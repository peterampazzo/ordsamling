import { Link } from "react-router-dom";
import { PageHeader, SerifHeading } from "@/components/layout";

const GITHUB_URL = "https://github.com/peterampazzo/ordsamling/";

const Privacy = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PageHeader backTo="/" pageLabel="Privacy" srHeading="Privacy Policy" />

      <main id="main" className="max-w-3xl mx-auto px-3 sm:px-4 py-12 sm:py-16">
        <div className="mb-10">
          <SerifHeading level="xl" className="mb-2">
            Privacy Policy
          </SerifHeading>
          <p className="text-sm text-muted-foreground">
            Ordsamling &nbsp;·&nbsp; Last updated: May 3, 2026
          </p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-foreground/90">

          <section aria-labelledby="hosting">
            <SerifHeading level="md" id="hosting" className="mb-3">
              Hosting &amp; open source
            </SerifHeading>
            <p>
              Ordsamling is a local-first app hosted on{" "}
              <a
                href="https://pages.cloudflare.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                Cloudflare Pages
              </a>
              . Vocabulary, quizzes, and AI features run in your browser. A small server-side
              function handles Google sign-in and token refresh; there is no application database
              storing your vocabulary or quiz history and no telemetry. All source code is available on{" "}
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
            <SerifHeading level="md" id="data" className="mb-3">
              Your data
            </SerifHeading>
            <p>
              Your vocabulary and quiz history are stored by default in your browser's
              localStorage. This data never leaves your device unless you choose to enable cloud
              sync, in which case it is written directly to a Google Spreadsheet in your own Google
              Drive. The maintainer does not collect your vocabulary or quiz history.
              Keep an export as a backup: clearing browser storage removes the local copy.
            </p>
          </section>

          <section aria-labelledby="google">
            <SerifHeading level="md" id="google" className="mb-3">
              Google account access
            </SerifHeading>
            <p>
              The Google Sheets integration is currently private and invite-only — it is not
              available to the general public. When you connect Google Drive, the app requests
              Google Sheets access and permission to locate app-created Drive files. The app uses
              these permissions to synchronize the spreadsheet named "Ordsamling Data". The Sheets
              permission is broader than access to that one spreadsheet. Google access and refresh
              tokens are kept in localStorage on your device; the OAuth function transiently handles
              credentials during sign-in and refresh. Vocabulary and history requests go directly
              from your browser to Google, not through that function.
            </p>
          </section>

          <section aria-labelledby="ai">
            <SerifHeading level="md" id="ai" className="mb-3">
              AI features (Bring Your Own Key)
            </SerifHeading>
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

      <footer className="border-t border-border mt-16">
        <div className="max-w-3xl mx-auto px-3 sm:px-4 py-6 flex items-center justify-between text-xs text-muted-foreground">
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
