import { expect, test } from "bun:test";
import {
  createBucketRequest,
  createS3Bucket,
  isCreateBucketOk,
} from "../src/shared/s3-bucket";

const localMinio = {
  endpoint: "http://localhost:9000",
  region: "us-east-1",
  bucket: "media",
  accessKeyId: "openrouter",
  secretAccessKey: "openrouter",
};

test("isCreateBucketOk treats already-exists as success", () => {
  expect(isCreateBucketOk(200)).toBe(true);
  expect(isCreateBucketOk(204)).toBe(true);
  expect(isCreateBucketOk(409)).toBe(true);
  expect(isCreateBucketOk(403)).toBe(false);
  expect(isCreateBucketOk(500)).toBe(false);
});

test("createBucketRequest signs a path-style PutBucket", () => {
  const request = createBucketRequest(
    localMinio,
    new Date("2026-09-17T12:00:00.000Z"),
  );
  expect(request.url).toBe("http://localhost:9000/media");
  expect(request.headers.host).toBe("localhost:9000");
  expect(request.headers["x-amz-date"]).toBe("20260917T120000Z");
  expect(request.headers.authorization?.startsWith("AWS4-HMAC-SHA256 ")).toBe(
    true,
  );
});

test("createS3Bucket can create or reuse the local MinIO bucket", async () => {
  await createS3Bucket(localMinio);
  await createS3Bucket(localMinio);
});
