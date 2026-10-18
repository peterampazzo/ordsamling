import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { handleOAuthCallback, type OAuthResult } from "@/lib/googleOAuth";
import { runMigration, AccountSwitchRequired } from "@/lib/migration";
import { REAL_STORAGE_KEY } from "@/lib/demo";
import type { LexisEntry } from "@/lib/lexicon";
import type { QuizSessionRecord } from "@/lib/quizHistory";

type PageState =
  | { status: "loading"; message: string }
  | { status: "error"; message: string }
  | { status: "account-switch"; message: string }
  | { status: "done" };

export default function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<PageState>({ status: "loading", message: "Connecting to Google Drive…" });
  const hasRun = useRef(false);
  const pendingAccount = useRef<OAuthResult | null>(null);

  const finishConnection = useCallback(async (result: OAuthResult, choice?: 'import' | 'separate') => {
    try {
      setState({ status: "loading", message: "Connecting your local data to Google Sheets…" });
      const entries = JSON.parse(localStorage.getItem(REAL_STORAGE_KEY) || "[]") as LexisEntry[];
      const history = JSON.parse(localStorage.getItem("lexikon-quiz-history") || "[]") as QuizSessionRecord[];
      await runMigration(result.accessToken, entries, history, choice);
      window.dispatchEvent(new CustomEvent("ordsamling:oauth-complete"));
      pendingAccount.current = null;
      setState({ status: "done" });
      navigate("/app", { replace: true });
    } catch (error) {
      if (error instanceof AccountSwitchRequired) {
        pendingAccount.current = result;
        setState({ status: "account-switch", message: error.message });
      } else setState({ status: "error", message: error instanceof Error ? error.message : "Connection failed." });
    }
  }, [navigate]);

  useEffect(() => {
    // Guard against double-invocation in React StrictMode
    if (hasRun.current) return;
    hasRun.current = true;

    const error = searchParams.get("error");
    const code = searchParams.get("code");

    if (error) {
      setState({ status: "error", message: `Google returned an error: ${error}` });
      return;
    }

    if (!code) {
      navigate("/app", { replace: true });
      return;
    }

    (async () => {
      try {
        // Step 1: Exchange code for tokens
        setState({ status: "loading", message: "Exchanging authorization code…" });
        const result = await handleOAuthCallback(code, searchParams.get("state"));

        await finishConnection(result);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "An unexpected error occurred.";
        setState({ status: "error", message });
      }
    })();
  }, [searchParams, navigate, finishConnection]);

  if (state.status === "account-switch") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <section className="max-w-md space-y-4" aria-labelledby="account-switch-title">
          <h1 id="account-switch-title" className="text-xl font-semibold">Switch Google account</h1>
          <p>{state.message}</p>
          <p>Your previous account's local copy and pending changes will be retained separately.</p>
          <button className="block underline" onClick={() => void finishConnection(pendingAccount.current!, 'separate')}>
            Keep accounts separate
          </button>
          <button className="block underline" onClick={() => void finishConnection(pendingAccount.current!, 'import')}>
            Import this device's vocabulary and history
          </button>
        </section>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold text-destructive">
            Connection failed
          </h1>
          <p className="text-muted-foreground">{state.message}</p>
          <a
            href="/app"
            className="inline-block text-sm underline underline-offset-4 hover:text-foreground"
          >
            Back to app
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">{state.status === "loading" ? state.message : "Done"}</p>
      </div>
    </div>
  );
}
