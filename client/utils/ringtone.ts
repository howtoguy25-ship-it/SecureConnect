import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { Asset } from 'expo-asset';

const RINGTONE_STORAGE_KEY = 'secureconnect_selected_ringtone';

export interface RingtoneOption {
  id: string;
  name: string;
  source: any;
}

export const RINGTONE_OPTIONS: RingtoneOption[] = [
  { id: 'pryvo', name: 'Pryvo', source: require('@/assets/sounds/pryvo-ringtone.mp3') },
  { id: 'default', name: 'Classic', source: require('@/assets/sounds/ringtone.wav') },
  { id: 'melody', name: 'Melody', source: require('@/assets/sounds/ringtone-melody.wav') },
];

// Outgoing ringback is a fixed brand sound — NOT the user's selected
// ringtone. This is the same UX as Snapchat / WhatsApp / Signal: the
// caller always hears the app's signature ringback while waiting for
// the callee to pick up. The callee's incoming ringtone (RINGTONE_OPTIONS)
// is independent and user-selectable.
const PRYVO_RINGBACK_SOURCE = require('@/assets/sounds/pryvo-ringback.mp3');

type PlaybackMode = 'none' | 'preview' | 'incoming' | 'outgoing';

let incomingPlayer: ReturnType<typeof createAudioPlayer> | null = null;
let outgoingPlayer: ReturnType<typeof createAudioPlayer> | null = null;
let previewPlayer: ReturnType<typeof createAudioPlayer> | null = null;
let webAudio: HTMLAudioElement | null = null;
let currentMode: PlaybackMode = 'none';
let cachedRingtoneId: string | null = null;

export async function getSelectedRingtoneId(): Promise<string> {
  if (cachedRingtoneId) return cachedRingtoneId;
  try {
    const stored = await AsyncStorage.getItem(RINGTONE_STORAGE_KEY);
    cachedRingtoneId = stored || 'pryvo';
    return cachedRingtoneId;
  } catch {
    return 'pryvo';
  }
}

export async function setSelectedRingtoneId(id: string): Promise<void> {
  cachedRingtoneId = id;
  try {
    await AsyncStorage.setItem(RINGTONE_STORAGE_KEY, id);
  } catch (error) {
    console.error('Error saving ringtone preference:', error);
  }
}

function getRingtoneSource(id: string): any {
  const option = RINGTONE_OPTIONS.find(r => r.id === id);
  return option ? option.source : RINGTONE_OPTIONS[0].source;
}

function releasePlayer(player: ReturnType<typeof createAudioPlayer> | null) {
  if (!player) return;
  try {
    player.pause();
    player.release();
  } catch (error) {
    console.error('Error releasing player:', error);
  }
}

function stopWebAudio() {
  if (webAudio) {
    try {
      webAudio.pause();
      webAudio.currentTime = 0;
      webAudio.src = '';
    } catch {}
    webAudio = null;
  }
}

async function getWebAudioUri(source: any): Promise<string | null> {
  try {
    const asset = Asset.fromModule(source);
    await asset.downloadAsync();
    return asset.localUri || asset.uri || null;
  } catch (error) {
    console.error('Error resolving audio asset URI:', error);
    return null;
  }
}

async function playWebAudio(source: any, loop: boolean): Promise<void> {
  stopWebAudio();
  const uri = await getWebAudioUri(source);
  if (!uri) return;
  const audio = new Audio(uri);
  audio.loop = loop;
  audio.volume = 1.0;
  await audio.play();
  webAudio = audio;
}

async function playNativeAudio(source: any, loop: boolean, isIncoming: boolean): Promise<ReturnType<typeof createAudioPlayer>> {
  await setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
    shouldPlayInBackground: isIncoming,
  });

  const player = createAudioPlayer(source);
  player.loop = loop;
  player.volume = 1.0;
  player.play();
  return player;
}

