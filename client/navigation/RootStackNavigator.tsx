import React, { useEffect, useRef } from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { hideSplashScreen } from "@/lib/splashScreen";
import { logCheckpoint } from "@/lib/launchInstrumentation";
import MainTabNavigator from "@/navigation/MainTabNavigator";
import WelcomeScreen from "@/screens/WelcomeScreen";
import PhoneInputScreen from "@/screens/PhoneInputScreen";
import VerifyCodeScreen from "@/screens/VerifyCodeScreen";
import ProfileSetupScreen from "@/screens/ProfileSetupScreen";
import ConversationScreen from "@/screens/ConversationScreen";
import VipUpgradeScreen from "@/screens/VipUpgradeScreen";
import HiddenLockerScreen from "@/screens/HiddenLockerScreen";
import SettingsScreen from "@/screens/SettingsScreen";
import AudioCallScreen from "@/screens/AudioCallScreen";
import VideoCallScreen from "@/screens/VideoCallScreen";
import NewMessageScreen from "@/screens/NewMessageScreen";
import CameraScreen from "@/screens/CameraScreen";
import MiniGamesScreen from "@/screens/MiniGamesScreen";
import SendPhotoScreen from "@/screens/SendPhotoScreen";
import MessageRequestsScreen from "@/screens/MessageRequestsScreen";
import FriendRequestsScreen from "@/screens/FriendRequestsScreen";
import VirtualNumberScreen from "@/screens/VirtualNumberScreen";
import QRCodeScreen from "@/screens/QRCodeScreen";
import LastSeenPrivacyScreen from "@/screens/LastSeenPrivacyScreen";
import SupportScreen from "@/screens/SupportScreen";
import SecurityScreen from "@/screens/SecurityScreen";
import RecoveryCodeScreen from "@/screens/RecoveryCodeScreen";
import TrustedDevicesScreen from "@/screens/TrustedDevicesScreen";
import SafeCodeScreen from "@/screens/SafeCodeScreen";
import SecurityQuestionsSetupScreen from "@/screens/SecurityQuestionsSetupScreen";
import SecurityQuestionsVerifyScreen from "@/screens/SecurityQuestionsVerifyScreen";
import RecoverAccountScreen from "@/screens/RecoverAccountScreen";
import AdminLoginScreen from "@/screens/AdminLoginScreen";
import AdminDashboardScreen from "@/screens/AdminDashboardScreen";
import LoginHistoryScreen from "@/screens/LoginHistoryScreen";
import PeekDetectionSettingsScreen from "@/screens/PeekDetectionSettingsScreen";
import RingtoneScreen from "@/screens/RingtoneScreen";
import BlockedContactsScreen from "@/screens/BlockedContactsScreen";
import AdminReportsScreen from "@/screens/AdminReportsScreen";
import ForwardPickerScreen from "@/screens/ForwardPickerScreen";
import PrivacySettingsScreen from "@/screens/PrivacySettingsScreen";
import DisappearingMessagesScreen from "@/screens/DisappearingMessagesScreen";
import StorySettingsScreen from "@/screens/StorySettingsScreen";
import StoryPrivacyScreen from "@/screens/StoryPrivacyScreen";
import StoryContactPickerScreen from "@/screens/StoryContactPickerScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { useAuth } from "@/contexts/AuthContext";
import { View } from "react-native";
import { useTheme } from "@/hooks/useTheme";

