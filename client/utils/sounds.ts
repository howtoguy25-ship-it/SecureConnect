import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { haptics } from '@/lib/haptics';
import { Platform } from 'react-native';

const sendSoundSource = require('@/assets/sounds/message-send.wav');
const receiveSoundSource = require('@/assets/sounds/message-receive.wav');

let sendPlayer: ReturnType<typeof createAudioPlayer> | null = null;
let receivePlayer: ReturnType<typeof createAudioPlayer> | null = null;
let soundsInitialized = false;

export async function initializeSounds() {
  if (soundsInitialized) return;

  try {
    await setAudioModeAsync({
      playsInSilentMode: false,
    });

    sendPlayer = createAudioPlayer(sendSoundSource);
    receivePlayer = createAudioPlayer(receiveSoundSource);

    soundsInitialized = true;
  } catch (error) {
    console.log('Audio mode setup failed:', error);
  }
}

export async function playSendSound() {
  try {
    haptics.light();
    if (sendPlayer) {
      sendPlayer.seekTo(0);
      sendPlayer.play();
    }
  } catch (error) {
    console.log('Send sound error:', error);
  }
}

export async function playReceiveSound() {
  try {
    haptics.success();
    if (receivePlayer) {
      receivePlayer.seekTo(0);
      receivePlayer.play();
    }
  } catch (error) {
    console.log('Receive sound error:', error);
  }
}

export async function cleanupSounds() {
  try {
    if (sendPlayer) {
      sendPlayer.release();
      sendPlayer = null;
    }
    if (receivePlayer) {
      receivePlayer.release();
      receivePlayer = null;
    }
    soundsInitialized = false;
  } catch (error) {
    console.log('Sound cleanup error:', error);
  }
}
