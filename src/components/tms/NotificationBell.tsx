import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '@/lib/supabaseCompat';
import { toast } from 'sonner';
import { Bell, MapPin, Truck, ArrowDownToLine, ArrowUpFromLine, X, Check, CheckCheck, Volume2, VolumeX, Trash2 } from 'lucide-react';

interface GeofenceEvent {
  id: string;
  load_id: string;
  stop_id: string | null;
  stop_type: 'pickup' | 'delivery';
  event_type: 'arrived' | 'departed';
  timestamp: string;
  latitude: number | null;
  longitude: number | null;
  verified: boolean;
  verification_method: string | null;
  created_at: string;
  // Resolved fields
  load_number?: string;
  driver_name?: string;
  location_name?: string;
}

interface NotificationItem extends GeofenceEvent {
  read: boolean;
}

const EVENT_DESCRIPTIONS: Record<string, Record<string, { label: string; color: string; bgColor: string; borderColor: string }>> = {
  pickup: {
    arrived: { label: 'Arrived at Pickup', color: 'text-blue-700', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' },
    departed: { label: 'Departed Pickup', color: 'text-cyan-700', bgColor: 'bg-cyan-50', borderColor: 'border-cyan-200' },
  },
  delivery: {
    arrived: { label: 'Arrived at Delivery', color: 'text-amber-700', bgColor: 'bg-amber-50', borderColor: 'border-amber-200' },
    departed: { label: 'Delivery Complete', color: 'text-emerald-700', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200' },
  },
};

const getEventIcon = (stopType: string, eventType: string) => {
  if (eventType === 'arrived') {
    return <ArrowDownToLine className="w-4 h-4" />;
  }
  return <ArrowUpFromLine className="w-4 h-4" />;
};

const getEventConfig = (stopType: string, eventType: string) => {
  return EVENT_DESCRIPTIONS[stopType]?.[eventType] || {
    label: `${eventType} at ${stopType}`,
    color: 'text-slate-700',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-200',
  };
};

const formatTimeAgo = (dateStr: string): string => {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 30) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
};

interface NotificationBellProps {
  loads?: Array<{ id: string; load_number: string; driver_id: string | null; driver?: { name: string } | null }>;
}

const STORAGE_KEY = 'geofence_notifications_read';
const SOUND_PREF_KEY = 'geofence_notifications_sound';

const NotificationBell: React.FC<NotificationBellProps> = ({ loads = [] }) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem(SOUND_PREF_KEY);
    return saved !== 'false';
  });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const lastFetchedIdRef = useRef<string | null>(null);
  const loadsRef = useRef(loads);
  const notificationsRef = useRef(notifications);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Keep refs in sync
  useEffect(() => { loadsRef.current = loads; }, [loads]);
  useEffect(() => { notificationsRef.current = notifications; }, [notifications]);

  // Load read state from localStorage
  const getReadIds = (): Set<string> => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  };

  const saveReadIds = (ids: Set<string>) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  };

  // Resolve load details from the loads prop
  const resolveEventDetails = useCallback((event: GeofenceEvent): NotificationItem => {
    const currentLoads = loadsRef.current;
    const load = currentLoads.find(l => l.id === event.load_id);
    const readIds = getReadIds();
    return {
      ...event,
      load_number: load?.load_number || event.load_id.substring(0, 8),
      driver_name: load?.driver?.name || 'Unknown Driver',
      read: readIds.has(event.id),
    };
  }, []);

  // Play notification sound
  const playNotificationSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      // Use Web Audio API for a clean notification chime
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } catch (e) {
      // Audio not available
    }
  }, [soundEnabled]);

  // Show toast for a new event
  const showEventToast = useCallback((event: NotificationItem) => {
    const config = getEventConfig(event.stop_type, event.event_type);
    
    toast(
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${config.bgColor} ${config.color} flex-shrink-0 mt-0.5`}>
          {getEventIcon(event.stop_type, event.event_type)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-sm font-bold ${config.color}`}>{config.label}</span>
          </div>
          <p className="text-sm text-slate-700 font-medium">
            {event.driver_name}
          </p>
          <p className="text-xs text-slate-500">
            Load {event.load_number} — {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>,
      {
        duration: 8000,
        position: 'top-right',
        className: `!border-l-4 !${config.borderColor}`,
      }
    );

    playNotificationSound();
  }, [playNotificationSound]);

  // Fetch recent geofence events
  const fetchRecentEvents = useCallback(async (showToastsForNew = false) => {
    try {
      const { data, error } = await db
        .from('geofence_timestamps')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching geofence events:', error);
        return;
      }

      if (!data || data.length === 0) return;

      const resolved = data.map(resolveEventDetails);

      // Check for new events to toast
      if (showToastsForNew && lastFetchedIdRef.current) {
        const existingIds = new Set(notificationsRef.current.map(n => n.id));
        const newEvents = resolved.filter(e => !existingIds.has(e.id));
        newEvents.forEach(showEventToast);
      }

      lastFetchedIdRef.current = data[0]?.id || null;
      setNotifications(resolved);
    } catch (err) {
      console.error('Failed to fetch geofence events:', err);
    }
  }, [resolveEventDetails, showEventToast]);

  // Initial fetch
  useEffect(() => {
    fetchRecentEvents(false);
  }, []);

  // Re-resolve when loads change (so driver names update)
  useEffect(() => {
    if (notifications.length > 0) {
      setNotifications(prev => prev.map(n => ({
        ...resolveEventDetails(n),
        read: n.read, // preserve read state
      })));
    }
  }, [loads]);

  // Set up realtime subscription
  useEffect(() => {
    const channel = db
      .channel('geofence-events-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'geofence_timestamps',
        },
        (payload) => {
          console.log('Realtime geofence event:', payload);
          const newEvent = payload.new as GeofenceEvent;
          const resolved = resolveEventDetails(newEvent);
          resolved.read = false;

          setNotifications(prev => [resolved, ...prev].slice(0, 50));
          showEventToast(resolved);
        }
      )
      .subscribe((status) => {
        console.log('Realtime subscription status:', status);
      });

    return () => {
      db.removeChannel(channel);
    };
  }, [resolveEventDetails, showEventToast]);

  // Polling fallback every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchRecentEvents(true);
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchRecentEvents]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        bellRef.current && !bellRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = () => {
    const readIds = getReadIds();
    notifications.forEach(n => readIds.add(n.id));
    saveReadIds(readIds);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const markOneRead = (id: string) => {
    const readIds = getReadIds();
    readIds.add(id);
    saveReadIds(readIds);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const clearAll = () => {
    const readIds = getReadIds();
    notifications.forEach(n => readIds.add(n.id));
    saveReadIds(readIds);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const toggleSound = () => {
    const newVal = !soundEnabled;
    setSoundEnabled(newVal);
    localStorage.setItem(SOUND_PREF_KEY, String(newVal));
  };

  return (
    <div className="relative">
      {/* Bell Button */}
      <button
        ref={bellRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2 rounded-lg transition-all duration-200 ${
          isOpen 
            ? 'bg-blue-100 text-blue-600' 
            : unreadCount > 0 
              ? 'hover:bg-blue-50 text-slate-600' 
              : 'hover:bg-slate-100 text-slate-600'
        }`}
        title={`${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`}
      >
        <Bell className={`w-5 h-5 ${unreadCount > 0 ? 'animate-[wiggle_0.5s_ease-in-out]' : ''}`} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full ring-2 ring-white animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute right-0 top-full mt-2 w-[420px] max-h-[520px] bg-white rounded-xl shadow-2xl border border-slate-200 z-[100] overflow-hidden"
          style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 4px 20px rgba(0,0,0,0.08)' }}
        >
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-800">Geofence Events</h3>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 text-xs font-bold bg-red-100 text-red-600 rounded-full">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={toggleSound}
                  className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                  title={soundEnabled ? 'Mute notifications' : 'Unmute notifications'}
                >
                  {soundEnabled ? (
                    <Volume2 className="w-4 h-4 text-slate-500" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-slate-400" />
                  )}
                </button>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Mark all as read"
                  >
                    <CheckCheck className="w-4 h-4 text-slate-500" />
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>
            </div>
          </div>

          {/* Event List */}
          <div className="overflow-y-auto max-h-[420px]">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4">
                <div className="p-4 bg-slate-100 rounded-full mb-4">
                  <MapPin className="w-8 h-8 text-slate-400" />
                </div>
                <h4 className="text-sm font-semibold text-slate-700 mb-1">No Geofence Events Yet</h4>
                <p className="text-xs text-slate-500 text-center max-w-[260px]">
                  When drivers enter or exit geofenced locations, events will appear here in real-time.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {notifications.map((notif) => {
                  const config = getEventConfig(notif.stop_type, notif.event_type);
                  return (
                    <button
                      key={notif.id}
                      onClick={() => markOneRead(notif.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-start gap-3 ${
                        !notif.read ? 'bg-blue-50/50' : ''
                      }`}
                    >
                      {/* Unread indicator */}
                      <div className="flex-shrink-0 mt-2">
                        {!notif.read ? (
                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        ) : (
                          <div className="w-2 h-2 bg-transparent rounded-full"></div>
                        )}
                      </div>

                      {/* Event icon */}
                      <div className={`flex-shrink-0 p-2 rounded-lg ${config.bgColor} ${config.color}`}>
                        {getEventIcon(notif.stop_type, notif.event_type)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-sm font-semibold ${config.color}`}>
                            {config.label}
                          </span>
                          {notif.verified && (
                            <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-100 text-emerald-600 rounded text-[10px] font-bold">
                              <Check className="w-3 h-3" />
                              GPS
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-700 font-medium flex items-center gap-1.5">
                          <Truck className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          <span className="truncate">{notif.driver_name}</span>
                        </p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-slate-500 font-medium">
                            Load {notif.load_number}
                          </span>
                          <span className="text-xs text-slate-400">
                            {formatTimeAgo(notif.timestamp)}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="sticky bottom-0 bg-white border-t border-slate-200 px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                {notifications.length} event{notifications.length !== 1 ? 's' : ''} — auto-refreshes every 30s
              </span>
              <button
                onClick={clearAll}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium hover:underline"
              >
                Mark all read
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
