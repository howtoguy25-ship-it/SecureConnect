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
  // Up to 3 data URIs (data:image/jpeg;base64,...) the user picked as visual inspiration --
  // shown to the model alongside the prompt, never inserted directly into the site.
  referenceImages?: string[];
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

export async function cancelGeneration(sessionId: string): Promise<void> {
  const call = httpsCallable(requireFunctions(functions), 'cancelGeneration');
  await call({ sessionId });
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

// Free, no credit charge -- a quick pass before the real (paid) build to turn a short
// prompt into a couple of concrete questions specific to what was actually typed.
export async function suggestClarifyingQuestions(prompt: string, pageType: PageType): Promise<string[]> {
  const call = httpsCallable<{ prompt: string; pageType: PageType }, { questions: string[] }>(
    requireFunctions(functions),
    'suggestClarifyingQuestions'
  );
  const result = await call({ prompt, pageType });
  return result.data.questions;
}
