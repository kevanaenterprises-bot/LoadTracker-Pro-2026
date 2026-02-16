import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { generateNextInvoiceNumber } from '@/lib/invoiceUtils';

import { Load, LoadStop } from '@/types/tms';
import HistoryTourSection from '@/components/tms/HistoryTourSection';
import { Truck, MapPin, Calendar, Package, DollarSign, CheckCircle, Upload, FileText, Loader2, AlertCircle, Camera, Search, ClipboardList, Navigation, Signal, SignalZero, Clock, Undo2, RefreshCw, Copy, Check, ChevronDown, Info, ExternalLink, Mail, Send } from 'lucide-react';



interface DriverPortalViewProps {
  onBack: () => void;
}

const DriverPortalView: React.FC<DriverPortalViewProps> = ({ onBack }) => {
  const [load, setLoad] = useState<Load | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [returning, setReturning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [accepted, setAccepted] = useState(false);
  const [loadNumberInput, setLoadNumberInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [initialCheckDone, setInitialCheckDone] = useState(false);
  const [bolNumber, setBolNumber] = useState('');
  const [loadStops, setLoadStops] = useState<LoadStop[]>([]);


  // Invoice email status
  const [invoiceEmailStatus, setInvoiceEmailStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [invoiceEmailMessage, setInvoiceEmailMessage] = useState('');



  // GPS Tracking State - simplified
  const [gpsTracking, setGpsTracking] = useState(false);
  const [gpsStarting, setGpsStarting] = useState(false);
  const [gpsPosition, setGpsPosition] = useState<{ lat: number; lng: number; accuracy: number; speed: number | null; heading: number | null } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsErrorCode, setGpsErrorCode] = useState<number | null>(null);
  const [lastGpsUpdate, setLastGpsUpdate] = useState<Date | null>(null);
  const [gpsUpdateCount, setGpsUpdateCount] = useState(0);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);
  const [usingFallbackPolling, setUsingFallbackPolling] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [showDebugLog, setShowDebugLog] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [dbWriteStatus, setDbWriteStatus] = useState<'idle' | 'writing' | 'success' | 'error'>('idle');
  const [lastDbCoords, setLastDbCoords] = useState<{ lat: number; lng: number } | null>(null);


  const watchIdRef = useRef<number | null>(null);
  const sendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fallbackPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestPositionRef = useRef<GeolocationPosition | null>(null);
  const activeRef = useRef(false); // tracks if GPS session is active


  // Safe iOS detection wrapped in try-catch
  let isIOS = false;
  try {
    isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  } catch { /* ignore */ }

  // Debug logger
  const log = useCallback((msg: string) => {
    try {
      const ts = new Date().toLocaleTimeString();
      console.log(`[GPS ${ts}] ${msg}`);
      setDebugLog(prev => [`[${ts}] ${msg}`, ...prev].slice(0, 30));
    } catch { /* ignore */ }
  }, []);

  // Copy URL to clipboard
  const handleCopyUrl = useCallback(async () => {
    try {
      const url = window.location.href;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 3000);
    } catch {
      try { alert('Copy this URL:\n\n' + window.location.href); } catch { /* ignore */ }
    }
  }, []);

  // ---- Load fetching ----
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      if (token) {
        setLoading(true);
        fetchLoadByToken(token);
      } else {
        setInitialCheckDone(true);
      }
    } catch {
      setInitialCheckDone(true);
    }
  }, []);

  const fetchLoadByToken = async (token: string) => {
    try {
      const { data, error: fetchError } = await supabase.from('loads').select('*, driver:drivers(*)').eq('acceptance_token', token).single();
      if (fetchError || !data) { setError('Load not found or link has expired'); return; }
      setLoad(data);
      setBolNumber(data.bol_number || '');
      if (data.status === 'IN_TRANSIT' || data.status === 'DELIVERED') setAccepted(true);
      // Fetch stops for this load
      fetchLoadStops(data.id);
    } catch { setError('Failed to load data'); }
    finally {
      setLoading(false);
      setInitialCheckDone(true);
    }
  };

  const fetchLoadStops = async (loadId: string) => {
    try {
      const { data: stops } = await supabase
        .from('load_stops')
        .select('*')
        .eq('load_id', loadId)
        .order('stop_sequence', { ascending: true });
      if (stops) setLoadStops(stops);
    } catch { /* non-critical */ }
  };


  const handleSearchLoad = async () => {
    if (!loadNumberInput.trim()) { setError('Please enter a load number'); return; }
    setSearching(true);
    setError(null);
    setLoad(null);
    setAccepted(false);
    setBolNumber('');
    setLoadStops([]);

    setLoadStops([]);
    try {
      const { data, error: fetchError } = await supabase
        .from('loads')
        .select('*, driver:drivers(*)')
        .eq('load_number', loadNumberInput.trim().toUpperCase())
        .single();
      if (fetchError || !data) {
        setError(`Load "${loadNumberInput.trim()}" not found. Please check the load number and try again.`);
        return;
      }
      setLoad(data);
      setBolNumber(data.bol_number || '');
      if (data.status === 'IN_TRANSIT' || data.status === 'DELIVERED' || data.status === 'INVOICED') {
        setAccepted(true);
      }
      // Fetch stops for this load
      fetchLoadStops(data.id);
    } catch {
      setError('Failed to search for load. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  // ---- Navigation Helpers ----
  // Build a full address string from load stop or load fields
  const buildAddressString = (address?: string, city?: string, state?: string, zip?: string) => {
    const parts = [address, city, state, zip].filter(Boolean);
    return parts.join(', ');
  };

  // Get pickup address (from stops or load fields)
  const getPickupAddress = () => {
    const pickupStop = loadStops.find(s => s.stop_type === 'pickup');
    if (pickupStop?.address) {
      return buildAddressString(pickupStop.address, pickupStop.city, pickupStop.state, pickupStop.zip);
    }
    if (load?.origin_address) {
      return buildAddressString(load.origin_address, load.origin_city, load.origin_state);
    }
    return `${load?.origin_city || ''}, ${load?.origin_state || ''}`;
  };

  // Get delivery address (from stops or load fields)
  const getDeliveryAddress = () => {
    const deliveryStops = loadStops.filter(s => s.stop_type === 'delivery');
    const lastDelivery = deliveryStops.length > 0 ? deliveryStops[deliveryStops.length - 1] : null;
    if (lastDelivery?.address) {
      return buildAddressString(lastDelivery.address, lastDelivery.city, lastDelivery.state, lastDelivery.zip);
    }
    if (load?.dest_address) {
      return buildAddressString(load.dest_address, load.dest_city, load.dest_state);
    }
    return `${load?.dest_city || ''}, ${load?.dest_state || ''}`;
  };













  const handleAcceptLoad = async () => {
    if (!load) return;
    setAccepting(true);
    try {
      const { error: updateError } = await supabase
        .from('loads')
        .update({ status: 'IN_TRANSIT', accepted_at: new Date().toISOString() })
        .eq('id', load.id);
      if (updateError) { alert(`Failed to accept load: ${updateError.message}`); return; }
      setAccepted(true);
      setLoad({ ...load, status: 'IN_TRANSIT' });
    } catch { alert('Failed to accept load. Please try again.'); }
    finally { setAccepting(false); }
  };

  const handleReturnLoad = async () => {
    if (!load) return;
    if (!confirm('Are you sure you want to return this load? It will be sent back to dispatch for reassignment.')) return;
    setReturning(true);
    try {
      const { error: updateError } = await supabase
        .from('loads')
        .update({ status: 'UNASSIGNED', driver_id: null, acceptance_token: null, accepted_at: null })
        .eq('id', load.id);
      if (updateError) { alert(`Failed to return load: ${updateError.message}`); return; }
      if (load.driver_id) {
        await supabase.from('drivers').update({ status: 'available' }).eq('id', load.driver_id);
      }
      try {
        await supabase.functions.invoke('here-webhook', {
          body: { action: 'deactivate-load-geofences', load_id: load.id },
        });
      } catch { /* non-critical */ }
      if (gpsTracking) stopGpsTracking();
      alert('Load has been returned to dispatch. You can close this page.');
      setLoad({ ...load, status: 'UNASSIGNED', driver_id: null });
      setAccepted(false);
    } catch { alert('Failed to return load. Please try again.'); }
    finally { setReturning(false); }
  };






  // ---- GPS Tracking (simplified & robust) ----

  const sendLocationUpdate = useCallback(async () => {
    const pos = latestPositionRef.current;
    if (!pos || !load?.driver_id) return;

    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const speedMph = pos.coords.speed ? Math.round(pos.coords.speed * 2.237) : null;
    const heading = pos.coords.heading;
    const accuracy = pos.coords.accuracy;
    const altitude = pos.coords.altitude;
    const now = new Date().toISOString();

    log(`Sending location: lat=${lat}, lng=${lng}, speed=${speedMph}, heading=${heading}, accuracy=${Math.round(accuracy || 0)}m`);

    // Get battery level if available
    let batteryLevel: number | null = null;
    try {
      if ('getBattery' in navigator) {
        const battery = await (navigator as any).getBattery();
        batteryLevel = Math.round(battery.level * 100);
      }
    } catch { /* Battery API not available */ }

    setDbWriteStatus('writing');

    try {
      // ============================================================
      // PRIMARY: Write DIRECTLY to the drivers table
      // This bypasses the edge function to ensure correct lat/lng
      // The edge function was potentially corrupting the longitude
      // ============================================================
      const updatePayload: Record<string, any> = {
        last_known_lat: lat,
        last_known_lng: lng,
        last_position_update: now,
        last_known_speed: speedMph,
        last_known_heading: heading,
      };

      // Include battery level if we got it
      if (batteryLevel !== null) {
        updatePayload.battery_level = batteryLevel;
      }

      const { error: dbError } = await supabase
        .from('drivers')
        .update(updatePayload)
        .eq('id', load.driver_id);

      if (dbError) {
        log(`Direct DB write FAILED: ${dbError.message}`);
        setDbWriteStatus('error');
      } else {
        log(`Direct DB write SUCCESS: lat=${lat}, lng=${lng}`);
        setDbWriteStatus('success');
        setLastDbCoords({ lat, lng });

        // Verify the write by reading back (only occasionally to save bandwidth)
        if (gpsUpdateCount % 5 === 0) {
          try {
            const { data: verify } = await supabase
              .from('drivers')
              .select('last_known_lat, last_known_lng')
              .eq('id', load.driver_id)
              .single();
            if (verify) {
              const latMatch = Math.abs((verify.last_known_lat || 0) - lat) < 0.0001;
              const lngMatch = Math.abs((verify.last_known_lng || 0) - lng) < 0.0001;
              log(`DB verify: stored lat=${verify.last_known_lat}, lng=${verify.last_known_lng} | match: lat=${latMatch}, lng=${lngMatch}`);
              if (!latMatch || !lngMatch) {
                log(`WARNING: DB values don't match sent values! Sent: ${lat},${lng} Stored: ${verify.last_known_lat},${verify.last_known_lng}`);
              }
            }
          } catch { /* verification is non-critical */ }
        }
      }

      // Reset status indicator after 3 seconds
      setTimeout(() => setDbWriteStatus('idle'), 3000);

      // ============================================================
      // SECONDARY: Also call edge function for side effects
      // (geofence checks, position history logging, etc.)
      // This is non-blocking - we don't await it or care if it fails
      // ============================================================
      supabase.functions.invoke('here-webhook', {
        body: {
          action: 'update-driver-location',
          driver_id: load.driver_id,
          latitude: lat,
          longitude: lng,
          accuracy: accuracy,
          speed: speedMph,
          heading: heading,
          altitude: altitude,
          battery_level: batteryLevel,
        },
      }).then(({ data }) => {
        if (data?.success) {
          log(`Edge function also confirmed (secondary)`);
        }
      }).catch(() => {
        // Edge function failure is non-critical since we wrote directly to DB
        log(`Edge function call failed (non-critical, DB write was primary)`);
      });

      setLastGpsUpdate(new Date());
      setGpsUpdateCount(prev => prev + 1);
    } catch (err) {
      log(`Location update error: ${String(err)}`);
      setDbWriteStatus('error');
      setTimeout(() => setDbWriteStatus('idle'), 3000);
    }
  }, [load?.driver_id, log, gpsUpdateCount]);


  const handlePositionSuccess = useCallback((position: GeolocationPosition) => {
    latestPositionRef.current = position;
    setGpsPosition({
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy,
      speed: position.coords.speed ? Math.round(position.coords.speed * 2.237) : null,
      heading: position.coords.heading,
    });
    setGpsError(null);
    setGpsErrorCode(null);
    setShowTroubleshooting(false);
  }, []);

  // Start fallback polling (for iOS when watchPosition fails)
  const startFallbackPolling = useCallback(() => {
    if (!activeRef.current) return;
    log('Switching to fallback polling (every 10s)');
    setUsingFallbackPolling(true);

    const opts: PositionOptions = { enableHighAccuracy: false, timeout: 15000, maximumAge: 15000 };

    // Immediate first poll
    try {
      navigator.geolocation.getCurrentPosition(handlePositionSuccess, () => {}, opts);
    } catch { /* ignore */ }

    const pollId = setInterval(() => {
      if (!activeRef.current) return;
      try {
        navigator.geolocation.getCurrentPosition(handlePositionSuccess, () => {}, opts);
      } catch { /* ignore */ }
    }, 10000);

    fallbackPollRef.current = pollId;
  }, [handlePositionSuccess, log]);

  const startGpsTracking = useCallback(async () => {
    // Safety checks
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsError('GPS is not supported on this device.');
      return;
    }

    try {
      if (window.isSecureContext === false) {
        setGpsError('Location requires a secure (HTTPS) connection.');
        return;
      }
    } catch { /* ignore */ }

    setGpsError(null);
    setGpsErrorCode(null);
    setGpsStarting(true);
    setShowTroubleshooting(false);
    activeRef.current = true;

    log(`Starting GPS... iOS=${isIOS}, UA=${navigator.userAgent.substring(0, 60)}`);

    // Step 1: Always try high accuracy first for best GPS position
    // maximumAge kept short to avoid stale/inaccurate cached positions
    const highAccuracyOptions: PositionOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 };
    const lowAccuracyOptions: PositionOptions = { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 };

    try {
      let position: GeolocationPosition | null = null;
      
      try {
        // Try high accuracy first (uses real GPS on mobile)
        position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, highAccuracyOptions);
        });
        log(`High accuracy position: ${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}, accuracy=${Math.round(position.coords.accuracy)}m`);
      } catch (highAccErr: any) {
        log(`High accuracy failed (code=${highAccErr?.code}), trying low accuracy fallback...`);
        if (highAccErr?.code === 1) {
          // Permission denied - don't bother with low accuracy, it'll also fail
          throw highAccErr;
        }
        // Try low accuracy as fallback (WiFi/cell tower)
        position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, lowAccuracyOptions);
        });
        log(`Low accuracy fallback position: ${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}, accuracy=${Math.round(position.coords.accuracy)}m`);
      }

      if (!position) throw new Error('Could not get position');

      log(`Got position: ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}, accuracy: ${Math.round(position.coords.accuracy)}m`);

      if (!activeRef.current) return; // cancelled while waiting

      handlePositionSuccess(position);
      setGpsTracking(true);
      setGpsStarting(false);

      // Step 2: Start continuous tracking with watchPosition
      // Always use high accuracy for continuous tracking to get real GPS
      const watchOpts: PositionOptions = { enableHighAccuracy: true, timeout: 30000, maximumAge: 15000 };

      let watchWorking = false;
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          watchWorking = true;
          if (activeRef.current) handlePositionSuccess(pos);
        },
        (err) => {
          log(`watchPosition error: ${err.code} ${err.message}`);
          // If watchPosition fails, switch to fallback polling
          if (activeRef.current && watchIdRef.current !== null) {
            try { navigator.geolocation.clearWatch(watchIdRef.current); } catch { /* */ }
            watchIdRef.current = null;
            startFallbackPolling();
          }
        },
        watchOpts
      );
      watchIdRef.current = watchId;

      // Safety: if watchPosition doesn't fire within 15s, switch to fallback
      setTimeout(() => {
        if (activeRef.current && !watchWorking && watchIdRef.current !== null) {
          log('watchPosition appears stuck, switching to fallback');
          try { navigator.geolocation.clearWatch(watchIdRef.current); } catch { /* */ }
          watchIdRef.current = null;
          startFallbackPolling();
        }
      }, 15000);

      // Step 3: Send location updates to server every 30s
      const interval = setInterval(() => {
        if (activeRef.current) sendLocationUpdate();
      }, 30000);
      sendIntervalRef.current = interval;
      setTimeout(() => { if (activeRef.current) sendLocationUpdate(); }, 2000);

    } catch (err: any) {
      if (!activeRef.current) return;
      setGpsStarting(false);

      const code = err?.code;
      setGpsErrorCode(code ?? null);
      log(`GPS failed: code=${code} msg=${err?.message}`);

      if (code === 1) {
        // PERMISSION_DENIED
        // On iOS, try one more time with different options before giving up
        if (isIOS) {
          log('Permission denied on iOS, trying low-accuracy fallback...');
          try {
            const fallbackPos = await new Promise<GeolocationPosition>((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: false,
                timeout: 5000,
                maximumAge: 600000, // accept 10-minute-old cached position
              });
            });
            // If this worked, the "denied" was actually a timeout/glitch
            log('Fallback succeeded! Permission is actually OK.');
            if (!activeRef.current) return;
            handlePositionSuccess(fallbackPos);
            setGpsTracking(true);
            setGpsStarting(false);
            startFallbackPolling();
            const interval = setInterval(() => {
              if (activeRef.current) sendLocationUpdate();
            }, 30000);
            sendIntervalRef.current = interval;
            return;
          } catch (e2: any) {
            log(`Fallback also failed: code=${e2?.code} msg=${e2?.message}`);
          }
        }

        setGpsError('Location permission denied.');
        setShowTroubleshooting(true);
      } else if (code === 2) {
        setGpsError('Location unavailable. Make sure Location Services are turned on in your device settings.');
        if (isIOS) setShowTroubleshooting(true);
      } else if (code === 3) {
        setGpsError('Location request timed out. Make sure you have a clear view of the sky or good cell signal, then try again.');
        if (isIOS) setShowTroubleshooting(true);
      } else {
        setGpsError(`Could not get your location. ${err?.message || 'Please try again.'}`);
        if (isIOS) setShowTroubleshooting(true);
      }
    }
  }, [sendLocationUpdate, handlePositionSuccess, startFallbackPolling, log, isIOS]);

  const stopGpsTracking = useCallback(() => {
    activeRef.current = false;
    try {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    } catch { /* ignore */ }
    if (sendIntervalRef.current) { clearInterval(sendIntervalRef.current); sendIntervalRef.current = null; }
    if (fallbackPollRef.current) { clearInterval(fallbackPollRef.current); fallbackPollRef.current = null; }
    setGpsTracking(false);
    setUsingFallbackPolling(false);
    setGpsStarting(false);
    latestPositionRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      activeRef.current = false;
      try {
        if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      } catch { /* */ }
      if (sendIntervalRef.current) clearInterval(sendIntervalRef.current);
      if (fallbackPollRef.current) clearInterval(fallbackPollRef.current);
    };
  }, []);

  // ---- Image Compression Utility ----
  const compressImage = (file: File, maxWidth = 1600, quality = 0.8): Promise<string> => {
    return new Promise((resolve, reject) => {
      // If not an image, just convert to base64 directly
      if (!file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;

          // Scale down if larger than maxWidth
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('Canvas not supported')); return; }

          ctx.drawImage(img, 0, 0, width, height);

          // Convert to base64 JPEG for compression
          const base64 = canvas.toDataURL('image/jpeg', quality);
          resolve(base64);
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  // ---- File Upload (via Edge Function) ----
  const [uploadProgress, setUploadProgress] = useState<string>('');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !load) return;
    if (!bolNumber.trim()) {
      alert('Please enter the BOL number before uploading POD documents.');
      e.target.value = '';
      return;
    }
    setUploading(true);
    setUploadProgress('');
    setInvoiceEmailStatus('idle');
    setInvoiceEmailMessage('');

    try {
      // Save BOL number first
      setUploadProgress('Saving BOL number...');
      const { error: bolError } = await supabase
        .from('loads')
        .update({ bol_number: bolNumber.trim().toUpperCase() })
        .eq('id', load.id);
      if (bolError) { alert(`Failed to save BOL number: ${bolError.message}`); return; }

      const fileArray = Array.from(files);
      let allUploadsSuccessful = true;
      const failedFiles: string[] = [];

      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        setUploadProgress(`Uploading ${file.name} (${i + 1}/${fileArray.length})...`);

        try {
          // Compress image files to reduce size for edge function
          console.log(`[POD Upload] Processing ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB, type: ${file.type})`);
          setUploadProgress(`Compressing ${file.name}...`);

          const base64Data = await compressImage(file);
          const compressedSizeKB = Math.round((base64Data.length * 3) / 4 / 1024);
          console.log(`[POD Upload] Compressed to ~${compressedSizeKB} KB`);

          setUploadProgress(`Uploading ${file.name} to server...`);

          // Upload via edge function (uses service role key - bypasses storage policies)
          const { data: uploadResult, error: uploadError } = await supabase.functions.invoke('upload-pod-file', {
            body: {
              load_id: load.id,
              file_name: file.name,
              file_type: file.type || 'image/jpeg',
              file_data: base64Data,
            },
          });

          if (uploadError) {
            console.error(`[POD Upload] Edge function error for ${file.name}:`, uploadError);
            failedFiles.push(file.name);
            allUploadsSuccessful = false;
            continue;
          }

          if (!uploadResult?.success) {
            console.error(`[POD Upload] Upload failed for ${file.name}:`, uploadResult?.error);
            failedFiles.push(file.name);
            allUploadsSuccessful = false;
            continue;
          }

          console.log(`[POD Upload] Success: ${file.name} -> ${uploadResult.file_url} (verified: ${uploadResult.verified})`);
          setUploadedFiles(prev => [...prev, file.name]);

        } catch (fileErr: any) {
          console.error(`[POD Upload] Exception uploading ${file.name}:`, fileErr);
          failedFiles.push(file.name);
          allUploadsSuccessful = false;
        }
      }

      // If any files failed, show error but continue with status update if at least one succeeded
      if (failedFiles.length > 0) {
        const successCount = fileArray.length - failedFiles.length;
        if (successCount === 0) {
          alert(`Upload failed for all files. Please try again.\n\nFailed: ${failedFiles.join(', ')}`);
          setUploading(false);
          setUploadProgress('');
          return;
        } else {
          alert(`${successCount} file(s) uploaded successfully.\n\nFailed to upload: ${failedFiles.join(', ')}\n\nYou can re-upload the failed files later.`);
        }
      }

      // Mark load as delivered
      setUploadProgress('Marking load as delivered...');
      await supabase.from('loads').update({ status: 'DELIVERED', delivered_at: new Date().toISOString() }).eq('id', load.id);

      let autoInvoice = false;
      try {
        const { data: settingData } = await supabase.from('settings').select('value').eq('key', 'auto_invoice_enabled').single();
        autoInvoice = settingData?.value === 'true';
      } catch { /* default false */ }

      let finalStatus = 'DELIVERED';
      if (autoInvoice) {
        setUploadProgress('Generating invoice...');
        const invoiceNumber = await generateNextInvoiceNumber();

        // Calculate total with fuel surcharge if applicable
        let totalAmount = Number(load.rate || 0) + Number(load.extra_stop_fee || 0) + Number(load.lumper_fee || 0);
        
        // Check for fuel surcharge
        try {
          if (load.customer_id) {
            const { data: customerData } = await supabase
              .from('customers')
              .select('has_fuel_surcharge')
              .eq('id', load.customer_id)
              .single();
            
            if (customerData?.has_fuel_surcharge && load.total_miles) {
              const { data: fuelSetting } = await supabase
                .from('settings')
                .select('value')
                .eq('key', 'fuel_surcharge_rate')
                .single();
              
              if (fuelSetting?.value) {
                const fuelRate = parseFloat(fuelSetting.value);
                if (!isNaN(fuelRate) && fuelRate > 0) {
                  totalAmount += fuelRate * load.total_miles;
                }
              }
            }
          }
        } catch { /* fuel surcharge calculation is non-critical */ }

        await supabase.from('invoices').insert({ invoice_number: invoiceNumber, load_id: load.id, amount: totalAmount, status: 'PENDING' });
        await supabase.from('loads').update({ status: 'INVOICED' }).eq('id', load.id);
        finalStatus = 'INVOICED';

        // ─── AUTO-EMAIL: Check if auto-email is enabled before sending ───
        let autoEmailEnabled = true; // default to true for backward compatibility
        try {
          const { data: emailSetting } = await supabase.from('settings').select('value').eq('key', 'auto_email_invoice').single();
          if (emailSetting?.value === 'false') autoEmailEnabled = false;
        } catch { /* default true if setting doesn't exist */ }

        if (autoEmailEnabled) {
          setUploadProgress('Sending invoice email...');
          setInvoiceEmailStatus('sending');
          try {
            console.log(`[Auto-Invoice] Sending invoice ${invoiceNumber} email for load ${load.id}...`);
            const { data: emailResult, error: emailError } = await supabase.functions.invoke('send-invoice-email', {
              body: { load_id: load.id, auto_triggered: true },
            });

            if (emailError) {
              console.warn('[Auto-Invoice] Email edge function error:', emailError.message);
              setInvoiceEmailStatus('error');
              setInvoiceEmailMessage(emailResult?.error || emailError.message || 'Failed to send invoice email');
            } else if (emailResult?.success) {
              console.log('[Auto-Invoice] Invoice email sent successfully:', emailResult.message);
              setInvoiceEmailStatus('sent');
              setInvoiceEmailMessage(emailResult.message || `Invoice ${invoiceNumber} emailed to customer`);

              // ═══ CRITICAL FIX: Update emailed_at in database so pipeline advances ═══
              // Without this, the load stays in "Invoices To Be Emailed" instead of "Waiting On Payment"
              const now = new Date().toISOString();
              const emailedTo = emailResult.emailed_to || 'customer';
              try {
                await supabase
                  .from('invoices')
                  .update({ emailed_at: now, emailed_to: emailedTo })
                  .eq('load_id', load.id);
                console.log(`[Auto-Invoice] Updated emailed_at for load ${load.id} → ${emailedTo}`);
              } catch (dbErr) {
                console.warn('[Auto-Invoice] Failed to update emailed_at:', dbErr);
              }
            } else {
              console.warn('[Auto-Invoice] Email send failed:', emailResult?.error);
              setInvoiceEmailStatus('error');
              setInvoiceEmailMessage(emailResult?.error || 'Invoice created but email delivery failed');
            }
          } catch (emailErr: any) {
            console.warn('[Auto-Invoice] Email exception (non-critical):', emailErr?.message);
            setInvoiceEmailStatus('error');
            setInvoiceEmailMessage('Invoice created but could not send email. Dispatch can send it manually.');
          }
        } else {
          console.log('[Auto-Invoice] Auto-email is disabled in settings. Skipping email send.');
          setInvoiceEmailStatus('idle');
          setInvoiceEmailMessage('');
        }

      }


      if (load.driver_id) {
        await supabase.from('drivers').update({ status: 'available' }).eq('id', load.driver_id);
      }

      try {
        await supabase.functions.invoke('here-webhook', {
          body: { action: 'deactivate-load-geofences', load_id: load.id },
        });
      } catch { /* non-critical */ }

      if (gpsTracking) stopGpsTracking();
      setLoad({ ...load, status: finalStatus as any, bol_number: bolNumber.trim().toUpperCase() });
      if (!autoInvoice) setAccepted(true);
    } catch (err: any) {
      console.error('[POD Upload] Fatal error:', err);
      alert(`Failed to upload document: ${err?.message || 'Unknown error'}. Please try again.`);
    }
    finally {
      setUploading(false);
      setUploadProgress('');
    }
  };


  // ---- Render ----

  if (loading) return <div className="min-h-screen bg-slate-100 flex items-center justify-center"><Loader2 className="w-12 h-12 animate-spin text-blue-600" /></div>;

  return (

    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 to-blue-900 text-white p-4 rounded-t-xl shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg"><Truck className="w-6 h-6" /></div>
              <div><h1 className="text-xl font-bold">Driver Portal</h1><p className="text-blue-200 text-sm">LoadTracker Pro</p></div>
            </div>
            <button
              type="button"
              onClick={() => {
                // Do NOT stop GPS tracking here — tracking continues
                // until the driver uploads their POD (handled in handleFileUpload)
                setLoad(null);
                setAccepted(false);
                setLoadNumberInput('');
                setError(null);
                setUploadedFiles([]);
                setBolNumber('');
                setLoadStops([]);
                window.location.href = '/driver-portal';

              }}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-xs font-medium text-white/80 hover:text-white transition-all flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              Log Out
            </button>
          </div>
        </div>



      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Search */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Search className="w-5 h-5 text-blue-600" />
            Find Your Load
          </h2>
          <p className="text-slate-600 mb-4">Enter your load number to view details and accept the load.</p>
          <div className="flex gap-3">
            <input
              type="text"
              value={loadNumberInput}
              onChange={(e) => setLoadNumberInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearchLoad(); } }}
              placeholder="Enter Load Number (e.g., LD-001)"
              className="flex-1 px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg font-mono"
            />
            <button
              type="button"
              onClick={handleSearchLoad}
              disabled={searching || !loadNumberInput.trim()}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {searching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
              Search
            </button>
          </div>
          {error && !load && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Load Details */}
        {load && (
          <>
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
              <div className="bg-slate-800 text-white px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-lg font-bold">{load.load_number}</span>
                    {load.bol_number && <span className="ml-3 text-slate-300 text-sm">BOL: {load.bol_number}</span>}
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${load.status === 'DISPATCHED' ? 'bg-amber-500' : load.status === 'IN_TRANSIT' ? 'bg-blue-500' : load.status === 'DELIVERED' ? 'bg-emerald-500' : load.status === 'INVOICED' ? 'bg-purple-500' : 'bg-gray-500'}`}>{load.status.replace('_', ' ')}</span>
                </div>
              </div>
              <div className="p-6 space-y-6">
                <div className="flex items-center gap-4">
                  <div className="flex-1"><div className="flex items-center gap-2 text-sm text-slate-500 mb-1"><div className="w-3 h-3 rounded-full bg-blue-500"></div><span>Pickup</span></div><p className="text-lg font-semibold text-slate-800">{load.origin_city}, {load.origin_state}</p></div>
                  <svg className="w-8 h-8 text-slate-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                  <div className="flex-1 text-right"><div className="flex items-center justify-end gap-2 text-sm text-slate-500 mb-1"><span>Delivery</span><div className="w-3 h-3 rounded-full bg-emerald-500"></div></div><p className="text-lg font-semibold text-slate-800">{load.dest_city}, {load.dest_state}</p></div>
                </div>
                {load.total_miles && (
                  <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-3 flex items-center justify-center gap-2">
                    <Truck className="w-5 h-5 text-cyan-600" />
                    <span className="text-lg font-bold text-cyan-700">{load.total_miles} miles</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 rounded-xl p-4"><div className="flex items-center gap-2 text-slate-500 text-sm mb-1"><Calendar className="w-4 h-4" /><span>Pickup Date</span></div><p className="font-semibold text-slate-800">{new Date(load.pickup_date).toLocaleDateString()}</p></div>
                  <div className="bg-slate-50 rounded-xl p-4"><div className="flex items-center gap-2 text-slate-500 text-sm mb-1"><Calendar className="w-4 h-4" /><span>Delivery Date</span></div><p className="font-semibold text-slate-800">{new Date(load.delivery_date).toLocaleDateString()}</p></div>
                </div>
              </div>
            </div>


            {/* Navigation - Opens Google Maps / Apple Maps (free, no API key) */}
            {(accepted || load.status === 'IN_TRANSIT' || load.status === 'DISPATCHED') && (
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
                  <Navigation className="w-5 h-5 text-blue-600" />
                  Navigation
                </h2>

                {/* Stops overview */}
                <div className="space-y-3 mb-5">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">P</div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium">Pickup</p>
                      <p className="text-sm font-semibold text-slate-800">{getPickupAddress()}</p>
                    </div>
                  </div>
                  {loadStops.filter(s => s.stop_type === 'delivery').length > 1 && loadStops.filter(s => s.stop_type === 'delivery').slice(0, -1).map((stop, idx) => (
                    <div key={stop.id} className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">S{idx + 1}</div>
                      <div>
                        <p className="text-xs text-slate-500 font-medium">Stop {idx + 1}</p>
                        <p className="text-sm font-semibold text-slate-800">{buildAddressString(stop.address, stop.city, stop.state, stop.zip)}</p>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">D</div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium">Delivery</p>
                      <p className="text-sm font-semibold text-slate-800">{getDeliveryAddress()}</p>
                    </div>
                  </div>
                </div>

                {/* Navigation buttons - opens native maps apps (completely free) */}
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => {
                      const dest = encodeURIComponent(getPickupAddress());
                      window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`, '_blank');
                    }}
                    className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl text-sm font-semibold hover:from-blue-700 hover:to-blue-800 flex items-center justify-center gap-2"
                  >
                    <Navigation className="w-5 h-5" />
                    Navigate to Pickup
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const dest = encodeURIComponent(getDeliveryAddress());
                      window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`, '_blank');
                    }}
                    className="w-full py-3 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-xl text-sm font-semibold hover:from-emerald-700 hover:to-emerald-800 flex items-center justify-center gap-2"
                  >
                    <Navigation className="w-5 h-5" />
                    Navigate to Delivery
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const origin = encodeURIComponent(getPickupAddress());
                      const dest = encodeURIComponent(getDeliveryAddress());
                      // Build waypoints for extra stops
                      const extraStops = loadStops.filter(s => s.stop_type === 'delivery').slice(0, -1);
                      const waypoints = extraStops.map(s => encodeURIComponent(buildAddressString(s.address, s.city, s.state, s.zip))).join('|');
                      const waypointParam = waypoints ? `&waypoints=${waypoints}` : '';
                      window.open(`https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}${waypointParam}&travelmode=driving`, '_blank');
                    }}
                    className="w-full py-2.5 bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    View Full Route in Google Maps
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 text-center mt-3">Opens Google Maps for turn-by-turn navigation</p>
              </div>
            )}




            {/* BOL display */}
            {load.bol_number && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <ClipboardList className="w-5 h-5 text-indigo-600" />
                  <div>
                    <p className="text-sm text-indigo-600 font-medium">Bill of Lading Number</p>
                    <p className="text-lg font-bold text-indigo-800 font-mono">{load.bol_number}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Accept / Return Load */}
            {load.status === 'DISPATCHED' && !accepted && (
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h2 className="text-lg font-bold text-slate-800 mb-4">Accept This Load</h2>
                <p className="text-slate-600 mb-6">By accepting, you confirm pickup and delivery by the specified dates.</p>
                <div className="space-y-3">
                  <button type="button" onClick={handleAcceptLoad} disabled={accepting} className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                    {accepting ? <><Loader2 className="w-5 h-5 animate-spin" />Accepting...</> : <><CheckCircle className="w-5 h-5" />Accept Load</>}
                  </button>
                  <button type="button" onClick={handleReturnLoad} disabled={returning} className="w-full py-3 bg-red-50 border-2 border-red-200 text-red-700 rounded-xl font-semibold hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                    {returning ? <><Loader2 className="w-5 h-5 animate-spin" />Returning...</> : <><Undo2 className="w-5 h-5" />Return Load to Dispatch</>}
                  </button>
                </div>
              </div>
            )}

            {accepted && load.status === 'IN_TRANSIT' && (
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-emerald-500 to-green-600 rounded-2xl shadow-lg p-6 text-white">
                  <div className="flex items-center gap-3 mb-4"><CheckCircle className="w-8 h-8" /><h2 className="text-lg font-bold">Load Accepted!</h2></div>
                  <p className="text-emerald-100">Proceed to pickup and upload POD documents upon delivery.</p>
                </div>
                <button type="button" onClick={handleReturnLoad} disabled={returning} className="w-full py-3 bg-red-50 border-2 border-red-200 text-red-700 rounded-xl font-semibold hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  {returning ? <><Loader2 className="w-5 h-5 animate-spin" />Returning...</> : <><Undo2 className="w-5 h-5" />Return Load to Dispatch</>}
                </button>
              </div>
            )}

            {/* GPS Location Sharing */}
            {load.driver_id && (accepted || load.status === 'IN_TRANSIT' || load.status === 'DISPATCHED') && (
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Navigation className="w-5 h-5 text-blue-600" />
                    GPS Location Sharing
                  </h2>
                  <div className="flex items-center gap-2">
                    {usingFallbackPolling && gpsTracking && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-semibold">POLLING</span>
                    )}
                    {gpsTracking && (
                      <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                        LIVE
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-slate-600 text-sm mb-4">Share your live GPS location so dispatch can track your position.</p>

                {/* GPS Error */}
                {gpsError && (
                  <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-red-700 text-sm font-medium">{gpsError}</p>
                        <div className="flex gap-2 mt-3">
                          <button type="button" onClick={startGpsTracking} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 flex items-center gap-1.5">
                            <RefreshCw className="w-3.5 h-3.5" />Try Again
                          </button>
                          <button type="button" onClick={() => window.location.reload()} className="px-4 py-2 bg-slate-600 text-white rounded-lg text-sm font-medium hover:bg-slate-700 flex items-center gap-1.5">
                            <RefreshCw className="w-3.5 h-3.5" />Reload Page
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* iOS / Permission Troubleshooting */}
                {showTroubleshooting && (
                  <div className="mb-4 space-y-3">
                    {/* Open in Safari banner */}
                    <div className="bg-blue-600 text-white rounded-xl p-4">
                      <p className="font-bold text-sm mb-1">Most Common Fix: Open in Safari</p>
                      <p className="text-blue-100 text-xs mb-3">
                        If you opened this from a text message or another app, location may be blocked.
                        Copy this link and paste it in the <strong>Safari</strong> app.
                      </p>
                      <button
                        type="button"
                        onClick={handleCopyUrl}
                        className="w-full py-2.5 bg-white text-blue-700 rounded-lg text-sm font-bold flex items-center justify-center gap-2"
                      >
                        {urlCopied ? <><Check className="w-4 h-4" />Link Copied! Now paste in Safari</> : <><Copy className="w-4 h-4" />Copy Link</>}
                      </button>
                    </div>

                    {/* Settings checklist */}
                    <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
                      <div className="px-4 py-3">
                        <span className="font-semibold text-amber-800 text-sm">If already in Safari, check these settings:</span>
                      </div>
                      <div className="px-4 pb-4 space-y-3">
                        <div className="bg-white rounded-lg p-3 border border-amber-100">
                          <div className="flex items-start gap-3">
                            <div className="w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">1</div>
                            <div>
                              <p className="font-semibold text-slate-800 text-sm">Location Services ON</p>
                              <p className="text-slate-600 text-xs mt-0.5">
                                <strong>Settings</strong> &gt; <strong>Privacy & Security</strong> &gt; <strong>Location Services</strong> &gt; toggle ON
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="bg-white rounded-lg p-3 border border-amber-100">
                          <div className="flex items-start gap-3">
                            <div className="w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">2</div>
                            <div>
                              <p className="font-semibold text-slate-800 text-sm">Safari = "While Using"</p>
                              <p className="text-slate-600 text-xs mt-0.5">
                                In Location Services list, scroll to <strong>Safari Websites</strong> &gt; set to <strong>"While Using the App"</strong>
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="bg-white rounded-lg p-3 border border-amber-100">
                          <div className="flex items-start gap-3">
                            <div className="w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">3</div>
                            <div>
                              <p className="font-semibold text-slate-800 text-sm">Website = "Allow"</p>
                              <p className="text-slate-600 text-xs mt-0.5">
                                In Safari, tap <strong>aA</strong> in address bar &gt; <strong>Website Settings</strong> &gt; <strong>Location</strong> &gt; <strong>Allow</strong>
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="bg-white rounded-lg p-3 border border-red-100">
                          <div className="flex items-start gap-3">
                            <div className="w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">4</div>
                            <div>
                              <p className="font-semibold text-slate-800 text-sm">Still not working? Reset Safari permissions</p>
                              <p className="text-slate-600 text-xs mt-0.5">
                                <strong>Settings</strong> &gt; <strong>Safari</strong> &gt; <strong>Clear History and Website Data</strong>
                              </p>
                              <p className="text-red-600 text-xs mt-1 font-medium">Then reload this page and tap "Allow" when prompted</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Firefox alternative tip */}
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">5</div>
                        <div>
                          <p className="font-semibold text-slate-800 text-sm">Safari still not working? Try Firefox</p>
                          <p className="text-slate-600 text-xs mt-0.5">
                            Download <strong>Firefox</strong> from the App Store and open this link there. Firefox handles location permissions more reliably on some iOS devices.
                          </p>
                          <button
                            type="button"
                            onClick={handleCopyUrl}
                            className="mt-2 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-semibold hover:bg-orange-600 flex items-center gap-1.5"
                          >
                            {urlCopied ? <><Check className="w-3 h-3" />Copied!</> : <><Copy className="w-3 h-3" />Copy Link to Open in Firefox</>}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                      <div className="flex items-start gap-2">
                        <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                        <p className="text-blue-800 text-xs">
                          After changing any setting, you <strong>must reload this page</strong> or close the browser and reopen the link.
                        </p>
                      </div>
                    </div>


                    {/* Debug log */}
                    {debugLog.length > 0 && (
                      <div className="bg-slate-100 rounded-xl overflow-hidden">
                        <button type="button" onClick={() => setShowDebugLog(!showDebugLog)} className="w-full px-4 py-2 flex items-center justify-between text-left">
                          <span className="text-slate-500 text-xs font-medium">Debug Log ({debugLog.length})</span>
                          <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${showDebugLog ? 'rotate-180' : ''}`} />
                        </button>
                        {showDebugLog && (
                          <div className="px-4 pb-3 max-h-40 overflow-y-auto">
                            {debugLog.map((entry, i) => (
                              <p key={i} className="text-[10px] font-mono text-slate-500 leading-relaxed">{entry}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* GPS Position Display */}
                {gpsTracking && gpsPosition && (
                  <div className="mb-4 space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-blue-50 rounded-xl p-3 text-center">
                        <MapPin className="w-4 h-4 text-blue-600 mx-auto mb-1" />
                        <p className="text-[9px] text-slate-500 mb-0.5">GPS Position</p>
                        <p className="text-[10px] font-mono text-blue-800">{gpsPosition.lat.toFixed(6)}</p>
                        <p className="text-[10px] font-mono text-blue-800">{gpsPosition.lng.toFixed(6)}</p>
                      </div>
                      <div className="bg-emerald-50 rounded-xl p-3 text-center">
                        <Signal className="w-4 h-4 text-emerald-600 mx-auto mb-1" />
                        <p className="text-[9px] text-slate-500 mb-0.5">Accuracy</p>
                        <p className="text-sm font-bold text-emerald-800">{Math.round(gpsPosition.accuracy)}m</p>
                      </div>
                      <div className="bg-purple-50 rounded-xl p-3 text-center">
                        <Clock className="w-4 h-4 text-purple-600 mx-auto mb-1" />
                        <p className="text-[9px] text-slate-500 mb-0.5">Updates Sent</p>
                        <p className="text-sm font-bold text-purple-800">{gpsUpdateCount}</p>
                      </div>
                    </div>
                    {/* DB Write Status */}
                    {gpsUpdateCount > 0 && (
                      <div className={`rounded-xl p-2.5 flex items-center gap-2 text-xs ${
                        dbWriteStatus === 'success' ? 'bg-emerald-50 border border-emerald-200' :
                        dbWriteStatus === 'error' ? 'bg-red-50 border border-red-200' :
                        dbWriteStatus === 'writing' ? 'bg-blue-50 border border-blue-200' :
                        'bg-slate-50 border border-slate-200'
                      }`}>
                        {dbWriteStatus === 'writing' && (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" /><span className="text-blue-700">Writing to database...</span></>
                        )}
                        {dbWriteStatus === 'success' && (
                          <><CheckCircle className="w-3.5 h-3.5 text-emerald-500" /><span className="text-emerald-700">DB updated directly (bypassing edge function)</span></>
                        )}
                        {dbWriteStatus === 'error' && (
                          <><AlertCircle className="w-3.5 h-3.5 text-red-500" /><span className="text-red-700">DB write failed - using edge function fallback</span></>
                        )}
                        {dbWriteStatus === 'idle' && lastDbCoords && (
                          <><CheckCircle className="w-3.5 h-3.5 text-slate-400" /><span className="text-slate-600 font-mono">DB: {lastDbCoords.lat.toFixed(6)}, {lastDbCoords.lng.toFixed(6)}</span></>
                        )}
                      </div>
                    )}
                  </div>
                )}


                {/* Start/Stop Button */}
                <button
                  type="button"
                  onClick={gpsTracking ? stopGpsTracking : startGpsTracking}
                  disabled={gpsStarting}
                  className={`w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-70 ${
                    gpsTracking
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white'
                  }`}
                >
                  {gpsStarting ? (
                    <><Loader2 className="w-5 h-5 animate-spin" />Getting your location...</>
                  ) : gpsTracking ? (
                    <><SignalZero className="w-5 h-5" />Stop Sharing Location</>
                  ) : (
                    <><Navigation className="w-5 h-5" />Start Sharing Location</>
                  )}
                </button>

                {usingFallbackPolling && gpsTracking && (
                  <p className="mt-2 text-xs text-amber-600 text-center flex items-center justify-center gap-1">
                    <Info className="w-3 h-3" />
                    Using compatibility mode. Location updates every ~10 seconds.
                  </p>
                )}
              </div>
            )}

            {/* History Tour */}
            {load.driver_id && (accepted || load.status === 'IN_TRANSIT' || load.status === 'DISPATCHED') && (
              <HistoryTourSection
                driverId={load.driver_id}
                gpsPosition={gpsPosition ? { lat: gpsPosition.lat, lng: gpsPosition.lng } : null}
                gpsTracking={gpsTracking}
              />
            )}

            {/* POD Upload */}
            {(accepted || load.status === 'IN_TRANSIT') && (
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h2 className="text-lg font-bold text-slate-800 mb-4">Upload POD Documents</h2>
                {!load.bol_number && (
                  <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <div className="flex items-center gap-2 mb-3">
                      <ClipboardList className="w-5 h-5 text-amber-600" />
                      <h3 className="font-semibold text-amber-800">Enter BOL Number</h3>
                    </div>
                    <p className="text-amber-700 text-sm mb-3">Enter the Bill of Lading (BOL) number before uploading POD.</p>
                    <input
                      type="text"
                      value={bolNumber}
                      onChange={(e) => setBolNumber(e.target.value.toUpperCase())}
                      placeholder="Enter BOL Number"
                      className="w-full px-4 py-3 border border-amber-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-lg font-mono bg-white"
                    />
                    {!bolNumber.trim() && (
                      <p className="mt-2 text-amber-600 text-sm flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        BOL number is required to upload POD
                      </p>
                    )}
                  </div>
                )}
                {uploadedFiles.length > 0 && (
                  <div className="mb-6 space-y-2">
                    {uploadedFiles.map((file, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                        <FileText className="w-5 h-5 text-emerald-600" />
                        <span className="text-sm font-medium text-emerald-700">{file}</span>
                        <CheckCircle className="w-4 h-4 text-emerald-600 ml-auto" />
                      </div>
                    ))}
                  </div>
                )}
                <label className="block">
                  <input type="file" multiple accept="image/*,.pdf" onChange={handleFileUpload} disabled={uploading || (!load.bol_number && !bolNumber.trim())} className="hidden" />
                  <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                    uploading ? 'border-slate-200 bg-slate-50 cursor-wait'
                    : (!load.bol_number && !bolNumber.trim()) ? 'border-slate-200 bg-slate-50 cursor-not-allowed opacity-60'
                    : 'border-blue-300 hover:border-blue-400 hover:bg-blue-50 cursor-pointer'
                  }`}>
                    {uploading ? (
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
                        <span className="text-slate-600 text-sm">{uploadProgress || 'Uploading...'}</span>
                      </div>

                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <div className="flex gap-2">
                          <Camera className="w-8 h-8 text-blue-500" />
                          <Upload className="w-8 h-8 text-blue-500" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-700">
                            {(!load.bol_number && !bolNumber.trim()) ? 'Enter BOL number above first' : 'Tap to upload documents'}
                          </p>
                          <p className="text-sm text-slate-500 mt-1">Photos, PDFs, or scanned documents</p>
                        </div>
                      </div>
                    )}
                  </div>
                </label>
              </div>
            )}

            {load.status === 'DELIVERED' && (
              <div className="bg-gradient-to-r from-emerald-500 to-green-600 rounded-2xl shadow-lg p-6 text-white">
                <div className="flex items-center gap-3 mb-4"><CheckCircle className="w-8 h-8" /><h2 className="text-lg font-bold">POD Uploaded - Awaiting Invoice</h2></div>
                <p className="text-emerald-100">Your POD documents have been uploaded. The dispatcher will review and generate the invoice.</p>
                <div className="mt-4 p-3 bg-white/20 rounded-lg">
                  <p className="text-sm text-emerald-100">Load #: <span className="font-bold text-white">{load.load_number}</span></p>
                  {load.bol_number && <p className="text-sm text-emerald-100">BOL #: <span className="font-bold text-white">{load.bol_number}</span></p>}
                </div>
              </div>
            )}

            {load.status === 'INVOICED' && (
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-2xl shadow-lg p-6 text-white">
                  <div className="flex items-center gap-3 mb-4"><FileText className="w-8 h-8" /><h2 className="text-lg font-bold">Invoice Generated!</h2></div>
                  <p className="text-purple-100">POD uploaded and invoice generated. Payment will be processed per agreed terms.</p>
                  <div className="mt-4 p-3 bg-white/20 rounded-lg">
                    <p className="text-sm text-purple-100">Load #: <span className="font-bold text-white">{load.load_number}</span></p>
                    {load.bol_number && <p className="text-sm text-purple-100">BOL #: <span className="font-bold text-white">{load.bol_number}</span></p>}
                  </div>
                </div>

                {/* Invoice Email Status */}
                {invoiceEmailStatus === 'sending' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                      </div>
                      <div>
                        <p className="font-semibold text-blue-800">Sending Invoice Email...</p>
                        <p className="text-sm text-blue-600">Emailing invoice with all attached documents to the customer</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex-1 h-2 bg-blue-200 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: '60%' }}></div>
                      </div>
                    </div>
                  </div>
                )}

                {invoiceEmailStatus === 'sent' && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 bg-emerald-100 rounded-lg">
                        <Mail className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-emerald-800">Invoice Emailed to Customer</p>
                        <p className="text-sm text-emerald-600">Invoice with BOL, rate confirmation, and POD sent successfully</p>
                      </div>
                    </div>
                    {invoiceEmailMessage && (
                      <div className="bg-emerald-100 rounded-lg p-3">
                        <p className="text-xs text-emerald-700">{invoiceEmailMessage}</p>
                      </div>
                    )}
                    {/* Delivery Pipeline */}
                    <div className="mt-4 grid grid-cols-4 gap-1">
                      {[
                        { label: 'POD Uploaded', done: true },
                        { label: 'Invoice Created', done: true },
                        { label: 'Emailed', done: true },
                        { label: 'Awaiting Payment', done: false },
                      ].map((step, idx) => (
                        <div key={idx} className="text-center">
                          <div className={`w-7 h-7 mx-auto rounded-full flex items-center justify-center ${step.done ? 'bg-emerald-500' : 'bg-amber-400'}`}>
                            {step.done ? (
                              <CheckCircle className="w-4 h-4 text-white" />
                            ) : (
                              <Clock className="w-4 h-4 text-white" />
                            )}
                          </div>
                          <p className={`text-[10px] mt-1 font-medium ${step.done ? 'text-emerald-700' : 'text-amber-600'}`}>{step.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {invoiceEmailStatus === 'error' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-amber-100 rounded-lg">
                        <AlertCircle className="w-5 h-5 text-amber-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-amber-800">Invoice Created — Email Pending</p>
                        <p className="text-sm text-amber-600">Invoice was generated but the email could not be sent automatically. Dispatch will send it manually.</p>
                      </div>
                    </div>
                    {invoiceEmailMessage && (
                      <div className="mt-3 bg-amber-100 rounded-lg p-3">
                        <p className="text-xs text-amber-700">{invoiceEmailMessage}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

          </>
        )}

        {/* Instructions */}
        {!load && initialCheckDone && !error && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
            <ol className="list-decimal list-inside text-blue-700 space-y-2">
              <li>Enter your load number in the search box above</li>
              <li>Review the load details (pickup, delivery, cargo)</li>
              <li>Click "Accept Load" to confirm you'll handle this shipment</li>
              <li>After delivery, enter the BOL number and upload your POD documents</li>
            </ol>

          </div>
        )}
      </div>
    </div>
  );
};

export default DriverPortalView;
