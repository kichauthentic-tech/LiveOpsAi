import { supabase } from "./supabaseClient";

// Attaches the current Supabase session's access token as a Bearer header —
// server.ts routes that require a signed-in caller (admin/*, tiktok/*, gemini/*)
// read this to identify who's calling.
export async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return fetch(path, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${token ?? ""}`
    }
  });
}
