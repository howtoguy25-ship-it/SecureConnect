// Per-suite jest setup. We mock TWO modules globally:
//
// 1. `server/pushNotifications` — so we can ASSERT on the push payload
//    without ever hitting Expo's push endpoint. The captured calls are
//    exposed on `(globalThis as any).__pushCalls`.
//
// 2. `server/twilioClient.validateTwilioWebhookSignature` — partial
//    mock; everything else stays real. Default behavior is to FAIL closed
//    (return false) so the "unsigned webhook → 403" assertion works
//    without any per-test setup. Tests that need the happy path call
//    `setTwilioSignatureValid(true)` to flip it for one test.
//
// These mocks are installed via `jest.mock` here so every test file
// inherits them. Individual tests can still inspect / reset state.

jest.mock("../../server/pushNotifications", () => {
  const calls: Array<{
    fn: string;
    args: unknown[];
  }> = [];
  (globalThis as any).__pushCalls = calls;
  const mkFn = (fn: string) =>
    jest.fn(async (...args: unknown[]) => {
      calls.push({ fn, args });
      return null;
    });
  return {
    sendPushNotification: mkFn("sendPushNotification"),
    sendMessageNotification: mkFn("sendMessageNotification"),
    sendCallNotification: mkFn("sendCallNotification"),
    sendBatchPushNotifications: mkFn("sendBatchPushNotifications"),
  };
});

// Mock the `twilio` PACKAGE (not the wrapper). This preserves every line of
// `validateTwilioWebhookSignature` — the missing-header guard, the
// auth-token-presence check, the try/catch — and only swaps the cryptographic
// verdict at the bottom (`twilio.validateRequest(...)`). That way a regression
// in the wrapper itself (e.g. someone deleting the `!signature` guard) will
// still fail these tests.
jest.mock("twilio", () => {
  let valid = false;
  let lastCall: { token: string; signature: string; url: string; params: unknown } | null = null;
  (globalThis as any).__setTwilioSignatureValid = (v: boolean) => {
    valid = v;
  };
  (globalThis as any).__lastTwilioValidateCall = () => lastCall;
  const mockTwilio: any = jest.fn(() => ({})); // twilio(accountSid, authToken) factory
  mockTwilio.validateRequest = jest.fn(
    (token: string, signature: string, url: string, params: unknown) => {
      lastCall = { token, signature, url, params };
      return valid;
    },
  );
  // server/routes.ts references `twilio.jwt.AccessToken` at module load for
  // LiveKit/video grants. Tests never exercise that path but the property
  // access must not throw — stub a minimal class shape.
  class FakeGrant {}
  class FakeAccessToken {
    static VideoGrant = FakeGrant;
    static ChatGrant = FakeGrant;
    addGrant() {}
    toJwt() { return ""; }
  }
  mockTwilio.jwt = { AccessToken: FakeAccessToken };
  return { __esModule: true, default: mockTwilio, ...mockTwilio };
});

// The wrapper short-circuits to `false` when TWILIO_AUTH_TOKEN is missing,
// which would mask the cryptographic verdict. Provide a dummy so the real
// wrapper code reaches the (mocked) `twilio.validateRequest` call.
process.env.TWILIO_AUTH_TOKEN =
  process.env.TWILIO_AUTH_TOKEN || "AC_test_token_for_integration_harness_only";

// Provide a stable SESSION_SECRET so JWT signing is deterministic across
// the test run.
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET ||
  "build63-sealed-sender-integration-test-secret-do-not-use-in-prod";
