import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { db } from '@/lib/supabaseCompat';
import { useAuth } from '@/contexts/AuthContext';

export type SubscriptionTier = 'free' | 'standard';

export type FeatureKey = 
  | 'loads_created'
  | 'ai_dispatch_calls'
  | 'sms_sent'
  | 'invoices_generated'
  | 'tracking_sessions';

export interface TierLimits {
  loads_created: number;
  ai_dispatch_calls: number;
  sms_sent: number;
  invoices_generated: number;
  tracking_sessions: number;
}

export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  free: {
    loads_created: 10,
    ai_dispatch_calls: 5,
    sms_sent: 20,
    invoices_generated: 10,
    tracking_sessions: 3,
  },
  standard: {
    loads_created: Infinity,
    ai_dispatch_calls: Infinity,
    sms_sent: Infinity,
    invoices_generated: Infinity,
    tracking_sessions: Infinity,
  },
};

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  loads_created: 'Loads Created',
  ai_dispatch_calls: 'AI Dispatch Advisor',
  sms_sent: 'SMS Messages',
  invoices_generated: 'Invoices Generated',
  tracking_sessions: 'Live Tracking Sessions',
};

interface UsageData {
  [key: string]: number;
}

interface UsageContextType {
  tier: SubscriptionTier;
  usage: UsageData;
  limits: TierLimits;
  loading: boolean;
  canUseFeature: (feature: FeatureKey) => boolean;
  getRemainingUses: (feature: FeatureKey) => number;
  getUsagePercent: (feature: FeatureKey) => number;
  incrementUsage: (feature: FeatureKey) => Promise<boolean>;
  checkAndPromptUpgrade: (feature: FeatureKey) => boolean;
  showUpgradeModal: boolean;
  setShowUpgradeModal: (show: boolean) => void;
  upgradeBlockedFeature: FeatureKey | null;
  refreshUsage: () => Promise<void>;
}

const UsageContext = createContext<UsageContextType | undefined>(undefined);

export const useUsage = () => {
  const context = useContext(UsageContext);
  if (!context) {
    throw new Error('useUsage must be used within a UsageProvider');
  }
  return context;
};

const getCurrentMonthYear = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export const UsageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [tier, setTier] = useState<SubscriptionTier>('free');
  const [usage, setUsage] = useState<UsageData>({});
  const [loading, setLoading] = useState(true);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeBlockedFeature, setUpgradeBlockedFeature] = useState<FeatureKey | null>(null);

  const limits = TIER_LIMITS[tier];

  const fetchTierAndUsage = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // Fetch user's subscription tier
      const { data: userData } = await db
        .from('users')
        .select('subscription_tier')
        .eq('id', user.id)
        .single();

      if (userData?.subscription_tier) {
        setTier(userData.subscription_tier as SubscriptionTier);
      }

      // Fetch current month usage
      const monthYear = getCurrentMonthYear();
      const { data: usageData } = await db
        .from('usage_tracking')
        .select('feature, count')
        .eq('user_id', user.id)
        .eq('month_year', monthYear);

      const usageMap: UsageData = {};
      if (usageData) {
        usageData.forEach((row) => {
          usageMap[row.feature] = row.count;
        });
      }
      setUsage(usageMap);
    } catch (err) {
      console.error('Error fetching usage:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchTierAndUsage();
  }, [fetchTierAndUsage]);

  const canUseFeature = useCallback((feature: FeatureKey): boolean => {
    if (tier === 'standard') return true;
    const currentUsage = usage[feature] || 0;
    return currentUsage < limits[feature];
  }, [tier, usage, limits]);

  const getRemainingUses = useCallback((feature: FeatureKey): number => {
    if (tier === 'standard') return Infinity;
    const currentUsage = usage[feature] || 0;
    return Math.max(0, limits[feature] - currentUsage);
  }, [tier, usage, limits]);

  const getUsagePercent = useCallback((feature: FeatureKey): number => {
    if (tier === 'standard') return 0;
    const currentUsage = usage[feature] || 0;
    return Math.min(100, Math.round((currentUsage / limits[feature]) * 100));
  }, [tier, usage, limits]);

  const incrementUsage = useCallback(async (feature: FeatureKey): Promise<boolean> => {
    if (!user) return false;
    if (tier === 'standard') return true;

    const currentUsage = usage[feature] || 0;
    if (currentUsage >= limits[feature]) {
      setUpgradeBlockedFeature(feature);
      setShowUpgradeModal(true);
      return false;
    }

    const monthYear = getCurrentMonthYear();

    try {
      // Upsert the usage count
      const { error } = await db
        .from('usage_tracking')
        .upsert(
          {
            user_id: user.id,
            feature,
            month_year: monthYear,
            count: currentUsage + 1,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,feature,month_year' }
        );

      if (error) {
        console.error('Error incrementing usage:', error);
        return true; // Allow action even if tracking fails
      }

      setUsage((prev) => ({ ...prev, [feature]: currentUsage + 1 }));
      return true;
    } catch (err) {
      console.error('Error incrementing usage:', err);
      return true; // Allow action even if tracking fails
    }
  }, [user, tier, usage, limits]);

  const checkAndPromptUpgrade = useCallback((feature: FeatureKey): boolean => {
    if (tier === 'standard') return true;
    if (!canUseFeature(feature)) {
      setUpgradeBlockedFeature(feature);
      setShowUpgradeModal(true);
      return false;
    }
    return true;
  }, [tier, canUseFeature]);

  const refreshUsage = useCallback(async () => {
    await fetchTierAndUsage();
  }, [fetchTierAndUsage]);

  return (
    <UsageContext.Provider
      value={{
        tier,
        usage,
        limits,
        loading,
        canUseFeature,
        getRemainingUses,
        getUsagePercent,
        incrementUsage,
        checkAndPromptUpgrade,
        showUpgradeModal,
        setShowUpgradeModal,
        upgradeBlockedFeature,
        refreshUsage,
      }}
    >
      {children}
    </UsageContext.Provider>
  );
};
