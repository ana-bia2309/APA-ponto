import { useState, useEffect } from "react";

export function useTheme() {
  const [isDark, setIsDark] = useState(() => {
    return localStorage.getItem("apa-theme") === "dark";
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("apa-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("apa-theme", "light");
    }
  }, [isDark]);

  const toggle = () => setIsDark(prev => !prev);

  return { isDark, toggle };
}