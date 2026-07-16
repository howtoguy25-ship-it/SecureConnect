import { httpsCallable, HttpsCallableResult } from 'firebase/functions';
import { functions } from '@/services/firebase';
import { requireFunctions } from '@/services/requireFunctions';
import { PageType } from '@/types';
import { BuildComplexity } from '@/data/pricing';

export interface StartGenerationArgs {
  sessionId: string;
  prompt: string;
  pageType: PageType;
  complexity: BuildComplexity;
}

export async function startGeneration(args: StartGenerationArgs): Promise<{ sessionId: string; projectId: string }> {
  const call = httpsCallable<StartGenerationArgs, { sessionId: string; projectId: string }>(
    requireFunctions(functions),
    'startGeneration'
  );
  const result: HttpsCallableResult<{ sessionId: string; projectId: string }> = await call(args);
  return result.data;
}

export async function requestPause(sessionId: string): Promise<void> {
  const call = httpsCallable(requireFunctions(functions), 'requestPause');
  await call({ sessionId });
}

export async function resumeGeneration(sessionId: string, message: string): Promise<void> {
  const call = httpsCallable(requireFunctions(functions), 'resumeGeneration');
  await call({ sessionId, message });
}

export async function askBuildQuestion(sessionId: string, question: string): Promise<string> {
  const call = httpsCallable<{ sessionId: string; question: string }, { answer: string }>(
    requireFunctions(functions),
    'askBuildQuestion'
  );
  const result = await call({ sessionId, question });
  return result.data.answer;
}

export async function ensureAccount(): Promise<void> {
  const call = httpsCallable(requireFunctions(functions), 'ensureAccount');
  await call({});
}
