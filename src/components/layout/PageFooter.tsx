import { Link } from "react-router-dom";
import { Github } from "lucide-react";

const GITHUB_URL = "https://github.com/peterampazzo/ordsamling/";

/**
 * Minimal in-app footer (GitHub + Privacy). Used on Index, Quiz, BulkImport,
 * QuizHistory. Landing/Privacy use richer footers of their own.
 */
export const PageFooter = () => (
  <footer className="border-t border-border mt-8">
    <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 flex items-center justify-end gap-4">
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        aria-label="GitHub"
      >
        <Github className="h-3.5 w-3.5" />
        GitHub
      </a>
      <Link
        to="/privacy"
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Privacy Policy
      </Link>
    </div>
  </footer>
);
