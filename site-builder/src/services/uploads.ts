import { File } from 'expo-file-system';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';
import { requireFunctions } from '@/services/requireFunctions';

export function isLocalUri(uri: string): boolean {
  return !uri.startsWith('http://') && !uri.startsWith('https://');
}

// Moves a locally-picked photo (a device-only file:// URI) into Storage so it has a real
// https:// URL a published static page can actually load -- see uploadProjectImage in
// firebase/functions/src/index.ts.
export async function uploadLocalImage(uri: string): Promise<string> {
  const file = new File(uri);
  const base64 = await file.base64();
  const contentType = file.type || 'image/jpeg';

  const call = httpsCallable<{ base64: string; contentType: string }, { url: string }>(
    requireFunctions(functions),
    'uploadProjectImage'
  );
  const result = await call({ base64, contentType });
  return result.data.url;
}
