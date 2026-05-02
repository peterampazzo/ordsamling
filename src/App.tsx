import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useSearchParams } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DemoBanner } from "@/components/DemoBanner";
import { activateDemo } from "@/lib/demo";
import Landing from "./pages/Landing.tsx";
import Index from "./pages/Index.tsx";
import BulkImport from "./pages/BulkImport.tsx";
import Quiz from "./pages/Quiz.tsx";
import QuizHistory from "./pages/QuizHistory.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

function DemoActivator() {
  const [params] = useSearchParams();
  useEffect(() => {
    if (params.has("demo")) {
      activateDemo();
      // Remove ?demo from URL without reload
      const url = new URL(window.location.href);
      url.searchParams.delete("demo");
      window.history.replaceState({}, "", url.pathname + url.search);
      // Invalidate queries so demo data loads
      queryClient.invalidateQueries();
    }
  }, [params]);
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <DemoActivator />
        <DemoBanner />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app" element={<Index />} />
          <Route path="/import" element={<BulkImport />} />
          <Route path="/quiz" element={<Quiz />} />
          <Route path="/quiz/history" element={<QuizHistory />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