export type RootStackParamList = {
  Welcome: undefined;
  PhoneInput: undefined;
  VerifyCode: { phoneNumber: string; demoCode?: string };
  RecoverAccount: undefined;
  AdminLogin: undefined;
  AdminDashboard: { token: string };
  ProfileSetup: undefined;
  SecurityQuestionsSetup: undefined;
  SecurityQuestionsVerify: undefined;
  Main: undefined;
  Conversation: {
    conversationId: string;
    otherUserId: string;
    otherUserName: string;
    statusReplyQuote?: import("@/utils/statusReplyEnvelope").StatusReplyQuote;
  };
  VipUpgrade: undefined;
  HiddenLocker: undefined;
  Settings: undefined;
  MessageRequests: undefined;
  FriendRequests: undefined;
  VirtualNumber: undefined;
  AudioCall: { callId: string; receiverId: string | null; receiverName: string; receiverPhoneNumber?: string; isIncoming?: boolean; sealedCall?: boolean };
  VideoCall: { callId: string; receiverId: string | null; receiverName: string; receiverPhoneNumber?: string; isIncoming?: boolean; sealedCall?: boolean };
  NewMessage: undefined;
  Camera: undefined;
  MiniGames: undefined;
  SendPhoto: { photoUri: string };
  QRCode: undefined;
  LastSeenPrivacy: undefined;
  Support: undefined;
  Security: undefined;
  RecoveryCode: undefined;
  TrustedDevices: undefined;
  SafeCode: undefined;
  LoginHistory: undefined;
  PeekDetectionSettings: undefined;
  Ringtone: undefined;
  BlockedContacts: undefined;
  AdminReports: undefined;
  ForwardPicker: {
    messageId: string;
    plaintext: string | null;
    originalSenderId: string;
    mediaUrl?: string | null;
    mediaType?: string | null;
  };
  PrivacySettings: undefined;
  DisappearingMessages: { scope: "default" | "conversation"; conversationId?: string; currentTimer?: number };
  StorySettings: undefined;
  StoryPrivacy: undefined;
  StoryContactPicker: { kind: "except" | "only" };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

logCheckpoint('root_navigator_module_loaded');

export default function RootStackNavigator() {
  const screenOptions = useScreenOptions();
  const { isAuthenticated, isLoading, user, securityQuestionsPending } = useAuth();
  const { theme } = useTheme();
  const splashHidden = useRef(false);
  const renderCount = useRef(0);

  renderCount.current++;
  logCheckpoint(`root_navigator_render_${renderCount.current}_loading=${isLoading}`);

  useEffect(() => {
    if (!isLoading && !splashHidden.current) {
      splashHidden.current = true;
      logCheckpoint('root_navigator_hiding_splash');
      hideSplashScreen();
    }
  }, [isLoading]);

  useEffect(() => {
    const emergencyTimeout = setTimeout(() => {
      if (!splashHidden.current) {
        splashHidden.current = true;
        logCheckpoint('EMERGENCY_navigator_timeout_2s');
        hideSplashScreen();
      }
    }, 2000);
    return () => clearTimeout(emergencyTimeout);
  }, []);

  if (isLoading) {
    logCheckpoint('root_navigator_showing_loading_view');
    return <View style={{ flex: 1, backgroundColor: theme.backgroundRoot }} />;
  }

  logCheckpoint(`root_navigator_showing_content_auth=${isAuthenticated}`);

  const needsProfileSetup = isAuthenticated && !user?.displayName;
  // Only force the Safe Code screen for users who already generated a code
  // but never acknowledged saving it. Brand-new users can set one up at any
  // time from Settings → Security → Safe Code.
  const needsSafeCode =
    isAuthenticated &&
    !!user?.displayName &&
    user?.hasSafeCode === true &&
    user?.safeCodeAcknowledged === false;
  // First-time setup: shown once, right after the Account ID is acknowledged.
  const needsSecurityQuestionsSetup =
    isAuthenticated &&
    !!user?.displayName &&
    !needsSafeCode &&
    user?.hasSecurityQuestions === false;
  // Every fresh login thereafter (2nd factor) — see AuthContext's
  // securityQuestionsPending doc comment for why persisted-session resume
  // never trips this.
  const needsSecurityQuestionsVerify =
    isAuthenticated &&
    !!user?.displayName &&
    !needsSafeCode &&
    user?.hasSecurityQuestions === true &&
    securityQuestionsPending === true;

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      {!isAuthenticated ? (
        <>
          <Stack.Screen
            name="Welcome"
            component={WelcomeScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="PhoneInput"
            component={PhoneInputScreen}
            options={{ headerTitle: "Enter Phone" }}
          />
          <Stack.Screen
            name="VerifyCode"
            component={VerifyCodeScreen}
            options={{ headerTitle: "Verify" }}
          />
          <Stack.Screen
            name="RecoverAccount"
            component={RecoverAccountScreen}
            options={{ headerTitle: "Recover Account" }}
          />
          <Stack.Screen
            name="AdminLogin"
            component={AdminLoginScreen}
            options={{ headerTitle: "Admin Sign In" }}
          />
          <Stack.Screen
            name="AdminDashboard"
            component={AdminDashboardScreen}
            options={{ headerTitle: "Admin Dashboard", headerBackVisible: false }}
          />
        </>
      ) : needsProfileSetup ? (
        <Stack.Screen
          name="ProfileSetup"
          component={ProfileSetupScreen}
          options={{ headerShown: false }}
        />
      ) : needsSafeCode ? (
        <Stack.Screen
          name="SafeCode"
          component={SafeCodeScreen}
          options={{ headerTitle: "Account ID", headerBackVisible: false }}
        />
      ) : needsSecurityQuestionsSetup ? (
        <Stack.Screen
          name="SecurityQuestionsSetup"
          component={SecurityQuestionsSetupScreen}
          options={{ headerTitle: "Security Questions", headerBackVisible: false }}
        />
      ) : needsSecurityQuestionsVerify ? (
        <Stack.Screen
          name="SecurityQuestionsVerify"
          component={SecurityQuestionsVerifyScreen}
          options={{ headerTitle: "Verify Identity", headerBackVisible: false }}
        />
      ) : (
        <>
          <Stack.Screen
            name="Main"
            component={MainTabNavigator}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Conversation"
            component={ConversationScreen}
            options={{ headerTitle: "" }}
          />
          <Stack.Screen
            name="VipUpgrade"
            component={VipUpgradeScreen}
            options={{ 
              presentation: "modal",
              headerTitle: "VIP Membership",
            }}
          />
          <Stack.Screen
            name="HiddenLocker"
            component={HiddenLockerScreen}
            options={{ headerTitle: "Hidden Locker" }}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ headerTitle: "Settings" }}
          />
          <Stack.Screen
            name="AdminReports"
            component={AdminReportsScreen}
            options={{ headerTitle: "Moderation Queue" }}
          />
          <Stack.Screen
            name="MessageRequests"
            component={MessageRequestsScreen}
            options={{ headerTitle: "Message Requests" }}
          />
          <Stack.Screen
            name="FriendRequests"
            component={FriendRequestsScreen}
            options={{ headerTitle: "Friend Requests" }}
          />
          <Stack.Screen
            name="VirtualNumber"
            component={VirtualNumberScreen}
            options={{ headerTitle: "Pryvo Number" }}
          />
          <Stack.Screen
            name="AudioCall"
            component={AudioCallScreen}
            options={{ 
              headerShown: false,
              presentation: "fullScreenModal",
            }}
          />
          <Stack.Screen
            name="VideoCall"
            component={VideoCallScreen}
            options={{ 
              headerShown: false,
              presentation: "fullScreenModal",
            }}
          />
          <Stack.Screen
            name="NewMessage"
            component={NewMessageScreen}
            options={{ 
              presentation: "modal",
              headerTitle: "New Message",
            }}
          />
          <Stack.Screen
            name="Camera"
            component={CameraScreen}
            options={{ 
              headerShown: false,
              presentation: "fullScreenModal",
            }}
          />
          <Stack.Screen
            name="MiniGames"
            component={MiniGamesScreen}
            options={{ 
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="SendPhoto"
            component={SendPhotoScreen}
            options={{ 
              headerShown: false,
              presentation: "modal",
            }}
          />
          <Stack.Screen
            name="QRCode"
            component={QRCodeScreen}
            options={{ 
              headerShown: false,
              presentation: "modal",
            }}
          />
          <Stack.Screen
            name="LastSeenPrivacy"
            component={LastSeenPrivacyScreen}
            options={{ 
              headerTitle: "Last Seen Privacy",
            }}
          />
          <Stack.Screen
            name="Support"
            component={SupportScreen}
            options={{ 
              headerTitle: "Help & Support",
            }}
          />
          <Stack.Screen
            name="Security"
            component={SecurityScreen}
            options={{ 
              headerTitle: "Security",
            }}
          />
          <Stack.Screen
            name="RecoveryCode"
            component={RecoveryCodeScreen}
            options={{ 
              headerTitle: "Recovery Code",
            }}
          />
          <Stack.Screen
            name="TrustedDevices"
            component={TrustedDevicesScreen}
            options={{ 
              headerTitle: "Trusted Devices",
            }}
          />
          <Stack.Screen
            name="SafeCode"
            component={SafeCodeScreen}
            options={{ 
              headerTitle: "Safe Code",
            }}
          />
          <Stack.Screen
            name="LoginHistory"
            component={LoginHistoryScreen}
            options={{
              headerTitle: "Login History",
            }}
          />
          <Stack.Screen
            name="PeekDetectionSettings"
            component={PeekDetectionSettingsScreen}
            options={{
              headerTitle: "Peek Detection",
            }}
          />
          <Stack.Screen
            name="Ringtone"
            component={RingtoneScreen}
            options={{ 
              headerTitle: "Ringtone",
            }}
          />
          <Stack.Screen
            name="BlockedContacts"
            component={BlockedContactsScreen}
            options={{ 
              headerTitle: "Blocked Contacts",
            }}
          />
          <Stack.Screen
            name="ForwardPicker"
            component={ForwardPickerScreen}
            options={{
              presentation: "modal",
              headerTitle: "Forward to…",
            }}
          />
          <Stack.Screen
            name="PrivacySettings"
            component={PrivacySettingsScreen}
            options={{ headerTitle: "Privacy & Messaging" }}
          />
          <Stack.Screen
            name="DisappearingMessages"
            component={DisappearingMessagesScreen}
            options={{ headerTitle: "Disappearing Messages" }}
          />
          <Stack.Screen
            name="StorySettings"
            component={StorySettingsScreen}
            options={{ headerTitle: "Stories" }}
          />
          <Stack.Screen
            name="StoryPrivacy"
            component={StoryPrivacyScreen}
            options={{ headerTitle: "Story Privacy" }}
          />
          <Stack.Screen
            name="StoryContactPicker"
            component={StoryContactPickerScreen}
            options={{ headerTitle: "Select Contacts" }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
