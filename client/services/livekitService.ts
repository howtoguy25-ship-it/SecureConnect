import { Platform } from 'react-native';

// Single shared init barrier. The first caller dynamic-imports the LiveKit
// RN SDK and runs registerGlobals(); concurrent callers await the same
// promise so registerGlobals() runs exactly once and ALWAYS completes
// before any consumer constructs a Room. Exported so MainApp can warm
// the barrier at app start.
let livekitInitPromise: Promise<any> | null = null;
export function ensureLiveKitInitialized(): Promise<any> {
  if (Platform.OS === 'web') return Promise.resolve(null);
  if (livekitInitPromise) return livekitInitPromise;
  livekitInitPromise = (async () => {
    try {
      const lk: any = await import('@livekit/react-native');
      if (typeof lk.registerGlobals === 'function') {
        lk.registerGlobals();
      }
      return lk;
    } catch (e) {
      // Reset so a later retry (e.g. after a JS reload) gets a fresh shot.
      livekitInitPromise = null;
      throw e;
    }
  })();
  return livekitInitPromise;
}

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnecting';

export interface LiveKitRoom {
  name: string;
  sid: string;
  isConnected: boolean;
}

export interface RemoteParticipantInfo {
  identity: string;
  isMuted: boolean;
  videoTrack: any | null;
}

export interface RoomEventHandlers {
  onConnected?: (room: LiveKitRoom) => void;
  onDisconnected?: (room: LiveKitRoom, error?: Error) => void;
  onReconnecting?: (error: Error) => void;
  onReconnected?: () => void;
  onConnectionStateChanged?: (state: ConnectionState) => void;
  onParticipantConnected?: (identity: string) => void;
  onParticipantDisconnected?: (identity: string) => void;
  onRemoteParticipantsChanged?: (participants: RemoteParticipantInfo[]) => void;
}

class LiveKitService {
  private room: any = null;
  private LiveKit: any = null;
  private connectionState: ConnectionState = 'disconnected';
  private eventHandlers: RoomEventHandlers = {};
  private currentRoomInfo: LiveKitRoom | null = null;
  private localAudioEnabled = true;
  private localVideoEnabled = true;
  private usingFrontCamera = true;
  private speakerEnabled = false;
  private remoteParticipants: Map<string, RemoteParticipantInfo> = new Map();
  // Phase C.3: whether the most-recent connect attempt actually wired
  // up media-frame E2EE. Surfaced to the call screen for the honest
  // "E2EE active" indicator.
  private e2eeActive = false;

  setEventHandlers(handlers: RoomEventHandlers) {
    this.eventHandlers = handlers;
  }

  private setState(state: ConnectionState) {
    this.connectionState = state;
    this.eventHandlers.onConnectionStateChanged?.(state);
  }

  private emitRemoteParticipants() {
    this.eventHandlers.onRemoteParticipantsChanged?.(
      Array.from(this.remoteParticipants.values())
    );
  }

  private async loadSDK(): Promise<boolean> {
    if (this.LiveKit) return true;
    if (Platform.OS === 'web') return false;
    try {
      // Use the shared init barrier so registerGlobals() is guaranteed to
      // have run before we hand the SDK back. Without this, a fast incoming
      // call can race the module-top IIFE in MainApp and construct a Room
      // before WebRTC globals are wired, producing silent calls.
      this.LiveKit = await ensureLiveKitInitialized();
      return !!this.LiveKit;
    } catch {
      console.log('[LiveKit] Native SDK not available, using simulation mode');
      return false;
    }
  }

  async connect(
    url: string,
    token: string,
    options: {
      enableVideo?: boolean;
      enableAudio?: boolean;
      // Phase C.3: when supplied, the native LiveKit room is configured
      // with `RNKeyProvider` + `RNE2EEManager` and this 32-byte symmetric
      // key drives the media-frame encryption. Both sides must derive
      // the same key (X25519 + HKDF over the per-call salt) for media
      // to decode. If E2EE setup fails for any reason, we fall back to
      // a plain (transport-only-encrypted) call so the call still goes
      // through — the UI is honest about which mode is active via
      // `isE2EEActive()`.
      e2eeKey?: Uint8Array;
    } = {}
  ): Promise<LiveKitRoom | null> {
    if (this.connectionState !== 'disconnected') {
      await this.disconnect();
    }

    this.localAudioEnabled = options.enableAudio ?? true;
    this.localVideoEnabled = options.enableVideo ?? false;
    this.remoteParticipants.clear();
    this.e2eeActive = false;

    this.setState('connecting');

    if (Platform.OS === 'web') {
      // Web uses the livekit-client JS SDK (separate package from the RN
      // SDK). Without this branch web fell into connectSimulated() which
      // faked the connection — the call rang but no mic capture or audio
      // playback ever happened, so neither side could hear the other.
      return this.connectWeb(url, token);
    }

    const sdkLoaded = await this.loadSDK();
    if (sdkLoaded) {
      return this.connectNative(url, token, options.e2eeKey);
    } else {
      return this.connectSimulated(url, token);
    }
  }

