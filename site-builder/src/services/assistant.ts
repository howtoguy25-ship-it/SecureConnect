import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';
import { requireFunctions } from '@/services/requireFunctions';
import { AssistantAction } from '@/types';

export interface AssistantChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantChatResult {
  reply: string;
  actions: AssistantAction[];
}

export async function sendAssistantMessage(
  message: string,
  history: AssistantChatMessage[],
  screen: string
): Promise<AssistantChatResult> {
  const call = httpsCallable<
    { message: string; history: AssistantChatMessage[]; screen: string },
    AssistantChatResult
  >(requireFunctions(functions), 'assistantChat');
  const result = await call({ message, history, screen });
  return result.data;
}
