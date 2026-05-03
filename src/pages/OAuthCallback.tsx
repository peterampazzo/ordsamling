import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { handleOAuthCallback } from "@/lib/googleOAuth";
import { runMigration } from "@/lib/migration";
import { getEntriesStorageKey } from "@/lib/demo";
import type { LexisEntry } from "@/lib/lexicon";
import type { QuizSessionRecord } from "@/lib/quizHistory";

type PageState =
  | { status: "loading"; message: string }
  | { status: "error"; message: string }
  | { status: "done" };

export default function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<PageState>({ status: "loading", message: "Connecting to Google Drive…" });
  const hasRun = useRef(false);

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
        const result = await handleOAuthCallback(code);

        // Step 2: Run migration (upload local data to Sheets, set storageSource)
        setState({ status: "loading", message: "Migrating your data to Google Sheets…" });

        const localRaw = localStorage.getItem(getEntriesStorageKey());
        const entries: LexisEntry[] = localRaw ? (JSON.parse(localRaw) as LexisEntry[]) : [];

        const historyRaw = localStorage.getItem("lexikon-quiz-history");
        const history: QuizSessionRecord[] = historyRaw ? (JSON.parse(historyRaw) as QuizSessionRecord[]) : [];

        await runMigration(result.accessToken, entries, history);

        // Step 3: Notify the sync engine that OAuth + migration completed
        window.dispatchEvent(
          new CustomEvent("ordsamling:oauth-complete", {
            detail: { accessToken: result.accessToken, email: result.email },
          })
        );

        setState({ status: "done" });
        navigate("/app", { replace: true });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "An unexpected error occurred.";
        setState({ status: "error", message });
      }
    })();
  }, [searchParams, navigate]);

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
