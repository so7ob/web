import { updateMetadata } from "@/metadata";
import { createContext, useContext, useEffect, useState, useMemo } from "react";
import { useLoaderData } from "react-router-dom";
import {
  isThemeMode,
  PRESENTATION_KEYS,
  type PublicView,
} from "@so7ob/contracts";
import { THEME_STORAGE_KEY, defaultMode } from "@/lib/appearance";
import { SunMoon } from "lucide-react";
let transientPreference: string | null = null;
let storageUnavailable = false;
function preference() {
  try {
    return storageUnavailable
      ? transientPreference
      : localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return transientPreference;
  }
}
function storePreference(value: string | null) {
  transientPreference = value;
  try {
    if (value === null) localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, value);
    storageUnavailable = false;
  } catch {
    storageUnavailable = true;
  }
}
const SettingsContext = createContext<Record<string, string>>({});
export const useSitePresentation = () => useContext(SettingsContext);
export function AppearanceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const data = useLoaderData<PublicView>();
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const settings = useMemo(
    () => ({ ...data.settings, ...overrides }),
    [data.settings, overrides],
  );
  useEffect(() => {
    setOverrides({});
  }, [data.settings]);
  useEffect(() => {
    const saved = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, string>>).detail;
      const allowed = Object.fromEntries(
        Object.entries(detail).filter(
          ([key, value]) =>
            PRESENTATION_KEYS.includes(key) && typeof value === "string",
        ),
      );
      setOverrides((p) => ({ ...p, ...allowed }));
    };
    window.addEventListener("so7ob-presentation-saved", saved);
    return () => window.removeEventListener("so7ob-presentation-saved", saved);
  }, []);
  useEffect(() => {
    updateMetadata({ ...data, settings });
  }, [data, settings]);
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      let mode = defaultMode(settings);
      try {
        const stored = preference();
        if (isThemeMode(stored)) mode = stored;
      } catch {
        /* use site default */
      }
      const dark = mode === "dark" || (mode === "system" && query.matches);
      document.documentElement.dataset.colorMode = dark ? "dark" : "light";
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    query.addEventListener("change", apply);
    window.addEventListener("storage", apply);
    window.addEventListener("so7ob-theme", apply);
    return () => {
      query.removeEventListener("change", apply);
      window.removeEventListener("storage", apply);
      window.removeEventListener("so7ob-theme", apply);
    };
  }, [settings]);
  return (
    <SettingsContext.Provider value={settings}>
      {children}
    </SettingsContext.Provider>
  );
}
export function ThemeToggle({
  locale,
  compact = false,
}: {
  locale: "ar" | "en";
  compact?: boolean;
}) {
  const ar = locale === "ar",
    [mode, setMode] = useState("default");
  useEffect(() => {
    const update = () => {
      try {
        const value = preference();
        setMode(isThemeMode(value) ? value : "default");
      } catch {
        /* default */
      }
    };
    update();
    window.addEventListener("storage", update);
    window.addEventListener("so7ob-theme", update);
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener("so7ob-theme", update);
    };
  }, []);
  return (
    <label
      title={ar ? "وضع العرض" : "Color mode"}
      className={
        compact
          ? "relative inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground focus-within:outline-2 focus-within:outline-ring"
          : "inline-flex min-h-11 items-center gap-1 rounded-lg border border-border bg-card px-2 text-foreground"
      }
    >
      <SunMoon className="size-4 shrink-0" aria-hidden="true" />
      <span className="sr-only">{ar ? "وضع العرض" : "Color mode"}</span>
      <select
        aria-label={ar ? "وضع العرض" : "Color mode"}
        className={
          compact
            ? "absolute inset-0 h-full w-full cursor-pointer opacity-0"
            : "min-h-11 w-20 sm:w-28 bg-transparent text-xs"
        }
        value={mode}
        onChange={(e) => {
          setMode(e.target.value);
          storePreference(e.target.value === "default" ? null : e.target.value);
          window.dispatchEvent(new Event("so7ob-theme"));
        }}
      >
        {[
          ["default", ar ? "افتراضي الموقع" : "Site default"],
          ["light", ar ? "فاتح" : "Light"],
          ["dark", ar ? "داكن" : "Dark"],
          ["system", ar ? "تلقائي" : "System"],
        ].map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
