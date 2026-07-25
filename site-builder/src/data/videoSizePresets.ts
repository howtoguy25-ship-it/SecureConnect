import { CanvasSize } from '@/types';

// Real, named export sizes matching what Canva/Instagram/TikTok/YouTube actually publish at --
// each entry's width/height is the true output resolution; the editor canvas itself is scaled
// down to a fixed EDITOR_WIDTH (matching every other page type's on-screen size) while keeping
// the exact same aspect ratio, so what you see while editing is really the same shape you'll
// publish, just zoomed to fit the screen.
export interface VideoSizePreset {
  id: string;
  label: string;
  subtitle: string;
  icon: string;
  width: number; // real output px
  height: number; // real output px
}

export const VIDEO_SIZE_PRESETS: VideoSizePreset[] = [
  { id: 'reel', label: 'Instagram Reel / Story', subtitle: '1080 × 1920', icon: 'logo-instagram', width: 1080, height: 1920 },
  { id: 'tiktok', label: 'TikTok Video', subtitle: '1080 × 1920', icon: 'musical-notes-outline', width: 1080, height: 1920 },
  { id: 'youtube', label: 'YouTube Video', subtitle: '1920 × 1080', icon: 'logo-youtube', width: 1920, height: 1080 },
  { id: 'youtubeShorts', label: 'YouTube Shorts', subtitle: '1080 × 1920', icon: 'phone-portrait-outline', width: 1080, height: 1920 },
  { id: 'square', label: 'Square Video', subtitle: '1080 × 1080', icon: 'square-outline', width: 1080, height: 1080 },
  { id: 'facebook', label: 'Facebook Video', subtitle: '1280 × 720', icon: 'logo-facebook', width: 1280, height: 720 },
  { id: 'landscape', label: 'Landscape (16:9)', subtitle: '1920 × 1080', icon: 'tablet-landscape-outline', width: 1920, height: 1080 },
  { id: 'mobile', label: 'Mobile Story', subtitle: '1080 × 1920', icon: 'phone-portrait-outline', width: 1080, height: 1920 },
];

const EDITOR_WIDTH = 390;

// Scales a preset's real output resolution down to the fixed editor canvas width every page
// type already uses, preserving the exact aspect ratio -- so switching presets always lines
// up with the same on-screen frame size other pages/pinch-zoom/scroll code already assumes.
export function presetToCanvasSize(preset: VideoSizePreset): CanvasSize {
  const height = Math.round((preset.height / preset.width) * EDITOR_WIDTH);
  return { width: EDITOR_WIDTH, height, label: `${preset.label} (${preset.width}×${preset.height})` };
}

export function customSizeToCanvasSize(widthPx: number, heightPx: number, unitLabel: string): CanvasSize {
  const height = Math.round((heightPx / widthPx) * EDITOR_WIDTH);
  return { width: EDITOR_WIDTH, height, label: `Custom (${unitLabel})` };
}
