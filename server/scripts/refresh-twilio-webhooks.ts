/**
 * One-shot admin script: refresh Twilio webhook URLs after a domain swap.
 *
 * Context: every virtual number was provisioned via `provisionPhoneNumber`
 * with `voiceUrl`/`smsUrl` baked in at purchase time pointing at the old
 * deployment domain (secureconnectlive.com). When the API host changes
 * (Build 63 → pryvoapp.com), existing Twilio numbers keep posting
 * webhooks to the OLD domain. This script walks every row in
 * `virtual_numbers` and updates each Twilio IncomingPhoneNumber's
 * voiceUrl + smsUrl to the new domain.
 *
 * Run AFTER the new domain's DNS is live AND the deployment is reachable:
 *
 *   WEBHOOK_BASE_URL=https://pryvoapp.com \
 *     tsx server/scripts/refresh-twilio-webhooks.ts
 *
 * Idempotent: rerunning is safe. Twilio's REST API just overwrites the
 * existing values. Released/quarantined numbers are included on purpose —
 * they still live in our Twilio account and would otherwise keep posting
 * inbound SMS to the dead domain until the 30-day quarantine ends.
 */

import "dotenv/config";
import { db } from "../db";
import { virtualNumbers } from "../../shared/schema";
import { getTwilioClient, isTwilioConfigured } from "../twilioClient";

async function main() {
  const webhookBaseUrl =
    process.env.WEBHOOK_BASE_URL?.replace(/\/+$/, "") ||
    (process.env.EXPO_PUBLIC_DOMAIN
      ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
      : process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
        : "");

  if (!webhookBaseUrl) {
    console.error(
      "ERROR: set WEBHOOK_BASE_URL=https://pryvoapp.com (or EXPO_PUBLIC_DOMAIN) before running."
    );
    process.exit(1);
  }

  if (!isTwilioConfigured()) {
    console.error("ERROR: Twilio credentials missing in env.");
    process.exit(1);
  }

  const voiceUrl = `${webhookBaseUrl}/api/webhooks/twilio/voice`;
  const smsUrl = `${webhookBaseUrl}/api/webhooks/twilio/sms`;

  console.log(`Refreshing webhook URLs:`);
  console.log(`  voiceUrl = ${voiceUrl}`);
  console.log(`  smsUrl   = ${smsUrl}`);

  const client = getTwilioClient();
  const rows = await db.select().from(virtualNumbers);
  console.log(`Found ${rows.length} virtual_numbers row(s) to process.\n`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  const failures: { phoneNumber: string; twilioSid: string; error: string }[] = [];

  for (const row of rows) {
    if (!row.twilioSid) {
      console.warn(`SKIP ${row.phoneNumber} — no twilioSid on row`);
      skipped++;
      continue;
    }

    try {
      await client.incomingPhoneNumbers(row.twilioSid).update({
        voiceUrl,
        voiceMethod: "POST",
        smsUrl,
        smsMethod: "POST",
      });
      console.log(
        `OK   ${row.phoneNumber} (sid=${row.twilioSid}, status=${row.status})`
      );
      ok++;
    } catch (err: any) {
      const msg = err?.message || String(err);
      // Twilio returns 404 (status 20404) when the SID is no longer in our
      // account — e.g. legacy released-and-Twilio-released numbers from
      // before VN recycling. Surface but don't crash the whole batch.
      console.error(
        `FAIL ${row.phoneNumber} (sid=${row.twilioSid}): ${msg}`
      );
      failed++;
      failures.push({
        phoneNumber: row.phoneNumber,
        twilioSid: row.twilioSid,
        error: msg,
      });
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Updated: ${ok}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed:  ${failed}`);

  if (failures.length) {
    console.log(`\nFailure detail:`);
    for (const f of failures) {
      console.log(`  ${f.phoneNumber} [${f.twilioSid}] → ${f.error}`);
    }
  }

  process.exit(failed > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
