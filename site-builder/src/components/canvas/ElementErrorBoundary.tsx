import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

// Isolates one element's render failure from the rest of the canvas. Both the real Editor
// canvas and the AI build's live preview map an array of elements straight into
// ElementRenderer with no isolation between them -- one malformed element (a partial/
// incrementally-written AI result, an old-schema element from before some field existed)
// throwing during render used to take the *entire* screen down with it, which is exactly
// what turns "one bad element" into "the whole app closed." Catching it here instead just
// blanks out that one element's spot and leaves everything else on screen working.
export default class ElementErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('ElementErrorBoundary caught a bad element render:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.placeholder}>
          <Ionicons name="warning-outline" size={18} color="#94A3B8" />
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
  },
});
