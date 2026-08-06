import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';
import { requireFunctions } from '@/services/requireFunctions';

// Manual (non-AI-build) generation for one Custom Widget element -- the seller describes
// what they want directly in the inspector and this returns real, bespoke HTML/CSS/JS
// (any image placeholders already substituted with real generated photos server-side).
export async function generateCustomWidget(description: string, siteName?: string): Promise<string> {
  const call = httpsCallable<
    { description: string; siteName?: string },
    { code: string }
  >(requireFunctions(functions), 'generateCustomWidget');
  const result = await call({ description, siteName });
  return result.data.code;
}
