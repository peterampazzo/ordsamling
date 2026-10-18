import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { seedDemoEntries } from "@/lib/demo";
import { DemoTour } from "@/components/DemoTour";
import Index from "./Index";

/**
 * The /demo route.
 *
 * - Has its own QueryClient so the cache is completely isolated from /app.
 * - Seeds demo entries when the demo route is entered, before rendering Index.
 * - Renders Index with demo=true so it reads/writes only the demo storage key
 *   and never touches Google Sheets sync.
 * - Mounts the DemoTour overlay; the tour self-hides after first dismissal.
 */

const demoQueryClient = new QueryClient();

const DemoEntry = () => {
  const [ready, setReady] = useState(false);
  useEffect(() => { seedDemoEntries(); setReady(true); }, []);
  if (!ready) return <main id="main" role="status" className="p-6">Loading demo…</main>;
  return (
    <QueryClientProvider client={demoQueryClient}>
      <Index demo />
      <DemoTour />
    </QueryClientProvider>
  );
};

export default DemoEntry;
