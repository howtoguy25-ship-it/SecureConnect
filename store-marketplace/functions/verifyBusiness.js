const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const abrLookupGuid = defineSecret("ABR_LOOKUP_GUID");

const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
const ACN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 1];

function isValidAbnChecksum(abnRaw) {
  const abn = String(abnRaw).replace(/\s+/g, "");
  if (!/^\d{11}$/.test(abn)) return false;
  const digits = abn.split("").map(Number);
  digits[0] -= 1;
  const sum = digits.reduce((acc, d, i) => acc + d * ABN_WEIGHTS[i], 0);
  return sum % 89 === 0;
}

function isValidAcnChecksum(acnRaw) {
  const acn = String(acnRaw).replace(/\s+/g, "");
  if (!/^\d{9}$/.test(acn)) return false;
  const digits = acn.split("").map(Number);
  const sum = digits.slice(0, 8).reduce((acc, d, i) => acc + d * ACN_WEIGHTS[i], 0);
  const remainder = sum % 10;
  const complement = remainder === 0 ? 0 : 10 - remainder;
  return complement === digits[8];
}

/**
 * Real call to the Australian Business Register's free "ABN Lookup" JSON web service
 * (https://abr.business.gov.au/Tools/WebServices -- self-service GUID signup). Returns the
 * registered entity name/status for the given ABN so it can be cross-checked against what the
 * owner typed in, not just a checksum pass.
 */
async function lookupAbn(abn, guid) {
  const url = `https://abr.business.gov.au/json/AbnDetails.aspx?abn=${encodeURIComponent(abn)}&guid=${encodeURIComponent(guid)}`;
  const res = await fetch(url);
  const text = await res.text();
  return JSON.parse(text);
}

/**
 * Callable: validates the ABN/ACN submitted in a verificationRequest doc, cross-checks ABNs
 * against the real ABR register when ABR_LOOKUP_GUID is configured, and writes the result back
 * onto both the request and the business doc. ACN has no equivalent free public lookup (ASIC's
 * register API is a paid ASIC Connect product), so ACN-only submissions are checksum-validated
 * and routed to "pending" for manual admin review rather than auto-verified.
 */
exports.verifyBusiness = onCall({ secrets: [abrLookupGuid] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");

  const { businessId, requestId } = request.data || {};
  if (!businessId || !requestId) {
    throw new HttpsError("invalid-argument", "businessId and requestId are required.");
  }

  const db = getFirestore();
  const bizRef = db.doc(`businesses/${businessId}`);
  const reqRef = db.doc(`businesses/${businessId}/verificationRequests/${requestId}`);

  const [bizSnap, reqSnap] = await Promise.all([bizRef.get(), reqRef.get()]);
  if (!bizSnap.exists) throw new HttpsError("not-found", "Business not found.");
  if (!reqSnap.exists) throw new HttpsError("not-found", "Verification request not found.");
  if (bizSnap.data().ownerId !== uid) {
    throw new HttpsError("permission-denied", "Only the business owner can submit verification.");
  }

  const data = reqSnap.data();
  let result;

  if (data.abn) {
    if (!isValidAbnChecksum(data.abn)) {
      result = { status: "rejected", rejectionReason: "ABN failed checksum validation." };
    } else {
      const guid = abrLookupGuid.value();
      if (!guid) {
        result = {
          status: "pending",
          rejectionReason: "Checksum-valid; awaiting manual review (ABR_LOOKUP_GUID not configured).",
        };
      } else {
        try {
          const abr = await lookupAbn(data.abn.replace(/\s+/g, ""), guid);
          const entityName = abr.EntityName || abr.MainName?.OrganisationName || abr.mainName?.organisationName;
          const abnStatus = abr.AbnStatus || abr.abnStatus;
          if (abr.Abn && String(abnStatus).toLowerCase() === "active") {
            result = { status: "verified", abrEntityName: entityName, abrEntityStatus: abnStatus };
          } else {
            result = {
              status: "rejected",
              rejectionReason: `ABR lookup returned status "${abnStatus || "not found"}".`,
            };
          }
        } catch (err) {
          console.error("ABR lookup failed", err);
          result = { status: "pending", rejectionReason: "ABR lookup service unavailable -- try again shortly." };
        }
      }
    }
  } else if (data.acn) {
    result = isValidAcnChecksum(data.acn)
      ? {
          status: "pending",
          rejectionReason: "ACN checksum-valid; awaiting manual admin review (no free ASIC lookup API).",
        }
      : { status: "rejected", rejectionReason: "ACN failed checksum validation." };
  } else {
    throw new HttpsError("invalid-argument", "Provide an ABN or ACN.");
  }

  await reqRef.update({
    status: result.status,
    abrEntityName: result.abrEntityName || null,
    abrEntityStatus: result.abrEntityStatus || null,
    rejectionReason: result.rejectionReason || null,
    reviewedAt: FieldValue.serverTimestamp(),
  });

  await bizRef.update({ verificationStatus: result.status });

  return result;
});

module.exports.isValidAbnChecksum = isValidAbnChecksum;
module.exports.isValidAcnChecksum = isValidAcnChecksum;
