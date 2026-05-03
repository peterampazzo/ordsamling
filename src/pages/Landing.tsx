import { useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Brain,
  Languages,
  LineChart,
  Github,
  Lock,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, SerifHeading } from "@/components/layout";
import { t, getLang, setLang, AVAILABLE_LANGS } from "@/i18n";
import { cn } from "@/lib/utils";

const GITHUB_URL = "https://github.com/peterampazzo/ordsamling/";

const Landing = () => {
  const location = useLocation();
  const [lang, setLangState] = useState(getLang());

  useEffect(() => {
    const handler = () => setLangState(getLang());
    window.addEventListener("ordsamling:lang-changed", handler);
    return () => window.removeEventListener("ordsamling:lang-changed", handler);
  }, []);

  const switchLang = (l: string) => {
    setLang(l);
    setLangState(l);
  };

  // Legacy ?demo query → forward to dedicated route.
  if (new URLSearchParams(location.search).has("demo")) {
    return <Navigate to="/demo" replace />;
  }


  const features = [
    { icon: BookOpen, title: t("landing.feature1Title"), body: t("landing.feature1Body") },
    { icon: Languages, title: t("landing.feature2Title"), body: t("landing.feature2Body") },
    { icon: Brain, title: t("landing.feature3Title"), body: t("landing.feature3Body"), badge: t("landing.feature3Badge") },
    { icon: LineChart, title: t("landing.feature4Title"), body: t("landing.feature4Body") },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <PageHeader
        width="wide"
        actions={
          <>
            <div
              role="group"
              aria-label="Language"
              className="hidden sm:flex items-center rounded-full border border-border bg-background/60 p-0.5 text-[11px] font-mono uppercase tracking-wider"
            >
              {AVAILABLE_LANGS.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => switchLang(l)}
                  aria-pressed={lang === l}
                  className={cn(
                    "px-2 py-0.5 rounded-full transition-colors",
                    lang === l
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" asChild className="gap-1.5">
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" aria-label={t("landing.footerGithub")}>
                <Github className="h-4 w-4" />
                <span className="hidden sm:inline">{t("landing.github")}</span>
              </a>
            </Button>
            <Button asChild size="sm" className="gap-1.5">
              <Link to="/app">
                {t("landing.openApp")} <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </>
        }
      />

      {/* Mobile lang switch */}
      <div className="sm:hidden flex justify-center pt-3">
        <div role="group" aria-label="Language" className="flex items-center rounded-full border border-border bg-background/60 p-0.5 text-[11px] font-mono uppercase tracking-wider">
          {AVAILABLE_LANGS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => switchLang(l)}
              aria-pressed={lang === l}
              className={cn(
                "px-2.5 py-0.5 rounded-full transition-colors",
                lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-16 select-none font-serif text-[18rem] leading-none text-primary/5"
        >
          Aa
        </div>

        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-12 sm:pt-24 pb-16 sm:pb-20 text-center relative">
          <p className="text-xs sm:text-sm uppercase tracking-[0.32em] text-muted-foreground mb-6">
            {t("landing.eyebrow")}
          </p>
          <SerifHeading level="display" as="h1" className="mb-6">
            Ordsamling.
          </SerifHeading>
          <p className="font-serif italic text-lg sm:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            {t("landing.tagline")}
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild size="lg" className="h-12 px-6 gap-2 text-base">
              <Link to="/app">
                {t("landing.startCollecting")} <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12 px-6 text-base">
              <Link to="/demo">{t("landing.tryDemo")}</Link>
            </Button>
          </div>

          <p className="mt-6 text-xs text-muted-foreground">{t("landing.noAccount")}</p>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="h-px bg-border" />
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="mb-12 sm:mb-16 text-center max-w-2xl mx-auto">
          <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground mb-3">
            {t("landing.featuresEyebrow")}
          </p>
          <SerifHeading level="lg">
            {t("landing.featuresTitle")}
          </SerifHeading>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border rounded-lg overflow-hidden border border-border">
          {features.map(({ icon: Icon, title, body, badge }, i) => (
            <article
              key={title}
              className="bg-card p-6 sm:p-8 flex flex-col gap-3 transition-colors hover:bg-card/70"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-[11px] font-mono tabular-nums uppercase tracking-widest text-muted-foreground">
                  0{i + 1}
                </span>
                {badge && (
                  <span className="ml-auto text-[10px] uppercase tracking-wider bg-accent text-accent-foreground px-2 py-0.5 rounded-full">
                    {badge}
                  </span>
                )}
              </div>
              <SerifHeading level="md" as="h3">{title}</SerifHeading>
              <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Privacy */}
      <section className="border-y border-border bg-card/40">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-20 text-center">
          <span className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-primary/10 text-primary mb-5">
            <Lock className="h-5 w-5" />
          </span>
          <h2 className="font-serif text-2xl sm:text-3xl text-foreground mb-3">
            {t("landing.privacyTitle")}
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed">
            {t("landing.privacyBody")}
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-20 sm:py-28 text-center">
        <Sparkles className="h-5 w-5 text-muted-foreground/60 mx-auto mb-6" />
        <h2 className="font-serif text-3xl sm:text-4xl text-foreground mb-5 leading-tight">
          {t("landing.ctaTitle")}
        </h2>
        <p className="font-serif italic text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto mb-8 leading-relaxed">
          {t("landing.ctaBody")}
        </p>
        <Button asChild size="lg" className="h-12 px-7 gap-2 text-base">
          <Link to="/app">
            {t("landing.openOrdsamling")} <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <p className="font-serif text-sm text-foreground">Ordsamling</p>
          <div className="flex items-center gap-4">
            <span>{t("landing.footerCredit")}</span>
            <Link
              to="/privacy"
              className="hover:text-foreground transition-colors"
            >
              Privacy Policy
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-foreground hover:text-primary transition-colors"
            >
              <Github className="h-3.5 w-3.5" /> {t("landing.footerGithub")}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
