import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

function required(name: string, value: string | undefined): string {
  if (!value) {
    console.warn(
      `[env] Missing "${name}". Set it in your .env file (see .env.example) before shipping.`
    );
    return "";
  }
  return value;
}

export const env = {
  googlePlacesApiKey: extra.googlePlacesApiKey ?? "",
  abrLookupGuid: extra.abrLookupGuid ?? "",
  firebase: {
    apiKey: required("firebaseApiKey", extra.firebaseApiKey),
    authDomain: required("firebaseAuthDomain", extra.firebaseAuthDomain),
    projectId: required("firebaseProjectId", extra.firebaseProjectId),
    storageBucket: required("firebaseStorageBucket", extra.firebaseStorageBucket),
    messagingSenderId: required("firebaseMessagingSenderId", extra.firebaseMessagingSenderId),
    appId: required("firebaseAppId", extra.firebaseAppId),
  },
};
