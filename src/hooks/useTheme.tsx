import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "yfb" | "midnight" | "sand" | "paper" | "sage" | "daylight" | "bento";

export const THEME_OPTIONS: Array<{ id: Theme; label: string; dark: boolean; hint: string }> = [
  { id: "yfb", label: "YFB", dark: true, hint: "Đen vàng" },
  { id: "midnight", label: "Midnight", dark: true, hint: "Xanh navy" },
  { id: "sand", label: "Sand", dark: false, hint: "Sáng, tông kem" },
  { id: "paper", label: "Paper", dark: false, hint: "Trắng giấy, họp với brand" },
  { id: "sage", label: "Sage", dark: false, hint: "Sáng dịu, bo tròn" },
  { id: "daylight", label: "Daylight", dark: false, hint: "Tương phản cao, chữ to, mặc định" },
  { id: "bento", label: "Bento", dark: false, hint: "Nền kem, thẻ nổi bo lớn" }
];

// Font riêng của theme (05/11) — chỉ tải khi có người chọn theme đó, theme cũ giữ font hệ thống nên không tốn gì thêm.
// Cả 3 có bộ chữ tiếng Việt trên Google Fonts (kiểm 05/11); khai `--font-sans` tương ứng trong index.css.
const THEME_FONTS: Partial<Record<Theme, string>> = {
  paper: "Be+Vietnam+Pro:wght@400;500;600;700;800;900",
  sage: "Nunito+Sans:wght@400;500;600;700;800;900",
  daylight: "Lexend:wght@400;500;600;700;800;900",
  bento: "Plus+Jakarta+Sans:wght@400;500;600;700;800"
};

export type Density = "compact" | "normal" | "comfy";

export const DENSITY_OPTIONS: Array<{ id: Density; label: string }> = [
  { id: "compact", label: "Gọn" },
  { id: "normal", label: "Vừa" },
  { id: "comfy", label: "Thoáng" }
];

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  density: Density;
  setDensity: (density: Density) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = "liveops-theme";
const DENSITY_KEY = "liveops-density";

// Daylight là theme chính (mặc định, từ 08/11). Giá trị cũ được map sang preset tương ứng: "light" → sand,
// "ocean" (đã bỏ) và chưa chọn gì → daylight. Người đã tự chọn theme khác vẫn giữ lựa chọn của mình.
const getInitialTheme = (): Theme => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (THEME_OPTIONS.some((t) => t.id === stored)) return stored as Theme;
  if (stored === "light") return "sand";
  return "daylight";
};

const getInitialDensity = (): Density => {
  const stored = localStorage.getItem(DENSITY_KEY);
  return stored === "compact" || stored === "comfy" ? stored : "normal";
};

function ensureThemeFont(theme: Theme) {
  const family = THEME_FONTS[theme];
  if (!family) return;
  const id = `theme-font-${theme}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
  document.head.appendChild(link);
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);
  const [density, setDensityState] = useState<Density>(getInitialDensity);

  useEffect(() => {
    const root = document.documentElement;
    THEME_OPTIONS.forEach(({ id }) => root.classList.remove(`theme-${id}`));
    root.classList.add(`theme-${theme}`);
    const isDark = THEME_OPTIONS.find((t) => t.id === theme)?.dark ?? true;
    root.classList.toggle("dark", isDark);
    ensureThemeFont(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("density-compact", density === "compact");
    root.classList.toggle("density-comfy", density === "comfy");
    localStorage.setItem(DENSITY_KEY, density);
  }, [density]);

  const setTheme = (next: Theme) => setThemeState(next);
  const setDensity = (next: Density) => setDensityState(next);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, density, setDensity }}>{children}</ThemeContext.Provider>
  );
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
