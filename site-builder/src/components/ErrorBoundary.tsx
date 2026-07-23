import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

// The last line of defense against a fully fatal app crash. Without this, ANY uncaught
// exception thrown during render anywhere in the tree -- a project with a shape an older
// code path never expected, a rarely-hit null access -- kills the whole app outright in a
// production/TestFlight build (there's no dev-mode red screen safety net once this is a
// real build). "Try Again" remounts the whole tree from scratch, which naturally lands the
// user back on the initial screen (My Projects, once signed in) instead of re-opening
// whatever screen/project caused the crash and immediately hitting it again.
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught a render error that would otherwise have crashed the app:', error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Ionicons name="alert-circle-outline" size={48} color="#DC2626" />
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            This screen ran into a problem and couldn't continue. Your projects are safe — tap below to get back to them.
          </Text>
          <Pressable style={styles.button} onPress={() => this.setState({ error: null, componentStack: null })}>
            <Text style={styles.buttonText}>Back to My Projects</Text>
          </Pressable>
          {/* Beta-stage app with no crash reporting wired up yet -- showing the real error
              here (instead of hiding it behind a generic message) is what actually lets a
              crash like this get reported back with enough detail to fix, rather than just a
              screen recording of "it closed." */}
          <ScrollView style={styles.detailsBox}>
            <Text style={styles.detailsText} selectable>
              {this.state.error.message}
              {this.state.componentStack ? `\n${this.state.componentStack}` : ''}
            </Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#FFFFFF', gap: 12 },
  title: { fontSize: 18, fontWeight: '700', color: '#0F172A', marginTop: 4 },
  message: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20 },
  button: { marginTop: 16, backgroundColor: '#111827', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  detailsBox: { marginTop: 24, maxHeight: 160, width: '100%', backgroundColor: '#F8FAFC', borderRadius: 8, padding: 12 },
  detailsText: { fontSize: 11, color: '#94A3B8', fontFamily: 'monospace' },
});
