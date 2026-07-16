import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

function optional(name: string, value: string | undefined): string {
  if (!value) {
    console.warn(`[env] "${name}" is not set. See .env.example — this feature will fail until it is.`);
    return '';
  }
  return value;
}

// Firebase/Google config is read via `EXPO_PUBLIC_*` vars (inlined directly into the JS
// bundle by babel-preset-expo at build time) rather than app.config.js's `extra` field --
// `extra` round-trips fine under `expo start`, but `expo export`'s manifest embed strips
// arbitrary custom `extra` keys, so values set there silently never reached the client
// bundle. These are Firebase's public client config (safe to embed; Firebase auth is
// enforced by its own rules/providers, not by hiding this key) so EXPO_PUBLIC_ is the
// right mechanism, not a secret-handling concern.
export const env = {
  supportPhone: extra.supportPhone || '+61 408 680 813',
  supportEmail: extra.supportEmail || 'adisssal7@hotmail.com',
  firebase: {
    apiKey: optional('EXPO_PUBLIC_FIREBASE_API_KEY', process.env.EXPO_PUBLIC_FIREBASE_API_KEY),
    authDomain: optional('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN', process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN),
    projectId: optional('EXPO_PUBLIC_FIREBASE_PROJECT_ID', process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID),
    storageBucket: optional('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET', process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: optional(
      'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
      process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
    ),
    appId: optional('EXPO_PUBLIC_FIREBASE_APP_ID', process.env.EXPO_PUBLIC_FIREBASE_APP_ID),
  },
  google: {
    iosClientId: optional('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID', process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
    webClientId: optional('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
  },
  get isFirebaseConfigured(): boolean {
    return Boolean(env.firebase.apiKey && env.firebase.projectId && env.firebase.appId);
  },
};
