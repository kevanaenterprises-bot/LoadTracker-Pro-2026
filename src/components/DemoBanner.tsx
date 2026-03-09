import React, { useState, useEffect } from 'react';
import { Clock, X, Mail } from 'lucide-react';

const DEMO_START_KEY = 'ltp_demo_start';
const DEMO_DURATION_MS = 60 * 60 * 1000; // 1 hour

const DemoBanner: React.FC = () => {
  const [timeLeft, setTimeLeft] = useState<number>(DEMO_DURATION_MS);
  const [expired, setExpired] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Record demo start time on first load
    let startTime = parseInt(localStorage.getItem(DEMO_START_KEY) || '0', 10);
    if (!startTime) {
      startTime = Date.now();
      localStorage.setItem(DEMO_START_KEY, String(startTime));
    }

    const tick = () => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, DEMO_DURATION_MS - elapsed);
      setTimeLeft(remaining);
      if (remaining === 0) setExpired(true);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  if (dismissed && timeLeft > 10 * 60 * 1000) return null; // hide if dismissed and >10 min left

  const minutes = Math.floor(timeLeft / 60000);
  const seconds = Math.floor((timeLeft % 60000) / 1000);
  const isWarning = timeLeft <= 10 * 60 * 1000 && timeLeft > 0;
  const pad = (n: number) => String(n).padStart(2, '0');

  if (expired) {
    return (
      <div className="fixed inset-0 z-[200] bg-slate-900/95 backdrop-blur-sm flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-slate-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Demo Session Ended</h2>
          <p className="text-slate-500 mb-6">
            Your 1-hour demo has expired. We hope you liked what you saw!
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-left">
            <p className="text-sm text-blue-800 font-medium mb-1">Ready to get started?</p>
            <p className="text-sm text-blue-700">
              Reach out to Kevin at{' '}
              <a href="mailto:kevin@go4fc.com" className="font-semibold underline">kevin@go4fc.com</a>
              {' '}— no sales team, no pressure, just a real conversation.
            </p>
          </div>
          <a
            href="mailto:kevin@go4fc.com"
            className="flex items-center justify-center gap-2 w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors"
          >
            <Mail className="w-4 h-4" />
            Contact Kevin
          </a>
          <button
            onClick={() => {
              localStorage.removeItem(DEMO_START_KEY);
              window.location.reload();
            }}
            className="mt-3 text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            Start a new demo session
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`fixed top-0 left-0 right-0 z-[100] transition-colors ${
      isWarning ? 'bg-amber-500' : 'bg-blue-700'
    }`}>
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold ${
            isWarning ? 'bg-amber-600 text-white' : 'bg-blue-800 text-white'
          }`}>
            <Clock className="w-3.5 h-3.5" />
            {pad(minutes)}:{pad(seconds)}
          </div>
          <span className="text-white text-sm font-medium">
            {isWarning
              ? '⚠️ Demo ending soon — explore freely, no data is real'
              : '🎮 You\'re in demo mode — play with everything, nothing is real'}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="mailto:kevin@go4fc.com"
            className={`text-sm font-semibold underline hidden sm:block ${
              isWarning ? 'text-amber-100 hover:text-white' : 'text-blue-200 hover:text-white'
            }`}
          >
            Questions? kevin@go4fc.com
          </a>
          {!isWarning && (
            <button
              onClick={() => setDismissed(true)}
              className="text-white/60 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DemoBanner;
