import { Platform } from 'react-native';

export interface TwilioRoom {
  name: string;
  sid: string;
  isConnected: boolean;
  nativeRoom?: any;
}

export interface TwilioParticipant {
  identity: string;
  sid: string;
  videoEnabled: boolean;
  audioEnabled: boolean;
}

export interface VideoTrack {
  trackSid: string;
  trackName: string;
  enabled: boolean;
}

export interface AudioTrack {
  trackSid: string;
  trackName: string;
  enabled: boolean;
}

export type ConnectionState = 
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnecting';

export interface RoomEventHandlers {
  onConnected?: (room: TwilioRoom) => void;
  onDisconnected?: (room: TwilioRoom, error?: Error) => void;
  onParticipantConnected?: (participant: TwilioParticipant) => void;
  onParticipantDisconnected?: (participant: TwilioParticipant) => void;
  onReconnecting?: (error: Error) => void;
  onReconnected?: () => void;
  onConnectionStateChanged?: (state: ConnectionState) => void;
  onRemoteVideoTrackAdded?: (participant: TwilioParticipant, track: VideoTrack) => void;
  onRemoteAudioTrackAdded?: (participant: TwilioParticipant, track: AudioTrack) => void;
}

class TwilioVideoService {
  private currentRoom: TwilioRoom | null = null;
  private eventHandlers: RoomEventHandlers = {};
  private connectionState: ConnectionState = 'disconnected';
  private localVideoEnabled: boolean = true;
  private localAudioEnabled: boolean = true;
  private useFrontCamera: boolean = true;
  private nativeRoom: any = null;
  private TwilioVideo: any = null;

  constructor() {
    this.initializeNativeSDK();
  }

  private async initializeNativeSDK(): Promise<void> {
    console.log('[TwilioVideo] Native SDK requires EAS Build - using simulation mode');
    this.TwilioVideo = null;
  }

  isNativeSupported(): boolean {
    return (Platform.OS === 'ios' || Platform.OS === 'android') && this.TwilioVideo !== null;
  }

  isWebSupported(): boolean {
    return Platform.OS === 'web';
  }

  hasNativeSDK(): boolean {
    return this.TwilioVideo !== null;
  }

  setEventHandlers(handlers: RoomEventHandlers): void {
    this.eventHandlers = handlers;
  }

  async connect(token: string, roomName: string, options?: {
    enableVideo?: boolean;
    enableAudio?: boolean;
  }): Promise<TwilioRoom | null> {
    if (this.currentRoom) {
      console.warn('Already connected to a room. Disconnect first.');
      return null;
    }

    this.connectionState = 'connecting';
    this.eventHandlers.onConnectionStateChanged?.('connecting');
    this.localVideoEnabled = options?.enableVideo ?? true;
    this.localAudioEnabled = options?.enableAudio ?? true;

    try {
      if (Platform.OS === 'web') {
        return await this.connectWeb(token, roomName);
      } else if (this.TwilioVideo) {
        return await this.connectNative(token, roomName);
      } else {
        console.log('[TwilioVideo] SDK not available, using simulation mode');
        return await this.connectSimulated(token, roomName);
      }
    } catch (error) {
      console.error('Failed to connect to room:', error);
      this.connectionState = 'disconnected';
      this.eventHandlers.onConnectionStateChanged?.('disconnected');
      if (this.currentRoom) {
        this.eventHandlers.onDisconnected?.(this.currentRoom, error as Error);
      }
      return null;
    }
  }

  private async connectWeb(token: string, roomName: string): Promise<TwilioRoom> {
    console.log(`[Web] Connecting to room: ${roomName}`);
    
    const room: TwilioRoom = {
      name: roomName,
      sid: `RM${Date.now()}`,
      isConnected: true,
    };

    this.currentRoom = room;
    this.connectionState = 'connected';
    this.eventHandlers.onConnectionStateChanged?.('connected');
    this.eventHandlers.onConnected?.(room);

    return room;
  }

