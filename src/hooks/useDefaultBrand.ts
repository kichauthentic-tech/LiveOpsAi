import { useCallback, useMemo, useState } from "react";
import type { Brand, LiveSession } from "../types";
import { loadRememberedBrandId, pickDefaultBrandId, rememberBrandId } from "../lib/defaultBrand";

/**
 * brandId cho ô chọn brand của một màn: tự chọn theo pickDefaultBrandId cho tới khi ops tự đổi, và
 * nhớ lựa chọn đó cho mọi màn khác. Tính suy ra (không set trong effect) vì brands/sessions nạp async
 * — ca về sau brand thì mặc định phải tự nhảy sang brand có ca, không kẹt ở brand đầu danh sách.
 */
export function useDefaultBrand(
  brands: Pick<Brand, "id">[],
  sessions: Pick<LiveSession, "brandId" | "date" | "status">[],
  today: string
): [string, (brandId: string) => void] {
  const [picked, setPicked] = useState("");
  const auto = useMemo(
    () => pickDefaultBrandId(brands, sessions, loadRememberedBrandId(), today),
    [brands, sessions, today]
  );
  const brandId = picked && brands.some((b) => b.id === picked) ? picked : auto;
  const setBrandId = useCallback((id: string) => {
    setPicked(id);
    rememberBrandId(id);
  }, []);
  return [brandId, setBrandId];
}
