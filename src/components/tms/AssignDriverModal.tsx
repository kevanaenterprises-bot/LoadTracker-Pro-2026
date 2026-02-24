import React, { useState, useEffect } from 'react';
import { X, User, Phone, MapPin, Truck, Send, Loader2, CheckCircle, AlertCircle, UserMinus, Brain, Sparkles, Star, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Driver, Load } from '@/types/tms';
import { useUsage } from '@/contexts/UsageContext';

interface AIRecommendation {
  driver_id: string;
  driver_name: string;
  rank: number;
  confidence: number;
  reasoning: string;
  estimated_proximity: string;
  on_time_rate: number;
  key_factors: string[];
}

interface AIResponse {
  recommendations: AIRecommendation[];
  general_notes: string;
}

interface AssignDriverModalProps {
  isOpen: boolean;
  load: Load | null;
  onClose: () => void;
  onDriverAssigned: () => void;
}

const AssignDriverModal: React.FC<AssignDriverModalProps> = ({ isOpen, load, onClose, onDriverAssigned }) => {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [loading, setLoading] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);
  const [smsSuccess, setSmsSuccess] = useState(false);
  const [smsError, setSmsError] = useState<string | null>(null);

  // AI Advisor state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<AIResponse | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showAiPanel, setShowAiPanel] = useState(false);

  let usageCtx: ReturnType<typeof useUsage> | null = null;
  try {
    usageCtx = useUsage();
  } catch {
    // UsageProvider not available (e.g., in demo mode)
  }

  useEffect(() => {
    if (isOpen) {
      fetchDrivers();
      setSelectedDriver(null);
      setSmsSuccess(false);
      setSmsError(null);
      setAiResponse(null);
      setAiError(null);
      setShowAiPanel(false);
    }
  }, [isOpen]);

  const fetchDrivers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('drivers')
      .select('*')
      .order('name');
    if (data) {
      const filtered = data.filter(d => 
        d.status === 'available' || d.id === load?.driver_id
      );
      setDrivers(filtered);
    }
    setLoading(false);
  };

  const handleAskAI = async () => {
    if (!load) return;

    // Check usage limit
    if (usageCtx) {
      const canUse = usageCtx.checkAndPromptUpgrade('ai_dispatch_calls');
      if (!canUse) return;
    }

    setAiLoading(true);
    setAiError(null);
    setShowAiPanel(true);

    try {
      // Fetch recent loads for performance data
      const { data: recentLoads } = await supabase
        .from('loads')
        .select('id, driver_id, status, delivered_at, delivery_date, origin_city, origin_state, dest_city, dest_state')
        .in('status', ['DELIVERED', 'PAID', 'INVOICED'])
        .order('created_at', { ascending: false })
        .limit(100);

      // Fetch all drivers (not just available) for AI context
      const { data: allDrivers } = await supabase
        .from('drivers')
        .select('*')
        .eq('employment_status', 'active')
        .order('name');

      const { data, error } = await supabase.functions.invoke('ai-dispatch-advisor', {
        body: {
          load,
          drivers: allDrivers || drivers,
          recentLoads: recentLoads || [],
        },
      });

      if (error) throw error;

      setAiResponse(data as AIResponse);

      // Track usage
      if (usageCtx) {
        await usageCtx.incrementUsage('ai_dispatch_calls');
      }
    } catch (err: any) {
      console.error('AI Dispatch Advisor error:', err);
      setAiError(err.message || 'Failed to get AI recommendations. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSelectAIRecommendation = (driverId: string) => {
    const driver = drivers.find(d => d.id === driverId);
    if (driver) {
      setSelectedDriver(driver);
    }
  };

  const generateAcceptanceToken = () => {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  };

  const withTimeout = <T,>(promise: Promise<T>, maxMs: number): Promise<T | null> => {
    return Promise.race([
      promise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), maxMs))
    ]);
  };

  const handleAssignAndSendSms = async () => {
    if (!selectedDriver || !load) return;

    // Track SMS usage
    if (usageCtx) {
      const canSend = await usageCtx.incrementUsage('sms_sent');
      if (!canSend) return;
    }

    setSendingSms(true);
    setSmsError(null);
    
    try {
      const acceptanceToken = generateAcceptanceToken();
      const acceptanceUrl = `${window.location.origin}/driver-portal?token=${acceptanceToken}`;

      if (load.driver_id && load.driver_id !== selectedDriver.id) {
        await supabase
          .from('drivers')
          .update({ status: 'available' })
          .eq('id', load.driver_id);
      }

      const { error: updateError } = await supabase
        .from('loads')
        .update({
          driver_id: selectedDriver.id,
          status: 'DISPATCHED',
          acceptance_token: acceptanceToken,
          accepted_at: null,
        })
        .eq('id', load.id);

      if (updateError) throw updateError;

      await supabase
        .from('drivers')
        .update({ status: 'on_route' })
        .eq('id', selectedDriver.id);

      setSmsSuccess(true);

      try {
        const smsResult = await withTimeout(
          supabase.functions.invoke('send-driver-sms', {
            body: {
              driverPhone: selectedDriver.phone,
              driverName: selectedDriver.name,
              loadNumber: load.load_number,
              origin: `${load.origin_city}, ${load.origin_state}`,
              destination: `${load.dest_city}, ${load.dest_state}`,
              acceptanceUrl,
              totalMiles: load.total_miles || null,
              pickupDate: load.pickup_date || null,
              deliveryDate: load.delivery_date || null,
            },
          }),
          15000
        );

        if (smsResult === null) {
          setSmsError('Driver assigned! SMS timed out - use "Resend SMS" from load details if needed.');
        } else if (smsResult.error) {
          setSmsError(`Driver assigned! SMS failed: ${smsResult.error.message}. Use "Resend SMS" from load details.`);
        } else if (smsResult.data && !smsResult.data.success) {
          setSmsError(`Driver assigned! SMS failed: ${smsResult.data.error}. Use "Resend SMS" from load details.`);
        }
      } catch (smsErr: any) {
        setSmsError(`Driver assigned! SMS error: ${smsErr.message}. Use "Resend SMS" from load details.`);
      }

      supabase.functions.invoke('here-webhook', {
        body: { action: 'setup-load-geofences', load_id: load.id },
      }).catch(() => {});

      supabase.functions.invoke('here-webhook', {
        body: { action: 'register-device', driver_id: selectedDriver.id, device_name: `${selectedDriver.name}'s Device` },
      }).catch(() => {});

      setTimeout(() => {
        onDriverAssigned();
        onClose();
      }, 1500);

    } catch (error: any) {
      console.error('Error assigning driver:', error);
      setSmsError(error.message || 'Failed to assign driver. Please try again.');
      setSmsSuccess(false);
    } finally {
      setSendingSms(false);
    }
  };

  if (!isOpen || !load) return null;

  const isReassignment = !!load.driver_id;
  const currentDriverName = load.driver?.name || 'current driver';

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-emerald-600 bg-emerald-50';
    if (confidence >= 60) return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  };

  const getProximityColor = (proximity: string) => {
    const p = proximity.toLowerCase();
    if (p === 'close') return 'text-emerald-600 bg-emerald-50';
    if (p === 'medium') return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
        {/* Header */}
        <div className={`sticky top-0 z-10 px-6 py-4 flex items-center justify-between rounded-t-2xl ${
          isReassignment 
            ? 'bg-gradient-to-r from-amber-600 to-orange-600' 
            : 'bg-gradient-to-r from-indigo-600 to-purple-600'
        }`}>
          <div>
            <h2 className="text-xl font-bold text-white">
              {isReassignment ? 'Reassign Driver' : 'Assign Driver'}
            </h2>
            <p className="text-white/70 text-sm">{load.load_number}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Reassignment Warning */}
        {isReassignment && !smsSuccess && (
          <div className="px-6 py-3 bg-amber-50 border-b border-amber-200">
            <div className="flex items-center gap-3">
              <UserMinus className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800">Currently assigned to: {currentDriverName}</p>
                <p className="text-xs text-amber-600">Selecting a new driver will release {currentDriverName} and send a new dispatch SMS.</p>
              </div>
            </div>
          </div>
        )}

        {/* Load Summary */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-500" />
              <span className="text-slate-600">{load.origin_city}, {load.origin_state}</span>
            </div>
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-500" />
              <span className="text-slate-600">{load.dest_city}, {load.dest_state}</span>
            </div>
          </div>
        </div>

        {/* Success Message */}
        {smsSuccess ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">
              {isReassignment ? 'Driver Reassigned!' : 'Driver Assigned!'}
            </h3>
            <p className="text-slate-600">
              {smsError ? (
                <span className="text-amber-600 text-sm">{smsError}</span>
              ) : (
                <>SMS notification sent to {selectedDriver?.name}</>
              )}
            </p>
          </div>
        ) : (
          <>
            {/* AI Dispatch Advisor */}
            <div className="px-6 pt-4">
              <button
                onClick={showAiPanel ? () => setShowAiPanel(false) : handleAskAI}
                disabled={aiLoading}
                className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-violet-50 to-purple-50 border-2 border-violet-200 rounded-xl hover:from-violet-100 hover:to-purple-100 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl text-white group-hover:scale-110 transition-transform">
                    {aiLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Brain className="w-5 h-5" />}
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-slate-800 text-sm">AI Dispatch Advisor</p>
                    <p className="text-xs text-slate-500">
                      {aiLoading ? 'Analyzing drivers...' : aiResponse ? 'View AI recommendations' : 'Get AI-powered driver recommendations'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {aiResponse && (
                    <span className="px-2 py-0.5 bg-violet-100 text-violet-700 text-xs font-bold rounded-full">
                      {aiResponse.recommendations.length} picks
                    </span>
                  )}
                  {usageCtx && usageCtx.tier === 'free' && (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full">
                      {usageCtx.getRemainingUses('ai_dispatch_calls')} left
                    </span>
                  )}
                  {showAiPanel ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>
              </button>

              {/* AI Panel */}
              {showAiPanel && (
                <div className="mt-3 border-2 border-violet-200 rounded-xl overflow-hidden">
                  {aiLoading && (
                    <div className="p-8 text-center">
                      <div className="inline-flex items-center gap-3 px-4 py-2 bg-violet-50 rounded-full mb-3">
                        <Loader2 className="w-4 h-4 animate-spin text-violet-600" />
                        <span className="text-sm font-medium text-violet-700">Analyzing driver locations, performance & availability...</span>
                      </div>
                      <div className="flex justify-center gap-1 mt-2">
                        {[0, 1, 2].map(i => (
                          <div key={i} className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                        ))}
                      </div>
                    </div>
                  )}

                  {aiError && (
                    <div className="p-4 bg-red-50">
                      <div className="flex items-center gap-3 text-red-700">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <p className="text-sm">{aiError}</p>
                      </div>
                      <button onClick={handleAskAI} className="mt-2 text-sm text-red-600 font-medium hover:underline">
                        Try Again
                      </button>
                    </div>
                  )}

                  {aiResponse && !aiLoading && (
                    <div>
                      {/* Recommendations */}
                      {aiResponse.recommendations.length > 0 ? (
                        <div className="divide-y divide-violet-100">
                          {aiResponse.recommendations.map((rec, idx) => {
                            const isAvailableInList = drivers.some(d => d.id === rec.driver_id);
                            const isSelected = selectedDriver?.id === rec.driver_id;
                            
                            return (
                              <div
                                key={rec.driver_id}
                                className={`p-4 cursor-pointer transition-all ${
                                  isSelected ? 'bg-violet-50' : 'hover:bg-slate-50'
                                } ${!isAvailableInList ? 'opacity-50' : ''}`}
                                onClick={() => isAvailableInList && handleSelectAIRecommendation(rec.driver_id)}
                              >
                                <div className="flex items-start gap-3">
                                  {/* Rank Badge */}
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm ${
                                    idx === 0 ? 'bg-amber-100 text-amber-700' :
                                    idx === 1 ? 'bg-slate-200 text-slate-600' :
                                    'bg-orange-100 text-orange-700'
                                  }`}>
                                    {idx === 0 ? <Star className="w-4 h-4" /> : `#${rec.rank}`}
                                  </div>

                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-bold text-slate-800">{rec.driver_name}</span>
                                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getConfidenceColor(rec.confidence)}`}>
                                        {rec.confidence}% match
                                      </span>
                                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getProximityColor(rec.estimated_proximity)}`}>
                                        {rec.estimated_proximity}
                                      </span>
                                      {!isAvailableInList && (
                                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-600">
                                          Not Available
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-sm text-slate-600 mt-1">{rec.reasoning}</p>
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                      {rec.key_factors.map((factor, fi) => (
                                        <span key={fi} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">
                                          {factor}
                                        </span>
                                      ))}
                                      {rec.on_time_rate > 0 && (
                                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs rounded-full font-medium">
                                          {rec.on_time_rate}% on-time
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {isSelected && (
                                    <CheckCircle className="w-5 h-5 text-violet-600 flex-shrink-0" />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="p-4 text-center text-slate-500 text-sm">
                          No recommendations available
                        </div>
                      )}

                      {/* General Notes */}
                      {aiResponse.general_notes && (
                        <div className="px-4 py-3 bg-violet-50 border-t border-violet-100">
                          <div className="flex items-start gap-2">
                            <Sparkles className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-violet-700">{aiResponse.general_notes}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Driver List */}
            <div className="p-6">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
                {aiResponse ? 'All Available Drivers' : 'Available Drivers'}
              </h3>
              
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                </div>
              ) : drivers.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  No available drivers at the moment
                </div>
              ) : (
                <div className="space-y-3">
                  {drivers.map((driver) => {
                    const isCurrentDriver = driver.id === load.driver_id;
                    const aiRec = aiResponse?.recommendations.find(r => r.driver_id === driver.id);
                    
                    return (
                      <button
                        key={driver.id}
                        onClick={() => !isCurrentDriver && setSelectedDriver(driver)}
                        disabled={isCurrentDriver}
                        className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                          isCurrentDriver
                            ? 'border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed'
                            : selectedDriver?.id === driver.id
                            ? 'border-indigo-500 bg-indigo-50'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                            isCurrentDriver ? 'bg-slate-300'
                            : selectedDriver?.id === driver.id ? 'bg-indigo-500' : 'bg-slate-200'
                          }`}>
                            <User className={`w-6 h-6 ${
                              isCurrentDriver ? 'text-slate-500'
                              : selectedDriver?.id === driver.id ? 'text-white' : 'text-slate-500'
                            }`} />
                          </div>
                          <div className="flex-1">
                            <div className="font-semibold text-slate-800 flex items-center gap-2 flex-wrap">
                              {driver.name}
                              {isCurrentDriver && (
                                <span className="text-xs font-normal text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                                  Currently Assigned
                                </span>
                              )}
                              {aiRec && (
                                <span className="text-xs font-bold text-violet-600 bg-violet-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                                  <Brain className="w-3 h-3" />
                                  AI Pick #{aiRec.rank}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-slate-500 mt-1">
                              <span className="flex items-center gap-1">
                                <Truck className="w-3.5 h-3.5" />{driver.truck_number}
                              </span>
                              <span className="flex items-center gap-1">
                                <Phone className="w-3.5 h-3.5" />{driver.phone}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-sm text-slate-500 mt-1">
                              <MapPin className="w-3.5 h-3.5" />{driver.current_location}
                            </div>
                          </div>
                          {selectedDriver?.id === driver.id && (
                            <CheckCircle className="w-6 h-6 text-indigo-500" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Error Message */}
            {smsError && !smsSuccess && (
              <div className="mx-6 mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm">{smsError}</p>
              </div>
            )}

            {/* Actions */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-6 py-3 text-slate-600 bg-white border border-slate-200 rounded-xl font-medium hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignAndSendSms}
                disabled={!selectedDriver || sendingSms}
                className={`flex-1 px-6 py-3 text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                  isReassignment 
                    ? 'bg-amber-600 hover:bg-amber-700' 
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {sendingSms ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {isReassignment ? 'Reassigning...' : 'Assigning...'}
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    {isReassignment ? 'Reassign & Send SMS' : 'Assign & Send SMS'}
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AssignDriverModal;
