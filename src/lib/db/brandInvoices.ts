import { supabase } from "../supabaseClient";
import { BrandInvoice } from "../../types";

const orNull = (v: string | undefined | null) => (v ? v : null);

interface DbBrandInvoice {
  id: string;
  brand_id: string;
  month: string;
  amount: number;
  status: BrandInvoice["status"];
  due_date: string | null;
  paid_amount: number;
  paid_at: string | null;
  notes: string;
  created_by: string | null;
}

function fromDb(row: DbBrandInvoice): BrandInvoice {
  return {
    id: row.id,
    brandId: row.brand_id,
    month: row.month,
    amount: row.amount,
    status: row.status,
    dueDate: row.due_date ?? undefined,
    paidAmount: row.paid_amount,
    paidAt: row.paid_at ?? undefined,
    notes: row.notes,
    createdBy: row.created_by ?? undefined
  };
}

export async function fetchBrandInvoices(): Promise<BrandInvoice[]> {
  const { data, error } = await supabase.from("brand_invoices").select("*").order("month", { ascending: false });
  if (error) throw error;
  return (data as DbBrandInvoice[]).map(fromDb);
}

export async function createBrandInvoice(
  invoice: Omit<BrandInvoice, "id" | "paidAmount" | "paidAt"> & { createdBy?: string }
): Promise<BrandInvoice> {
  const { data, error } = await supabase
    .from("brand_invoices")
    .insert({
      brand_id: invoice.brandId,
      month: invoice.month,
      amount: invoice.amount,
      status: invoice.status,
      due_date: orNull(invoice.dueDate),
      notes: invoice.notes,
      created_by: orNull(invoice.createdBy)
    })
    .select()
    .single();
  if (error) throw error;
  return fromDb(data as DbBrandInvoice);
}

export async function updateBrandInvoice(
  id: string,
  patch: Partial<Pick<BrandInvoice, "amount" | "status" | "dueDate" | "paidAmount" | "notes">>
): Promise<BrandInvoice> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.amount !== undefined) row.amount = patch.amount;
  if (patch.status !== undefined) {
    row.status = patch.status;
    row.paid_at = patch.status === "paid" ? new Date().toISOString() : null;
  }
  if (patch.dueDate !== undefined) row.due_date = orNull(patch.dueDate);
  if (patch.paidAmount !== undefined) row.paid_amount = patch.paidAmount;
  if (patch.notes !== undefined) row.notes = patch.notes;

  const { data, error } = await supabase.from("brand_invoices").update(row).eq("id", id).select().single();
  if (error) throw error;
  return fromDb(data as DbBrandInvoice);
}

export async function deleteBrandInvoice(id: string): Promise<void> {
  const { error } = await supabase.from("brand_invoices").delete().eq("id", id);
  if (error) throw error;
}
