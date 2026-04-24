import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { generateNextInvoiceNumber } from '@/lib/invoiceUtils';

import { useAuth } from '@/contexts/AuthContext';
import { Load, Driver, LoadStop, GeofenceTimestamp } from '@/types/tms';
import {
  Truck, MapPin, Calendar, Package, CheckCircle, Upload,
  FileText, Loader2, Camera, LogOut, RefreshCw, Clock,
  Navigation, Phone, User, ChevronRight, ShieldCheck, AlertCircle, Fuel
} from 'lucide-react';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
];

const DriverDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [driver, setDriver] = useState<Driver | null>(null);
  const [loads, setLoads] = useState<Load[]>([]);
  const [selectedLoad, setSelectedLoad] = useState<Load | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submittingPod, setSubmittingPod] = useState(false);
  const [bolNumber, setBolNumber] = useState('');
  const [extraStopFee, setExtraStopFee] = useState('');
  const [lumperFee, setLumperFee] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<{ [loadId: string]: string[] }>({});
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');
  const [stops, setStops] = useState<LoadStop[]>([]);
  const [timestamps, setTimestamps] = useState<GeofenceTimestamp[]>([]);
  const [recordingEvent, setRecordingEvent] = useState<string | null>(null);
  const [gpsStatus, setGpsStatus] = useState<string>('');
  const watchIdRef = useRef<number | null>(null);
  const autoTriggeredRef = useRef<Set<string>>(new Set());
  const stopsRef = useRef<LoadStop[]>([]);

  // Fuel entry state
  const [fuelState, setFuelState] = useState('');
  const [fuelGallons, setFuelGallons] = useState('');
  const [fuelPPG, setFuelPPG] = useState('');
  const [fuelTotal, setFuelTotal] = useState('');
  const [fuelVendor, setFuelVendor] = useState('');
  const [savingFuel, setSavingFuel] = useState(false);
  const [fuelSaved, setFuelSaved] = useState(false);

  // Historical marker tour state
  const [markerTourEnabled, setMarkerTourEnabled] = useState(() => localStorage.getItem('lt_marker_tour') !== 'false');
  const [voicePreference, setVoicePreference] = useState<'male' | 'female'>(() =>
    (localStorage.getItem('lt_voice_pref') as 'male' | 'female') || 'female'
  );
  const [lastAnnouncedMarker, setLastAnnouncedMarker] = useState<string | null>(null);
  const announcedMarkersRef = useRef<Set<string>>(new Set());
  const markerCacheRef = useRef<Map<string, any[]>>(new Map());
  const lastMarkerFetchCellRef = useRef<string>('');

  useEffect(() => {
    if (user?.driver_id) {
      fetchDriverData();
    } else {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (selectedLoad) {
      fetchStopsAndTimestamps(selectedLoad.id);
    }
  }, [selectedLoad]);

  // Start auto-geofencing when load is IN_TRANSIT and stops are loaded
  useEffect(() => {
    if (selectedLoad?.status === 'IN_TRANSIT' && stops.length > 0) {
      startAutoGeofencing(selectedLoad.id);
    }
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [selectedLoad?.id, selectedLoad?.status, stops.length]);

  const fetchDriverData = async () => {
    if (!user?.driver_id) return;
    
    try {
      const { data: driverData } = await supabase
        .from('drivers')
        .select('*')
        .eq('id', user.driver_id)
        .single();

      if (driverData) setDriver(driverData);

      const { data: loadsData } = await supabase
        .from('loads')
        .select('*')
        .eq('driver_id', user.driver_id)
        .order('pickup_date', { ascending: true });

      if (loadsData) setLoads(loadsData);

      const { data: podData } = await supabase
        .from('pod_documents')
        .select('load_id, file_name')
        .in('load_id', loadsData?.map(l => l.id) || []);

      if (podData) {
        const podsByLoad: { [loadId: string]: string[] } = {};
        podData.forEach(pod => {
          if (!podsByLoad[pod.load_id]) podsByLoad[pod.load_id] = [];
          podsByLoad[pod.load_id].push(pod.file_name);
        });
        setUploadedFiles(podsByLoad);
      }
    } catch (error) {
      console.error('Error fetching driver data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStopsAndTimestamps = async (loadId: string) => {
    const { data: loadStops } = await supabase
      .from('load_stops')
      .select('*, location:locations(latitude, longitude, geofence_radius)')
      .eq('load_id', loadId)
      .order('stop_type')
      .order('stop_sequence');
    if (loadStops) {
      setStops(loadStops as LoadStop[]);
      stopsRef.current = loadStops as LoadStop[];
    }

    // Fetch timestamps
    const { data: geoData } = await supabase
      .from('geofence_timestamps')
      .select('*')
      .eq('load_id', loadId)
      .order('timestamp', { ascending: true });
    if (geoData) setTimestamps(geoData);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDriverData();
    if (selectedLoad) {
      await fetchStopsAndTimestamps(selectedLoad.id);
    }
    setRefreshing(false);
  };

  const getDriverLocation = (): Promise<{ lat: number; lng: number } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        setGpsStatus('GPS not available on this device');
        resolve(null);
        return;
      }

      setGpsStatus('Getting GPS location...');
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGpsStatus('');
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.error('GPS error:', error);
          setGpsStatus(`GPS error: ${error.message}`);
          // Still allow recording without GPS
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  };

  // Haversine distance in meters
  const getDistanceMeters = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const saveGeofenceTimestamp = async (
    loadId: string, stopId: string | null, stopType: string,
    eventType: 'arrived' | 'departed', lat: number | null, lng: number | null,
    method: string
  ) => {
    // Guard: don't double-insert
    const query = supabase.from('geofence_timestamps').select('id')
      .eq('load_id', loadId).eq('event_type', eventType);
    if (stopId) query.eq('stop_id', stopId);
    else query.eq('stop_type', stopType).is('stop_id', null);
    const { data: existing } = await query.maybeSingle();
    if (existing) return false;

    await supabase.from('geofence_timestamps').insert({
      load_id: loadId,
      stop_id: stopId,
      stop_type: stopType,
      event_type: eventType,
      timestamp: new Date().toISOString(),
      latitude: lat,
      longitude: lng,
      verified: lat !== null,
      verification_method: method,
    });
    return true;
  };

  const handleRecordGeofenceEvent = async (
    loadId: string,
    stopId: string | null,
    stopType: string,
    eventType: 'arrived' | 'departed'
  ) => {
    const eventKey = `${stopId || stopType}-${eventType}`;
    setRecordingEvent(eventKey);
    try {
      const location = await getDriverLocation();
      await saveGeofenceTimestamp(loadId, stopId, stopType, eventType,
        location?.lat ?? null, location?.lng ?? null, location ? 'gps_manual' : 'manual');
      await fetchStopsAndTimestamps(loadId);
      setGpsStatus(location ? 'Location recorded' : 'Timestamp recorded');
      setTimeout(() => setGpsStatus(''), 3000);
    } catch (error) {
      console.error('Error recording geofence event:', error);
      alert('Failed to record timestamp.');
    } finally {
      setRecordingEvent(null);
    }
  };

  // ── Historical Marker Tour ────────────────────────────────────────────────

  const getGridCell = (lat: number, lng: number) =>
    `${Math.floor(lat * 10)},${Math.floor(lng * 10)}`; // ~11km cells

  const fetchNearbyMarkers = async (lat: number, lng: number): Promise<any[]> => {
    const cell = getGridCell(lat, lng);
    if (markerCacheRef.current.has(cell)) return markerCacheRef.current.get(cell)!;

    try {
      const query = `
        [out:json][timeout:15];
        (
          node["historic"="wayside"](around:600,${lat},${lng});
          node["historic"="memorial"](around:600,${lat},${lng});
          node["historic"="monument"](around:600,${lat},${lng});
          node["historic"="milestone"](around:600,${lat},${lng});
          node["tourism"="information"]["information"="board"](around:600,${lat},${lng});
          node["information"="guidepost"]["historic"](around:600,${lat},${lng});
        );
        out body;
      `.trim();

      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: query,
        headers: { 'Content-Type': 'text/plain' },
      });

      if (!res.ok) return [];
      const data = await res.json();
      const markers = (data.elements || []).filter((el: any) =>
        el.lat && el.lon && (el.tags?.name || el.tags?.inscription || el.tags?.description)
      );
      markerCacheRef.current.set(cell, markers);
      return markers;
    } catch {
      return [];
    }
  };

  const speakMarker = (marker: any, voice: 'male' | 'female') => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel(); // stop anything already playing

    const name = marker.tags?.name || 'Historical Marker';
    const inscription = marker.tags?.inscription || marker.tags?.description || '';
    const text = inscription
      ? `Historical marker: ${name}. ${inscription}`
      : `Historical marker ahead: ${name}.`;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.92;
    utterance.pitch = voice === 'female' ? 1.1 : 0.85;
    utterance.volume = 1;

    // Pick a matching voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => {
      const n = v.name.toLowerCase();
      return voice === 'female'
        ? (n.includes('samantha') || n.includes('female') || n.includes('zira') || n.includes('victoria') || n.includes('karen'))
        : (n.includes('alex') || n.includes('male') || n.includes('david') || n.includes('daniel') || n.includes('fred'));
    });
    if (preferred) utterance.voice = preferred;

    window.speechSynthesis.speak(utterance);
    setLastAnnouncedMarker(name);
    setTimeout(() => setLastAnnouncedMarker(null), 8000);
  };

  const checkNearbyMarkers = async (lat: number, lng: number) => {
    if (!markerTourEnabled) return;

    const cell = getGridCell(lat, lng);
    if (cell === lastMarkerFetchCellRef.current) {
      // Already fetched for this cell — just check distances against cache
      const cached = markerCacheRef.current.get(cell) || [];
      for (const marker of cached) {
        const dist = getDistanceMeters(lat, lng, marker.lat, marker.lon);
        const key = `marker-${marker.id}`;
        if (dist <= 50 && !announcedMarkersRef.current.has(key)) {
          announcedMarkersRef.current.add(key);
          speakMarker(marker, voicePreference);
          break; // one at a time
        }
      }
      return;
    }

    lastMarkerFetchCellRef.current = cell;
    const markers = await fetchNearbyMarkers(lat, lng);
    for (const marker of markers) {
      const dist = getDistanceMeters(lat, lng, marker.lat, marker.lon);
      const key = `marker-${marker.id}`;
      if (dist <= 50 && !announcedMarkersRef.current.has(key)) {
        announcedMarkersRef.current.add(key);
        speakMarker(marker, voicePreference);
        break;
      }
    }
  };

  // ── End Historical Marker Tour ────────────────────────────────────────────

  // Start GPS watchPosition auto-geofencing for the active load
  const startAutoGeofencing = (loadId: string) => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    autoTriggeredRef.current = new Set();
    if (!navigator.geolocation) return;

    const insideSet = new Set<string>();

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude: dLat, longitude: dLng, speed, heading } = pos.coords;

        // Check for nearby historical markers and announce via TTS
        checkNearbyMarkers(dLat, dLng);

        // Write position to drivers table so live tracking map can see this driver
        if (user?.driver_id) {
          supabase.from('drivers').update({
            last_known_lat: dLat,
            last_known_lng: dLng,
            last_position_update: new Date().toISOString(),
            last_known_speed: speed ? Math.round(speed * 2.237) : null, // m/s → mph
            last_known_heading: heading ?? null,
            status: 'on_route',
          }).eq('id', user.driver_id).then(() => {});
        }

        for (const stop of stopsRef.current) {
          const sLat = stop.location?.latitude;
          const sLng = stop.location?.longitude;
          const radius = stop.location?.geofence_radius || 500;
          if (!sLat || !sLng) continue;

          const dist = getDistanceMeters(dLat, dLng, sLat, sLng);
          const inside = dist <= radius;
          const wasInside = insideSet.has(stop.id);

          if (inside && !wasInside) {
            insideSet.add(stop.id);
            const key = `${stop.id}-arrived`;
            if (!autoTriggeredRef.current.has(key)) {
              autoTriggeredRef.current.add(key);
              const saved = await saveGeofenceTimestamp(loadId, stop.id, stop.stop_type, 'arrived', dLat, dLng, 'gps_geofence');
              if (saved) fetchStopsAndTimestamps(loadId);
            }
          } else if (!inside && wasInside) {
            insideSet.delete(stop.id);
            const key = `${stop.id}-departed`;
            if (!autoTriggeredRef.current.has(key)) {
              autoTriggeredRef.current.add(key);
              const saved = await saveGeofenceTimestamp(loadId, stop.id, stop.stop_type, 'departed', dLat, dLng, 'gps_geofence');
              if (saved) fetchStopsAndTimestamps(loadId);
            }
          }
        }
      },
      (err) => console.warn('Geofence watch error:', err),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 }
    );
  };

  const handleSaveFuel = async () => {
    if (!fuelState || !fuelGallons) {
      alert('Please enter at least the state and gallons.');
      return;
    }
    setSavingFuel(true);
    try {
      const now = new Date();
      const quarter = Math.ceil((now.getMonth() + 1) / 3);
      const year = now.getFullYear();
      const truckNum = driver?.truck_number || 'UNKNOWN';
      const gallons = parseFloat(fuelGallons);
      const ppg = fuelPPG ? parseFloat(fuelPPG) : null;
      const total = fuelTotal ? parseFloat(fuelTotal) : (ppg && gallons ? Math.round(ppg * gallons * 100) / 100 : null);

      const { error } = await supabase.from('ifta_fuel_purchases').insert({
        truck_number: truckNum,
        quarter,
        year,
        purchase_date: now.toISOString().split('T')[0],
        state: fuelState,
        gallons,
        price_per_gallon: ppg,
        total_cost: total,
        vendor: fuelVendor.trim() || null,
      });
      if (error) throw error;

      // Reset form
      setFuelState('');
      setFuelGallons('');
      setFuelPPG('');
      setFuelTotal('');
      setFuelVendor('');
      setFuelSaved(true);
      setTimeout(() => setFuelSaved(false), 3000);
    } catch (err: any) {
      alert('Failed to save fuel entry: ' + (err?.message || 'Unknown error'));
    } finally {
      setSavingFuel(false);
    }
  };

  const getTimestamp = (stopId: string | null, stopType: string, eventType: string): GeofenceTimestamp | undefined => {
    return timestamps.find(t => {
      if (stopId) return t.stop_id === stopId && t.event_type === eventType;
      return t.stop_type === stopType && t.event_type === eventType;
    });
  };

  const formatTimestamp = (ts: GeofenceTimestamp): string => {
    const date = new Date(ts.timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const handleAcceptLoad = async (load: Load) => {
    try {
      const { data, error: updateError } = await supabase
        .from('loads')
        .update({ status: 'IN_TRANSIT', accepted_at: new Date().toISOString() })
        .eq('id', load.id)
        .select()
        .single();

      if (updateError) {
        alert(`Failed to accept load: ${updateError.message}`);
        return;
      }

      await supabase
        .from('drivers')
        .update({ status: 'on_route' })
        .eq('id', user?.driver_id);

      setSelectedLoad({ ...load, status: 'IN_TRANSIT' });
      setLoads(prev => prev.map(l => l.id === load.id ? { ...l, status: 'IN_TRANSIT' } : l));
      fetchDriverData();
    } catch (error) {
      alert('Failed to accept load. Please try again.');
    }
  };

  // Step 1: just upload files to storage — driver can call this multiple times
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, load: Load) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fileName = `${load.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        await supabase.storage.from('pod-documents').upload(fileName, file);
        const { data: urlData } = supabase.storage.from('pod-documents').getPublicUrl(fileName);
        await supabase.from('pod_documents').insert({
          load_id: load.id,
          file_name: file.name,
          file_url: urlData.publicUrl,
          file_type: file.type,
        });
        setUploadedFiles(prev => ({
          ...prev,
          [load.id]: [...(prev[load.id] || []), file.name],
        }));
      }
      // Reset the input so the same file can be re-selected if needed
      e.target.value = '';
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Failed to upload file. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // Step 2: finalize — create invoice, send email, update statuses
  const handleSubmitPod = async (load: Load) => {
    if (!bolNumber.trim()) {
      alert('Please enter the BOL # before submitting.');
      return;
    }
    setSubmittingPod(true);
    try {
      // Save BOL #, fees, and status to load
      const extraStop = parseFloat(extraStopFee) || 0;
      const lumper = parseFloat(lumperFee) || 0;
      await supabase
        .from('loads')
        .update({
          bol_number: bolNumber.trim(),
          extra_stop_fee: extraStop || null,
          lumper_fee: lumper || null,
          status: 'DELIVERED',
          delivered_at: new Date().toISOString(),
        })
        .eq('id', load.id);

      const invoiceAmount = (parseFloat(String(load.rate)) || 0) + extraStop + lumper;
      const invoiceNumber = await generateNextInvoiceNumber();
      await supabase.from('invoices').insert({
        invoice_number: invoiceNumber,
        load_id: load.id,
        amount: invoiceAmount,
        status: 'PENDING',
      });

      await supabase
        .from('loads')
        .update({ status: 'INVOICED' })
        .eq('id', load.id);

      // Auto-send invoice email with POD attachment
      try {
        const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://loadtracker-pro-2026-production.up.railway.app';
        const emailRes = await fetch(`${BACKEND_URL}/api/send-invoice-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ load_id: load.id }),
        });
        if (!emailRes.ok) {
          const errText = await emailRes.text();
          console.error('Auto-email failed:', errText);
        } else {
          console.log('Invoice email auto-sent after POD submit');
        }
      } catch (emailErr) {
        console.error('Auto-email request failed:', emailErr);
      }

      // Record departed timestamp for delivery stops
      for (const stop of stopsRef.current.filter(s => s.stop_type === 'delivery')) {
        await saveGeofenceTimestamp(load.id, stop.id, 'delivery', 'departed', null, null, 'pod_upload');
      }

      // Release driver back to available
      if (user?.driver_id) {
        await supabase.from('drivers').update({ status: 'available' }).eq('id', user.driver_id);
      }

      setSelectedLoad(prev => prev?.id === load.id ? { ...prev, status: 'INVOICED' } : prev);
      setLoads(prev => prev.map(l => l.id === load.id ? { ...l, status: 'INVOICED' } : l));
      fetchDriverData();
    } catch (error) {
      console.error('Error submitting POD:', error);
      alert('Failed to submit POD. Please try again.');
    } finally {
      setSubmittingPod(false);
    }
  };


  const activeLoads = loads.filter(l => ['DISPATCHED', 'IN_TRANSIT'].includes(l.status));
  const completedLoads = loads.filter(l => ['DELIVERED', 'INVOICED', 'PAID'].includes(l.status));

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DISPATCHED': return 'bg-amber-500';
      case 'IN_TRANSIT': return 'bg-blue-500';
      case 'DELIVERED': return 'bg-emerald-500';
      case 'INVOICED': return 'bg-purple-500';
      case 'PAID': return 'bg-green-600';
      default: return 'bg-gray-500';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user?.driver_id) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <User className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-800 mb-2">Account Not Linked</h1>
          <p className="text-slate-600 mb-6">Your account is not linked to a driver profile. Please contact your administrator.</p>
          <button
            onClick={logout}
            className="px-6 py-3 bg-slate-800 text-white rounded-xl font-medium hover:bg-slate-700 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // Load Details View
  if (selectedLoad) {
    const pickupStops = stops.filter(s => s.stop_type === 'pickup');
    const deliveryStops = stops.filter(s => s.stop_type === 'delivery');

    return (
      <div className="min-h-screen bg-slate-100">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <button
              onClick={() => { setSelectedLoad(null); setStops([]); setTimestamps([]); }}
              className="flex items-center gap-2 text-blue-200 hover:text-white transition-colors mb-4"
            >
              <ChevronRight className="w-5 h-5 rotate-180" />
              Back to Dashboard
            </button>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">{selectedLoad.load_number}</h1>
                <p className="text-blue-200">Load Details</p>
              </div>
              <span className={`px-4 py-2 rounded-full text-sm font-semibold ${getStatusColor(selectedLoad.status)}`}>
                {selectedLoad.status.replace('_', ' ')}
              </span>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {/* Route Info */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Route Information</h2>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span>Pickup</span>
                </div>
                <p className="text-lg font-semibold text-slate-800">{selectedLoad.origin_city}, {selectedLoad.origin_state}</p>
                {selectedLoad.origin_address && (
                  <p className="text-sm text-slate-500 mt-1">{selectedLoad.origin_address}</p>
                )}
              </div>
              <Navigation className="w-8 h-8 text-slate-300 flex-shrink-0" />
              <div className="flex-1 text-right">
                <div className="flex items-center justify-end gap-2 text-sm text-slate-500 mb-1">
                  <span>Delivery</span>
                  <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                </div>
                <p className="text-lg font-semibold text-slate-800">{selectedLoad.dest_city}, {selectedLoad.dest_state}</p>
                {selectedLoad.dest_address && (
                  <p className="text-sm text-slate-500 mt-1">{selectedLoad.dest_address}</p>
                )}
              </div>
            </div>
          </div>

          {/* Schedule & Cargo */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl shadow-lg p-4">
              <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
                <Calendar className="w-4 h-4" />
                <span>Pickup Date</span>
              </div>
              <p className="font-semibold text-slate-800">
                {new Date(selectedLoad.pickup_date).toLocaleDateString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric'
                })}
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-lg p-4">
              <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
                <Calendar className="w-4 h-4" />
                <span>Delivery Date</span>
              </div>
              <p className="font-semibold text-slate-800">
                {new Date(selectedLoad.delivery_date).toLocaleDateString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric'
                })}
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-lg p-4 col-span-2">
              <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
                <Package className="w-4 h-4" />
                <span>Cargo</span>
              </div>
              <p className="font-semibold text-slate-800">{selectedLoad.cargo_description || 'General Freight'}</p>
              {selectedLoad.weight && (
                <p className="text-sm text-slate-500 mt-1">{selectedLoad.weight.toLocaleString()} lbs</p>
              )}
            </div>
          </div>

          {/* Actions */}
          {selectedLoad.status === 'DISPATCHED' && (
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h2 className="text-lg font-bold text-slate-800 mb-4">Accept This Load</h2>
              <p className="text-slate-600 mb-6">By accepting, you confirm you will pickup and deliver by the specified dates.</p>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleAcceptLoad(selectedLoad);
                }}
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle className="w-5 h-5" />
                Accept Load
              </button>
            </div>
          )}

          {selectedLoad.status === 'IN_TRANSIT' && (
            <>
              <div className="bg-gradient-to-r from-emerald-500 to-green-600 rounded-2xl shadow-lg p-6 text-white">
                <div className="flex items-center gap-3 mb-2">
                  <CheckCircle className="w-6 h-6" />
                  <h2 className="text-lg font-bold">Load Accepted</h2>
                </div>
                <p className="text-emerald-100">Use the GPS tracking buttons below to record your arrival and departure at each location.</p>
              </div>

              {/* Historical Marker Tour Controls */}
              <div className="bg-white rounded-2xl shadow-lg p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🏛️</span>
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm">Historical Marker Tour</h3>
                      <p className="text-xs text-slate-500">Voice announces markers as you pass</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !markerTourEnabled;
                      setMarkerTourEnabled(next);
                      localStorage.setItem('lt_marker_tour', String(next));
                      if (!next) window.speechSynthesis?.cancel();
                    }}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                      markerTourEnabled ? 'bg-blue-600' : 'bg-slate-300'
                    }`}
                  >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                      markerTourEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>

                {markerTourEnabled && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-slate-500 font-medium">Voice:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setVoicePreference('female');
                        localStorage.setItem('lt_voice_pref', 'female');
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        voicePreference === 'female'
                          ? 'bg-pink-100 text-pink-700 border border-pink-300'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      👩 Female
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setVoicePreference('male');
                        localStorage.setItem('lt_voice_pref', 'male');
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        voicePreference === 'male'
                          ? 'bg-blue-100 text-blue-700 border border-blue-300'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      👨 Male
                    </button>

                    {lastAnnouncedMarker && (
                      <span className="ml-auto text-xs text-emerald-600 font-medium animate-pulse">
                        🔊 {lastAnnouncedMarker}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* GPS Status Message */}
              {gpsStatus && (
                <div className={`rounded-xl p-4 flex items-center gap-3 ${
                  gpsStatus.includes('verified') || gpsStatus.includes('recorded')
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                    : gpsStatus.includes('error') || gpsStatus.includes('not available')
                    ? 'bg-red-50 border border-red-200 text-red-700'
                    : 'bg-blue-50 border border-blue-200 text-blue-700'
                }`}>
                  {gpsStatus.includes('Getting') ? (
                    <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
                  ) : gpsStatus.includes('verified') ? (
                    <ShieldCheck className="w-5 h-5 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  )}
                  <p className="text-sm font-medium">{gpsStatus}</p>
                </div>
              )}

              {/* GPS Geofence Tracking */}
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <MapPin className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">GPS Location Tracking</h2>
                    <p className="text-xs text-slate-500">Tap buttons when you arrive/depart each location</p>
                  </div>
                </div>

                {/* Pickup Stops */}
                {pickupStops.length > 0 ? (
                  pickupStops.map((stop, idx) => {
                    const arrivedTs = getTimestamp(stop.id, 'pickup', 'arrived');
                    const departedTs = getTimestamp(stop.id, 'pickup', 'departed');
                    return (
                      <div key={stop.id} className="border-2 border-blue-200 rounded-xl p-4 mb-4">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-bold flex items-center justify-center">
                            P{idx + 1}
                          </div>
                          <div className="flex-1">
                            <p className="font-semibold text-slate-800 text-sm">
                              {stop.company_name || 'Pickup Location'}
                            </p>
                            <p className="text-xs text-slate-500">{stop.city}, {stop.state}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {/* Arrived Button */}
                          {arrivedTs ? (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                              <div className="flex items-center gap-1 mb-1">
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="text-xs font-semibold text-emerald-700">ARRIVED</span>
                                {arrivedTs.verified && <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 ml-auto" />}
                              </div>
                              <p className="text-xs text-emerald-600 font-medium">{formatTimestamp(arrivedTs)}</p>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleRecordGeofenceEvent(selectedLoad.id, stop.id, 'pickup', 'arrived')}
                              disabled={recordingEvent === `${stop.id}-arrived`}
                              className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg p-3 text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                              {recordingEvent === `${stop.id}-arrived` ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <MapPin className="w-4 h-4" />
                              )}
                              Arrived
                            </button>
                          )}
                          {/* Departed Button */}
                          {departedTs ? (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                              <div className="flex items-center gap-1 mb-1">
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="text-xs font-semibold text-emerald-700">DEPARTED</span>
                                {departedTs.verified && <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 ml-auto" />}
                              </div>
                              <p className="text-xs text-emerald-600 font-medium">{formatTimestamp(departedTs)}</p>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleRecordGeofenceEvent(selectedLoad.id, stop.id, 'pickup', 'departed')}
                              disabled={recordingEvent === `${stop.id}-departed` || !arrivedTs}
                              className="bg-slate-600 hover:bg-slate-700 text-white rounded-lg p-3 text-sm font-semibold transition-colors disabled:opacity-30 flex items-center justify-center gap-2"
                            >
                              {recordingEvent === `${stop.id}-departed` ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Navigation className="w-4 h-4" />
                              )}
                              Departed
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  /* Legacy fallback - no stops */
                  <div className="border-2 border-blue-200 rounded-xl p-4 mb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-bold flex items-center justify-center">P</div>
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">Pickup</p>
                        <p className="text-xs text-slate-500">{selectedLoad.origin_city}, {selectedLoad.origin_state}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {(() => {
                        const arrivedTs = getTimestamp(null, 'pickup', 'arrived');
                        const departedTs = getTimestamp(null, 'pickup', 'departed');
                        return (
                          <>
                            {arrivedTs ? (
                              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                                <div className="flex items-center gap-1 mb-1">
                                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                  <span className="text-xs font-semibold text-emerald-700">ARRIVED</span>
                                </div>
                                <p className="text-xs text-emerald-600 font-medium">{formatTimestamp(arrivedTs)}</p>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleRecordGeofenceEvent(selectedLoad.id, null, 'pickup', 'arrived')}
                                disabled={recordingEvent === `pickup-arrived`}
                                className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg p-3 text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                              >
                                {recordingEvent === `pickup-arrived` ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                                Arrived
                              </button>
                            )}
                            {departedTs ? (
                              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                                <div className="flex items-center gap-1 mb-1">
                                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                  <span className="text-xs font-semibold text-emerald-700">DEPARTED</span>
                                </div>
                                <p className="text-xs text-emerald-600 font-medium">{formatTimestamp(departedTs)}</p>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleRecordGeofenceEvent(selectedLoad.id, null, 'pickup', 'departed')}
                                disabled={recordingEvent === `pickup-departed` || !arrivedTs}
                                className="bg-slate-600 hover:bg-slate-700 text-white rounded-lg p-3 text-sm font-semibold transition-colors disabled:opacity-30 flex items-center justify-center gap-2"
                              >
                                {recordingEvent === `pickup-departed` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
                                Departed
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* Delivery Stops */}
                {deliveryStops.length > 0 ? (
                  deliveryStops.map((stop, idx) => {
                    const arrivedTs = getTimestamp(stop.id, 'delivery', 'arrived');
                    const departedTs = getTimestamp(stop.id, 'delivery', 'departed');
                    return (
                      <div key={stop.id} className="border-2 border-emerald-200 rounded-xl p-4 mb-4">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center">
                            D{idx + 1}
                          </div>
                          <div className="flex-1">
                            <p className="font-semibold text-slate-800 text-sm">
                              {stop.company_name || 'Delivery Location'}
                            </p>
                            <p className="text-xs text-slate-500">{stop.city}, {stop.state}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {arrivedTs ? (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                              <div className="flex items-center gap-1 mb-1">
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="text-xs font-semibold text-emerald-700">ARRIVED</span>
                                {arrivedTs.verified && <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 ml-auto" />}
                              </div>
                              <p className="text-xs text-emerald-600 font-medium">{formatTimestamp(arrivedTs)}</p>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleRecordGeofenceEvent(selectedLoad.id, stop.id, 'delivery', 'arrived')}
                              disabled={recordingEvent === `${stop.id}-arrived`}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg p-3 text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                              {recordingEvent === `${stop.id}-arrived` ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <MapPin className="w-4 h-4" />
                              )}
                              Arrived
                            </button>
                          )}
                          {departedTs ? (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                              <div className="flex items-center gap-1 mb-1">
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="text-xs font-semibold text-emerald-700">DEPARTED</span>
                                {departedTs.verified && <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 ml-auto" />}
                              </div>
                              <p className="text-xs text-emerald-600 font-medium">{formatTimestamp(departedTs)}</p>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleRecordGeofenceEvent(selectedLoad.id, stop.id, 'delivery', 'departed')}
                              disabled={recordingEvent === `${stop.id}-departed` || !arrivedTs}
                              className="bg-slate-600 hover:bg-slate-700 text-white rounded-lg p-3 text-sm font-semibold transition-colors disabled:opacity-30 flex items-center justify-center gap-2"
                            >
                              {recordingEvent === `${stop.id}-departed` ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Navigation className="w-4 h-4" />
                              )}
                              Departed
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  /* Legacy fallback */
                  <div className="border-2 border-emerald-200 rounded-xl p-4 mb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center">D</div>
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">Delivery</p>
                        <p className="text-xs text-slate-500">{selectedLoad.dest_city}, {selectedLoad.dest_state}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {(() => {
                        const arrivedTs = getTimestamp(null, 'delivery', 'arrived');
                        const departedTs = getTimestamp(null, 'delivery', 'departed');
                        return (
                          <>
                            {arrivedTs ? (
                              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                                <div className="flex items-center gap-1 mb-1">
                                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                  <span className="text-xs font-semibold text-emerald-700">ARRIVED</span>
                                </div>
                                <p className="text-xs text-emerald-600 font-medium">{formatTimestamp(arrivedTs)}</p>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleRecordGeofenceEvent(selectedLoad.id, null, 'delivery', 'arrived')}
                                disabled={recordingEvent === `delivery-arrived`}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg p-3 text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                              >
                                {recordingEvent === `delivery-arrived` ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                                Arrived
                              </button>
                            )}
                            {departedTs ? (
                              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                                <div className="flex items-center gap-1 mb-1">
                                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                  <span className="text-xs font-semibold text-emerald-700">DEPARTED</span>
                                </div>
                                <p className="text-xs text-emerald-600 font-medium">{formatTimestamp(departedTs)}</p>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleRecordGeofenceEvent(selectedLoad.id, null, 'delivery', 'departed')}
                                disabled={recordingEvent === `delivery-departed` || !arrivedTs}
                                className="bg-slate-600 hover:bg-slate-700 text-white rounded-lg p-3 text-sm font-semibold transition-colors disabled:opacity-30 flex items-center justify-center gap-2"
                              >
                                {recordingEvent === `delivery-departed` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
                                Departed
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    GPS coordinates are recorded automatically and verified against location geofences for legally verifiable timestamps.
                  </p>
                </div>
              </div>

              {/* Fuel Entry — feeds IFTA reporting */}
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-amber-100 rounded-xl">
                    <Fuel className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">Log Fuel Stop</h2>
                    <p className="text-xs text-slate-500">Auto-saved to IFTA quarterly report</p>
                  </div>
                </div>

                {fuelSaved && (
                  <div className="mb-4 flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span className="text-sm font-medium text-emerald-700">Fuel entry saved to IFTA!</span>
                  </div>
                )}

                <div className="space-y-3">
                  {/* State + Gallons */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">State *</label>
                      <select
                        value={fuelState}
                        onChange={e => setFuelState(e.target.value)}
                        className="w-full border border-slate-300 rounded-xl px-3 py-3 text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 bg-white"
                      >
                        <option value="">State...</option>
                        {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Gallons *</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={fuelGallons}
                        onChange={e => setFuelGallons(e.target.value)}
                        placeholder="0.000"
                        step="0.001"
                        min="0"
                        className="w-full border border-slate-300 rounded-xl px-3 py-3 text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                      />
                    </div>
                  </div>

                  {/* Price per gallon + Total */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Price / Gal</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={fuelPPG}
                        onChange={e => setFuelPPG(e.target.value)}
                        placeholder="$0.000"
                        step="0.001"
                        min="0"
                        className="w-full border border-slate-300 rounded-xl px-3 py-3 text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Total Cost</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={fuelTotal}
                        onChange={e => setFuelTotal(e.target.value)}
                        placeholder="$0.00"
                        step="0.01"
                        min="0"
                        className="w-full border border-slate-300 rounded-xl px-3 py-3 text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                      />
                    </div>
                  </div>

                  {/* Vendor */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Station / Vendor</label>
                    <input
                      type="text"
                      value={fuelVendor}
                      onChange={e => setFuelVendor(e.target.value)}
                      placeholder="e.g. Pilot, Love's, Flying J"
                      className="w-full border border-slate-300 rounded-xl px-3 py-3 text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                    />
                  </div>

                  <button
                    onClick={handleSaveFuel}
                    disabled={savingFuel || !fuelState || !fuelGallons}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-white rounded-xl py-3.5 text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {savingFuel ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fuel className="w-4 h-4" />}
                    {savingFuel ? 'Saving...' : 'Save Fuel Entry'}
                  </button>
                </div>
              </div>

              {/* BOL # + Fees — required before upload */}
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <h2 className="text-lg font-bold text-slate-800">BOL Number</h2>
                  <span className="text-xs bg-red-100 text-red-600 font-semibold px-2 py-0.5 rounded-full">Required</span>
                </div>
                <p className="text-sm text-slate-500 mb-3">Enter the Bill of Lading number from your paperwork. Required before uploading documents.</p>
                <input
                  type="text"
                  value={bolNumber}
                  onChange={(e) => setBolNumber(e.target.value)}
                  placeholder="e.g. BOL-2024-001234"
                  disabled={submittingPod}
                  className={`w-full px-4 py-3 rounded-xl border-2 text-slate-800 font-medium text-base focus:outline-none transition-colors ${
                    bolNumber.trim()
                      ? 'border-emerald-400 bg-emerald-50 focus:border-emerald-500'
                      : 'border-slate-300 bg-white focus:border-blue-400'
                  }`}
                />

                {/* Optional fee fields */}
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Extra Stop Fee <span className="font-normal text-slate-400">(optional)</span></label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={extraStopFee}
                        onChange={(e) => setExtraStopFee(e.target.value)}
                        placeholder="0.00"
                        disabled={submittingPod}
                        className="w-full pl-7 pr-3 py-3 rounded-xl border-2 border-slate-300 text-slate-800 font-medium text-base focus:outline-none focus:border-blue-400 transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Lumper Fee <span className="font-normal text-slate-400">(optional)</span></label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={lumperFee}
                        onChange={(e) => setLumperFee(e.target.value)}
                        placeholder="0.00"
                        disabled={submittingPod}
                        className="w-full pl-7 pr-3 py-3 rounded-xl border-2 border-slate-300 text-slate-800 font-medium text-base focus:outline-none focus:border-blue-400 transition-colors"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Upload POD Documents */}
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h2 className="text-lg font-bold text-slate-800 mb-1">Upload POD Documents</h2>
                <p className="text-sm text-slate-500 mb-4">Upload all photos first, then tap <strong>Submit POD &amp; Send Invoice</strong> when done.</p>

                {uploadedFiles[selectedLoad.id]?.length > 0 && (
                  <div className="mb-4 space-y-2">
                    {uploadedFiles[selectedLoad.id].map((file, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                        <FileText className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                        <span className="text-sm font-medium text-emerald-700 truncate">{file}</span>
                        <CheckCircle className="w-4 h-4 text-emerald-600 ml-auto flex-shrink-0" />
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload button — can tap multiple times */}
                <label className="block mb-4">
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    onChange={(e) => handleFileUpload(e, selectedLoad)}
                    disabled={uploading || submittingPod || !bolNumber.trim()}
                    className="hidden"
                  />
                  <div className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                    uploading ? 'border-slate-200 bg-slate-50' : !bolNumber.trim() ? 'border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed' : 'border-blue-300 hover:border-blue-400 hover:bg-blue-50'
                  }`}>
                    {uploading ? (
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                        <span className="text-slate-600 font-medium">Uploading...</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <div className="flex gap-2">
                          <Camera className="w-7 h-7 text-blue-500" />
                          <Upload className="w-7 h-7 text-blue-500" />
                        </div>
                        <p className="font-semibold text-slate-700">
                          {uploadedFiles[selectedLoad.id]?.length > 0 ? 'Tap to add more photos' : 'Tap to upload documents'}
                        </p>
                        <p className="text-xs text-slate-500">Photos, PDFs, or scanned documents</p>
                      </div>
                    )}
                  </div>
                </label>

                {/* Submit button — shown once at least one file is uploaded */}
                {(uploadedFiles[selectedLoad.id]?.length ?? 0) > 0 && (
                  <>
                    {!bolNumber.trim() && (
                      <p className="text-center text-sm text-amber-600 font-medium mb-2">
                        ⚠️ Enter the BOL # above before uploading
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => handleSubmitPod(selectedLoad)}
                      disabled={uploading || submittingPod || !bolNumber.trim()}
                      className="w-full py-4 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-xl font-bold text-base hover:from-emerald-600 hover:to-green-700 flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md"
                    >
                      {submittingPod ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Submitting &amp; Sending Invoice...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-5 h-5" />
                          Submit POD &amp; Send Invoice
                          <span className="text-emerald-200 text-sm font-normal">
                            ({uploadedFiles[selectedLoad.id]?.length} file{uploadedFiles[selectedLoad.id]?.length !== 1 ? 's' : ''})
                          </span>
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </>
          )}

          {['DELIVERED', 'INVOICED', 'PAID'].includes(selectedLoad.status) && (
            <div className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-2xl shadow-lg p-6 text-white">
              <div className="flex items-center gap-3 mb-2">
                <FileText className="w-6 h-6" />
                <h2 className="text-lg font-bold">
                  {selectedLoad.status === 'PAID' ? 'Load Complete!' : 'POD Submitted'}
                </h2>
              </div>
              <p className="text-purple-100">
                {selectedLoad.status === 'PAID' 
                  ? 'This load has been completed and paid.'
                  : 'POD documents uploaded. Invoice has been generated and sent to customer.'}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Main Dashboard View
  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Truck className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Driver Portal</h1>
                <p className="text-blue-200 text-sm">LoadTracker Pro</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
              >
                <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={logout}
                className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>

          {driver && (
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
                  <User className="w-7 h-7" />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold">{driver.name}</h2>
                  <p className="text-blue-200 text-sm">Truck #{driver.truck_number}</p>
                </div>
                <div className="text-right">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    driver.status === 'available' ? 'bg-emerald-500' :
                    driver.status === 'on_route' ? 'bg-blue-500' : 'bg-slate-500'
                  }`}>
                    {driver.status === 'on_route' ? 'On Route' : driver.status.charAt(0).toUpperCase() + driver.status.slice(1)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-4xl mx-auto px-4 -mt-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl shadow-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Truck className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{activeLoads.length}</p>
                <p className="text-sm text-slate-500">Active Loads</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{completedLoads.length}</p>
                <p className="text-sm text-slate-500">Completed</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-4xl mx-auto px-4 mt-6">
        <div className="bg-white rounded-xl shadow-sm p-1 flex">
          <button
            onClick={() => setActiveTab('active')}
            className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
              activeTab === 'active'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Active ({activeLoads.length})
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
              activeTab === 'completed'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Completed ({completedLoads.length})
          </button>
        </div>
      </div>

      {/* Loads List */}
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {(activeTab === 'active' ? activeLoads : completedLoads).length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-800 mb-2">
              No {activeTab === 'active' ? 'Active' : 'Completed'} Loads
            </h3>
            <p className="text-slate-500">
              {activeTab === 'active' 
                ? 'You have no loads currently assigned to you.'
                : 'You have not completed any loads yet.'}
            </p>
          </div>
        ) : (
          (activeTab === 'active' ? activeLoads : completedLoads).map((load) => (
            <div
              key={load.id}
              onClick={() => setSelectedLoad(load)}
              className="bg-white rounded-xl shadow-lg p-4 cursor-pointer hover:shadow-xl transition-shadow"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-slate-800">{load.load_number}</span>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold text-white ${getStatusColor(load.status)}`}>
                  {load.status.replace('_', ' ')}
                </span>
              </div>
              
              <div className="flex items-center gap-3 text-sm">
                <div className="flex-1">
                  <div className="flex items-center gap-1 text-slate-500 mb-1">
                    <MapPin className="w-3 h-3" />
                    <span>From</span>
                  </div>
                  <p className="font-medium text-slate-700">{load.origin_city}, {load.origin_state}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-300" />
                <div className="flex-1 text-right">
                  <div className="flex items-center justify-end gap-1 text-slate-500 mb-1">
                    <span>To</span>
                    <MapPin className="w-3 h-3" />
                  </div>
                  <p className="font-medium text-slate-700">{load.dest_city}, {load.dest_state}</p>
                </div>
              </div>

              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100 text-sm text-slate-500">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <span>Pickup: {new Date(load.pickup_date).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>Delivery: {new Date(load.delivery_date).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default DriverDashboard;
