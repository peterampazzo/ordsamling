import { useEffect, useState } from "react";
import { getVisibleLanguages, type Language } from "@/lib/settings";

/** React hook returning currently-visible languages, reactively updated. */
export function useVisibleLanguages(): Language[] {
  const [langs, setLangs] = useState<Language[]>(() => getVisibleLanguages());

  useEffect(() => {
    const update = () => setLangs(getVisibleLanguages());
    window.addEventListener("ordsamling:settings-changed", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("ordsamling:settings-changed", update);
      window.removeEventListener("storage", update);
    };
  }, []);

  return langs;
}

export function useIsLanguageVisible(lang: Language): boolean {
  return useVisibleLanguages().includes(lang);
}
