import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DemoBanner } from "@/components/DemoBanner";
import { RouteAnnouncer } from "@/components/RouteAnnouncer";
import Landing from "./pages/Landing.tsx";
import Index from "./pages/Index.tsx";
import BulkImport from "./pages/BulkImport.tsx";
import Quiz from "./pages/Quiz.tsx";
import Progress from "./pages/Progress.tsx";
import DemoEntry from "./pages/DemoEntry.tsx";
import OAuthCallback from "./pages/OAuthCallback.tsx";
import Privacy from "./pages/Privacy.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <RouteAnnouncer />
        <DemoBanner />
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
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
