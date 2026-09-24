import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: imps } = await sb.from("brand_dataraw_imports").select("id,period_start").eq("report_type", "shop_analytics").eq("brand_id", "07de51d2-fae6-437c-bd00-f10c12ccfbf9").order("period_start");
  for (const imp of imps ?? []) {
    const { data: rows } = await sb.from("brand_dataraw_rows").select("raw").eq("import_id", imp.id);
    let gmv = 0, live = 0, refunds = 0, n = 0;
    for (const { raw } of rows ?? []) { const r = raw as any; gmv += Number(r.GMV || 0); live += Number(r["Seller LIVE GMV"] || 0); refunds += Number(r.Refunds || 0); n++; }
    console.log(imp.period_start, "days", n, "shop GMV", (gmv / 1e9).toFixed(2), "tỷ; seller LIVE", (live / 1e9).toFixed(2), "tỷ =", (live / gmv * 100).toFixed(0) + "%", "refunds", (refunds / gmv * 100).toFixed(0) + "%");
  }
}
main();
