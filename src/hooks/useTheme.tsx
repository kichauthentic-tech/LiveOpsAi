import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "midnight" | "ocean" | "sand";

export const THEME_OPTIONS: Array<{ id: Theme; label: string; dark: boolean }> = [
  { id: "midnight", label: "Midnight", dark: true },
  { id: "ocean", label: "Ocean", dark: true },
  { id: "sand", label: "Sand", dark: false }
];

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = "liveops-theme";

// Theme cũ chỉ có "light"/"dark" (trước khi có 3 preset) — map sang preset tương ứng để
// không mất lựa chọn user đã lưu trước đó.
const getInitialTheme = (): Theme => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "midnight" || stored === "ocean" || stored === "sand") return stored;
  if (stored === "light") return "sand";
  return "midnight";
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    THEME_OPTIONS.forEach(({ id }) => root.classList.remove(`theme-${id}`));
    root.classList.add(`theme-${theme}`);
    const isDark = THEME_OPTIONS.find((t) => t.id === theme)?.dark ?? true;
    root.classList.toggle("dark", isDark);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = (next: Theme) => setThemeState(next);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
