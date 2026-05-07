import { useLocation, useNavigate } from "react-router-dom";
import { FlaskConical, ArrowRight } from "lucide-react";
import { t } from "@/i18n";

export function DemoBanner() {
  const location = useLocation();
  const navigate = useNavigate();

  // Banner is permanently visible on /demo — no flag needed.
  if (location.pathname !== "/demo") return null;

  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-primary px-3 py-1.5 text-primary-foreground text-xs">
      <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate hidden sm:inline">{t("demo.banner")}</span>
      <span className="truncate sm:hidden">{t("demo.bannerShort")}</span>
      <button
        type="button"
        onClick={() => navigate("/app")}
        className="ml-2 flex items-center gap-1 rounded-full bg-primary-foreground/20 px-2 py-0.5 text-[11px] hover:bg-primary-foreground/30 transition-colors shrink-0"
      >
        {t("landing.openApp")}
        <ArrowRight className="h-3 w-3" />
      </button>
    </div>
  );
}
