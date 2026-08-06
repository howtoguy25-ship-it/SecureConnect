import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';
import { requireFunctions } from '@/services/requireFunctions';

export async function claimAdReward(): Promise<{ creditsAwarded: number; claimedAt: number }> {
  const call = httpsCallable<undefined, { creditsAwarded: number; claimedAt: number }>(
    requireFunctions(functions),
    'claimAdReward'
  );
  const result = await call();
  return result.data;
}
