import { supabase } from "../supabaseClient";
import { BrandOnboardingChecklistItem, OnboardingChecklistTemplateItem } from "../../types";

interface DbTemplateItem {
  id: string;
  title: string;
  description: string;
  order_index: number;
  is_active: boolean;
  created_at: string;
}

interface DbBrandItem {
  id: string;
  brand_id: string;
  title: string;
  description: string;
  assignee: string;
  deadline: string | null;
  status: BrandOnboardingChecklistItem["status"];
  order_index: number;
  source_template_item_id: string | null;
  created_at: string;
}

function templateFromDb(row: DbTemplateItem): OnboardingChecklistTemplateItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    orderIndex: row.order_index,
    isActive: row.is_active,
    createdAt: row.created_at
  };
}

function brandItemFromDb(row: DbBrandItem): BrandOnboardingChecklistItem {
  return {
    id: row.id,
    brandId: row.brand_id,
    title: row.title,
    description: row.description,
    assignee: row.assignee,
    deadline: row.deadline ?? undefined,
    status: row.status,
    orderIndex: row.order_index,
    sourceTemplateItemId: row.source_template_item_id ?? undefined,
    createdAt: row.created_at
  };
}

export async function fetchOnboardingChecklistTemplates(): Promise<OnboardingChecklistTemplateItem[]> {
  const { data, error } = await supabase.from("onboarding_checklist_templates").select("*").order("order_index", { ascending: true });
  if (error) throw error;
  return (data as DbTemplateItem[]).map(templateFromDb);
}

export async function createOnboardingChecklistTemplateItem(
  item: Pick<OnboardingChecklistTemplateItem, "title" | "description" | "orderIndex"> & { createdBy?: string }
): Promise<OnboardingChecklistTemplateItem> {
  const { data, error } = await supabase
    .from("onboarding_checklist_templates")
    .insert({
      title: item.title,
      description: item.description,
      order_index: item.orderIndex,
      created_by: item.createdBy ?? null
    })
    .select()
    .single();
  if (error) throw error;
  return templateFromDb(data as DbTemplateItem);
}

export async function updateOnboardingChecklistTemplateItem(
  id: string,
  patch: Partial<Pick<OnboardingChecklistTemplateItem, "title" | "description" | "orderIndex" | "isActive">>
): Promise<OnboardingChecklistTemplateItem> {
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.orderIndex !== undefined) row.order_index = patch.orderIndex;
  if (patch.isActive !== undefined) row.is_active = patch.isActive;

  const { data, error } = await supabase.from("onboarding_checklist_templates").update(row).eq("id", id).select().single();
  if (error) throw error;
  return templateFromDb(data as DbTemplateItem);
}

export async function deleteOnboardingChecklistTemplateItem(id: string): Promise<void> {
  const { error } = await supabase.from("onboarding_checklist_templates").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchBrandOnboardingChecklists(): Promise<BrandOnboardingChecklistItem[]> {
  const { data, error } = await supabase.from("brand_onboarding_checklists").select("*").order("order_index", { ascending: true });
  if (error) throw error;
  return (data as DbBrandItem[]).map(brandItemFromDb);
}

export async function createBrandOnboardingChecklistItem(
  item: Pick<BrandOnboardingChecklistItem, "brandId" | "title" | "description" | "orderIndex"> & {
    sourceTemplateItemId?: string;
    createdBy?: string;
  }
): Promise<BrandOnboardingChecklistItem> {
  const { data, error } = await supabase
    .from("brand_onboarding_checklists")
    .insert({
      brand_id: item.brandId,
      title: item.title,
      description: item.description,
      order_index: item.orderIndex,
      source_template_item_id: item.sourceTemplateItemId ?? null,
      created_by: item.createdBy ?? null
    })
    .select()
    .single();
  if (error) throw error;
  return brandItemFromDb(data as DbBrandItem);
}

// Khởi tạo checklist cho 1 brand bằng cách copy toàn bộ template item đang active,
// giữ đúng thứ tự orderIndex của template.
export async function instantiateBrandOnboardingChecklist(
  brandId: string,
  templateItems: OnboardingChecklistTemplateItem[],
  createdBy?: string
): Promise<BrandOnboardingChecklistItem[]> {
  const activeItems = templateItems.filter((t) => t.isActive);
  if (activeItems.length === 0) return [];

  const { data, error } = await supabase
    .from("brand_onboarding_checklists")
    .insert(
      activeItems.map((t) => ({
        brand_id: brandId,
        title: t.title,
        description: t.description,
        order_index: t.orderIndex,
        source_template_item_id: t.id,
        created_by: createdBy ?? null
      }))
    )
    .select();
  if (error) throw error;
  return (data as DbBrandItem[]).map(brandItemFromDb);
}

export async function updateBrandOnboardingChecklistItem(
  id: string,
  patch: Partial<Pick<BrandOnboardingChecklistItem, "title" | "description" | "assignee" | "deadline" | "status" | "orderIndex">>
): Promise<BrandOnboardingChecklistItem> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.assignee !== undefined) row.assignee = patch.assignee;
  if (patch.deadline !== undefined) row.deadline = patch.deadline || null;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.orderIndex !== undefined) row.order_index = patch.orderIndex;

  const { data, error } = await supabase.from("brand_onboarding_checklists").update(row).eq("id", id).select().single();
  if (error) throw error;
  return brandItemFromDb(data as DbBrandItem);
}

export async function deleteBrandOnboardingChecklistItem(id: string): Promise<void> {
  const { error } = await supabase.from("brand_onboarding_checklists").delete().eq("id", id);
  if (error) throw error;
}
