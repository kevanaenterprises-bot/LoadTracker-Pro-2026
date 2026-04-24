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

  // Start GPS watchPosition auto-geofencing for the active load
  const startAutoGeofencing = (loadId: string) => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    autoTriggeredRef.current = new Set();
    if (!navigator.geolocation) return;

    const insideSet = new Set<string>();

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude: dLat, longitude: dLng } = pos.coords;
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
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 30000 }
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, load: Load) => {
    const files = e.target.files;
    if (!files) return;
    
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fileName = `${load.id}/${Date.now()}.${file.name.split('.').pop()}`;
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
          [load.id]: [...(prev[load.id] || []), file.name]
        }));
      }

      await supabase
        .from('loads')
        .update({ status: 'DELIVERED', delivered_at: new Date().toISOString() })
        .eq('id', load.id);

      const invoiceNumber = await generateNextInvoiceNumber();

      await supabase.from('invoices').insert({
        invoice_number: invoiceNumber,
        load_id: load.id,
        amount: load.rate,
        status: 'PENDING',
      });

      await supabase
        .from('loads')
        .update({ status: 'INVOICED' })
        .eq('id', load.id);

      // Record departed timestamp for delivery stops that don't have one yet (POD = proof of departure)
      for (const stop of stopsRef.current.filter(s => s.stop_type === 'delivery')) {
        await saveGeofenceTimestamp(load.id, stop.id, 'delivery', 'departed', null, null, 'pod_upload');
      }

      // Release the driver back to available after POD upload
      // Driver should be freed up once delivery is confirmed, not waiting for payment
      if (user?.driver_id) {
        await supabase
          .from('drivers')
          .update({ status: 'available' })
          .eq('id', user.driver_id);
        console.log('Driver released to available after POD upload (DriverDashboard)');
      }

      fetchDriverData();
    } catch (error) {
      console.error('Error uploading POD:', error);
      alert('Failed to upload document');
    } finally {
      setUploading(false);
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

              {/* Upload POD Documents */}
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h2 className="text-lg font-bold text-slate-800 mb-4">Upload POD Documents</h2>
                
                {uploadedFiles[selectedLoad.id]?.length > 0 && (
                  <div className="mb-6 space-y-2">
                    {uploadedFiles[selectedLoad.id].map((file, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                        <FileText className="w-5 h-5 text-emerald-600" />
                        <span className="text-sm font-medium text-emerald-700">{file}</span>
                        <CheckCircle className="w-4 h-4 text-emerald-600 ml-auto" />
                      </div>
                    ))}
                  </div>
                )}

                <label className="block">
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    onChange={(e) => handleFileUpload(e, selectedLoad)}
                    disabled={uploading}
                    className="hidden"
                  />
                  <div className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                    uploading ? 'border-slate-200 bg-slate-50' : 'border-blue-300 hover:border-blue-400 hover:bg-blue-50'
                  }`}>
                    {uploading ? (
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
                        <span className="text-slate-600">Uploading...</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <div className="flex gap-2">
                          <Camera className="w-8 h-8 text-blue-500" />
                          <Upload className="w-8 h-8 text-blue-500" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-700">Tap to upload documents</p>
                          <p className="text-sm text-slate-500 mt-1">Photos, PDFs, or scanned documents</p>
                        </div>
                      </div>
                    )}
                  </div>
                </label>
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
