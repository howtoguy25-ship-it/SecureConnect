import { httpsCallable } from 'firebase/functions';
import { Platform } from 'react-native';
import JSZip from 'jszip';
import * as Sharing from 'expo-sharing';
import { File as LocalFile, Paths } from 'expo-file-system';
import { functions } from '@/services/firebase';
import { requireFunctions } from '@/services/requireFunctions';
import { Project } from '@/types';

interface PublishedSiteExport {
  siteName: string;
  slug: string;
  pages: Record<string, string>;
}

// Real published-site HTML, not a re-render or a stub -- getPublishedSiteExport hands back
// exactly what visitors are served (publishedSites is Admin-SDK-only, so this callable is
// the one sanctioned way to get it back to its own owner). '' is the Home page slug
// convention used throughout this app (see SitePage.slug) -- everything else keeps its own
// slug as the filename.
function pageFileName(slug: string): string {
  return slug ? `${slug}.html` : 'index.html';
}

function safeFileBaseName(name: string): string {
  return (name || 'site').trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'site';
}

async function fetchProjectZip(project: Project): Promise<{ zip: JSZip; zipFilename: string; siteName: string }> {
  if (!project.publishSlug) throw new Error('Publish this site before downloading it.');
  const call = httpsCallable<{ projectId: string }, PublishedSiteExport>(requireFunctions(functions), 'getPublishedSiteExport');
  const { data } = await call({ projectId: project.id });

  const zip = new JSZip();
  for (const [slug, html] of Object.entries(data.pages)) {
    zip.file(pageFileName(slug), html);
  }
  return { zip, zipFilename: `${safeFileBaseName(data.siteName)}.zip`, siteName: data.siteName };
}

// Native has no "silently save this file" API -- the OS share sheet (which itself offers
// "Save to Files") is the real, only way to hand a generated file to the user, so both
// download and share funnel through it there. Web can do a direct download.
async function saveZipToCache(zip: JSZip, zipFilename: string): Promise<string> {
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  const file = new LocalFile(Paths.cache, zipFilename);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  return file.uri;
}

function downloadBlobOnWeb(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

// Zips a published project's real HTML pages and hands them to the user -- a browser
// download on web, the native share sheet elsewhere. Only ever called once a project is
// actually published (gated in the UI), since an unpublished project has no rendered
// output to zip yet.
export async function downloadProjectZip(project: Project): Promise<void> {
  const { zip, zipFilename } = await fetchProjectZip(project);

  if (Platform.OS === 'web') {
    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlobOnWeb(blob, zipFilename);
    return;
  }

  const uri = await saveZipToCache(zip, zipFilename);
  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(uri, { mimeType: 'application/zip', dialogTitle: `Save ${zipFilename}` });
}

// Same zip, but explicitly opens a share flow -- the real Web Share API (with the zip as an
// attached file) where the browser supports sharing files, falling back to a plain download
// where it doesn't; the native OS share sheet everywhere else.
export async function shareProjectZip(project: Project): Promise<void> {
  const { zip, zipFilename, siteName } = await fetchProjectZip(project);

  if (Platform.OS === 'web') {
    const blob = await zip.generateAsync({ type: 'blob' });
    const nav = navigator as Navigator & { canShare?: (data: any) => boolean; share?: (data: any) => Promise<void> };
    if (nav.share && nav.canShare) {
      const shareFile = new File([blob], zipFilename, { type: 'application/zip' });
      if (nav.canShare({ files: [shareFile] })) {
        await nav.share({ files: [shareFile], title: siteName });
        return;
      }
    }
    downloadBlobOnWeb(blob, zipFilename);
    return;
  }

  const uri = await saveZipToCache(zip, zipFilename);
  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(uri, { mimeType: 'application/zip', dialogTitle: `Share ${zipFilename}` });
}
