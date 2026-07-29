import { Storage, File } from "@google-cloud/storage";
import { Response } from "express";
import { randomUUID } from "crypto";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

// Previously authenticated via Replit's local sidecar (http://127.0.0.1:1106),
// which only exists inside a Replit container. Off Replit, authenticate with
// a real GCS service-account key instead: GCS_SERVICE_ACCOUNT_KEY holds the
// key JSON directly (or base64-encoded, for envs that dislike embedded
// newlines). If unset, fall back to the client library's normal defaults —
// GOOGLE_APPLICATION_CREDENTIALS (a mounted key file) or the ambient service
// account on GCP compute (Cloud Run/GKE/GCE).
function buildStorageClient(): Storage {
  const rawKey = process.env.GCS_SERVICE_ACCOUNT_KEY;
  if (!rawKey) return new Storage();
  const json = rawKey.trim().startsWith("{")
    ? rawKey
    : Buffer.from(rawKey, "base64").toString("utf8");
  const credentials = JSON.parse(json);
  return new Storage({ credentials, projectId: credentials.project_id });
}

export const objectStorageClient = buildStorageClient();

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  constructor() {}

  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths: string[] = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path: string) => path.trim())
          .filter((path: string) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' " +
          "tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths)."
      );
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    // Trim: a stray leading/trailing space in the env var value (easy to
    // introduce when pasting into Render's dashboard) shifts parseObjectPath's
    // split-on-"/" indexing by one, silently turning the space itself into
    // the bucket name (signed URLs come back pointing at .../%20/<real-bucket>/...
    // and every upload/download 404s against GCS).
    const dir = (process.env.PRIVATE_OBJECT_DIR || "").trim();
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<File | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }
    return null;
  }

  async downloadObject(
    file: File,
    res: Response,
    cacheTtlSec: number = 3600,
    rangeHeader?: string,
  ) {
    try {
      const [metadata] = await file.getMetadata();
      const aclPolicy = await getObjectAclPolicy(file);
      const isPublic = aclPolicy?.visibility === "public";
      const totalSize = Number(metadata.size);

      const baseHeaders: Record<string, string> = {
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
        // Advertise byte-range support — required for iOS/AVPlayer video
        // streaming, which probes with Range requests before playing.
        "Accept-Ranges": "bytes",
      };

      let start = 0;
      let end = totalSize - 1;
      let isPartial = false;

      if (rangeHeader && Number.isFinite(totalSize) && totalSize > 0) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
        if (match && (match[1] !== "" || match[2] !== "")) {
          if (match[1] === "") {
            // Suffix range: last N bytes
            const suffixLen = Math.min(Number(match[2]), totalSize);
            start = totalSize - suffixLen;
          } else {
            start = Number(match[1]);
            if (match[2] !== "") end = Math.min(Number(match[2]), totalSize - 1);
          }
          if (start > end || start >= totalSize) {
            res.status(416).set({ "Content-Range": `bytes */${totalSize}` }).end();
            return;
          }
          isPartial = true;
        }
      }

      if (isPartial) {
        res.status(206).set({
          ...baseHeaders,
          "Content-Range": `bytes ${start}-${end}/${totalSize}`,
          "Content-Length": String(end - start + 1),
        });
      } else {
        res.set({
          ...baseHeaders,
          "Content-Length": String(metadata.size),
        });
      }

      const stream = isPartial
        ? file.createReadStream({ start, end })
        : file.createReadStream();
      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });
      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  // Direct server-side upload — avoids any signed-URL CORS dance.
  // Used for avatar uploads (and any other server-proxied upload) so the
  // client only ever talks to our origin. Returns the normalized
  // `/objects/uploads/<id>` path you can serve via GET /objects/*.
  async uploadBuffer(
    buffer: Buffer,
    contentType: string,
    ownerUserId: string,
  ): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);

    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);

    await file.save(buffer, {
      contentType,
      resumable: false,
      metadata: { contentType },
    });

    await setObjectAclPolicy(file, {
      owner: ownerUserId,
      visibility: "public",
    });

    return `/objects/uploads/${objectId}`;
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    if (!privateObjectDir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }

    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);

    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }

    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;

    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }

    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }

    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: File;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return { bucketName, objectName };
}

// Previously delegated to Replit's sidecar (/object-storage/signed-object-url),
// which signs on the caller's behalf so no private key ever needs to leave
// Replit's infra. Off Replit there's no sidecar, so sign directly with the
// GCS client: a real key (GCS_SERVICE_ACCOUNT_KEY) signs locally; falling
// back to ambient credentials on GCP compute signs via the IAM SignBlob API
// (requires roles/iam.serviceAccountTokenCreator on that service account).
async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const action = method === "PUT" ? "write" : method === "DELETE" ? "delete" : "read";
  const [signedURL] = await objectStorageClient
    .bucket(bucketName)
    .file(objectName)
    .getSignedUrl({
      version: "v4",
      action,
      expires: Date.now() + ttlSec * 1000,
    });
  return signedURL;
}
