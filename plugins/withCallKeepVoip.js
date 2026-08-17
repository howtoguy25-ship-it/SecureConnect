const { withAppDelegate, withInfoPlist, withEntitlementsPlist } = require('@expo/config-plugins');

// Real PushKit + CallKit wiring for genuine phone-call-style ringing on
// iOS — a regular remote push (what this app used before) cannot wake the
// app to show the native full-screen incoming-call UI, ring through
// silent mode, or reliably fire when the app is force-quit. Only PushKit
// VoIP pushes handled via CallKit get that behavior; this is an Apple
// platform requirement, not something achievable from JS alone.
//
// react-native-voip-push-notification + react-native-callkeep both ship
// real native iOS modules (see their podspecs) but neither publishes an
// Expo config plugin — their setup docs assume a hand-edited AppDelegate,
// which this managed project doesn't keep checked in (EAS Build
// regenerates ios/ from scratch on every build via `expo prebuild`). This
// plugin re-applies that same native wiring automatically on every
// prebuild instead, using @expo/config-plugins' string-based AppDelegate
// mod (works for the Swift AppDelegate this Expo SDK generates, not just
// the older Objective-C template).
//
// IMPORTANT: this has not been build-tested against a real device yet —
// Objective-C/Swift can't be compiled or verified in this sandbox, only
// on EAS's macOS build workers. Treat the first few EAS builds after this
// lands as integration testing, not a guaranteed first-try success.

const IMPORT_MARKER = '// @generated begin react-native-voip-callkeep-import';
const IMPORT_MARKER_END = '// @generated end react-native-voip-callkeep-import';
const REGISTER_MARKER = '// @generated begin react-native-voip-callkeep-register';
const REGISTER_MARKER_END = '// @generated end react-native-voip-callkeep-register';
const DELEGATE_MARKER = '// @generated begin react-native-voip-callkeep-delegate';
const DELEGATE_MARKER_END = '// @generated end react-native-voip-callkeep-delegate';

function withVoipBackgroundMode(config) {
  return withInfoPlist(config, (config) => {
    const modes = config.modResults.UIBackgroundModes ?? [];
    if (!modes.includes('voip')) modes.push('voip');
    config.modResults.UIBackgroundModes = modes;
    return config;
  });
}

// CallKit itself needs no special entitlement beyond the standard Push
// Notifications capability (already implied by expo-notifications being
// installed) — this is a no-op placeholder kept for symmetry/clarity and
// as the obvious place to add one if a future CallKit feature needs it.
function withCallKeepEntitlements(config) {
  return withEntitlementsPlist(config, (config) => config);
}

function withCallKeepAppDelegate(config) {
  return withAppDelegate(config, (config) => {
    const { language } = config.modResults;
    if (language === 'swift') {
      config.modResults.contents = applySwiftAppDelegate(config.modResults.contents);
    } else if (language === 'objc' || language === 'objcpp') {
      config.modResults.contents = applyObjcAppDelegate(config.modResults.contents);
    } else {
      console.warn(
        `[withCallKeepVoip] Unrecognized AppDelegate language "${language}" — PushKit/CallKit native wiring was NOT applied. VoIP ringing will not work until this is done by hand.`,
      );
    }
    return config;
  });
}

