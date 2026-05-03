import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X, FlaskConical } from "lucide-react";
import { isDemoMode, deactivateDemo } from "@/lib/demo";
import { t } from "@/i18n";

export function DemoBanner() {
  const [active, setActive] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setActive(isDemoMode());
    const update = () => setActive(isDemoMode());
    window.addEventListener("ordsamling:demo-changed", update);
    return () => window.removeEventListener("ordsamling:demo-changed", update);
  }, []);

  // Hide on the public landing page; only show inside the actual app surfaces.
  const visible = active && location.pathname !== "/";
  if (!visible) return null;

  const handleDisable = () => {
    deactivateDemo();
    navigate("/", { replace: true });
    setTimeout(() => window.location.reload(), 30);
  };

  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-primary px-3 py-1.5 text-primary-foreground text-xs">
      <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{t("demo.banner")}</span>
      <button
        type="button"
        onClick={handleDisable}
        className="ml-2 flex items-center gap-1 rounded-full bg-primary-foreground/20 px-2 py-0.5 text-[11px] hover:bg-primary-foreground/30 transition-colors shrink-0"
      >
        {t("demo.disable")}
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
