import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AssistantChatScreen from '@/components/assistant/AssistantChatScreen';
import { navigationRef, currentScreenName } from '@/navigation/navigationRef';

// The Editor screen has its own persistent bottom toolbar (Elements/Text/Image/Slideshow/
// Video/Product/Bar) -- lift the launcher above it there so it doesn't sit on top of the
// last tab button, which is the only screen with a bottom bar tall enough to collide with
// the launcher's default position.
const EDITOR_TOOLBAR_CLEARANCE = 72;

// Rendered as a sibling of the main Stack.Navigator (see RootNavigator) so it floats above
// every signed-in screen rather than living inside one of them.
export default function AssistantLauncher() {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [screenName, setScreenName] = useState(currentScreenName());

  useEffect(() => {
    const unsubscribe = navigationRef.addListener('state', () => {
      setScreenName(currentScreenName());
    });
    return unsubscribe;
  }, []);

  const bottomOffset = insets.bottom + 20 + (screenName === 'Editor' ? EDITOR_TOOLBAR_CLEARANCE : 0);

  return (
    <>
      <Pressable
        style={[styles.fab, { bottom: bottomOffset }]}
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
