import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { buildRecaptchaHtml } from '@/services/recaptcha/recaptchaHtml';
import { env } from '@/config/env';
import type { RecaptchaVerifierHandle } from '@/services/recaptcha/RecaptchaVerifierModal.types';

export type { RecaptchaVerifierHandle };

interface PendingRequest {
  resolve: (token: string) => void;
  reject: (err: Error) => void;
}

const firebaseConfig = {
  apiKey: env.firebase.apiKey,
  authDomain: env.firebase.authDomain,
  projectId: env.firebase.projectId,
  messagingSenderId: env.firebase.messagingSenderId,
  appId: env.firebase.appId,
};

const RecaptchaVerifierModal = forwardRef<RecaptchaVerifierHandle>((_props, ref) => {
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const webviewRef = useRef<WebView>(null);
  const pending = useRef<PendingRequest | null>(null);
  const html = useRef(buildRecaptchaHtml(firebaseConfig)).current;

  useImperativeHandle(ref, () => ({
    verify: () =>
      new Promise<string>((resolve, reject) => {
        pending.current = { resolve, reject };
        setReady(false);
        setVisible(true);
      }),
  }));

  const handleMessage = (event: { nativeEvent: { data: string } }) => {
    let message: { type: string; token?: string; message?: string };
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }

    if (message.type === 'ready') {
      setReady(true);
      webviewRef.current?.injectJavaScript('window.runVerify(); true;');
      return;
    }
    if (message.type === 'token' && message.token) {
      pending.current?.resolve(message.token);
      pending.current = null;
      setVisible(false);
      return;
    }
    if (message.type === 'error' || message.type === 'expired') {
      pending.current?.reject(new Error(message.message || 'Verification expired. Please try again.'));
      pending.current = null;
      setVisible(false);
    }
  };

  const cancel = () => {
    pending.current?.reject(new Error('Verification cancelled.'));
    pending.current = null;
    setVisible(false);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Verifying you're human</Text>
            <Pressable onPress={cancel} hitSlop={8}>
              <Ionicons name="close" size={22} color="#64748B" />
            </Pressable>
          </View>
          {!ready && (
            <View style={styles.loading}>
              <ActivityIndicator />
            </View>
          )}
          <WebView
            ref={webviewRef}
            source={{ html }}
            onMessage={handleMessage}
            style={styles.webview}
            originWhitelist={['*']}
            javaScriptEnabled
          />
        </View>
      </View>
    </Modal>
  );
});

RecaptchaVerifierModal.displayName = 'RecaptchaVerifierModal';
export default RecaptchaVerifierModal;

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000088', alignItems: 'center', justifyContent: 'center' },
  card: { width: '90%', height: 340, backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  title: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  loading: { position: 'absolute', top: 60, left: 0, right: 0, alignItems: 'center', zIndex: 1 },
  webview: { flex: 1, backgroundColor: 'transparent' },
});
