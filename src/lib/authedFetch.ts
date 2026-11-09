import { supabase } from "./supabaseClient";

// Gắn access token của phiên Supabase hiện tại vào header Bearer — các route server (admin/*, tiktok/*, gemini/*,
// me/*) đọc token này để biết ai gọi. Đây là bản duy nhất: users.ts và tiktokIntegration.ts dùng chung.
//
// Phiên có thể đã bị Supabase thu hồi trong khi tab vẫn còn token cũ (đăng xuất/đổi mật khẩu ở thiết bị khác, phiên bị
// dọn) — server khi đó trả 401. Gặp 401 thì thử làm mới phiên đúng một lần rồi gọi lại; vẫn 401 nghĩa là phiên chết
// hẳn → đăng xuất cục bộ để app quay về màn đăng nhập thay vì để người dùng bấm lại mãi và nhận lỗi khó hiểu.
async function accessToken(forceRefresh: boolean): Promise<string | undefined> {
  if (forceRefresh) {
    const { data } = await supabase.auth.refreshSession();
    return data.session?.access_token;
  }
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}

function send(path: string, init: RequestInit | undefined, token: string | undefined): Promise<Response> {
  return fetch(path, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${token ?? ""}`
    }
  });
}

export async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await send(path, init, await accessToken(false));
  if (res.status !== 401) return res;

  const retryToken = await accessToken(true);
  if (retryToken) {
    const retry = await send(path, init, retryToken);
    if (retry.status !== 401) return retry;
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    return retry;
  }
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  return res;
}
