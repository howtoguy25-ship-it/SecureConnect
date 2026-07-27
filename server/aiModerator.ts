import OpenAI from "openai";
import { storage } from "./storage";
import { db } from "./db";
import { messages as messagesTable, users, userReports } from "@shared/schema";
import { eq, and, lte, desc, sql } from "drizzle-orm";

// Reuse the existing Replit AI integration.
//
// Built lazily, not at module scope: this module is dynamically imported
// from the hot message-send path (checkAndConsumeChatLimit), and the
// OpenAI SDK throws synchronously from its constructor when no API key is
// present. Eagerly constructing it here meant every message send 500'd
// on any deployment without AI_INTEGRATIONS_OPENAI_API_KEY set, even
// though only callOpenAI (guarded by the caller) actually needs a client.
let _openai: OpenAI | null = null;
function getOpenAIClient(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return _openai;
}

const MODEL = "gpt-5.1";

const REASON_LABELS: Record<string, string> = {
  spam: "Spam or unwanted content",
  harassment: "Harassment or bullying",
  hate_speech: "Hate speech",
  sexual_content: "Sexual or nude content",
  threats_or_violence: "Threats or violence",
  csam: "Child exploitation",
  impersonation: "Impersonation",
  scam_or_fraud: "Scam or fraud",
  other: "Other",
};

type AiVerdict = "approve" | "decline" | "insufficient_evidence" | "error";
type AiAction =
  | "none"
  | "warn"
  | "chat_limit"
  | "suspend_24h"
  | "suspend_7d"
  | "suspend_30d"
  | "suspend_permanent";

interface AiResult {
  verdict: AiVerdict;
  severity: number; // 1-5
  confidence: number; // 0-100
  recommendedAction: AiAction;
  reason: string;
}

function describeAction(action: AiAction): string {
  switch (action) {
    case "warn": return "warning issued";
    case "chat_limit": return "chat limit (5 messages/day for 7 days)";
    case "suspend_24h": return "24-hour suspension";
    case "suspend_7d": return "7-day suspension";
    case "suspend_30d": return "30-day suspension";
    case "suspend_permanent": return "permanent suspension";
    default: return "no action";
  }
}

const SYSTEM_PROMPT = `You are Pryvo's AI Trust & Safety officer. Your job is to evaluate user reports against actual chat history and decide whether the reported behavior matches the reported reason. You only approve reports when the evidence clearly supports the claim. You never act on suspicion alone.

Verdict definitions:
- "approve": The reported behavior clearly matches the reported reason and there is concrete evidence in the messages. Choose a recommendedAction proportional to severity.
- "decline": The evidence does NOT support the claim, or the message is benign / a misunderstanding / out of context.
- "insufficient_evidence": The reported message is encrypted ciphertext, missing, or the context is too thin to make a confident decision. Always pair with action "none".

Severity scale (1-5):
1 = Minor / borderline (mild rudeness, single low-effort spam)
2 = Mild but clearly unwelcome (repeated spam, name-calling)
3 = Moderate (sustained harassment, slurs, scams)
4 = Severe (threats of violence, sexual content sent to non-consenting party, doxxing)
5 = Critical (explicit threats of imminent harm, child exploitation, coordinated abuse)

Recommended action mapping (use ONLY these strings):
- severity 1 + first-time → "warn"
- severity 2 → "chat_limit"  (5 messages/day for 7 days)
- severity 3 → "suspend_24h"
- severity 4 → "suspend_7d"
- severity 5 (CSAM, credible threats of violence) → "suspend_permanent"
- severity 5 (other) → "suspend_30d"
- decline / insufficient_evidence → "none"

Hard rules:
- CSAM (child_exploitation): if there is ANY credible signal, set verdict="approve", severity=5, action="suspend_permanent". Do NOT downgrade.
- Credible threats of violence with a target → minimum suspend_7d.
- Encrypted/empty/non-text content → verdict="insufficient_evidence", action="none".
- Always favor decline when context shows the messages are consensual, in-jokes, or the reported user is the victim.
- Confidence must reflect honesty (10-100). If you wouldn't bet money on the verdict, drop confidence below 60 and prefer insufficient_evidence.

Return STRICT JSON only — no prose, no markdown, no commentary outside JSON.`;

