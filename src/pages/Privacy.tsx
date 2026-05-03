import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const GITHUB_URL = "https://github.com/peterampazzo/ordsamling/";

const Privacy = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur-md supports-[backdrop-filter]:bg-card/70">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild className="gap-1.5">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
          <span className="font-serif text-lg text-foreground tracking-tight">Ordsamling.</span>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="mb-10">
          <h1 className="font-serif text-3xl sm:text-4xl text-foreground tracking-tight mb-2">
            Privacy Policy
          </h1>
          <p className="text-sm text-muted-foreground">
            Ordsamling &nbsp;·&nbsp; Last updated: May 3, 2026
          </p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-foreground/90">

          <section aria-labelledby="hosting">
            <h2 id="hosting" className="font-serif text-xl text-foreground mb-3">
              Hosting &amp; open source
            </h2>
            <p>
              Ordsamling is a fully client-side app hosted on{" "}
              <a
                href="https://pages.cloudflare.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                Cloudflare Pages
              </a>
              . It runs entirely in your browser — there is no server-side logic, no database, and
              no telemetry. All source code is open source and available on{" "}
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                GitHub
              </a>
              . You can inspect exactly what the app does with your data.
            </p>
          </section>

          <section aria-labelledby="data">
            <h2 id="data" className="font-serif text-xl text-foreground mb-3">
              Your data
            </h2>
            <p>
              Your vocabulary and quiz history are stored exclusively in your browser's
              localStorage. This data never leaves your device unless you choose to enable cloud
              sync, in which case it is written directly to a Google Spreadsheet in your own Google
              Drive. The developer has no access to your data at any point.
            </p>
          </section>

          <section aria-labelledby="google">
            <h2 id="google" className="font-serif text-xl text-foreground mb-3">
              Google account access
            </h2>
            <p>
              The Google Sheets integration is currently private and invite-only — it is not
              available to the general public. When you connect Google Drive, the app requests
              permission to access only the files it creates itself. This means it can only read
              and write the single spreadsheet named "Ordsamling Data" — it cannot see, read, or
              modify any other file in your Drive. Your Google account data is not shared with any
              third party and is used solely to provide the sync functionality.
            </p>
          </section>

          <section aria-labelledby="ai">
            <h2 id="ai" className="font-serif text-xl text-foreground mb-3">
              AI features (Bring Your Own Key)
            </h2>
            <p>
              AI features use a Gemini API key that you supply yourself — there is no shared or
              developer-managed key. The key is stored exclusively in your browser's localStorage
              and is never sent to any developer-controlled server. When you use an AI feature,
              your browser makes a direct HTTPS request to the Gemini API using your key. The
              developer has no visibility into these requests, their content, or your key.
            </p>
          </section>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-serif text-sm text-foreground">Ordsamling</span>
          <Link to="/" className="hover:text-foreground transition-colors">
            ← Back to home
          </Link>
        </div>
      </footer>
    </div>
  );
};

export default Privacy;
