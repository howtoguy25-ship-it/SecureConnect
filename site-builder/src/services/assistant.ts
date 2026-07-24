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
  screen: string,
  images?: string[]
): Promise<AssistantChatResult> {
  const call = httpsCallable<
    { message: string; history: AssistantChatMessage[]; screen: string; images?: string[] },
    AssistantChatResult
  >(requireFunctions(functions), 'assistantChat');
  const result = await call({ message, history, screen, images });
  return result.data;
}

export interface ExecuteAssistantActionParams {
  type: AssistantAction['type'];
  projectId?: string | null;
  productName?: string | null;
  priceUsd?: number | null;
  menuLabel?: string | null;
  pageName?: string | null;
}

export interface ExecuteAssistantActionResult {
  ok: true;
  projectId?: string;
  productId?: string;
  slug?: string;
  url?: string;
}

// Real cross-project actions (Phase 8) -- createProduct/editProduct/insertProductOnPage/
// publishProject/addMenuItem. Called once `projectId` (where relevant) is a real, concrete
// id -- either the assistant matched it confidently, or the user picked one from a chip list
// after an ambiguous match (see AssistantChatScreen's disambiguation UI).
export async function executeAssistantAction(params: ExecuteAssistantActionParams): Promise<ExecuteAssistantActionResult> {
  const call = httpsCallable<ExecuteAssistantActionParams, ExecuteAssistantActionResult>(
    requireFunctions(functions),
    'assistantExecuteAction'
  );
  const result = await call(params);
  return result.data;
}
