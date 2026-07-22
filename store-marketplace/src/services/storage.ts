import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";

export type UploadKind = "logo" | "cover" | "stockItem" | "announcement";

/** Uploads a local image (from expo-image-picker) to
 * businesses/{businessId}/{kind}/{timestamp}-{fileName} and returns its public download URL. */
export async function uploadBusinessImage(
  businessId: string,
  kind: UploadKind,
  localUri: string,
  fileName: string
): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const path = `businesses/${businessId}/${kind}/${Date.now()}-${fileName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}
