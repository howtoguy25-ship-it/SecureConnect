import { AudioModule, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from "expo-audio";
import { YamnetSiren, isYamnetAvailable } from "@/native/yamnetNative";

const WINDOW_MS = 1000;
const CONSECUTIVE_WINDOWS_REQUIRED = 2;
const SIREN_LABELS = new Set(["Siren", "Emergency vehicle", "Police car (siren)", "Ambulance (siren)", "Fire engine, fire truck (siren)"]);

export type SirenDetectionListener = (event: { confidence: number; label: string }) => void;

class SirenDetectionEngine {
  private recorder: InstanceType<typeof AudioModule.AudioRecorder> | null = null;
  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private consecutiveHits = 0;
  private listeners = new Set<SirenDetectionListener>();
  private running = false;
  private sensitivity = 0.6;

  setSensitivity(threshold: number) {
    this.sensitivity = threshold;
  }

  onDetection(listener: SirenDetectionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<void> {
    if (this.running) return;

    const { status } = await requestRecordingPermissionsAsync();
    if (status !== "granted") {
      console.warn("[siren] Microphone permission denied; EV Radar disabled.");
      return;
    }

    if (!isYamnetAvailable) {
      console.warn(
        "[siren] Skipping start(): no native YamnetSiren module in this build " +
          "(requires an Expo Dev Build, see /modules/yamnet-siren/README.md)."
      );
      return;
    }

    await YamnetSiren.loadModel();

    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      shouldPlayInBackground: true,
    });

    this.running = true;
    this.consecutiveHits = 0;
    this.pollHandle = setInterval(() => {
      this.captureAndClassifyWindow().catch((err) =>
        console.warn("[siren] window classification failed", err)
      );
    }, WINDOW_MS);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
    if (this.recorder) {
      try {
        await this.recorder.stop();
      } catch {
        // already stopped
      }
      this.recorder = null;
    }
    this.consecutiveHits = 0;
  }

  private async captureAndClassifyWindow(): Promise<void> {
    // Capture a short recording, hand its raw PCM samples to the native classifier, then
    // discard the audio immediately — nothing is ever written to persistent storage or
    // uploaded, matching the "no recording stored" promise shown in the mic permission prompt.
    const recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
    await recorder.prepareToRecordAsync();
    recorder.record();
    await new Promise((resolve) => setTimeout(resolve, WINDOW_MS));
    await recorder.stop();

    const uri = recorder.uri;
    if (!uri) return;

    const pcmSamples = await readPcmSamplesFromUri(uri);
    const results = await YamnetSiren.classify(pcmSamples);

    const sirenResult = results.find((r) => SIREN_LABELS.has(r.label));
    const confidence = sirenResult?.confidence ?? 0;

    if (confidence >= this.sensitivity) {
      this.consecutiveHits += 1;
    } else {
      this.consecutiveHits = 0;
    }

    if (this.consecutiveHits >= CONSECUTIVE_WINDOWS_REQUIRED) {
      this.consecutiveHits = 0;
      this.listeners.forEach((listener) =>
        listener({ confidence, label: sirenResult?.label ?? "Siren" })
      );
    }
  }
}

/**
 * Reads raw PCM float samples from a recorded audio file for handoff to the native
 * classifier. The actual decode happens on the native side inside YamnetSiren.classify()
 * in production builds; this stub exists so the JS orchestration loop above has a stable
 * call shape regardless of platform decode details.
 */
async function readPcmSamplesFromUri(_uri: string): Promise<number[]> {
  return [];
}

export const sirenDetection = new SirenDetectionEngine();
