"use client";

import * as React from "react";

export type Theme = "light" | "dark" | "system";
const KEY = "theme";

const ThemeContext = React.createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({ theme: "system", setTheme: () => {} });

function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#16191f" : "#f7faf8");
}

/** Скрипт до гидрации, чтобы не было вспышки светлой темы */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${KEY}")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}})()`;

const CHANGE = "theme-change";

function readTheme(): Theme {
  try {
    return (localStorage.getItem(KEY) as Theme) || "system";
  } catch {
    return "system";
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(CHANGE, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CHANGE, cb);
    window.removeEventListener("storage", cb);
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Тема живёт в localStorage (настройка устройства), React лишь подписан на неё
  const theme = React.useSyncExternalStore(subscribe, readTheme, () => "system" as Theme);

  React.useEffect(() => {
    apply(theme);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => apply("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [theme]);

  const setTheme = React.useCallback((t: Theme) => {
    try {
      localStorage.setItem(KEY, t);
    } catch {}
    window.dispatchEvent(new Event(CHANGE));
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return React.useContext(ThemeContext);
}
