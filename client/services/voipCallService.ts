import { Platform } from "react-native";
import type { NavigationContainerRef } from "@react-navigation/native";
import { getSocket } from "@/lib/socket";
import { getApiUrl } from "@/lib/query-client";
import { getStoredToken } from "@/lib/auth";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

// Real PushKit + CallKit wiring — see plugins/withCallKeepVoip.js for the
// native half (which is what actually calls RNCallKeep.reportNewIncomingCall
// the instant a VoIP push arrives, per Apple's requirement that this happen
// synchronously in native code, not from JS).
//
// This module owns: registering for VoIP pushes, forwarding the token to
// the server, and translating CallKit's native answer/end actions into the
// same socket events CallContext's acceptCall()/rejectCall()/endCall()
// already send — but WITHOUT depending on CallContext's `incomingCall`
// React state. A VoIP push can wake the app from fully-killed and the user
// can tap Answer on the native CallKit screen before the JS socket has even
// reconnected, so the VoIP push's own payload (received independently via
// PushKit, cached here by call UUID) is what drives both navigation and the
// server handshake — not a socket round trip that might not have happened
// yet.
//
// NOT YET VERIFIED ON A REAL DEVICE. Native module wiring (see the config
// plugin) can't be compiled or exercised in this sandbox — only on EAS's
// build workers and then only in an actual phone call. Treat this as a
// first real implementation to iterate on, not a guaranteed-correct one.

let RNCallKeep: typeof import("react-native-callkeep").default | null = null;
let RNVoipPushNotification: typeof import("react-native-voip-push-notification").default | null = null;

function getCallKeep() {
  if (Platform.OS !== "ios") return null;
  if (RNCallKeep) return RNCallKeep;
  try {
    RNCallKeep = require("react-native-callkeep").default;
    return RNCallKeep;
  } catch {
    return null;
  }
}

function getVoipPush() {
  if (Platform.OS !== "ios") return null;
  if (RNVoipPushNotification) return RNVoipPushNotification;
  try {
    RNVoipPushNotification = require("react-native-voip-push-notification").default;
    return RNVoipPushNotification;
  } catch {
    return null;
  }
}

interface VoipCallInfo {
  callId: string;
  callerId: string | null;
  callerName: string;
  hasVideo: boolean;
  conversationId?: string;
  sealedCall?: boolean;
}

// Keyed by CallKit's callUUID (== our own callId — see sendVoipCallPush on
// the server, which uses the real callId as the uuid). CallKeep's
// answer/end events only carry this UUID, not the full call payload, so
// this is how we get back the caller/type info needed to actually route
// the accept/reject and navigate to the right screen.
const pendingCalls = new Map<string, VoipCallInfo>();
// Calls CallKit has reported as answered — used to tell endCall's "hang up
// after answering" apart from "decline before answering", since CallKeep
// fires the same `endCall` event for both.
const answeredCalls = new Set<string>();

let navRef: NavigationContainerRef<RootStackParamList> | null = null;
export function setVoipNavigationRef(ref: NavigationContainerRef<RootStackParamList> | null) {
  navRef = ref;
}

let initialized = false;

export function initVoipCalling() {
  if (initialized || Platform.OS !== "ios") return;
  initialized = true;

  const CallKeep = getCallKeep();
  const VoipPush = getVoipPush();
  if (!CallKeep || !VoipPush) {
    console.log(
      "[voip] CallKeep/VoipPush native modules unavailable (Expo Go, or a build predating this plugin) — real CallKit ringing disabled, falling back to regular push.",
    );
    return;
  }

  CallKeep.setup({
    ios: {
      appName: "Pryvo",
      supportsVideo: true,
      // Calls never touch the system Phone app's call log — this is an
      // E2EE messenger, not something that should leave a trace there.
      includesCallsInRecents: false,
    },
    // Android CallKeep setup is a distinct, separate effort (ConnectionService)
    // — not wired up here since this session's testing has been iOS-only.
    // This whole function early-returns on non-iOS anyway (see the
    // Platform.OS !== "ios" guard above), so these values are never used.
    android: { alertTitle: "", alertDescription: "", cancelButton: "", okButton: "", additionalPermissions: [] },
  }).catch((e: any) => console.warn("[voip] CallKeep.setup failed:", e));

  VoipPush.addEventListener("register", (token: string) => {
    registerVoipTokenWithServer(token).catch((e) =>
      console.warn("[voip] token registration with server failed:", e),
    );
  });

  // The native AppDelegate already calls RNCallKeep.reportNewIncomingCall
  // synchronously on receipt (required by Apple) — this listener exists
  // purely to capture the payload for the answer/end handlers below, not
  // to display anything itself.
  VoipPush.addEventListener("notification", (payload: any) => {
    if (!payload?.uuid) return;
    pendingCalls.set(payload.uuid, {
      callId: payload.callId ?? payload.uuid,
      callerId: payload.callerId ?? null,
      callerName: payload.callerName ?? "Unknown",
      hasVideo: !!payload.hasVideo,
      conversationId: payload.conversationId,
      sealedCall: !!payload.sealedCall,
    });
  });

  CallKeep.addEventListener("answerCall", ({ callUUID }: { callUUID: string }) => {
    const info = pendingCalls.get(callUUID);
    answeredCalls.add(callUUID);
    if (!info) {
      console.warn(
        "[voip] answerCall fired for a callUUID with no cached payload (VoIP notification event never arrived) — cannot route to the call screen.",
      );
      return;
    }

    const socket = getSocket();
    socket?.emit("call-accepted", { callerId: info.callerId ?? undefined, callId: info.callId });

    const routeName = info.hasVideo ? "VideoCall" : "AudioCall";
    // Route name is picked at runtime (video vs audio), which doesn't fit
    // React Navigation's strict per-route overloads — deliberately dynamic
    // dispatch, not a type-safety gap worth fighting here.
    (navRef as any)?.navigate(routeName, {
      callId: info.callId,
      receiverId: info.callerId,
      receiverName: info.callerName,
      isIncoming: true,
      sealedCall: info.sealedCall,
    });
  });

  CallKeep.addEventListener("endCall", ({ callUUID }: { callUUID: string }) => {
    const info = pendingCalls.get(callUUID);
    if (!info) return;
    const socket = getSocket();
    if (answeredCalls.has(callUUID)) {
      socket?.emit("call-ended", { otherUserId: info.callerId ?? undefined, callId: info.callId });
    } else {
      socket?.emit("call-rejected", { callerId: info.callerId ?? undefined, callId: info.callId });
    }
    pendingCalls.delete(callUUID);
    answeredCalls.delete(callUUID);
  });

  VoipPush.registerVoipToken();
}

async function registerVoipTokenWithServer(voipPushToken: string) {
  const token = await getStoredToken();
  // Not logged in yet (e.g. VoIP registration completes before the user
  // finishes sign-in on first launch) — the 'register' event only fires
  // once per token change, not on every app start, so there's no
  // guaranteed later retry. Settings/notification screens re-registering
  // on next login is a known gap, not silently "handled".
  if (!token) return;
  try {
    const apiUrl = getApiUrl();
    await fetch(`${apiUrl}/api/push-token/voip`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ voipPushToken }),
    });
  } catch (e) {
    console.warn("[voip] Failed to POST VoIP token:", e);
  }
}