interface ReportRow {
  id: string;
  reporterId: string;
  reportedUserId: string;
  reportedMessageId: string | null;
  reason: string;
  details: string | null;
}

async function gatherEvidence(report: ReportRow): Promise<{
  reportedMessage: { content: string | null; mediaType: string | null; createdAt: string | null; senderId: string } | null;
  conversationContext: Array<{ role: "reported_user" | "reporter" | "other"; content: string; mediaType: string | null; ts: string }>;
  reportedUserDisplay: string;
  reporterDisplay: string;
}> {
  const reporter = await storage.getUser(report.reporterId);
  const reported = await storage.getUser(report.reportedUserId);

  let reportedMessage: any = null;
  let conversationId: string | null = null;
  if (report.reportedMessageId) {
    const [m] = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.id, report.reportedMessageId))
      .limit(1);
    if (m) {
      reportedMessage = {
        content: m.content,
        mediaType: m.mediaType,
        createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : null,
        senderId: m.senderId,
      };
      conversationId = m.conversationId;
    }
  }

  // Pull the most recent 50 messages between reporter & reported user
  // (or in the conversation containing the reported message) so the AI
  // sees actual context, not a single isolated bubble.
  const conversationContext: Array<{
    role: "reported_user" | "reporter" | "other";
    content: string;
    mediaType: string | null;
    ts: string;
  }> = [];

  // If the report does not point at a specific message, find the most recent
  // shared conversation between reporter & reported user so the AI still has
  // real context to judge against. Without this, `conversationContext` would
  // be empty and the AI could only see the reporter's free-text "details".
  if (!conversationId) {
    try {
      const recent = await db
        .select({ conversationId: messagesTable.conversationId })
        .from(messagesTable)
        .where(
          // Either direction between the two users — covers reported_user → reporter
          // AND reporter → reported_user so we never miss the shared thread.
          sql`(
            (${messagesTable.senderId} = ${report.reportedUserId} AND ${messagesTable.receiverId} = ${report.reporterId})
            OR
            (${messagesTable.senderId} = ${report.reporterId} AND ${messagesTable.receiverId} = ${report.reportedUserId})
          )`,
        )
        .orderBy(desc(messagesTable.createdAt))
        .limit(1);
      if (recent[0]?.conversationId) conversationId = recent[0].conversationId;
    } catch {}
  }

  if (conversationId) {
    const rows = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId))
      .orderBy(desc(messagesTable.createdAt))
      .limit(50);
    for (const m of rows.reverse()) {
      const role =
        m.senderId === report.reportedUserId
          ? "reported_user"
          : m.senderId === report.reporterId
            ? "reporter"
            : "other";
      conversationContext.push({
        role,
        content: m.content ?? "",
        mediaType: m.mediaType,
        ts: m.createdAt ? new Date(m.createdAt).toISOString() : "",
      });
    }
  }

  return {
    reportedMessage,
    conversationContext,
    reportedUserDisplay: reported?.displayName || reported?.phoneNumber || "Reported user",
    reporterDisplay: reporter?.displayName || reporter?.phoneNumber || "Reporter",
  };
}

function looksLikeCiphertext(s: string | null | undefined): boolean {
  if (!s) return true;
  const trimmed = s.trim();
  if (trimmed.length === 0) return true;
  // Heuristic: Pryvo E2EE payloads are JSON envelopes or base64-only.
  if (trimmed.startsWith("{") && trimmed.includes('"ciphertext"')) return true;
  if (/^[A-Za-z0-9+/=]{120,}$/.test(trimmed)) return true;
  return false;
}

