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

// Video/audio clips are typically too large for the base64-over-onCall approach above --
// this instead gets a short-lived signed PUT URL from Cloud Functions and uploads the
// file's bytes straight to Storage, sidestepping onCall's request-size ceiling.
export async function uploadLocalVideo(uri: string): Promise<string> {
  const file = new File(uri);
  const contentType = file.type || 'video/mp4';
  const extension = uri.split('.').pop()?.split('?')[0] || 'mp4';

  const call = httpsCallable<{ contentType: string; extension: string }, { uploadUrl: string; readUrl: string }>(
    requireFunctions(functions),
    'createUploadUrl'
  );
  const { data } = await call({ contentType, extension });

  const blob = await (await fetch(uri)).blob();
  const putResult = await fetch(data.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!putResult.ok) throw new Error('Upload failed — try again.');

  return data.readUrl;
}