function applySwiftAppDelegate(contents) {
  if (contents.includes(IMPORT_MARKER)) return contents; // idempotent across multiple prebuilds

  const importBlock = `${IMPORT_MARKER}
import PushKit
import CallKit
${IMPORT_MARKER_END}
`;
  // Swift imports live at the top of the file, above the class declaration.
  contents = contents.replace(/^(import Expo\n)/m, `$1${importBlock}`);
  if (!contents.includes(IMPORT_MARKER)) {
    // Fallback: no "import Expo" line found — prepend at the very top.
    contents = importBlock + contents;
  }

  // Register for VoIP pushes as early as possible in didFinishLaunching,
  // per Apple's guidance (see react-native-voip-push-notification's own
  // README) — doing this only from JS is too slow for reliable delivery.
  const registerBlock = `
    ${REGISTER_MARKER}
    let voipRegistry = PKPushRegistry(queue: nil)
    voipRegistry.delegate = self
    voipRegistry.desiredPushTypes = [.voIP]
    ${REGISTER_MARKER_END}
`;
  const launchingSignature = /(func application\([\s\S]*?didFinishLaunchingWithOptions[\s\S]*?\{\n)/;
  if (launchingSignature.test(contents)) {
    contents = contents.replace(launchingSignature, `$1${registerBlock}`);
  } else {
    console.warn(
      '[withCallKeepVoip] Could not find didFinishLaunchingWithOptions in AppDelegate.swift — VoIP push registration was NOT inserted.',
    );
  }

  // PKPushRegistryDelegate conformance + the three delegate callbacks.
  // Inserted as a top-level extension at the end of the file so it
  // doesn't need to touch the main class body at all — safest against
  // upstream template changes between Expo SDK versions.
  const delegateExtension = `
${DELEGATE_MARKER}
extension AppDelegate: PKPushRegistryDelegate {
  func pushRegistry(_ registry: PKPushRegistry, didUpdate credentials: PKPushCredentials, for type: PKPushType) {
    RNVoipPushNotificationManager.didUpdate(credentials, forType: type.rawValue)
  }

  func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
    // No action needed — see react-native-voip-push-notification docs.
  }

  func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
    let uuidString = (payload.dictionaryPayload["uuid"] as? String) ?? UUID().uuidString
    let callerName = (payload.dictionaryPayload["callerName"] as? String) ?? "Unknown"
    let handle = (payload.dictionaryPayload["handle"] as? String) ?? callerName
    let hasVideo = (payload.dictionaryPayload["hasVideo"] as? Bool) ?? false

    RNVoipPushNotificationManager.addCompletionHandler(uuidString, completionHandler: completion)
    RNVoipPushNotificationManager.didReceiveIncomingPush(with: payload, forType: type.rawValue)

    // Apple requires CallKit to be invoked synchronously here on iOS 13+
    // or the OS may terminate the app / stop delivering future VoIP
    // pushes — see react-native-callkeep's README for the same warning.
    RNCallKeep.reportNewIncomingCall(
      uuidString,
      handle: handle,
      handleType: "generic",
      hasVideo: hasVideo,
      localizedCallerName: callerName,
      supportsHolding: false,
      supportsDTMF: false,
      supportsGrouping: false,
      supportsUngrouping: false,
      fromPushKit: true,
      payload: payload.dictionaryPayload,
      withCompletionHandler: nil
    )

    completion()
  }
}
${DELEGATE_MARKER_END}
`;
  contents = contents + delegateExtension;
  return contents;
}

function applyObjcAppDelegate(contents) {
  if (contents.includes(IMPORT_MARKER)) return contents;

  const importBlock = `${IMPORT_MARKER}
#import <PushKit/PushKit.h>
#import "RNVoipPushNotificationManager.h"
#import <RNCallKeep/RNCallKeep.h>
${IMPORT_MARKER_END}
`;
  contents = contents.replace(/(#import "AppDelegate\.h"\n)/, `$1${importBlock}`);
  if (!contents.includes(IMPORT_MARKER)) contents = importBlock + contents;

  const registerBlock = `
  ${REGISTER_MARKER}
  PKPushRegistry *voipRegistry = [[PKPushRegistry alloc] initWithQueue:dispatch_get_main_queue()];
  voipRegistry.delegate = self;
  voipRegistry.desiredPushTypes = [NSSet setWithObject:PKPushTypeVoIP];
  ${REGISTER_MARKER_END}
`;
  const launchingSignature = /(- \(BOOL\)application:\(UIApplication \*\)application didFinishLaunchingWithOptions:\(NSDictionary \*\)launchOptions\s*\{\n)/;
  if (launchingSignature.test(contents)) {
    contents = contents.replace(launchingSignature, `$1${registerBlock}`);
  } else {
    console.warn(
      '[withCallKeepVoip] Could not find didFinishLaunchingWithOptions in AppDelegate.mm — VoIP push registration was NOT inserted.',
    );
  }

  const delegateBlock = `
${DELEGATE_MARKER}
- (void)pushRegistry:(PKPushRegistry *)registry didUpdatePushCredentials:(PKPushCredentials *)credentials forType:(PKPushType)type {
  [RNVoipPushNotificationManager didUpdatePushCredentials:credentials forType:(NSString *)type];
}

- (void)pushRegistry:(PKPushRegistry *)registry didInvalidatePushTokenForType:(PKPushType)type {
}

- (void)pushRegistry:(PKPushRegistry *)registry didReceiveIncomingPushWithPayload:(PKPushPayload *)payload forType:(PKPushType)type withCompletionHandler:(void (^)(void))completion {
  NSString *uuid = payload.dictionaryPayload[@"uuid"] ?: [[NSUUID UUID] UUIDString];
  NSString *callerName = payload.dictionaryPayload[@"callerName"] ?: @"Unknown";
  NSString *handle = payload.dictionaryPayload[@"handle"] ?: callerName;
  BOOL hasVideo = [payload.dictionaryPayload[@"hasVideo"] boolValue];

  [RNVoipPushNotificationManager addCompletionHandler:uuid completionHandler:completion];
  [RNVoipPushNotificationManager didReceiveIncomingPushWithPayload:payload forType:(NSString *)type];

  [RNCallKeep reportNewIncomingCall:uuid
                              handle:handle
                          handleType:@"generic"
                            hasVideo:hasVideo
                 localizedCallerName:callerName
                     supportsHolding:NO
                        supportsDTMF:NO
                    supportsGrouping:NO
                  supportsUngrouping:NO
                         fromPushKit:YES
                             payload:payload.dictionaryPayload
               withCompletionHandler:nil];

  completion();
}
${DELEGATE_MARKER_END}
`;
  // Insert before the final @end of the @implementation block.
  const lastEndIndex = contents.lastIndexOf('@end');
  if (lastEndIndex !== -1) {
    contents = contents.slice(0, lastEndIndex) + delegateBlock + '\n' + contents.slice(lastEndIndex);
  } else {
    console.warn('[withCallKeepVoip] Could not find @end in AppDelegate.mm — delegate methods were NOT inserted.');
  }
  return contents;
}

module.exports = function withCallKeepVoip(config) {
  config = withVoipBackgroundMode(config);
  config = withCallKeepEntitlements(config);
  config = withCallKeepAppDelegate(config);
  return config;
};