async function callOpenAI(
  report: ReportRow,
  evidence: Awaited<ReturnType<typeof gatherEvidence>>,
): Promise<AiResult> {
  const reasonLabel = REASON_LABELS[report.reason] || report.reason;

  // Pre-screen: if every text field is ciphertext, short-circuit.
  const reportedText = evidence.reportedMessage?.content ?? null;
  const allCiphertext =
    looksLikeCiphertext(reportedText) &&
    evidence.conversationContext.every((m) => looksLikeCiphertext(m.content));
  if (allCiphertext && evidence.conversationContext.length > 0) {
    return {
      verdict: "insufficient_evidence",
      severity: 1,
      confidence: 95,
      recommendedAction: "none",
      reason:
        "All available messages are end-to-end encrypted ciphertext that the server cannot read. Manual review required for human-readable evidence.",
    };
  }

  const userPayload = {
    report: {
      reason: report.reason,
      reasonLabel,
      reporterDetails: report.details || null,
      reporter: evidence.reporterDisplay,
      reportedUser: evidence.reportedUserDisplay,
    },
    reportedMessage: evidence.reportedMessage
      ? {
          text: looksLikeCiphertext(evidence.reportedMessage.content)
            ? "[encrypted - cannot read]"
            : evidence.reportedMessage.content,
          mediaType: evidence.reportedMessage.mediaType,
          ts: evidence.reportedMessage.createdAt,
          sentBy:
            evidence.reportedMessage.senderId === report.reportedUserId
              ? "reported_user"
              : "reporter",
        }
      : null,
    conversationHistory: evidence.conversationContext.slice(-50).map((m) => ({
      from: m.role,
      text: looksLikeCiphertext(m.content) ? "[encrypted]" : m.content,
      mediaType: m.mediaType,
      ts: m.ts,
    })),
  };

  const completion = await getOpenAIClient().chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content:
          `Evaluate this report and respond with JSON of shape: ` +
          `{"verdict":"approve|decline|insufficient_evidence","severity":1-5,"confidence":0-100,"recommendedAction":"none|warn|chat_limit|suspend_24h|suspend_7d|suspend_30d|suspend_permanent","reason":"brief one-paragraph explanation citing evidence"}.\n\n` +
          `Report payload:\n${JSON.stringify(userPayload, null, 2)}`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 600,
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      verdict: "error",
      severity: 1,
      confidence: 0,
      recommendedAction: "none",
      reason: `AI returned non-JSON: ${raw.slice(0, 300)}`,
    };
  }

  const verdict: AiVerdict = ["approve", "decline", "insufficient_evidence"].includes(
    parsed.verdict,
  )
    ? parsed.verdict
    : "insufficient_evidence";
  const severity = Math.max(1, Math.min(5, Number(parsed.severity) || 1));
  const confidence = Math.max(0, Math.min(100, Number(parsed.confidence) || 0));
  const allowedActions: AiAction[] = [
    "none",
    "warn",
    "chat_limit",
    "suspend_24h",
    "suspend_7d",
    "suspend_30d",
    "suspend_permanent",
  ];
  let recommendedAction: AiAction = allowedActions.includes(parsed.recommendedAction)
    ? parsed.recommendedAction
    : "none";
  if (verdict !== "approve") recommendedAction = "none";

  return {
    verdict,
    severity,
    confidence,
    recommendedAction,
    reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 1000) : "",
  };
}

async function applyAction(
  reportedUserId: string,
  action: AiAction,
  reasonLabel: string,
): Promise<string> {
  const now = new Date();
  switch (action) {
    case "warn":
      // Warning is informational only — recorded on the report, no DB change to the user.
      return `warned for ${reasonLabel}`;
    case "chat_limit": {
      const until = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      await db
        .update(users)
        .set({
          chatLimitUntil: until,
          chatLimitMessagesPerDay: 5,
          chatMessagesUsedToday: 0,
          chatLimitDayStart: now,
        })
        .where(eq(users.id, reportedUserId));
      return `chat-limited to 5 messages/day until ${until.toISOString()}`;
    }
    case "suspend_24h":
    case "suspend_7d":
    case "suspend_30d":
    case "suspend_permanent": {
      const days =
        action === "suspend_24h"
          ? 1
          : action === "suspend_7d"
            ? 7
            : action === "suspend_30d"
              ? 30
              : 365 * 100;
      const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      await storage.suspendUser(reportedUserId, `AI moderation: ${reasonLabel}`);
      // Also stamp chatLimitUntil so the suspension end date is queryable.
      await db
        .update(users)
        .set({ chatLimitUntil: until })
        .where(eq(users.id, reportedUserId));
      return `${action} for ${reasonLabel}`;
    }
    default:
      return "no action";
  }
}

/**
 * Fire-and-forget AI evaluation of a freshly-created user report.
 * Updates the report row with the verdict and applies the action automatically.
 * Returns silently on failure (errors are recorded in ai_verdict='error').
 */