  private async connectSimulated(token: string, roomName: string): Promise<TwilioRoom> {
    console.log(`[Simulated] Connecting to room: ${roomName}`);
    console.log('[Simulated] Note: Full video calling requires EAS Build with native Twilio SDK');
    
    const room: TwilioRoom = {
      name: roomName,
      sid: `RM${Date.now()}`,
      isConnected: true,
    };

    this.currentRoom = room;
    this.connectionState = 'connected';
    this.eventHandlers.onConnectionStateChanged?.('connected');
    this.eventHandlers.onConnected?.(room);

    return room;
  }

  private async connectNative(token: string, roomName: string): Promise<TwilioRoom> {
    console.log(`[Native] Connecting to Twilio room: ${roomName}`);
    
    try {
      const connectOptions = {
        roomName,
        accessToken: token,
        enableVideo: this.localVideoEnabled,
        enableAudio: this.localAudioEnabled,
        enableAutomaticSubscription: true,
      };

      this.nativeRoom = await this.TwilioVideo.connect(connectOptions);
      
      this.setupNativeRoomEventListeners();

      const room: TwilioRoom = {
        name: this.nativeRoom.name || roomName,
        sid: this.nativeRoom.sid || `RM${Date.now()}`,
        isConnected: true,
        nativeRoom: this.nativeRoom,
      };

      this.currentRoom = room;
      this.connectionState = 'connected';
      this.eventHandlers.onConnectionStateChanged?.('connected');
      this.eventHandlers.onConnected?.(room);

      console.log(`[Native] Successfully connected to room: ${room.name}`);
      return room;
    } catch (error) {
      console.error('[Native] Failed to connect to Twilio room:', error);
      throw error;
    }
  }

  private setupNativeRoomEventListeners(): void {
    if (!this.nativeRoom) return;

    this.nativeRoom.on('participantConnected', (participant: any) => {
      console.log(`[Native] Participant connected: ${participant.identity}`);
      this.eventHandlers.onParticipantConnected?.({
        identity: participant.identity,
        sid: participant.sid,
        videoEnabled: true,
        audioEnabled: true,
      });
    });

    this.nativeRoom.on('participantDisconnected', (participant: any) => {
      console.log(`[Native] Participant disconnected: ${participant.identity}`);
      this.eventHandlers.onParticipantDisconnected?.({
        identity: participant.identity,
        sid: participant.sid,
        videoEnabled: false,
        audioEnabled: false,
      });
    });

    this.nativeRoom.on('disconnected', (room: any, error: any) => {
      console.log(`[Native] Disconnected from room`, error);
      this.connectionState = 'disconnected';
      this.eventHandlers.onConnectionStateChanged?.('disconnected');
      if (this.currentRoom) {
        this.eventHandlers.onDisconnected?.(this.currentRoom, error);
      }
      this.nativeRoom = null;
      this.currentRoom = null;
    });

    this.nativeRoom.on('reconnecting', (error: any) => {
      console.log(`[Native] Reconnecting...`, error);
      this.connectionState = 'reconnecting';
      this.eventHandlers.onConnectionStateChanged?.('reconnecting');
      this.eventHandlers.onReconnecting?.(error);
    });

    this.nativeRoom.on('reconnected', () => {
      console.log(`[Native] Reconnected`);
      this.connectionState = 'connected';
      this.eventHandlers.onConnectionStateChanged?.('connected');
      this.eventHandlers.onReconnected?.();
    });

    this.nativeRoom.on('trackSubscribed', (track: any, publication: any, participant: any) => {
      console.log(`[Native] Track subscribed: ${track.kind} from ${participant.identity}`);
      if (track.kind === 'video') {
        this.eventHandlers.onRemoteVideoTrackAdded?.({
          identity: participant.identity,
          sid: participant.sid,
          videoEnabled: true,
          audioEnabled: true,
        }, {
          trackSid: track.sid,
          trackName: track.name,
          enabled: track.isEnabled,
        });
      } else if (track.kind === 'audio') {
        this.eventHandlers.onRemoteAudioTrackAdded?.({
          identity: participant.identity,
          sid: participant.sid,
          videoEnabled: true,
          audioEnabled: true,
        }, {
          trackSid: track.sid,
          trackName: track.name,
          enabled: track.isEnabled,
        });
      }
    });
  }

