import { useLocation, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Truck, AlertCircle, ArrowRight, Loader2 } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const [shouldRedirect, setShouldRedirect] = useState(false);
  const [redirectTarget, setRedirectTarget] = useState('/driver-portal');

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname + location.search
    );

    const params = new URLSearchParams(location.search);
    const token = params.get('token');
    const dpParam = params.get('_dp');

    // If there's a token, redirect to driver portal with it
    if (token) {
      setRedirectTarget(`/driver-portal?token=${encodeURIComponent(token)}`);
      setShouldRedirect(true);
      return;
    }

    // If there's a _dp parameter, redirect to it (if it's a driver URL)
    if (dpParam) {
      const decoded = decodeURIComponent(dpParam);
      if (decoded.includes('driver') || decoded.includes('portal')) {
        setRedirectTarget(decoded.startsWith('/') ? decoded : '/driver-portal');
        setShouldRedirect(true);
        return;
      }
    }

    // If the path looks like it should be /driver-portal, redirect there
    if (
      location.pathname.includes('driver') || 
      location.pathname.includes('portal') ||
      location.pathname.includes('load')
    ) {
      setRedirectTarget('/driver-portal' + location.search);
      setShouldRedirect(true);
      return;
    }
  }, [location.pathname, location.search]);

  // Use React Router Navigate for reliable redirects
  if (shouldRedirect) {
    return <Navigate to={redirectTarget} replace />;
  }

  // =============================================================
  // CRITICAL: This page has ZERO links to "/" (the admin dashboard)
  // ALL navigation goes to /driver-portal ONLY
  // =============================================================
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 bg-blue-600 rounded-2xl shadow-lg mb-4">
            <Truck className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">LoadTracker Pro</h1>
          <p className="text-slate-500 text-sm">Driver Portal</p>
        </div>

        {/* Error Card */}
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Page Not Found</h2>
          <p className="text-slate-600 mb-6">
            The link you followed may have expired or the page has moved. 
            If you received a dispatch text, try clicking the link again.
          </p>
          {/* Go to Driver Portal - NEVER to admin */}
          <a
            href="/driver-portal"
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg"
          >
            Go to Driver Portal
            <ArrowRight className="w-5 h-5" />
          </a>

          {/* Admin Login */}
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              try { sessionStorage.removeItem('spa_redirect'); } catch {}
              window.location.href = '/';
            }}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 mt-3 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200 transition-all border border-slate-200"
          >
            Admin Login
          </a>
        </div>

        {/* Help Text */}
        <div className="mt-6 text-center">
          <p className="text-sm text-slate-500">
            If you received a dispatch text, try clicking the link again.
            <br />
            If the problem persists, contact your dispatcher.
          </p>
        </div>

      </div>
    </div>
  );
};

export default NotFound;
