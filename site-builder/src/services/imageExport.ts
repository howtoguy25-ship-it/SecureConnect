import { Platform, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { safeFileBaseName, downloadBlobOnWeb } from '@/services/projectExport';

// Real pixel-for-pixel screenshot of the hidden CanvasExportView, not a cropped/rescaled
// stand-in -- react-native-view-shot resolves to a real native snapshot on iOS/Android and to
// html2canvas on web (see its own RNViewShot.web.ts), so the same call works everywhere. Native
// gets a real temp file handed straight to the OS share sheet (which itself offers "Save
// Image"/"Save to Files"); web triggers a real browser download -- same dual-path pattern as
// projectExport.ts's ZIP download.
export async function downloadCanvasImage(viewRef: React.RefObject<View | null>, projectName: string): Promise<void> {
  const fileBaseName = safeFileBaseName(projectName);

  if (Platform.OS === 'web') {
    const dataUri = await captureRef(viewRef, { format: 'png', quality: 1, result: 'data-uri' });
    const res = await fetch(dataUri);
    const blob = await res.blob();
    downloadBlobOnWeb(blob, `${fileBaseName}.png`);
    return;
  }

  const uri = await captureRef(viewRef, { format: 'png', quality: 1, result: 'tmpfile' });
  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: `Save ${fileBaseName}.png` });
}