  async disconnect(): Promise<void> {
    if (!this.currentRoom) {
      return;
    }

    this.connectionState = 'disconnecting';
    this.eventHandlers.onConnectionStateChanged?.('disconnecting');

    if (this.nativeRoom && typeof this.nativeRoom.disconnect === 'function') {
      try {
        await this.nativeRoom.disconnect();
      } catch (error) {
        console.error('[Native] Error disconnecting:', error);
      }
    }

    const room = this.currentRoom;
    this.currentRoom = null;
    this.nativeRoom = null;
    this.connectionState = 'disconnected';
    this.eventHandlers.onConnectionStateChanged?.('disconnected');
    this.eventHandlers.onDisconnected?.(room);
  }

  toggleLocalVideo(): boolean {
    this.localVideoEnabled = !this.localVideoEnabled;
    console.log(`Local video ${this.localVideoEnabled ? 'enabled' : 'disabled'}`);
    
    if (this.nativeRoom && this.TwilioVideo) {
      try {
        if (this.localVideoEnabled) {
          this.nativeRoom.localParticipant?.videoTracks?.forEach((publication: any) => {
            publication.track?.enable();
          });
        } else {
          this.nativeRoom.localParticipant?.videoTracks?.forEach((publication: any) => {
            publication.track?.disable();
          });
        }
      } catch (error) {
        console.error('Error toggling video:', error);
      }
    }
    
    return this.localVideoEnabled;
  }

  toggleLocalAudio(): boolean {
    this.localAudioEnabled = !this.localAudioEnabled;
    console.log(`Local audio ${this.localAudioEnabled ? 'enabled' : 'disabled'}`);
    
    if (this.nativeRoom && this.TwilioVideo) {
      try {
        if (this.localAudioEnabled) {
          this.nativeRoom.localParticipant?.audioTracks?.forEach((publication: any) => {
            publication.track?.enable();
          });
        } else {
          this.nativeRoom.localParticipant?.audioTracks?.forEach((publication: any) => {
            publication.track?.disable();
          });
        }
      } catch (error) {
        console.error('Error toggling audio:', error);
      }
    }
    
    return this.localAudioEnabled;
  }

  flipCamera(): void {
    this.useFrontCamera = !this.useFrontCamera;
    console.log(`Switched to ${this.useFrontCamera ? 'front' : 'back'} camera`);
    
    if (this.nativeRoom && this.TwilioVideo) {
      try {
        this.nativeRoom.localParticipant?.videoTracks?.forEach((publication: any) => {
          if (publication.track && typeof publication.track.switchCamera === 'function') {
            publication.track.switchCamera();
          }
        });
      } catch (error) {
        console.error('Error flipping camera:', error);
      }
    }
  }

  isVideoEnabled(): boolean {
    return this.localVideoEnabled;
  }

  isAudioEnabled(): boolean {
    return this.localAudioEnabled;
  }

  isFrontCamera(): boolean {
    return this.useFrontCamera;
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  getCurrentRoom(): TwilioRoom | null {
    return this.currentRoom;
  }

  isConnected(): boolean {
    return this.connectionState === 'connected' && this.currentRoom !== null;
  }

  getNativeRoom(): any {
    return this.nativeRoom;
  }

  getLocalParticipant(): any {
    return this.nativeRoom?.localParticipant || null;
  }

  getRemoteParticipants(): any[] {
    if (!this.nativeRoom) return [];
    return Array.from(this.nativeRoom.remoteParticipants?.values() || []);
  }
}

export const twilioVideoService = new TwilioVideoService();
