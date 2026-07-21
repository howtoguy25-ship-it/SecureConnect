import { Alert, Platform } from 'react-native';

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

// react-native-web's Alert.alert is a literal no-op (see
// node_modules/react-native-web/dist/exports/Alert: `static alert() {}`) -- every
// Alert.alert(...) call in this app was silently doing nothing on web. That's why purchase
// errors, delete confirmations, sign-in failures, etc. all looked like dead buttons in the
// browser even though the underlying logic ran fine; nothing was actually broken except the
// feedback itself never appearing. This wraps both platforms with one implementation that
// always shows something real.
export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons as any);
    return;
  }

  const fullText = message ? `${title}\n\n${message}` : title;
  const list = buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }];

  // A cancel/confirm pair reads naturally as a browser confirm(); a single button (or 3+,
  // which a browser dialog can't represent anyway) just needs acknowledgement.
  if (list.length === 2 && list.some((b) => b.style === 'cancel')) {
    const cancelBtn = list.find((b) => b.style === 'cancel')!;
    const confirmBtn = list.find((b) => b !== cancelBtn)!;
    if (window.confirm(fullText)) {
      confirmBtn.onPress?.();
    } else {
      cancelBtn.onPress?.();
    }
    return;
  }

  window.alert(fullText);
  list[0].onPress?.();
}
