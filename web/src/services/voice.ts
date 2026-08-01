// Real spoken turn-by-turn guidance via the browser's built-in Web Speech API
// (window.speechSynthesis) -- no server/API key involved, works offline once the voice
// list is loaded, and is the same mechanism the mobile app's expo-speech wraps natively.
// The enabled/volume preferences themselves live in WebSettings (useSettings.ts), alongside
// every other persisted setting, not duplicated here.

export function speak(instruction: string, volume = 1): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  // Cancels whatever's still queued/speaking first -- otherwise a fast run of step changes
  // (a couple of close-together maneuvers) would queue up and read them back-to-back late,
  // well after the driver has already passed them.
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(instruction);
  utterance.volume = Math.max(0, Math.min(1, volume));
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
}
