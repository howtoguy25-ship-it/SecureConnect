import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthStackParamList } from '@/navigation/authTypes';
import WelcomeScreen from '@/screens/auth/WelcomeScreen';
import EmailAuthScreen from '@/screens/auth/EmailAuthScreen';
import ForgotPasswordScreen from '@/screens/auth/ForgotPasswordScreen';
import PhoneAuthScreen from '@/screens/auth/PhoneAuthScreen';
import PhoneVerifyScreen from '@/screens/auth/PhoneVerifyScreen';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="EmailAuth" component={EmailAuthScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="PhoneAuth" component={PhoneAuthScreen} />
      <Stack.Screen name="PhoneVerify" component={PhoneVerifyScreen} />
    </Stack.Navigator>
  );
}