export async function evaluateReport(reportId: string): Promise<void> {
  let report: any;
  try {
    // Atomic claim: stamp aiEvaluatedAt only if NULL. If the row was already
    // claimed by a concurrent invocation, this returns 0 rows and we exit.
    // The claim row is the source of truth for "this report is ours to act on".
    const claim = await db
      .update(userReports)
      .set({ aiEvaluatedAt: new Date() })
      .where(and(eq(userReports.id, reportId), sql`${userReports.aiEvaluatedAt} IS NULL`))
      .returning();
    if (claim.length === 0) {
      console.log(`[AI-MOD] report=${reportId} already claimed by another worker, skipping.`);
      return;
    }
    report = claim[0];

    // Fail-closed if the OpenAI key isn't configured: stamp the report so the
    // owner moderation queue surfaces it for manual review instead of silently
    // claiming "AI is reviewing".
    if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
      await db
        .update(userReports)
        .set({
          aiVerdict: "error",
          aiVerdictReason: "AI moderator not configured (missing OPENAI key) — needs human review.",
          aiAction: "none",
        })
        .where(eq(userReports.id, reportId));
      return;
    }

    const evidence = await gatherEvidence(report);
    const result = await callOpenAI(report, evidence);

    let actionTakenStr: string | null = null;
    let nextStatus = report.status;

    if (result.verdict === "approve" && result.recommendedAction !== "none") {
      const reasonLabel = REASON_LABELS[report.reason] || report.reason;
      actionTakenStr = await applyAction(
        report.reportedUserId,
        result.recommendedAction,
        reasonLabel,
      );
      nextStatus = "actioned";

      // Disconnect any active sockets if user is now suspended.
      if (result.recommendedAction.startsWith("suspend_")) {
        try {
          const io = (global as any).__socketIO;
          if (io) {
            const sockets = await io.in(report.reportedUserId).fetchSockets();
            for (const s of sockets) {
              try {
                s.emit("account-suspended", { reason: report.reason });
              } catch {}
              try {
                s.disconnect(true);
              } catch {}
            }
          }
        } catch (e) {
          console.error("[AI-MOD] socket disconnect failed:", e);
        }
      } else if (result.recommendedAction === "chat_limit") {
        // Notify any live sockets so the client can update the UI immediately.
        try {
          const io = (global as any).__socketIO;
          if (io) io.to(report.reportedUserId).emit("chat-limit-applied", { perDay: 5 });
        } catch {}
      }
    } else if (result.verdict === "decline") {
      nextStatus = "dismissed";
      actionTakenStr = `auto-dismissed by AI (${describeAction(result.recommendedAction)})`;
    } else if (result.verdict === "insufficient_evidence") {
      nextStatus = "pending"; // Leave for human review.
      actionTakenStr = "needs human review";
    }

    await db
      .update(userReports)
      .set({
        aiVerdict: result.verdict,
        aiVerdictReason: result.reason,
        aiAction: result.recommendedAction,
        aiSeverity: result.severity,
        aiConfidence: result.confidence,
        aiEvaluatedAt: new Date(),
        status: nextStatus,
        actionTaken: actionTakenStr ?? report.actionTaken,
        reviewedAt:
          nextStatus !== "pending" ? new Date() : report.reviewedAt,
        reviewedBy: nextStatus !== "pending" ? "ai-moderator" : report.reviewedBy,
      })
      .where(eq(userReports.id, reportId));

    console.log(
      `[AI-MOD] report=${reportId} verdict=${result.verdict} action=${result.recommendedAction} ` +
        `severity=${result.severity} confidence=${result.confidence}`,
    );
  } catch (err: any) {
    console.error("[AI-MOD] evaluation failed:", err?.message || err);
    try {
      await db
        .update(userReports)
        .set({
          aiVerdict: "error",
          aiVerdictReason: String(err?.message || err).slice(0, 500),
          aiEvaluatedAt: new Date(),
        })
        .where(eq(userReports.id, reportId));
    } catch {}
  }
}

/**
 * Resets the per-day counter if the saved chatLimitDayStart is from a previous UTC day.
 * Returns the (possibly updated) counter and the day-start.
 */
