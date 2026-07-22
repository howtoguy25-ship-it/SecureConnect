import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import type { AiStoreDraft } from "@/types";

export interface DraftStoreProfileInput {
  businessName: string;
  address: string;
  categoryId: string;
}

/**
 * Asks the aiDraftStoreProfile Cloud Function (Claude with web search) to research the named
 * business at that address and propose a description, category, and starter menu/stock list.
 * This is always a *draft* -- nothing is saved to the business's live stock/announcements
 * until the owner reviews and explicitly accepts each item in the onboarding screen. The
 * function never fabricates photos; it only proposes text fields for the owner to confirm,
 * edit, or discard, and owners still add their own real photos.
 */
export async function draftStoreProfile(input: DraftStoreProfileInput): Promise<AiStoreDraft> {
  const draft = httpsCallable<DraftStoreProfileInput, AiStoreDraft>(functions, "aiDraftStoreProfile");
  const result = await draft(input);
  return result.data;
}