  // Web audio-element registry. Remote audio tracks must be attached to a
  // live HTMLAudioElement in the DOM or the browser will not produce sound.
  // We keep a sid → element map so we can detach + remove on unsubscribe /
  // disconnect (otherwise stale elements pile up across calls).
  private webAudioElements: Map<string, HTMLAudioElement> = new Map();

  private async connectWeb(url: string, token: string): Promise<LiveKitRoom | null> {
    try {
      const lkWeb: any = await import('livekit-client');
      const { Room, RoomEvent, Track } = lkWeb;

      this.LiveKit = lkWeb; // so isNativeAvailable / Track lookups elsewhere work
      this.room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      this.e2eeActive = false; // frame E2EE not wired on web (RN-only manager)

      this.room.on(RoomEvent.Connected, () => {
        const info: LiveKitRoom = {
          name: this.room.name || 'room',
          sid: this.room.sid || '',
          isConnected: true,
        };
        this.currentRoomInfo = info;
        this.setState('connected');
        this.eventHandlers.onConnected?.(info);
        for (const [, participant] of this.room.remoteParticipants) {
          this.trackRemoteParticipant(participant);
        }
      });

      this.room.on(RoomEvent.Disconnected, (error?: Error) => {
        this.setState('disconnected');
        if (this.currentRoomInfo) {
          this.eventHandlers.onDisconnected?.(this.currentRoomInfo, error);
        }
        this.currentRoomInfo = null;
        this.room = null;
        this.remoteParticipants.clear();
        this.detachAllWebAudio();
      });

      this.room.on(RoomEvent.Reconnecting, () => {
        this.setState('reconnecting');
        this.eventHandlers.onReconnecting?.(new Error('Reconnecting'));
      });
      this.room.on(RoomEvent.Reconnected, () => {
        this.setState('connected');
        this.eventHandlers.onReconnected?.();
      });

      this.room.on(RoomEvent.ParticipantConnected, (participant: any) => {
        this.trackRemoteParticipant(participant);
        this.eventHandlers.onParticipantConnected?.(participant.identity);
      });
      this.room.on(RoomEvent.ParticipantDisconnected, (participant: any) => {
        this.remoteParticipants.delete(participant.identity);
        this.emitRemoteParticipants();
        this.eventHandlers.onParticipantDisconnected?.(participant.identity);
      });

      this.room.on(RoomEvent.TrackSubscribed, (track: any, _pub: any, participant: any) => {
        // CRITICAL: on web, remote audio only plays if its MediaStreamTrack
        // is attached to a live <audio> element in the DOM. Without this,
        // the WebRTC connection is established and packets flow but the
        // browser has no sink for the audio — both sides go silent.
        if (track?.kind === Track.Kind.Audio || track?.kind === 'audio') {
          try {
            const el: HTMLAudioElement = track.attach();
            el.autoplay = true;
            (el as any).playsInline = true;
            el.style.display = 'none';
            document.body.appendChild(el);
            const sid = track.sid ?? `${participant.identity}:${Date.now()}`;
            this.webAudioElements.set(sid, el);
            // Some browsers gate autoplay until a user gesture even though
            // the user just clicked "Answer" — call play() explicitly so
            // the gesture-attribution chain reaches the audio element.
            el.play().catch((e) => console.warn('[LiveKit web] audio play() rejected:', e));
          } catch (e) {
            console.warn('[LiveKit web] attach audio failed:', e);
          }
        }
        this.trackRemoteParticipant(participant);
      });

      this.room.on(RoomEvent.TrackUnsubscribed, (track: any, _pub: any, participant: any) => {
        try {
          const sid = track?.sid;
          if (sid && this.webAudioElements.has(sid)) {
            const el = this.webAudioElements.get(sid)!;
            try { track.detach(el); } catch {}
            try { el.remove(); } catch {}
            this.webAudioElements.delete(sid);
          } else if (typeof track?.detach === 'function') {
            // Fallback: detach all elements this track is currently bound to.
            const els: HTMLMediaElement[] = track.detach();
            for (const el of els ?? []) { try { (el as any).remove?.(); } catch {} }
          }
        } catch {}
        this.trackRemoteParticipant(participant);
      });

      this.room.on(RoomEvent.TrackMuted, (_pub: any, participant: any) => {
        this.trackRemoteParticipant(participant);
      });
      this.room.on(RoomEvent.TrackUnmuted, (_pub: any, participant: any) => {
        this.trackRemoteParticipant(participant);
      });

      await this.room.connect(url, token);

      // Capture mic. setMicrophoneEnabled(true) calls getUserMedia under the
      // hood — browser will show the mic permission prompt the first time.
      // If the user blocked the mic the promise rejects and we surface it.
      try {
        await this.room.localParticipant.setMicrophoneEnabled(this.localAudioEnabled);
      } catch (e) {
        console.error('[LiveKit web] mic enable failed (permission denied?):', e);
        throw new Error('Microphone permission denied. Allow microphone access in your browser settings and try again.');
      }
      if (this.localVideoEnabled) {
        try {
          await this.room.localParticipant.setCameraEnabled(true);
        } catch (e) {
          console.warn('[LiveKit web] camera enable failed:', e);
        }
      }

      const info: LiveKitRoom = {
        name: this.room.name || 'room',
        sid: this.room.sid || '',
        isConnected: true,
      };
      this.currentRoomInfo = info;
      return info;
    } catch (error: any) {
      console.error('[LiveKit web] connect failed:', error);
      try { if (this.room?.disconnect) await this.room.disconnect(); } catch {}
      this.room = null;
      this.remoteParticipants.clear();
      this.emitRemoteParticipants();
      this.detachAllWebAudio();
      this.setState('disconnected');
      throw error;
    }
  }