function rolloverDay(
  user: { chatMessagesUsedToday: number | null; chatLimitDayStart: Date | null },
  now: Date,
): { used: number; dayStart: Date } {
  const todayUtcMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const lastStart = user.chatLimitDayStart ? new Date(user.chatLimitDayStart) : null;
  const lastStartMidnight = lastStart
    ? new Date(Date.UTC(lastStart.getUTCFullYear(), lastStart.getUTCMonth(), lastStart.getUTCDate()))
    : null;
  if (!lastStartMidnight || lastStartMidnight.getTime() < todayUtcMidnight.getTime()) {
    return { used: 0, dayStart: todayUtcMidnight };
  }
  return { used: user.chatMessagesUsedToday ?? 0, dayStart: lastStart! };
}

export interface ChatLimitStatus {
  allowed: boolean;
  reason?: string;
  remaining?: number;
  perDay?: number;
  resetAt?: string;
}

export async function checkAndConsumeChatLimit(userId: string): Promise<ChatLimitStatus> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return { allowed: true };

  const now = new Date();

  // If chatLimitUntil has expired, clear the limit so the user is unrestricted.
  if (user.chatLimitUntil && new Date(user.chatLimitUntil).getTime() <= now.getTime()) {
    await db
      .update(users)
      .set({
        chatLimitUntil: null,
        chatLimitMessagesPerDay: null,
        chatMessagesUsedToday: 0,
        chatLimitDayStart: null,
      })
      .where(eq(users.id, userId));
    return { allowed: true };
  }

  const perDay = user.chatLimitMessagesPerDay;
  if (!perDay || perDay <= 0) return { allowed: true };

  // Compute today's UTC midnight so the rollover is part of the same atomic
  // SQL update — the previous in-memory rollover could leave the persisted
  // counter at the cap from yesterday and incorrectly deny today's first send.
  const todayUtcMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const tomorrowIso = new Date(todayUtcMidnight.getTime() + 24 * 60 * 60 * 1000).toISOString();

  // Single atomic statement:
  //  - WHERE allows the update when EITHER the saved dayStart is from a
  //    previous UTC day (rollover) OR today's used < perDay.
  //  - SET resets used to 1 + dayStart to today on rollover, otherwise
  //    increments used by 1.
  // If 0 rows are returned, today's quota is fully consumed.
  const result = await db
    .update(users)
    .set({
      chatMessagesUsedToday: sql`CASE
        WHEN ${users.chatLimitDayStart} IS NULL OR ${users.chatLimitDayStart} < ${todayUtcMidnight}
          THEN 1
        ELSE COALESCE(${users.chatMessagesUsedToday}, 0) + 1
      END`,
      chatLimitDayStart: sql`CASE
        WHEN ${users.chatLimitDayStart} IS NULL OR ${users.chatLimitDayStart} < ${todayUtcMidnight}
          THEN ${todayUtcMidnight}
        ELSE ${users.chatLimitDayStart}
      END`,
    })
    .where(
      and(
        eq(users.id, userId),
        sql`(
          ${users.chatLimitDayStart} IS NULL
          OR ${users.chatLimitDayStart} < ${todayUtcMidnight}
          OR COALESCE(${users.chatMessagesUsedToday}, 0) < ${perDay}
        )`,
      ),
    )
    .returning({ usedNow: users.chatMessagesUsedToday });

  if (result.length === 0) {
    return {
      allowed: false,
      reason: `Daily message limit reached (${perDay}/day). Resets at ${tomorrowIso}.`,
      remaining: 0,
      perDay,
      resetAt: tomorrowIso,
    };
  }

  const usedNow = result[0]?.usedNow ?? 1;
  return {
    allowed: true,
    remaining: Math.max(0, perDay - usedNow),
    perDay,
    resetAt: tomorrowIso,
  };
}

/**
 * Refund one consumed message slot. Call this from the REST send path if the
 * downstream message-create fails AFTER the limit was consumed, so users are
 * never charged a slot for a send that didn't happen.
 */
export async function refundChatLimitSlot(userId: string): Promise<void> {
  try {
    await db
      .update(users)
      .set({
        chatMessagesUsedToday: sql`GREATEST(COALESCE(${users.chatMessagesUsedToday}, 0) - 1, 0)`,
      })
      .where(eq(users.id, userId));
  } catch (e) {
    console.error("[AI-MOD] refund slot failed:", e);
  }
}
