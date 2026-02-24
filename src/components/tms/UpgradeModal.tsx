import React from 'react';
import { useUsage, FEATURE_LABELS, TIER_LIMITS, FeatureKey } from '@/contexts/UsageContext';
import { 
  X, Zap, CheckCircle2, ArrowRight, Crown, 
  Truck, Package, Receipt, Radar, MessageSquare, Brain
} from 'lucide-react';

const featureIcons: Record<FeatureKey, React.ReactNode> = {
  loads_created: <Package className="w-5 h-5" />,
  ai_dispatch_calls: <Brain className="w-5 h-5" />,
  sms_sent: <MessageSquare className="w-5 h-5" />,
  invoices_generated: <Receipt className="w-5 h-5" />,
  tracking_sessions: <Radar className="w-5 h-5" />,
};

const UpgradeModal: React.FC = () => {
  const { showUpgradeModal, setShowUpgradeModal, upgradeBlockedFeature, tier, usage, limits } = useUsage();

  if (!showUpgradeModal) return null;

  const blockedFeature = upgradeBlockedFeature || 'loads_created';
  const currentUsage = usage[blockedFeature] || 0;
  const limit = TIER_LIMITS.free[blockedFeature];

  const allFeatures: { key: FeatureKey; label: string; freeLimit: number; icon: React.ReactNode }[] = [
    { key: 'loads_created', label: 'Loads per Month', freeLimit: TIER_LIMITS.free.loads_created, icon: <Package className="w-4 h-4" /> },
    { key: 'ai_dispatch_calls', label: 'AI Dispatch Advisor', freeLimit: TIER_LIMITS.free.ai_dispatch_calls, icon: <Brain className="w-4 h-4" /> },
    { key: 'sms_sent', label: 'SMS Messages', freeLimit: TIER_LIMITS.free.sms_sent, icon: <MessageSquare className="w-4 h-4" /> },
    { key: 'invoices_generated', label: 'Invoices', freeLimit: TIER_LIMITS.free.invoices_generated, icon: <Receipt className="w-4 h-4" /> },
    { key: 'tracking_sessions', label: 'Live Tracking', freeLimit: TIER_LIMITS.free.tracking_sessions, icon: <Radar className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowUpgradeModal(false)} />
      
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
        {/* Header with gradient */}
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 px-6 py-8 text-white relative">
          <button 
            onClick={() => setShowUpgradeModal(false)}
            className="absolute top-4 right-4 p-1 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-white/20 rounded-xl">
              <Crown className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Starter Plan Limit Reached</h2>
              <p className="text-white/80 text-sm">Upgrade to Pro for unlimited access</p>
            </div>
          </div>
          
          <div className="bg-white/10 rounded-xl p-4 mt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                {featureIcons[blockedFeature]}
              </div>
              <div>
                <p className="font-semibold text-sm">{FEATURE_LABELS[blockedFeature]}</p>
                <p className="text-white/80 text-xs">
                  You've used {currentUsage} of {limit} free {FEATURE_LABELS[blockedFeature].toLowerCase()} this month
                </p>
              </div>
            </div>
            <div className="mt-3 w-full bg-white/20 rounded-full h-2">
              <div className="bg-white h-2 rounded-full" style={{ width: '100%' }} />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          <h3 className="text-lg font-bold text-slate-900 mb-1">Go Pro — Unlimited Everything</h3>
          <p className="text-sm text-slate-500 mb-5">Remove all limits. No per-seat fees. One flat monthly rate.</p>

          {/* Feature comparison */}
          <div className="space-y-2 mb-6">
            {allFeatures.map((f) => {
              const isBlocked = f.key === blockedFeature;
              const featureUsage = usage[f.key] || 0;
              const atLimit = featureUsage >= f.freeLimit;
              
              return (
                <div 
                  key={f.key} 
                  className={`flex items-center justify-between p-3 rounded-xl border ${
                    isBlocked ? 'bg-red-50 border-red-200' : atLimit ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-lg ${isBlocked ? 'bg-red-100 text-red-600' : atLimit ? 'bg-amber-100 text-amber-600' : 'bg-slate-200 text-slate-500'}`}>
                      {f.icon}
                    </div>
                    <span className="text-sm font-medium text-slate-700">{f.label}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <span className={`text-xs font-semibold ${atLimit ? 'text-red-600' : 'text-slate-500'}`}>
                        {featureUsage}/{f.freeLimit} used
                      </span>
                    </div>
                    <ArrowRight className="w-3 h-3 text-slate-400" />
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                      Unlimited
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pricing */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-5 text-white mb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-200">LoadTracker PRO</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-3xl font-extrabold">$300</span>
                  <span className="text-blue-200">/month</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-blue-200">Everything unlimited</p>
                <p className="text-xs text-blue-200">No per-seat fees</p>
                <p className="text-xs text-blue-200">Cancel anytime</p>
              </div>
            </div>
          </div>

          <a
            href="mailto:kevin@go4fc.com?subject=Upgrade to LoadTracker PRO&body=Hi Kevin,%0A%0AI'd like to upgrade my LoadTracker PRO account to the Pro tier ($300/month).%0A%0APlease let me know the next steps.%0A%0AThanks!"
            className="flex items-center justify-center gap-2 w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold text-base hover:from-amber-600 hover:to-orange-600 transition-all shadow-lg shadow-amber-500/30"
          >
            <Zap className="w-5 h-5" />
            Contact Us to Go Pro
          </a>
          
          <button
            onClick={() => setShowUpgradeModal(false)}
            className="w-full mt-3 py-2.5 text-slate-500 text-sm font-medium hover:text-slate-700 transition-colors"
          >
            Continue with Starter Plan
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpgradeModal;
