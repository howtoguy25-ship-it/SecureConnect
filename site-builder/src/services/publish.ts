import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';
import { requireFunctions } from '@/services/requireFunctions';
import { projectsStore } from '@/storage/projectsStore';
import { uploadLocalImage, uploadLocalVideo, isLocalUri } from '@/services/uploads';
import { Project, CanvasElement } from '@/types';

export interface PublishResult {
  slug: string;
  url: string;
}

// Shared per-page-of-elements uploader -- used directly for single-page projects, and once
// per page for a manually-built multi-page website (see uploadLocalProjectMedia below).
async function uploadElementsMedia(elements: CanvasElement[]): Promise<{ elements: CanvasElement[]; changed: boolean }> {
  let changed = false;

  const next: CanvasElement[] = await Promise.all(
    elements.map(async (el): Promise<CanvasElement> => {
      if (el.type === 'image' && el.uri && isLocalUri(el.uri)) {
        const url = await uploadLocalImage(el.uri);
        changed = true;
        return { ...el, uri: url };
      }
      if (el.type === 'slideshow' && el.images.some(isLocalUri)) {
        const images = await Promise.all(el.images.map((u) => (isLocalUri(u) ? uploadLocalImage(u) : u)));
        changed = true;
        return { ...el, images };
      }
      if (el.type === 'video') {
        const uri = el.uri && isLocalUri(el.uri) ? await uploadLocalVideo(el.uri) : el.uri;
        const audioUri = el.audioUri && isLocalUri(el.audioUri) ? await uploadLocalVideo(el.audioUri) : el.audioUri;
        if (uri !== el.uri || audioUri !== el.audioUri) {
          changed = true;
          return { ...el, uri, audioUri };
        }
      }
      return el;
    })
  );

  return { elements: next, changed };
}

// Local media (device file:// URIs from the picker) can't be read by Cloud Functions --
// only the client has access to them -- so this uploads any that haven't made it to
// Storage yet before asking the server to render/publish the page.
async function uploadLocalProjectMedia(uid: string, project: Project): Promise<Project> {
  let changed = false;
  let updated: Project;

  if (project.pages && project.pages.length > 0) {
    const pages = await Promise.all(
      project.pages.map(async (page) => {
        const r = await uploadElementsMedia(page.elements);
        if (r.changed) changed = true;
        return { ...page, elements: r.elements };
      })
    );
    // Keep the legacy top-level fields mirrored to Home (pages[0]) -- see Project.pages's
    // comment in src/types/index.ts for why other code still reads those directly.
    updated = { ...project, pages, elements: pages[0].elements, backgroundColor: pages[0].backgroundColor };
  } else {
    const r = await uploadElementsMedia(project.elements);
    changed = r.changed;
    updated = { ...project, elements: r.elements };
  }

  if (!changed) return project;
  await projectsStore.save(uid, updated);
  return updated;
}

export async function publishProject(uid: string, project: Project): Promise<PublishResult> {
  await uploadLocalProjectMedia(uid, project);
  const call = httpsCallable<{ projectId: string }, PublishResult>(requireFunctions(functions), 'publishProject');
  const result = await call({ projectId: project.id });
  return result.data;
}

export async function unpublishProject(projectId: string): Promise<void> {
  const call = httpsCallable(requireFunctions(functions), 'unpublishProject');
  await call({ projectId });
}

export interface DomainDnsRecord {
  domainName: string;
  type: string;
  requiredValue: string;
}

export interface DomainResult {
  domainName: string;
  status: string;
  certStatus?: string;
  dnsRecords: DomainDnsRecord[];
  domainStatus?: 'pending' | 'active' | 'failed';
}

export async function connectDomain(projectId: string, domain: string): Promise<DomainResult> {
  const call = httpsCallable<{ projectId: string; domain: string }, DomainResult>(
    requireFunctions(functions),
    'connectDomain'
  );
  const result = await call({ projectId, domain });
  return result.data;
}

export async function getDomainStatus(projectId: string): Promise<DomainResult> {
  const call = httpsCallable<{ projectId: string }, DomainResult>(requireFunctions(functions), 'getDomainStatus');
  const result = await call({ projectId });
  return result.data;
}

export async function disconnectDomain(projectId: string): Promise<void> {
  const call = httpsCallable(requireFunctions(functions), 'disconnectDomain');
  await call({ projectId });
}
