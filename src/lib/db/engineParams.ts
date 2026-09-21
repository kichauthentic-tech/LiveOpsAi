import { supabase } from "../supabaseClient";
import { EngineParams, diffFromDefaults, mergeEngineParams } from "../scheduling/engineParams";

// Tham số engine Kế Hoạch Tháng (0095). Đọc: mọi người đăng nhập; ghi: admin (RLS). DB chỉ giữ
// phần khác mặc định — lưu = ghi đè cả dòng bằng diff hiện tại.
const ENGINE_KEY = "month_plan";

export interface EngineParamsRow {
  params: EngineParams;
  overrides: Partial<EngineParams>; // phần đang khác mặc định (đã lưu)
  updatedAt: string | null;
}

export async function fetchEngineParams(): Promise<EngineParamsRow> {
  const { data, error } = await supabase.from("engine_params").select("params, updated_at").eq("engine_key", ENGINE_KEY).maybeSingle();
  if (error) throw error;
  const saved = (data?.params as Partial<Record<string, unknown>> | undefined) ?? {};
  const params = mergeEngineParams(saved);
  return { params, overrides: diffFromDefaults(params), updatedAt: data?.updated_at ?? null };
}

export async function saveEngineParams(params: EngineParams, userId: string): Promise<EngineParamsRow> {
  const overrides = diffFromDefaults(params);
  const { data, error } = await supabase
    .from("engine_params")
    .upsert({ engine_key: ENGINE_KEY, params: overrides, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: "engine_key" })
    .select("params, updated_at")
    .single();
  if (error) throw error;
  const merged = mergeEngineParams(data.params as Partial<Record<string, unknown>>);
  return { params: merged, overrides: diffFromDefaults(merged), updatedAt: data.updated_at };
}
