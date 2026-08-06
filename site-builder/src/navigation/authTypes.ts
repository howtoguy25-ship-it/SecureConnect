export type AuthStackParamList = {
  Welcome: undefined;
  EmailAuth: { mode: 'signup' | 'signin' };
  ForgotPassword: undefined;
  PhoneAuth: undefined;
  PhoneVerify: { phoneNumber: string };
};
