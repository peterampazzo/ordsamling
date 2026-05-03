import { useEffect, useState } from "react";
import { getExtraLanguages } from "@/lib/settings";

/** React hook returning currently-enabled extra language codes (ISO 639-1). */
export function useExtraLanguages(): string[] {
  const [codes, setCodes] = useState<string[]>(() => getExtraLanguages());

  useEffect(() => {
    const update = () => setCodes(getExtraLanguages());
    window.addEventListener("ordsamling:settings-changed", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("ordsamling:settings-changed", update);
      window.removeEventListener("storage", update);
    };
  }, []);

  return codes;
}