  private detachAllWebAudio() {
    if (Platform.OS !== 'web') return;
    for (const [, el] of this.webAudioElements) {
      try { el.pause(); } catch {}
      try { el.remove(); } catch {}
    }
    this.webAudioElements.clear();
  }

  private async connectNative(
    url: string,
    token: string,
    e2eeKey?: Uint8Array,
  ): Promise<LiveKitRoom | null> {
    try {
      const { Room, RoomEvent, Track, RNKeyProvider, RNE2EEManager } = this.LiveKit;

      // Phase C.3: try to wire up frame E2EE if a key was provided AND
      // the LiveKit RN SDK exposes the E2EE manager (older builds don't).
      let e2eeOption: any = undefined;
      if (e2eeKey && RNKeyProvider && RNE2EEManager) {
        try {
          const keyProvider = new RNKeyProvider({});
          await keyProvider.setSharedKey(e2eeKey);
          const e2eeManager = new RNE2EEManager(keyProvider);
          e2eeOption = { e2eeManager };
        } catch (e) {
          console.warn('[LiveKit] E2EE setup failed, falling back to transport-only:', e);
          e2eeOption = undefined;
        }
      }

      this.room = new Room({
        adaptiveStream: true,
        dynacast: true,
        ...(e2eeOption ? { e2ee: e2eeOption } : {}),
      });
      this.e2eeActive = !!e2eeOption;

      this.room.on(RoomEvent.Connected, () => {
        const info: LiveKitRoom = {
          name: this.room.name || 'room',
          sid: this.room.sid || '',
          isConnected: true,
        };
        this.currentRoomInfo = info;
        this.setState('connected');
        this.eventHandlers.onConnected?.(info);

        // Snapshot any already-present remote participants
        for (const [, participant] of this.room.remoteParticipants) {
          this.trackRemoteParticipant(participant);
        }
      });

      this.room.on(RoomEvent.Disconnected, (error?: Error) => {
        this.setState('disconnected');
        if (this.currentRoomInfo) {
          this.eventHandlers.onDisconnected?.(this.currentRoomInfo, error);
        }
        this.currentRoomInfo = null;
        this.room = null;
        this.remoteParticipants.clear();
      });

      this.room.on(RoomEvent.Reconnecting, () => {
        this.setState('reconnecting');
        this.eventHandlers.onReconnecting?.(new Error('Reconnecting'));
      });

      this.room.on(RoomEvent.Reconnected, () => {
        this.setState('connected');
        this.eventHandlers.onReconnected?.();
      });

      this.room.on(RoomEvent.ParticipantConnected, (participant: any) => {
        this.trackRemoteParticipant(participant);
        this.eventHandlers.onParticipantConnected?.(participant.identity);
      });

      this.room.on(RoomEvent.ParticipantDisconnected, (participant: any) => {
        this.remoteParticipants.delete(participant.identity);
        this.emitRemoteParticipants();
        this.eventHandlers.onParticipantDisconnected?.(participant.identity);
      });

      this.room.on(RoomEvent.TrackSubscribed, (_track: any, _pub: any, participant: any) => {
        this.trackRemoteParticipant(participant);
      });

      this.room.on(RoomEvent.TrackUnsubscribed, (_track: any, _pub: any, participant: any) => {
        this.trackRemoteParticipant(participant);
      });

      this.room.on(RoomEvent.TrackMuted, (_pub: any, participant: any) => {
        this.trackRemoteParticipant(participant);
      });

      this.room.on(RoomEvent.TrackUnmuted, (_pub: any, participant: any) => {
        this.trackRemoteParticipant(participant);
      });

      // CRITICAL: start the native audio session BEFORE connecting. Without
      // this, iOS never activates the PlayAndRecord/voiceChat AVAudioSession
      // and Android never grabs the WebRTC mic/speaker route — the room
      // connects fine but both participants hear silence. This is the
      // #1 documented gotcha for @livekit/react-native and is the bug
      // behind "calls connect but no audio".
      const { AudioSession } = this.LiveKit;
      if (AudioSession && typeof AudioSession.startAudioSession === 'function') {
        try {
          await AudioSession.startAudioSession();
        } catch (e) {
          console.warn('[LiveKit] startAudioSession failed:', e);
        }
      }

      await this.room.connect(url, token);

      // Phase C.3: enable E2EE on the room AFTER connect (per LiveKit
      // RN docs — the manager has to be wired up to the engine first).
      if (this.e2eeActive) {
        try {
          await this.room.setE2EEEnabled(true);
        } catch (e) {
          console.warn('[LiveKit] setE2EEEnabled failed:', e);
          this.e2eeActive = false;
        }
      }

      await this.room.localParticipant.setMicrophoneEnabled(this.localAudioEnabled);
      if (this.localVideoEnabled) {
        await this.room.localParticipant.setCameraEnabled(true);
      }

      // Set initial audio routing
      await this.applyAudioMode();

      const info: LiveKitRoom = {
        name: this.room.name || 'room',
        sid: this.room.sid || '',
        isConnected: true,
      };
      this.currentRoomInfo = info;
      return info;
    } catch (error: any) {
      console.error('[LiveKit] Native connect failed:', error);
      // Full cleanup on partial connect — otherwise a failed attempt leaves
      // the native AVAudioSession active and/or a half-constructed Room
      // hanging around. A retry would then start a *second* audio session
      // on top of the stale one and silent-audio symptoms can re-emerge.
      try {
        if (this.room?.disconnect) {
          await this.room.disconnect();
        }
      } catch {}
      this.room = null;
      this.remoteParticipants.clear();
      this.emitRemoteParticipants();
      try {
        const { AudioSession } = this.LiveKit || {};
        if (AudioSession && typeof AudioSession.stopAudioSession === 'function') {
          await AudioSession.stopAudioSession();
        }
      } catch {}
      this.setState('disconnected');
      throw error;
    }
  }

