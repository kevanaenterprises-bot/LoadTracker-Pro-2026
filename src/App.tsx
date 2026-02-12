import React, { useEffect } from 'react';
import { Toaster } from "@/components/ui/toaster";

import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useSearchParams, useLocation } from "react-router-dom";

import { ThemeProvider } from "@/components/theme-provider";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import DriverPortalPage from "./pages/DriverPortalPage";
import LandingPage from "./pages/LandingPage";

const queryClient = new QueryClient();

/**
 * TokenRedirectGuard: CRITICAL SECURITY COMPONENT
 * 
 * This is the FINAL safety net that prevents drivers from EVER seeing the admin dashboard.
 * It runs at the React level on the "/app" route and checks multiple signals:
 * 
 * 1. ?_dp= parameter: Set by public/404.html and public/driver-portal/index.html
 *    when the server can't handle SPA routing. Contains the encoded intended path.
 * 
 * 2. ?token= parameter: A driver token in the URL means this is a driver, not an admin.
 * 
 * 3. sessionStorage 'spa_redirect': Legacy fallback from older redirect approach.
 * 
 * If ANY of these signals indicate a driver URL, we redirect to /driver-portal
 * and the admin dashboard NEVER renders.
 */
const TokenRedirectGuard = ({ children }: { children: React.ReactNode }) => {
  const [searchParams] = useSearchParams();
  const location = useLocation();

  // ---- Check 1: ?_dp= parameter (from 404.html / driver-portal/index.html redirect) ----
  const dpParam = searchParams.get('_dp');
  if (dpParam) {
    const targetPath = decodeURIComponent(dpParam);
    // If it's a driver-related path, redirect there
    if (targetPath.includes('driver') || targetPath.includes('portal') || targetPath.includes('token')) {
      // Extract token if embedded in the _dp path
      try {
        const dpUrl = new URL(targetPath, window.location.origin);
        const token = dpUrl.searchParams.get('token');
        if (token) {
          return <Navigate to={`/driver-portal?token=${encodeURIComponent(token)}`} replace />;
        }
      } catch {
        // URL parsing failed, just redirect to driver portal
      }
      return <Navigate to="/driver-portal" replace />;
    }
    // Non-driver _dp path - try to navigate there
    if (targetPath.startsWith('/') && targetPath !== '/') {
      return <Navigate to={targetPath} replace />;
    }
  }

  // ---- Check 2: ?token= parameter (driver landed on / with a dispatch token) ----
  const token = searchParams.get('token');
  if (token) {
    return <Navigate to={`/driver-portal?token=${encodeURIComponent(token)}`} replace />;
  }

  // ---- Check 3: sessionStorage fallback ----
  try {
    const spaRedirect = sessionStorage.getItem('spa_redirect');
    if (spaRedirect) {
      sessionStorage.removeItem('spa_redirect');
      if (spaRedirect.includes('driver') || spaRedirect.includes('portal') || spaRedirect.includes('token')) {
        // Extract token from the stored path
        try {
          const redirectUrl = new URL(spaRedirect, window.location.origin);
          const storedToken = redirectUrl.searchParams.get('token');
          if (storedToken) {
            return <Navigate to={`/driver-portal?token=${encodeURIComponent(storedToken)}`} replace />;
          }
        } catch {
          // URL parsing failed
        }
        return <Navigate to="/driver-portal" replace />;
      }
    }
  } catch {
    // sessionStorage not available - that's fine
  }

  // No driver signals detected - render the admin app normally
  return <>{children}</>;
};

const App = () => (
  <ThemeProvider defaultTheme="light">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Landing/Demo page - public facing */}
            <Route path="/demo" element={<LandingPage />} />
            
            {/* Root route - TMS app protected by TokenRedirectGuard */}
            <Route path="/" element={
              <TokenRedirectGuard>
                <Index />
              </TokenRedirectGuard>
            } />
            
            {/* Driver portal routes - exact path and wildcard to catch any sub-paths */}
            <Route path="/driver-portal" element={<DriverPortalPage />} />
            <Route path="/driver-portal/*" element={<DriverPortalPage />} />
            
            {/* Also catch common URL variations drivers might hit */}
            <Route path="/driver" element={<Navigate to="/driver-portal" replace />} />
            <Route path="/driver/*" element={<Navigate to="/driver-portal" replace />} />
            <Route path="/portal" element={<Navigate to="/driver-portal" replace />} />
            <Route path="/portal/*" element={<Navigate to="/driver-portal" replace />} />
            
            {/* 404 - NEVER shows admin link, always directs to driver portal */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
