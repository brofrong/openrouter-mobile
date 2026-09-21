import { createHash, createHmac } from "node:crypto";

const EMPTY_PAYLOAD_HASH =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export type S3BucketConfig = {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
};

const hmac = (key: Buffer | string, value: string): Buffer =>
  createHmac("sha256", key).update(value, "utf8").digest();

const sha256Hex = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

const amzTimestamp = (
  now: Date,
): { readonly date: string; readonly day: string } => {
  const date = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { date, day: date.slice(0, 8) };
};

export const isCreateBucketOk = (status: number): boolean =>
  status === 200 || status === 204 || status === 409;

export const createBucketRequest = (
  config: S3BucketConfig,
  now: Date = new Date(),
): { readonly url: string; readonly headers: Record<string, string> } => {
  const endpoint = new URL(config.endpoint);
  const { date, day } = amzTimestamp(now);
  const host = endpoint.host;
  const path = `/${encodeURIComponent(config.bucket)}`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${EMPTY_PAYLOAD_HASH}\nx-amz-date:${date}\n`;
  const canonicalRequest = [
    "PUT",
    path,
    "",
    canonicalHeaders,
    signedHeaders,
    EMPTY_PAYLOAD_HASH,
  ].join("\n");
  const scope = `${day}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    date,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, day), config.region), "s3"),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign, "utf8")
    .digest("hex");
  return {
    url: `${endpoint.origin}${path}`,
    headers: {
      host,
      "x-amz-content-sha256": EMPTY_PAYLOAD_HASH,
      "x-amz-date": date,
      authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
};

export const createS3Bucket = async (config: S3BucketConfig): Promise<void> => {
  const { url, headers } = createBucketRequest(config);
  const response = await fetch(url, { method: "PUT", headers });
  if (isCreateBucketOk(response.status)) {
    return;
  }
  const body = await response.text();
  throw new Error(
    `CreateBucket ${config.bucket} failed (${response.status}): ${body}`,
  );
};

export const ensureS3Bucket = async (
  config: S3BucketConfig,
  options: { readonly attempts?: number; readonly delayMs?: number } = {},
): Promise<void> => {
  const attempts = options.attempts ?? 20;
  const delayMs = options.delayMs ?? 500;
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await createS3Bucket(config);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const status = /\((\d{3})\):/.exec(lastError.message)?.[1];
      if (status === "400" || status === "403") {
        throw lastError;
      }
      await Bun.sleep(delayMs);
    }
  }
  throw lastError ?? new Error(`CreateBucket ${config.bucket} timed out`);
};