  private trackRemoteParticipant(participant: any) {
    if (!participant) return;
    const { Track } = this.LiveKit || {};
    let videoTrack: any = null;
    try {
      for (const [, pub] of participant.videoTrackPublications ?? []) {
        if (pub.isSubscribed && pub.track && pub.source !== (Track?.Source?.ScreenShare)) {
          videoTrack = pub.track;
          break;
        }
      }
    } catch {}
    const isMuted = participant.isMicrophoneEnabled === false;
    this.remoteParticipants.set(participant.identity, {
      identity: participant.identity,
      isMuted,
      videoTrack,
    });
    this.emitRemoteParticipants();
  }

  private async connectSimulated(url: string, token: string): Promise<LiveKitRoom> {
    console.log('[LiveKit] Simulation mode — EAS build required for real calls');
    await new Promise((r) => setTimeout(r, 500));

    const info: LiveKitRoom = {
      name: `sim_${Date.now()}`,
      sid: `SIM_${Date.now()}`,
      isConnected: true,
    };
    this.currentRoomInfo = info;
    this.setState('connected');
    this.eventHandlers.onConnected?.(info);
    return info;
  }

  async disconnect() {
    try {
      if (this.room) {
        await this.room.disconnect();
        this.room = null;
      }
    } catch {}
    this.setState('disconnected');
    this.currentRoomInfo = null;
    this.remoteParticipants.clear();

    // Web: rip down all <audio> sinks so the next call starts clean and
    // we don't leak DOM nodes (each call would otherwise leave a hidden
    // <audio> element behind).
    this.detachAllWebAudio();

    // Native: tear down the native audio session so the OS can release
    // the mic / route audio back to other apps. Symmetrical with
    // startAudioSession() in connectNative — must always run on
    // disconnect or the next call can inherit a stale session in a
    // bad state.
    try {
      const lk = this.LiveKit;
      if (Platform.OS !== 'web' && lk?.AudioSession && typeof lk.AudioSession.stopAudioSession === 'function') {
        await lk.AudioSession.stopAudioSession();
      }
    } catch {}
  }

