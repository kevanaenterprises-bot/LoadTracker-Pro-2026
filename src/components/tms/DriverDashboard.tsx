import React, { useState, useEffect } from 'react';
import { db } from '@/lib/supabaseCompat';
import { generateNextInvoiceNumber } from '@/lib/invoiceUtils';

import { useAuth } from '@/contexts/AuthContext';
import { Load, Driver, LoadStop, GeofenceTimestamp } from '@/types/tms';
import { 
  Truck, MapPin, Calendar, Package, CheckCircle, Upload, 
  FileText, Loader2, Camera, LogOut, RefreshCw, Clock,
  Navigation, Phone, User, ChevronRight, ShieldCheck, AlertCircle
} from 'lucide-react';

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

  const fetchDriverData = async () => {
    if (!user?.driver_id) return;
    
    try {
      const { data: driverData } = await db
        .from('drivers')
        .select('*')
        .eq('id', user.driver_id)
        .single();

      if (driverData) setDriver(driverData);

      const { data: loadsData } = await db
        .from('loads')
        .select('*')
        .eq('driver_id', user.driver_id)
        .order('pickup_date', { ascending: true });

      if (loadsData) setLoads(loadsData);

      const { data: podData } = await db
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
    // Fetch stops
    const { data: loadStops } = await db
      .from('load_stops')
      .select('*')
      .eq('load_id', loadId)
      .order('stop_type')
      .order('stop_sequence');
    if (loadStops) setStops(loadStops);

    // Fetch timestamps
    const { data: geoData } = await db
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

      const { data, error } = await db.functions.invoke('here-webhook', {

        body: {
          action: 'record',
          load_id: loadId,
          stop_id: stopId,
          driver_lat: location?.lat || null,
          driver_lng: location?.lng || null,
          event_type: eventType,
        },
      });

      if (error) {
        console.error('Geofence record error:', error);
        alert('Failed to record timestamp. Please try again.');
      } else {
        // Refresh timestamps
        await fetchStopsAndTimestamps(loadId);
        
        if (data?.verified) {
          setGpsStatus('Location verified within geofence!');
        } else if (location) {
          setGpsStatus('Timestamp recorded (outside geofence radius)');
        } else {
          setGpsStatus('Timestamp recorded (no GPS available)');
        }
        
        setTimeout(() => setGpsStatus(''), 3000);
      }
    } catch (error) {
      console.error('Error recording geofence event:', error);
      alert('Failed to record timestamp.');
    } finally {
      setRecordingEvent(null);
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
      const { data, error: updateError } = await db
        .from('loads')
        .update({ status: 'IN_TRANSIT', accepted_at: new Date().toISOString() })
        .eq('id', load.id)
        .select()
        .single();

      if (updateError) {
        alert(`Failed to accept load: ${updateError.message}`);
        return;
      }

      await db
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
        await db.storage.from('pod-documents').upload(fileName, file);
        const { data: urlData } = db.storage.from('pod-documents').getPublicUrl(fileName);
        await db.from('pod_documents').insert({
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

      await db
        .from('loads')
        .update({ status: 'DELIVERED', delivered_at: new Date().toISOString() })
        .eq('id', load.id);

      const invoiceNumber = await generateNextInvoiceNumber();

      await db.from('invoices').insert({
        invoice_number: invoiceNumber,
        load_id: load.id,
        amount: load.rate,
        status: 'PENDING',
      });

      await db
        .from('loads')
        .update({ status: 'INVOICED' })
        .eq('id', load.id);

      // Release the driver back to available after POD upload
      // Driver should be freed up once delivery is confirmed, not waiting for payment
      if (user?.driver_id) {
        await db
          .from('drivers')
          .update({ status: 'available' })
          .eq('id', user.driver_id);
        console.log('Driver released to available after POD upload (DriverDashboard)');
      }

      // Deactivate geofences since load is delivered
      try {
        await db.functions.invoke('here-webhook', {
          body: {
            action: 'deactivate-load-geofences',
            load_id: load.id,
          },
        });
      } catch (err) {
        console.warn('Geofence deactivation failed (non-critical):', err);
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
