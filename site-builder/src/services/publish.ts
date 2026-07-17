import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';
import { requireFunctions } from '@/services/requireFunctions';
import { projectsStore } from '@/storage/projectsStore';
import { uploadLocalImage, isLocalUri } from '@/services/uploads';
import { Project, CanvasElement } from '@/types';

export interface PublishResult {
  slug: string;
  url: string;
}

// Local images (device file:// URIs from the picker) can't be read by Cloud Functions --
// only the client has access to them -- so this uploads any that haven't made it to
// Storage yet before asking the server to render/publish the page.
async function uploadLocalProjectImages(uid: string, project: Project): Promise<Project> {
  let changed = false;

  const elements: CanvasElement[] = await Promise.all(
    project.elements.map(async (el): Promise<CanvasElement> => {
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
      return el;
    })
  );

  if (!changed) return project;
  const updated: Project = { ...project, elements };
  await projectsStore.save(uid, updated);
  return updated;
}

export async function publishProject(uid: string, project: Project): Promise<PublishResult> {
  await uploadLocalProjectImages(uid, project);
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