  toggleLocalAudio(): boolean {
    this.localAudioEnabled = !this.localAudioEnabled;
    if (this.room?.localParticipant) {
      this.room.localParticipant.setMicrophoneEnabled(this.localAudioEnabled).catch(() => {});
    }
    return this.localAudioEnabled;
  }

  toggleLocalVideo(): boolean {
    this.localVideoEnabled = !this.localVideoEnabled;
    if (this.room?.localParticipant) {
      this.room.localParticipant.setCameraEnabled(this.localVideoEnabled).catch(() => {});
    }
    return this.localVideoEnabled;
  }

  async toggleSpeaker(): Promise<boolean> {
    this.speakerEnabled = !this.speakerEnabled;
    await this.applyAudioMode();
    return this.speakerEnabled;
  }

  private async applyAudioMode() {
    // Speaker routing is owned by LiveKit's AudioSession on iOS/Android —
    // calling expo-audio's setAudioModeAsync here used to silently stomp
    // LiveKit's category and result in earpiece-only or silent output.
    //
    // Runtime toggle (post-connect) uses selectAudioOutput on both
    // platforms — configureAudio is for pre-connect setup, not for
    // live route switching.
    const lk = this.LiveKit;
    if (!lk?.AudioSession) {
      if (this.room?.setSpeakerphoneOn) {
        try { await this.room.setSpeakerphoneOn(this.speakerEnabled); } catch {}
      }
      return;
    }

    try {
      if (Platform.OS === 'ios' && typeof lk.AudioSession.selectAudioOutput === 'function') {
        // iOS: force_speaker / default are the documented runtime values.
        await lk.AudioSession.selectAudioOutput(this.speakerEnabled ? 'force_speaker' : 'default');
      } else if (Platform.OS === 'android' && typeof lk.AudioSession.selectAudioOutput === 'function') {
        // Android valid outputs: 'speaker' | 'earpiece' | 'headset' | 'bluetooth'
        await lk.AudioSession.selectAudioOutput(this.speakerEnabled ? 'speaker' : 'earpiece');
      } else if (this.room?.setSpeakerphoneOn) {
        await this.room.setSpeakerphoneOn(this.speakerEnabled);
      }
    } catch (e) {
      console.warn('[LiveKit] applyAudioMode failed:', e);
    }
  }

  flipCamera() {
    this.usingFrontCamera = !this.usingFrontCamera;
    if (this.room?.localParticipant) {
      const videoTrackPub = Array.from(
        this.room.localParticipant.videoTrackPublications.values()
      )[0] as any;
      if (videoTrackPub?.track) {
        videoTrackPub.track.restartTrack({
          facingMode: this.usingFrontCamera ? 'user' : 'environment',
        }).catch(() => {});
      }
    }
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  isNativeAvailable(): boolean {
    return this.LiveKit !== null;
  }

  isSpeakerEnabled(): boolean {
    return this.speakerEnabled;
  }

  isLocalAudioEnabled(): boolean {
    return this.localAudioEnabled;
  }

  isLocalVideoEnabled(): boolean {
    return this.localVideoEnabled;
  }

  isE2EEActive(): boolean {
    return this.e2eeActive;
  }

  getRemoteParticipants(): RemoteParticipantInfo[] {
    return Array.from(this.remoteParticipants.values());
  }

  getRoom(): any {
    return this.room;
  }
}

export const livekitService = new LiveKitService();
