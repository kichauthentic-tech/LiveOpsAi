// Xem src/shims/README.md. App không dùng Supabase Storage (0 chỗ gọi `.storage` trong src, kiểm 2026-10-01).
const REASON =
  "App chưa dùng Supabase Storage: @supabase/storage-js đã được thay bằng shim rỗng để giảm 22 KB " +
  "chunk entry (src/shims/README.md). Muốn upload file thì gỡ alias trong vite.config.ts.";

export class StorageApiError extends Error {
  status: number;
  statusCode: string;
  constructor(message: string, status = 0, statusCode = "") {
    super(message);
    this.name = "StorageApiError";
    this.status = status;
    this.statusCode = statusCode;
  }
}

export class StorageClient {
  constructor(_url?: string, _headers?: unknown, _fetch?: unknown) {}

  /** Cửa vào tính năng thật — phải vỡ to, không được im lặng. */
  from(_id: string): never {
    throw new Error(REASON);
  }
  listBuckets(): never {
    throw new Error(REASON);
  }
  getBucket(_id: string): never {
    throw new Error(REASON);
  }
  createBucket(_id: string, _options?: unknown): never {
    throw new Error(REASON);
  }
  updateBucket(_id: string, _options?: unknown): never {
    throw new Error(REASON);
  }
  deleteBucket(_id: string): never {
    throw new Error(REASON);
  }
  emptyBucket(_id: string): never {
    throw new Error(REASON);
  }
}
