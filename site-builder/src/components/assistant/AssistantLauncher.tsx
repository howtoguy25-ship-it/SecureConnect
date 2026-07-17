import React, { useState } from 'react';
import { Pressable, StyleSheet, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AssistantChatScreen from '@/components/assistant/AssistantChatScreen';

// Rendered as a sibling of the main Stack.Navigator (see RootNavigator) so it floats above
// every signed-in screen rather than living inside one of them.
export default function AssistantLauncher() {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 20 }]}
        onPress={() => setOpen(true)}
        hitSlop={8}
      >
        <Ionicons name="sparkles" size={24} color="#FFFFFF" />
      </Pressable>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <AssistantChatScreen onClose={() => setOpen(false)} />
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4338CA',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
