import React, { useEffect, useState } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import DriverPortalPage from "./pages/DriverPortalPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import LandingPage from "./pages/LandingPage";
import DemoBanner from "./components/DemoBanner";

const queryClient = new QueryClient();

/**
 * TokenRedirectGuard: prevents drivers from seeing the admin dashboard.
 * Checks ?_dp=, ?token=, and sessionStorage for driver signals.
 */
const TokenRedirectGuard = ({ children }: { children: React.ReactNode }) => {
  const [searchParams] = useSearchParams();

  const dpParam = searchParams.get('_dp');
  if (dpParam) {
    const targetPath = decodeURIComponent(dpParam);
    if (targetPath.includes('driver') || targetPath.includes('portal') || targetPath.includes('token')) {
      try {
        const dpUrl = new URL(targetPath, window.location.origin);
        const token = dpUrl.searchParams.get('token');
        if (token) return <Navigate to={`/driver-portal?token=${encodeURIComponent(token)}`} replace />;
      } catch { /* ignore */ }
      return <Navigate to="/driver-portal" replace />;
    }
    if (targetPath.startsWith('/') && targetPath !== '/') {
      return <Navigate to={targetPath} replace />;
    }
  }

  const token = searchParams.get('token');
  if (token) return <Navigate to={`/driver-portal?token=${encodeURIComponent(token)}`} replace />;

  try {
    const spaRedirect = sessionStorage.getItem('spa_redirect');
    if (spaRedirect) {
      sessionStorage.removeItem('spa_redirect');
      if (spaRedirect.includes('driver') || spaRedirect.includes('portal') || spaRedirect.includes('token')) {
        try {
          const redirectUrl = new URL(spaRedirect, window.location.origin);
          const storedToken = redirectUrl.searchParams.get('token');
          if (storedToken) return <Navigate to={`/driver-portal?token=${encodeURIComponent(storedToken)}`} replace />;
        } catch { /* ignore */ }
        return <Navigate to="/driver-portal" replace />;
      }
    }
  } catch { /* sessionStorage not available */ }

  return <>{children}</>;
};

const useDemoMode = () => {
  const [isDemo, setIsDemo] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL ||
      (window.location.hostname === 'localhost' ? 'http://localhost:3001' : window.location.origin);
    fetch(`${apiUrl}/api/demo-status`)
      .then(r => r.json())
      .then(d => { if (d.demo) setIsDemo(true); })
      .catch(() => {})
      .finally(() => setChecked(true));
  }, []);

  return { isDemo, checked };
};

const AppInner = () => {
  const { isDemo, checked } = useDemoMode();

  // Wait for demo check before rendering to avoid flash
  if (!checked) return null;

  return (
    <>
      {isDemo && <DemoBanner />}
      <div style={isDemo ? { paddingTop: '40px' } : undefined}>
        <Routes>
          {/* Root — landing page in demo mode, TMS app in production */}
          <Route path="/" element={
            <TokenRedirectGuard>
              {isDemo ? <LandingPage /> : <Index />}
            </TokenRedirectGuard>
          } />

          {/* Direct TMS app access (always available for admin login after demo form) */}
          <Route path="/app" element={
            <TokenRedirectGuard>
              <Index />
            </TokenRedirectGuard>
          } />

          {/* Password reset */}
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Driver portal */}
          <Route path="/driver-portal" element={<DriverPortalPage />} />
          <Route path="/driver-portal/*" element={<DriverPortalPage />} />
          <Route path="/driver" element={<Navigate to="/driver-portal" replace />} />
          <Route path="/driver/*" element={<Navigate to="/driver-portal" replace />} />
          <Route path="/portal" element={<Navigate to="/driver-portal" replace />} />
          <Route path="/portal/*" element={<Navigate to="/driver-portal" replace />} />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </>
  );
};

const App = () => (
  <ThemeProvider defaultTheme="light">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppInner />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
