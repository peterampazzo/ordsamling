import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { seedDemoEntries } from "@/lib/demo";
import { DemoTour } from "@/components/DemoTour";
import Index from "./Index";

/**
 * The /demo route.
 *
 * - Has its own QueryClient so the cache is completely isolated from /app.
 * - Seeds demo entries synchronously at module evaluation time so they are
 *   present before the first render (avoids the useEffect timing gap).
 * - Renders Index with demo=true so it reads/writes only the demo storage key
 *   and never touches Google Sheets sync.
 * - Mounts the DemoTour overlay; the tour self-hides after first dismissal.
 */

// Seed before any render so useLexicon's initialData sees the entries.
seedDemoEntries();

const demoQueryClient = new QueryClient();

const DemoEntry = () => (
  <QueryClientProvider client={demoQueryClient}>
    <Index demo />
    <DemoTour />
  </QueryClientProvider>
);

export default DemoEntry;

