import { useSyncExternalStore } from "react";

/** true/false theo media query, tự cập nhật khi đổi cỡ cửa sổ. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => true
  );
}
