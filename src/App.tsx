import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DemoBanner } from "@/components/DemoBanner";
import { RouteAnnouncer } from "@/components/RouteAnnouncer";
import { GoogleSheetsProvider } from "@/components/GoogleSheetsProvider";
import { RouteBoundary } from "@/components/RouteBoundary";
import Landing from "./pages/Landing.tsx";
const Index = lazy(() => import("./pages/Index.tsx"));
const BulkImport = lazy(() => import("./pages/BulkImport.tsx"));
const Quiz = lazy(() => import("./pages/Quiz.tsx"));
const Progress = lazy(() => import("./pages/Progress.tsx"));
const DemoEntry = lazy(() => import("./pages/DemoEntry.tsx"));
const OAuthCallback = lazy(() => import("./pages/OAuthCallback.tsx"));
const Privacy = lazy(() => import("./pages/Privacy.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

const queryClient = new QueryClient();

const RouteContent = ({ children }: { children: React.ReactNode }) => {
  const { pathname } = useLocation();
  return (
    <RouteBoundary key={pathname}>
      <Suspense fallback={<main id="main" className="p-6" role="status">Loading page…</main>}>
        {children}
      </Suspense>
    </RouteBoundary>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <GoogleSheetsProvider>
          <RouteAnnouncer />
          <DemoBanner />
          <RouteContent>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/app" element={<Index />} />
              <Route path="/demo" element={<DemoEntry />} />
              <Route path="/import" element={<BulkImport />} />
              <Route path="/quiz" element={<Quiz />} />
              <Route path="/quiz/history" element={<Navigate to="/progress?tab=sessions" replace />} />
              <Route path="/progress" element={<Progress />} />
              <Route path="/oauth/callback" element={<OAuthCallback />} />
              <Route path="/privacy" element={<Privacy />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </RouteContent>
        </GoogleSheetsProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
