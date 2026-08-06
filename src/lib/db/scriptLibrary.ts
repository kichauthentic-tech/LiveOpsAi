import { supabase } from "../supabaseClient";
import { LibraryScript } from "../../types";

interface DbLibraryScript {
  id: string;
  brand_id: string | null;
  title: string;
  hook: string;
  content: string;
  platform: LibraryScript["platform"];
  pinned_sku_order: string;
  tags: string;
  created_by: string | null;
}

function fromDb(row: DbLibraryScript): LibraryScript {
  return {
    id: row.id,
    brandId: row.brand_id ?? undefined,
    title: row.title,
    hook: row.hook,
    content: row.content,
    platform: row.platform,
    pinnedSkuOrder: row.pinned_sku_order,
    tags: row.tags,
    createdBy: row.created_by ?? undefined
  };
}

export async function fetchScriptLibrary(): Promise<LibraryScript[]> {
  const { data, error } = await supabase.from("script_library").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbLibraryScript[]).map(fromDb);
}

export async function createLibraryScript(
  script: Pick<LibraryScript, "title" | "hook" | "content" | "platform"> & { brandId?: string; createdBy?: string }
): Promise<LibraryScript> {
  const { data, error } = await supabase
    .from("script_library")
    .insert({
      brand_id: script.brandId ?? null,
      title: script.title,
      hook: script.hook,
      content: script.content,
      platform: script.platform,
      created_by: script.createdBy ?? null
    })
    .select()
    .single();
  if (error) throw error;
  return fromDb(data as DbLibraryScript);
}

export async function updateLibraryScript(
  id: string,
  patch: Partial<Pick<LibraryScript, "title" | "hook" | "content" | "platform" | "pinnedSkuOrder" | "tags">> & { brandId?: string | null }
): Promise<LibraryScript> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.hook !== undefined) row.hook = patch.hook;
  if (patch.content !== undefined) row.content = patch.content;
  if (patch.platform !== undefined) row.platform = patch.platform;
  if (patch.pinnedSkuOrder !== undefined) row.pinned_sku_order = patch.pinnedSkuOrder;
  if (patch.tags !== undefined) row.tags = patch.tags;
  if (patch.brandId !== undefined) row.brand_id = patch.brandId;

  const { data, error } = await supabase.from("script_library").update(row).eq("id", id).select().single();
  if (error) throw error;
  return fromDb(data as DbLibraryScript);
}

export async function deleteLibraryScript(id: string): Promise<void> {
  const { error } = await supabase.from("script_library").delete().eq("id", id);
  if (error) throw error;
}
