import { httpsCallable } from "firebase/functions";
import { functions, db } from "./firebase";
import { collection, doc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from "firebase/firestore";
import { toMillis } from "@/utils/firestoreTime";
import type { VerificationRequest } from "@/types";

const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
const ACN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 1];

/** Real ABN checksum per the ATO's published algorithm (subtract 1 from digit 1, weight, mod 89 == 0). */
export function isValidAbnChecksum(abnRaw: string): boolean {
  const abn = abnRaw.replace(/\s+/g, "");
  if (!/^\d{11}$/.test(abn)) return false;
  const digits = abn.split("").map(Number);
  digits[0] -= 1;
  const sum = digits.reduce((acc, d, i) => acc + d * ABN_WEIGHTS[i], 0);
  return sum % 89 === 0;
}

/** Real ACN checksum per ASIC's published algorithm (weighted sum of first 8 digits mod 10, complement to 10). */
export function isValidAcnChecksum(acnRaw: string): boolean {
  const acn = acnRaw.replace(/\s+/g, "");
  if (!/^\d{9}$/.test(acn)) return false;
  const digits = acn.split("").map(Number);
  const sum = digits.slice(0, 8).reduce((acc, d, i) => acc + d * ACN_WEIGHTS[i], 0);
  const remainder = sum % 10;
  const complement = remainder === 0 ? 0 : 10 - remainder;
  return complement === digits[8];
}

export interface SubmitVerificationInput {
  businessId: string;
  submittedBy: string;
  legalBusinessName: string;
  abn?: string;
  acn?: string;
}

export interface VerifyBusinessResult {
  status: VerificationRequest["status"];
  abrEntityName?: string;
  abrEntityStatus?: string;
  rejectionReason?: string;
}

/**
 * Submits a verification request doc, then invokes the verifyBusiness Cloud Function which
 * checksum-validates the ABN/ACN and, if ABR_LOOKUP_GUID is configured server-side, cross-checks
 * it against the real Australian Business Register. See functions/src/verifyBusiness.ts.
 */
export async function submitVerification(input: SubmitVerificationInput): Promise<VerifyBusinessResult> {
  if (input.abn && !isValidAbnChecksum(input.abn)) {
    throw new Error("That ABN doesn't pass the standard checksum -- double-check the 11 digits.");
  }
  if (input.acn && !isValidAcnChecksum(input.acn)) {
    throw new Error("That ACN doesn't pass the standard checksum -- double-check the 9 digits.");
  }

  const reqRef = doc(collection(db, "businesses", input.businessId, "verificationRequests"));
  await setDoc(reqRef, {
    businessId: input.businessId,
    submittedBy: input.submittedBy,
    legalBusinessName: input.legalBusinessName,
    abn: input.abn ?? null,
    acn: input.acn ?? null,
    status: "pending",
    submittedAt: serverTimestamp(),
  });

  const verify = httpsCallable<{ businessId: string; requestId: string }, VerifyBusinessResult>(
    functions,
    "verifyBusiness"
  );
  const result = await verify({ businessId: input.businessId, requestId: reqRef.id });
  return result.data;
}

export function watchLatestVerification(
  businessId: string,
  requestId: string,
  onChange: (request: VerificationRequest | null) => void
): Unsubscribe {
  return onSnapshot(doc(db, "businesses", businessId, "verificationRequests", requestId), (snap) => {
    if (!snap.exists()) {
      onChange(null);
      return;
    }
    const data = snap.data();
    onChange({
      ...(data as Omit<VerificationRequest, "id">),
      id: snap.id,
      submittedAt: toMillis(data.submittedAt),
      reviewedAt: data.reviewedAt ? toMillis(data.reviewedAt) : undefined,
    });
  });
}
