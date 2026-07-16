export interface RecaptchaVerifierHandle {
  verify: () => Promise<string>;
}
