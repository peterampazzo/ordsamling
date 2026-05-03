import { Link } from "react-router-dom";
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

const GITHUB_URL = "https://github.com/lorenzobertolini/ordsamling";

const features = [
  {
    icon: BookOpen,
    title: "Personal Notebook",
    body: "A mobile-first workspace to capture and organize the words you actually meet — at school, at work, in conversation.",
  },
  {
    icon: Languages,
    title: "Danish Grammar",
    body: "Built-in support for noun genders (en/et), verb tenses, and adjective inflections. Not just translations — the full picture.",
  },
  {
    icon: Brain,
    title: "Smart Quizzes",
    body: "Memory exercises with intelligent distractors so the wrong answers actually feel plausible.",
    badge: "Preview",
  },
  {
    icon: LineChart,
    title: "Progress Insights",
    body: "Your weakest words rise to the top automatically, so practice always lands where it matters most.",
  },
];

const Landing = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur-md supports-[backdrop-filter]:bg-card/70">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-baseline gap-2">
            <span className="font-serif text-xl sm:text-2xl text-foreground tracking-tight">
              Ordsamling.
            </span>
            <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground hidden sm:inline">
              · DA · EN
            </span>
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button variant="ghost" size="sm" asChild className="gap-1.5">
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" aria-label="View on GitHub">
                <Github className="h-4 w-4" />
                <span className="hidden sm:inline">GitHub</span>
              </a>
            </Button>
            <Button asChild size="sm" className="gap-1.5">
              <Link to="/app">
                Open app <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-16 select-none font-serif text-[18rem] leading-none text-primary/5"
        >
          Aa
        </div>

        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-16 sm:pb-20 text-center relative">
          <p className="text-xs sm:text-sm uppercase tracking-[0.32em] text-muted-foreground mb-6">
            A pocket notebook for languages
          </p>
          <h1 className="font-serif text-5xl sm:text-7xl leading-[1.05] text-foreground mb-6 tracking-tight">
            Ordsamling.
          </h1>
          <p className="font-serif italic text-lg sm:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            A minimalist language notebook designed to rescue your Danish and
            English vocabulary from being forgotten.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild size="lg" className="h-12 px-6 gap-2 text-base">
              <Link to="/app">
                Start collecting <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12 px-6 text-base">
              <Link to="/demo">Try the demo</Link>
            </Button>
          </div>

          <p className="mt-6 text-xs text-muted-foreground">
            No account. Your words stay yours.
          </p>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="h-px bg-border" />
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="mb-12 sm:mb-16 text-center max-w-2xl mx-auto">
          <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground mb-3">
            What Ordsamling does
          </p>
          <h2 className="font-serif text-2xl sm:text-3xl text-foreground">
            A small notebook with bigger ambitions
          </h2>
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
              <h3 className="font-serif text-xl text-foreground leading-snug">{title}</h3>
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
            100% Private.
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed">
            All data is stored locally in your browser. No accounts, no
            sign-ups, no tracking. Export your collection at any time.
          </p>
        </div>
      </section>

      {/* Mission strip */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-20 text-center">
        <Sparkles className="h-5 w-5 text-muted-foreground/60 mx-auto mb-4" />
        <p className="font-serif italic text-2xl sm:text-3xl text-foreground leading-relaxed">
          “Stop forgetting, start capturing.”
        </p>
      </section>

      {/* Final CTA */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-20 sm:pb-28 text-center">
        <h2 className="font-serif text-3xl sm:text-4xl text-foreground mb-4">
          Begin your collection.
        </h2>
        <p className="text-muted-foreground max-w-xl mx-auto mb-8">
          Add your first word in under a minute. Quiz yourself for the rest of your life.
        </p>
        <Button asChild size="lg" className="h-12 px-7 gap-2 text-base">
          <Link to="/app">
            Open Ordsamling <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <p className="font-serif text-sm text-foreground">Ordsamling</p>
          <div className="flex items-center gap-4">
            <span>Built with care · Local-first</span>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-foreground hover:text-primary transition-colors"
            >
              <Github className="h-3.5 w-3.5" /> View on GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