export async function playIncomingCallRingtone(): Promise<void> {
  if (currentMode === 'incoming') return;

  stopPreview();

  try {
    const ringtoneId = await getSelectedRingtoneId();
    const source = getRingtoneSource(ringtoneId);

    if (Platform.OS === 'web') {
      await playWebAudio(source, true);
    } else {
      incomingPlayer = await playNativeAudio(source, true, true);
    }
    currentMode = 'incoming';
  } catch (error) {
    console.error('Error playing ringtone:', error);
    currentMode = 'none';
  }
}

export async function playRingtonePreview(ringtoneId: string): Promise<void> {
  if (currentMode === 'incoming') return;

  stopPreview();

  try {
    const source = getRingtoneSource(ringtoneId);

    if (Platform.OS === 'web') {
      await playWebAudio(source, false);
    } else {
      previewPlayer = await playNativeAudio(source, false, false);
    }
    currentMode = 'preview';

    const playerRef = Platform.OS === 'web' ? webAudio : previewPlayer;
    setTimeout(() => {
      const currentRef = Platform.OS === 'web' ? webAudio : previewPlayer;
      if (currentRef === playerRef) {
        stopPreview();
      }
    }, 3000);
  } catch (error) {
    console.error('Error playing ringtone preview:', error);
    if (currentMode === 'preview') currentMode = 'none';
  }
}

export function stopPreview(): void {
  if (Platform.OS === 'web') {
    stopWebAudio();
  } else {
    releasePlayer(previewPlayer);
    previewPlayer = null;
  }
  if (currentMode === 'preview') currentMode = 'none';
}

export async function stopIncomingCallRingtone(): Promise<void> {
  if (Platform.OS === 'web') {
    stopWebAudio();
  } else {
    releasePlayer(incomingPlayer);
    incomingPlayer = null;
    releasePlayer(previewPlayer);
    previewPlayer = null;
  }
  currentMode = 'none';
}

export function isRingtonePlaying(): boolean {
  return currentMode !== 'none';
}

export function isPreviewPlaying(): boolean {
  return currentMode === 'preview';
}

// Outgoing ringback — played by the CALLER while waiting for the callee to
// answer. Same audio asset as the incoming ringtone but at a lower volume so
// it feels like a ringback tone rather than the callee's ringtone leaking
// out of the earpiece. Stops automatically on call connect/end/unmount via
// stopOutgoingRingback().
export async function playOutgoingRingback(): Promise<void> {
  if (currentMode === 'outgoing' || currentMode === 'incoming') return;

  stopPreview();

  try {
    // Fixed brand asset — NOT the user's selected ringtone. The caller
    // always hears the Pryvo signature ringback while waiting.
    const source = PRYVO_RINGBACK_SOURCE;

    if (Platform.OS === 'web') {
      stopWebAudio();
      const uri = await getWebAudioUri(source);
      if (!uri) return;
      const audio = new Audio(uri);
      audio.loop = true;
      audio.volume = 0.4; // softer than incoming ringtone
      await audio.play();
      webAudio = audio;
    } else {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
      });
      const player = createAudioPlayer(source);
      player.loop = true;
      player.volume = 0.4;
      player.play();
      outgoingPlayer = player;
    }
    currentMode = 'outgoing';
  } catch (error) {
    console.error('Error playing outgoing ringback:', error);
    currentMode = 'none';
  }
}

export async function stopOutgoingRingback(): Promise<void> {
  // Mode-guarded: webAudio is a single shared HTMLAudioElement across
  // incoming/preview/outgoing on web, so blindly calling stopWebAudio() here
  // would silence the incoming ringtone or a preview if either was active.
  // Only tear down playback when WE own the current playback mode.
  if (currentMode !== 'outgoing') return;
  if (Platform.OS === 'web') {
    stopWebAudio();
  } else {
    releasePlayer(outgoingPlayer);
    outgoingPlayer = null;
  }
  currentMode = 'none';
}
