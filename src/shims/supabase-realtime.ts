// Xem src/shims/README.md. App không dùng realtime (0 chỗ gọi `.channel(` trong src, kiểm 2026-10-01).
const REASON =
  "App chưa bật Supabase Realtime: @supabase/realtime-js đã được thay bằng shim rỗng để giảm 56 KB " +
  "chunk entry (src/shims/README.md). Muốn dùng realtime thì gỡ alias trong vite.config.ts.";

export class RealtimeClient {
  // supabase-js gọi `new RealtimeClient(url, opts)` trong constructor của SupabaseClient.
  constructor(_url?: string, _options?: unknown) {}

  /** supabase-js gọi mỗi lần phiên đăng nhập đổi. Không có kết nối nào để gắn token → no-op. */
  setAuth(_token?: string | null): void {}

  connect(): void {}
  disconnect(_code?: number, _reason?: string): void {}

  /** Đọc suông, dọn dẹp — an toàn khi không có kênh nào. */
  getChannels(): unknown[] {
    return [];
  }
  removeChannel(_channel: unknown): Promise<"ok"> {
    return Promise.resolve("ok");
  }
  removeAllChannels(): Promise<"ok"[]> {
    return Promise.resolve([]);
  }

  /** Cửa vào tính năng thật — phải vỡ to, không được im lặng. */
  channel(_name: string, _params?: unknown): never {
    throw new Error(REASON);
  }
}
