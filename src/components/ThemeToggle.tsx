"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const THEME_KEY = "cancionero:theme";

function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState<boolean | null>(null);

  useEffect(() => {
    const attr = document.documentElement.getAttribute("data-theme");
    setIsDark(attr ? attr === "dark" : systemPrefersDark());
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {
      // no pasa nada si no se puede guardar la preferencia
    }
  }

  if (isDark === null) {
    return <span className="flex h-9 w-9 shrink-0" aria-hidden />;
  }

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lilac-light"
    >
      {isDark ? <Sun size={18} strokeWidth={1.8} /> : <Moon size={18} strokeWidth={1.8} />}
    </button>
  );
}
