import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Brain,
  Languages,
  LineChart,
  Github,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: BookOpen,
    title: "Personlig trilingual notesbog",
    body: "En mobilvenlig lommebog til at fange dansk, engelsk og italiensk gloser fra skole og hverdag.",
  },
  {
    icon: Languages,
    title: "Dyb dansk grammatik",
    body: "Mere end oversættelser: spor køn (en/et), verbets tider og adjektivernes bøjninger.",
  },
  {
    icon: Brain,
    title: "Smarte AI-quizzer",
    body: "Træn hukommelsen med øvelsestilstande, AI-genererede distraktorer og en nedtælling per spørgsmål.",
  },
  {
    icon: LineChart,
    title: "Fremskridt & indsigter",
    body: "Historikken finder automatisk dine «svageste ord», så du øver dér hvor det betyder mest.",
  },
];

const Landing = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur-md supports-[backdrop-filter]:bg-card/70">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-baseline gap-2 group">
            <span className="font-serif text-xl sm:text-2xl text-foreground tracking-tight">
              Ordsamling
            </span>
            <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              · DA · EN · IT
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub"
              >
                <Github className="h-4 w-4" />
              </a>
            </Button>
            <Button asChild size="sm" className="gap-1.5">
              <Link to="/app">
                Åbn appen <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Decorative serif glyph */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-16 select-none font-serif text-[18rem] leading-none text-primary/5"
        >
          Aa
        </div>

        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-16 sm:pb-24 text-center relative">
          <p className="text-xs sm:text-sm uppercase tracking-[0.32em] text-muted-foreground mb-6">
            En lommenotesbog for sprog
          </p>
          <h1 className="font-serif text-4xl sm:text-6xl leading-[1.05] text-foreground mb-6">
            Ordsamling
          </h1>
          <p className="font-serif italic text-lg sm:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            A minimalist language notebook designed to rescue Danish, English,
            and Italian vocabulary from being forgotten.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild size="lg" className="h-12 px-6 gap-2 text-base">
              <Link to="/app">
                Start læring <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12 px-6 text-base">
              <Link to="/?demo">Prøv demoen</Link>
            </Button>
          </div>

          <p className="mt-6 text-xs text-muted-foreground">
            Ingen konto. Dine ord forbliver dine.
          </p>
        </div>

        {/* hairline */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="h-px bg-border" />
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="mb-12 sm:mb-16 text-center max-w-2xl mx-auto">
          <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground mb-3">
            Hvad Ordsamling gør
          </p>
          <h2 className="font-serif text-2xl sm:text-3xl text-foreground">
            En lille notesbog med store ambitioner
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border rounded-lg overflow-hidden border border-border">
          {features.map(({ icon: Icon, title, body }, i) => (
            <article
              key={title}
              className={cn(
                "bg-card p-6 sm:p-8 flex flex-col gap-3 transition-colors hover:bg-card/70",
              )}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-[11px] font-mono tabular-nums uppercase tracking-widest text-muted-foreground">
                  0{i + 1}
                </span>
              </div>
              <h3 className="font-serif text-xl text-foreground leading-snug">
                {title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {body}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* Quote / mission strip */}
      <section className="border-y border-border bg-card/40">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-20 text-center">
          <p className="font-serif italic text-xl sm:text-2xl text-foreground leading-relaxed">
            “I tend to remember things best by writing them down. Paper helps me
            memorize, but it’s hard to carry everywhere.”
          </p>
          <p className="mt-4 text-xs uppercase tracking-[0.28em] text-muted-foreground">
            — Hvorfor Ordsamling findes
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
        <h2 className="font-serif text-3xl sm:text-4xl text-foreground mb-4">
          Begynd din samling
        </h2>
        <p className="text-muted-foreground max-w-xl mx-auto mb-8">
          Tilføj dit første ord på under et minut. Quiz dig selv på resten af livet.
        </p>
        <Button asChild size="lg" className="h-12 px-7 gap-2 text-base">
          <Link to="/app">
            Åbn Ordsamling <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <p className="font-serif text-sm text-foreground">Ordsamling</p>
          <p>
            Bygget med omhu · Dansk · Engelsk · Italiensk
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
