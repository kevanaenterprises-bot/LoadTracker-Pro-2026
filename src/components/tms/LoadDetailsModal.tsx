import React, { useState, useEffect, useRef } from 'react';
import { X, MapPin, Calendar, Package, DollarSign, User, Truck, FileText, Download, Clock, Pencil, Trash2, Eye, Radar, ShieldCheck, Loader2, Wifi, WifiOff, Activity, AlertTriangle, Send, Phone, UserMinus, UserPlus, CheckCircle, Mail, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { generateNextInvoiceNumber } from '@/lib/invoiceUtils';
import { Load, PODDocument, Invoice, LoadStop } from '@/types/tms';

import InvoicePreviewModal from './InvoicePreviewModal';



interface GeofenceRecord {
  id: string;
  stop_id: string;
  here_geofence_id: string;
  geofence_name: string;
  center_lat: number;
  center_lng: number;
  radius_meters: number;
  status: string;
  created_at: string;
}

interface WebhookEvent {
  id: string;
  event_type: string;
  here_device_id: string;
  latitude: number;
  longitude: number;
  event_timestamp: string;
  processed: boolean;
  stop_id: string;
}

interface LoadDetailsModalProps {
  isOpen: boolean;
  load: Load | null;
  onClose: () => void;
  onEdit?: (load: Load) => void;
  onDelete?: (load: Load) => void;
  onLoadUpdated?: () => void;
  onAssignDriver?: (load: Load) => void;
}

const statusColors: Record<string, { bg: string; text: string }> = {
  UNASSIGNED: { bg: 'bg-gray-100', text: 'text-gray-700' },
  DISPATCHED: { bg: 'bg-amber-100', text: 'text-amber-700' },
  IN_TRANSIT: { bg: 'bg-blue-100', text: 'text-blue-700' },
  DELIVERED: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  INVOICED: { bg: 'bg-purple-100', text: 'text-purple-700' },
  PAID: { bg: 'bg-green-100', text: 'text-green-700' },
};

const statusLabels: Record<string, string> = {
  UNASSIGNED: 'Awaiting Dispatch',
  DISPATCHED: 'Dispatched',
  IN_TRANSIT: 'In Transit',
  DELIVERED: 'Delivered',
  INVOICED: 'Invoiced',
  PAID: 'Paid',
};

const LoadDetailsModal: React.FC<LoadDetailsModalProps> = ({ isOpen, load, onClose, onEdit, onDelete, onLoadUpdated, onAssignDriver }) => {
  const [documents, setDocuments] = useState<PODDocument[]>([]);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [stops, setStops] = useState<LoadStop[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showInvoicePreview, setShowInvoicePreview] = useState(false);
  const [geofences, setGeofences] = useState<GeofenceRecord[]>([]);
  const [webhookEvents, setWebhookEvents] = useState<WebhookEvent[]>([]);
  const [settingUpGeofences, setSettingUpGeofences] = useState(false);
  const [geofenceSetupResult, setGeofenceSetupResult] = useState<string | null>(null);
  const [resendingSms, setResendingSms] = useState(false);
  const [resendSmsResult, setResendSmsResult] = useState<{ success: boolean; message: string } | null>(null);
  const [unassigning, setUnassigning] = useState(false);
  const [showUnassignConfirm, setShowUnassignConfirm] = useState(false);
  const [locationGeofenceStatus, setLocationGeofenceStatus] = useState<Record<string, { lat: number; lng: number; radius: number } | null>>({});

  // Invoice generation & email sending state
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [sendingInvoiceEmail, setSendingInvoiceEmail] = useState(false);
  const [invoiceEmailResult, setInvoiceEmailResult] = useState<{ success: boolean; message: string } | null>(null);


  // Track the current load ID to prevent stale async operations
  const currentLoadIdRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isOpen && load) {
      currentLoadIdRef.current = load.id;
      fetchDetails();
      setShowDeleteConfirm(false);
      setShowInvoicePreview(false);
      setGeofenceSetupResult(null);
      setResendSmsResult(null);
      setShowUnassignConfirm(false);
      setSettingUpGeofences(false);
      setInvoiceEmailResult(null);
      setGeneratingInvoice(false);
      setSendingInvoiceEmail(false);
    } else {
      currentLoadIdRef.current = null;
    }
  }, [isOpen, load]);



  const fetchDetails = async () => {
    if (!load) return;
    const loadId = load.id;
    setLoading(true);

    // Fetch POD documents
    const { data: docs } = await supabase
      .from('pod_documents')
      .select('*')
      .eq('load_id', load.id);
    
    // Check if this is still the current load
    if (currentLoadIdRef.current !== loadId) return;
    if (docs) setDocuments(docs);

    // Fetch invoice
    const { data: inv } = await supabase
      .from('invoices')
      .select('*')
      .eq('load_id', load.id)
      .single();
    if (currentLoadIdRef.current !== loadId) return;
    if (inv) setInvoice(inv);

    // Fetch load stops
    const { data: loadStops } = await supabase
      .from('load_stops')
      .select('*')
      .eq('load_id', load.id)
      .order('stop_type')
      .order('stop_sequence');
    if (currentLoadIdRef.current !== loadId) return;
    if (loadStops) {
      setStops(loadStops);
      // Check location geofence status for each stop
      await checkLocationGeofenceStatus(loadStops, loadId);
    }

    // Fetch geofences for this load
    await fetchGeofenceData(loadId);

    if (currentLoadIdRef.current === loadId) {
      setLoading(false);
    }
  };

  const checkLocationGeofenceStatus = async (loadStops: LoadStop[], loadId: string) => {
    const statusMap: Record<string, { lat: number; lng: number; radius: number } | null> = {};
    
    for (const stop of loadStops) {
      if (stop.location_id) {
        const { data: loc } = await supabase
          .from('locations')
          .select('latitude, longitude, geofence_radius')
          .eq('id', stop.location_id)
          .single();
        
        if (currentLoadIdRef.current !== loadId) return;
        
        if (loc?.latitude && loc?.longitude) {
          statusMap[stop.id] = {
            lat: loc.latitude,
            lng: loc.longitude,
            radius: loc.geofence_radius || 500,
          };
        } else {
          statusMap[stop.id] = null;
        }
      }
    }
    
    if (currentLoadIdRef.current === loadId && isMountedRef.current) {
      setLocationGeofenceStatus(statusMap);
    }
  };

  const fetchGeofenceData = async (loadId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('here-webhook', {
        body: {
          action: 'get-load-geofences',
          load_id: loadId,
        },
      });
      if (currentLoadIdRef.current !== loadId) return;
      if (data?.geofences) setGeofences(data.geofences);
      if (data?.webhook_events) setWebhookEvents(data.webhook_events);
    } catch (err) {
      console.warn('Failed to fetch geofence data:', err);
    }
  };

  const handleSetupGeofences = async () => {
    if (!load) return;
    const loadId = load.id;
    setSettingUpGeofences(true);
    setGeofenceSetupResult(null);

    try {
      // STEP 1: Ensure every stop has a location_id (create locations if needed)
      for (const stop of stops) {
        if (!stop.location_id) {
          const locationType = stop.stop_type === 'pickup' ? 'shipper' : 'receiver';
          const { data: newLoc, error: locError } = await supabase
            .from('locations')
            .insert({
              company_name: stop.company_name || `${stop.city}, ${stop.state}`,
              address: stop.address || '',
              city: stop.city,
              state: stop.state,
              zip: stop.zip || '',
              contact_name: stop.contact_name || '',
              contact_phone: stop.contact_phone || '',
              instructions: stop.instructions || '',
              location_type: locationType,
              geofence_radius: 500,
              rate: 0,
            })
            .select()
            .single();

          if (currentLoadIdRef.current !== loadId || !isMountedRef.current) return;

          if (locError) {
            console.warn(`Failed to create location for stop ${stop.id}:`, locError.message);
            continue;
          }

          if (newLoc) {
            await supabase
              .from('load_stops')
              .update({ location_id: newLoc.id })
              .eq('id', stop.id);

            if (currentLoadIdRef.current !== loadId || !isMountedRef.current) return;

            stop.location_id = newLoc.id;
            console.log(`Created location ${newLoc.id} for stop ${stop.id} (${stop.company_name || stop.city})`);
          }
        }
      }

      // STEP 2: Geocode all locations that don't have coordinates yet
      // Use geocode-location (fast path - no Supabase in edge function) + direct DB update from frontend
      let geocodeSuccessCount = 0;
      let geocodeFailCount = 0;

      for (const stop of stops) {
        if (!stop.location_id) continue;

        // Check if location already has coordinates
        const { data: locData } = await supabase
          .from('locations')
          .select('latitude, longitude, address, city, state, zip, geofence_radius')
          .eq('id', stop.location_id)
          .single();

        if (currentLoadIdRef.current !== loadId || !isMountedRef.current) return;

        if (locData?.latitude && locData?.longitude) {
          geocodeSuccessCount++;
          continue; // Already geocoded
        }

        // Build address for geocoding
        const addressToGeocode = locData?.address || stop.address || '';
        const cityToGeocode = locData?.city || stop.city || '';
        const stateToGeocode = locData?.state || stop.state || '';
        const zipToGeocode = locData?.zip || stop.zip || '';
        const radius = locData?.geofence_radius || 500;

        try {
          // Use geocode-location action (fast path - no Supabase needed in edge function)
          const { data: geoResult, error: geoError } = await supabase.functions.invoke('here-webhook', {
            body: {
              action: 'geocode-location',
              address: addressToGeocode,
              city: cityToGeocode,
              state: stateToGeocode,
              zip: zipToGeocode,
            },
          });

          if (currentLoadIdRef.current !== loadId || !isMountedRef.current) return;

          if (geoResult?.success && geoResult.latitude && geoResult.longitude) {
            // Update location directly from frontend (bypasses edge function Supabase client issues)
            const { error: updateError } = await supabase
              .from('locations')
              .update({
                latitude: geoResult.latitude,
                longitude: geoResult.longitude,
                geofence_radius: radius,
              })
              .eq('id', stop.location_id);

            if (currentLoadIdRef.current !== loadId || !isMountedRef.current) return;

            if (updateError) {
              console.warn(`Failed to save coordinates for location ${stop.location_id}:`, updateError.message);
              geocodeFailCount++;
            } else {
              geocodeSuccessCount++;
              console.log(`Geocoded & saved location ${stop.location_id}: ${geoResult.latitude}, ${geoResult.longitude}`);
            }
          } else {
            geocodeFailCount++;
            console.warn(`Geocode failed for stop ${stop.company_name || stop.city}:`, geoResult?.error || geoError?.message);
          }
        } catch (geoErr: any) {
          geocodeFailCount++;
          console.warn(`Geocode error for location ${stop.location_id}:`, geoErr.message);
        }
      }

      if (currentLoadIdRef.current !== loadId || !isMountedRef.current) return;

      // STEP 3: Create geofence records directly from frontend
      if (geocodeSuccessCount > 0) {
        // Deactivate any existing geofences for this load
        await supabase
          .from('here_geofences')
          .update({ status: 'inactive', updated_at: new Date().toISOString() })
          .eq('load_id', loadId);

        if (currentLoadIdRef.current !== loadId || !isMountedRef.current) return;

        let geofencesCreated = 0;
        const geofenceErrors: string[] = [];

        for (const stop of stops) {
          if (!stop.location_id) continue;

          // Get the freshly geocoded coordinates
          const { data: loc } = await supabase
            .from('locations')
            .select('latitude, longitude, geofence_radius')
            .eq('id', stop.location_id)
            .single();

          if (currentLoadIdRef.current !== loadId || !isMountedRef.current) return;

          if (loc?.latitude && loc?.longitude) {
            const gfName = `${stop.stop_type === 'pickup' ? 'Pickup' : 'Delivery'} - ${stop.company_name || stop.city || 'Stop'}`;
            const gfId = `gf_${loadId}_${stop.id}`.substring(0, 64);

            const { error: insertErr } = await supabase
              .from('here_geofences')
              .insert({
                load_id: loadId,
                stop_id: stop.id,
                location_id: stop.location_id,
                here_geofence_id: gfId,
                geofence_name: gfName,
                center_lat: loc.latitude,
                center_lng: loc.longitude,
                radius_meters: loc.geofence_radius || 500,
                status: 'active',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });

            if (currentLoadIdRef.current !== loadId || !isMountedRef.current) return;

            if (insertErr) {
              geofenceErrors.push(`${gfName}: ${insertErr.message}`);
            } else {
              geofencesCreated++;
            }
          }
        }

        // Enable tracking on the load
        await supabase.from('loads').update({ tracking_enabled: true }).eq('id', loadId);

        // Calculate total miles from geofence points
        const { data: activeGf } = await supabase
          .from('here_geofences')
          .select('center_lat, center_lng')
          .eq('load_id', loadId)
          .eq('status', 'active')
          .order('created_at');

        if (activeGf && activeGf.length >= 2) {
          let totalMeters = 0;
          for (let i = 0; i < activeGf.length - 1; i++) {
            const R = 6371000;
            const dLat = (activeGf[i + 1].center_lat - activeGf[i].center_lat) * Math.PI / 180;
            const dLon = (activeGf[i + 1].center_lng - activeGf[i].center_lng) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(activeGf[i].center_lat * Math.PI / 180) * Math.cos(activeGf[i + 1].center_lat * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
            totalMeters += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          }
          const totalMiles = Math.round((totalMeters / 1609.344) * 10) / 10;
          await supabase.from('loads').update({ total_miles: totalMiles }).eq('id', loadId);
        }

        if (currentLoadIdRef.current !== loadId || !isMountedRef.current) return;

        if (geofencesCreated > 0) {
          const msg = `${geocodeSuccessCount} location(s) geocoded, ${geofencesCreated} geofence(s) created successfully`;
          setGeofenceSetupResult(msg);
          await fetchGeofenceData(loadId);
        } else {
          setGeofenceSetupResult(geofenceErrors.join('; ') || 'Geocoded locations but failed to create geofence records');
        }
      } else if (geocodeFailCount > 0) {
        setGeofenceSetupResult(`Failed to geocode ${geocodeFailCount} location(s). Check that addresses are valid and complete.`);
      } else {
        setGeofenceSetupResult('No stops with valid addresses found to geocode.');
      }

      // Refresh location geofence status
      if (currentLoadIdRef.current === loadId && isMountedRef.current) {
        const { data: updatedStops } = await supabase
          .from('load_stops')
          .select('*')
          .eq('load_id', loadId)
          .order('stop_type')
          .order('stop_sequence');

        if (currentLoadIdRef.current === loadId && isMountedRef.current && updatedStops) {
          setStops(updatedStops);
          await checkLocationGeofenceStatus(updatedStops, loadId);
        }
      }

    } catch (err: any) {
      if (currentLoadIdRef.current === loadId && isMountedRef.current) {
        setGeofenceSetupResult(`Error: ${err.message}`);
      }
    } finally {
      if (currentLoadIdRef.current === loadId && isMountedRef.current) {
        setSettingUpGeofences(false);
      }
    }
  };



  const handleDelete = () => {
    if (load && onDelete) {
      onDelete(load);
    }
  };

  const handleResendSms = async () => {
    if (!load || !load.driver) return;
    setResendingSms(true);
    setResendSmsResult(null);

    try {
      // If no acceptance token exists, generate one
      let token = load.acceptance_token;
      if (!token) {
        token = Math.random().toString(36).substring(2) + Date.now().toString(36);
        await supabase.from('loads').update({ acceptance_token: token }).eq('id', load.id);
      }

      const acceptanceUrl = `${window.location.origin}/driver-portal?token=${token}`;

      const { data: smsData, error: smsError } = await supabase.functions.invoke('send-driver-sms', {
        body: {
          driverPhone: load.driver.phone,
          driverName: load.driver.name,
          loadNumber: load.load_number,
          origin: `${load.origin_city}, ${load.origin_state}`,
          destination: `${load.dest_city}, ${load.dest_state}`,
          acceptanceUrl,
          totalMiles: load.total_miles || null,
          pickupDate: load.pickup_date || null,
          deliveryDate: load.delivery_date || null,
        },
      });


      if (smsError) {
        setResendSmsResult({ success: false, message: `Failed: ${smsError.message}` });
      } else if (smsData && !smsData.success) {
        setResendSmsResult({ success: false, message: `Failed: ${smsData.error}` });
      } else {
        setResendSmsResult({ success: true, message: `SMS resent to ${load.driver.name} (${load.driver.phone})` });
      }
    } catch (err: any) {
      setResendSmsResult({ success: false, message: `Error: ${err.message}` });
    } finally {
      setResendingSms(false);
    }
  };

  const handleUnassignDriver = async () => {
    if (!load || !load.driver_id) return;
    setUnassigning(true);

    try {
      // Release the driver back to available
      await supabase
        .from('drivers')
        .update({ status: 'available' })
        .eq('id', load.driver_id);

      // Update the load - remove driver, clear token, set back to UNASSIGNED
      await supabase
        .from('loads')
        .update({
          driver_id: null,
          status: 'UNASSIGNED',
          acceptance_token: null,
          accepted_at: null,
        })
        .eq('id', load.id);

      // Deactivate geofences (fire-and-forget)
      supabase.functions.invoke('here-webhook', {
        body: { action: 'deactivate-load-geofences', load_id: load.id },
      }).catch((err) => {
        console.warn('Geofence deactivation failed (non-critical):', err);
      });

      console.log(`Unassigned driver ${load.driver?.name} from load ${load.load_number}`);

      // Refresh parent data and close
      if (onLoadUpdated) onLoadUpdated();
      onClose();
    } catch (error: any) {
      console.error('Error unassigning driver:', error);
      alert('Failed to unassign driver. Please try again.');
    } finally {
      setUnassigning(false);
      setShowUnassignConfirm(false);
    }
  };

  const handleReassignDriver = () => {
    if (!load || !onAssignDriver) return;
    onClose();
    // Small delay to let the details modal close before opening assign modal
    setTimeout(() => {
      onAssignDriver(load);
    }, 100);
  };

  // Generate invoice for DELIVERED loads
  const handleGenerateInvoiceFromDetails = async () => {
    if (!load) return;
    setGeneratingInvoice(true);
    try {
      const invoiceNumber = await generateNextInvoiceNumber();
      const totalAmount = Number(load.rate || 0) + Number(load.extra_stop_fee || 0) + Number(load.lumper_fee || 0);


      const { data: newInv, error } = await supabase.from('invoices').insert({
        invoice_number: invoiceNumber,
        load_id: load.id,
        amount: totalAmount,
        status: 'PENDING',
      }).select().single();

      if (error) {
        alert(`Failed to generate invoice: ${error.message}`);
        return;
      }

      await supabase.from('loads').update({ status: 'INVOICED' }).eq('id', load.id);

      if (load.driver_id) {
        await supabase.from('drivers').update({ status: 'available' }).eq('id', load.driver_id);
      }

      if (newInv) setInvoice(newInv);
      if (onLoadUpdated) onLoadUpdated();
    } catch (err: any) {
      alert(`Failed to generate invoice: ${err.message}`);
    } finally {
      setGeneratingInvoice(false);
    }
  };

  // Send invoice to customer email
  const handleSendInvoiceEmail = async () => {
    if (!load) return;
    
    // Check if customer is assigned to this load
    if (!load.customer_id) {
      setInvoiceEmailResult({ 
        success: false, 
        message: 'Cannot send invoice: No customer assigned to this load.' 
      });
      return;
    }

    // Set initial loading state for customer fetch
    setInvoiceEmailResult(null);

    try {
      // Fetch customer data to verify email exists
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('email, company_name')
        .eq('id', load.customer_id)
        .single();

      if (customerError || !customer) {
        setInvoiceEmailResult({ 
          success: false, 
          message: 'Cannot send invoice: Customer not found.' 
        });
        return;
      }

      if (!customer.email || customer.email.trim() === '') {
        setInvoiceEmailResult({ 
          success: false, 
          message: `Cannot send invoice: Customer "${customer.company_name}" has no email address. Please add an email to the customer profile first.` 
        });
        return;
      }

      // Basic email format validation
      if (!customer.email.includes('@')) {
        setInvoiceEmailResult({ 
          success: false, 
          message: `Cannot send invoice: Customer "${customer.company_name}" has an invalid email address. Please update the customer profile.` 
        });
        return;
      }

      // All validations passed, now set loading state and call the edge function
      setSendingInvoiceEmail(true);

      const { data, error } = await supabase.functions.invoke('send-invoice-email', {
        body: { load_id: load.id },
      });

      if (error) {
        setInvoiceEmailResult({ success: false, message: error.message || 'Failed to send invoice' });
      } else if (data?.success) {
        setInvoiceEmailResult({ 
          success: true, 
          message: data.message || `Invoice sent to ${data.emailed_to}` 
        });
        // Update local invoice state with email info
        if (invoice) {
          setInvoice({ ...invoice, emailed_at: data.emailed_at, emailed_to: data.emailed_to });
        }
      } else {
        setInvoiceEmailResult({ success: false, message: data?.error || 'Failed to send invoice' });
      }
    } catch (err: any) {
      setInvoiceEmailResult({ success: false, message: err.message || 'Failed to send invoice' });
    } finally {
      setSendingInvoiceEmail(false);
    }
  };

  if (!isOpen || !load) return null;


  const colors = statusColors[load.status] || statusColors.UNASSIGNED;
  const pickupStops = stops.filter(s => s.stop_type === 'pickup');
  const deliveryStops = stops.filter(s => s.stop_type === 'delivery');
  const activeGeofences = geofences.filter(g => g.status === 'active');
  const canUnassign = load.driver_id && ['DISPATCHED', 'IN_TRANSIT'].includes(load.status);
  const canReassign = load.driver_id && ['DISPATCHED', 'IN_TRANSIT'].includes(load.status);

  // Calculate how many stops have geocoded locations
  const geocodedStopCount = stops.filter(s => locationGeofenceStatus[s.id]).length;
  const totalStopCount = stops.length;
  const allStopsGeocoded = totalStopCount > 0 && geocodedStopCount === totalStopCount;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto m-4">
          {/* Header */}
          <div className="sticky top-0 bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
            <div>
              <h2 className="text-xl font-bold text-white">{load.load_number}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${colors.bg} ${colors.text}`}>
                  {statusLabels[load.status]}
                </span>
                {load.bol_number && (
                  <span className="text-xs text-slate-400">BOL: {load.bol_number}</span>
                )}
                {activeGeofences.length > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-500/20 text-cyan-300">
                    <Radar className="w-3 h-3" />
                    {activeGeofences.length} Geofence{activeGeofences.length !== 1 ? 's' : ''}
                  </span>
                )}
                {activeGeofences.length === 0 && allStopsGeocoded && totalStopCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300">
                    <CheckCircle className="w-3 h-3" />
                    Geofence Ready
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {onEdit && (
                <button
                  onClick={() => onEdit(load)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                  title="Edit Load"
                >
                  <Pencil className="w-5 h-5 text-white" />
                </button>
              )}

              {onDelete && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-2 hover:bg-red-500/30 rounded-lg transition-colors"
                  title="Delete Load"
                >
                  <Trash2 className="w-5 h-5 text-red-300" />
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>

          {/* Delete Confirmation */}
          {showDeleteConfirm && (
            <div className="bg-red-50 border-b border-red-200 px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-red-800">Delete this load?</p>
                  <p className="text-sm text-red-600">This action cannot be undone. All associated data will be permanently removed.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Delete Load
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Unassign Confirmation */}
          {showUnassignConfirm && (
            <div className="bg-amber-50 border-b border-amber-200 px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-amber-800">Unassign {load.driver?.name} from this load?</p>
                  <p className="text-sm text-amber-600">The driver will be released back to available status and the load will return to "Awaiting Dispatch".</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowUnassignConfirm(false)}
                    className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUnassignDriver}
                    disabled={unassigning}
                    className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {unassigning ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />Unassigning...</>
                    ) : (
                      <><UserMinus className="w-4 h-4" />Unassign Driver</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="p-6 space-y-6">
            {/* Stops Section */}
            {(pickupStops.length > 0 || deliveryStops.length > 0) ? (
              <div className="space-y-4">
                {/* Pickup Stops */}
                {pickupStops.length > 0 && (
                  <div className="bg-blue-50 rounded-xl p-5 border border-blue-200">
                    <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <Truck className="w-4 h-4" />
                      Shipper(s) - Pickup Location(s)
                    </h3>
                    <div className="space-y-3">
                      {pickupStops.map((stop, index) => {
                        const stopGeofence = geofences.find(g => g.stop_id === stop.id && g.status === 'active');
                        const locGeo = locationGeofenceStatus[stop.id];
                        return (
                          <div key={stop.id} className="bg-white rounded-lg p-3 border border-blue-100">
                            <div className="flex items-start gap-3">
                              <div className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                                {index + 1}
                              </div>
                              <div className="flex-1">
                                {stop.company_name && (
                                  <p className="font-semibold text-slate-800">{stop.company_name}</p>
                                )}
                                <p className="text-sm text-slate-600">
                                  {stop.address && `${stop.address}, `}{stop.city}, {stop.state} {stop.zip}
                                </p>
                                {stop.contact_name && (
                                  <p className="text-xs text-slate-500 mt-1">Contact: {stop.contact_name} {stop.contact_phone && `- ${stop.contact_phone}`}</p>
                                )}
                              </div>
                              {/* Geofence indicator */}
                              {stopGeofence ? (
                                <div className="flex items-center gap-1 px-2 py-1 bg-cyan-50 border border-cyan-200 rounded-lg" title={`Active geofence: ${stopGeofence.radius_meters}m radius`}>
                                  <Radar className="w-3.5 h-3.5 text-cyan-600" />
                                  <span className="text-xs font-medium text-cyan-700">{stopGeofence.radius_meters}m</span>
                                </div>
                              ) : locGeo ? (
                                <div className="flex items-center gap-1 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-lg" title={`Location geocoded: ${locGeo.radius}m radius`}>
                                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                  <span className="text-xs font-medium text-emerald-700">{locGeo.radius}m</span>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Delivery Stops */}
                {deliveryStops.length > 0 && (
                  <div className="bg-emerald-50 rounded-xl p-5 border border-emerald-200">
                    <h3 className="text-sm font-semibold text-emerald-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      Receiver(s) - Delivery Location(s)
                    </h3>
                    <div className="space-y-3">
                      {deliveryStops.map((stop, index) => {
                        const stopGeofence = geofences.find(g => g.stop_id === stop.id && g.status === 'active');
                        const locGeo = locationGeofenceStatus[stop.id];
                        return (
                          <div key={stop.id} className="bg-white rounded-lg p-3 border border-emerald-100">
                            <div className="flex items-start gap-3">
                              <div className="w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                                {index + 1}
                              </div>
                              <div className="flex-1">
                                {stop.company_name && (
                                  <p className="font-semibold text-slate-800">{stop.company_name}</p>
                                )}
                                <p className="text-sm text-slate-600">
                                  {stop.address && `${stop.address}, `}{stop.city}, {stop.state} {stop.zip}
                                </p>
                                {stop.contact_name && (
                                  <p className="text-xs text-slate-500 mt-1">Contact: {stop.contact_name} {stop.contact_phone && `- ${stop.contact_phone}`}</p>
                                )}
                              </div>
                              {/* Geofence indicator */}
                              {stopGeofence ? (
                                <div className="flex items-center gap-1 px-2 py-1 bg-cyan-50 border border-cyan-200 rounded-lg" title={`Active geofence: ${stopGeofence.radius_meters}m radius`}>
                                  <Radar className="w-3.5 h-3.5 text-cyan-600" />
                                  <span className="text-xs font-medium text-cyan-700">{stopGeofence.radius_meters}m</span>
                                </div>
                              ) : locGeo ? (
                                <div className="flex items-center gap-1 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-lg" title={`Location geocoded: ${locGeo.radius}m radius`}>
                                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                  <span className="text-xs font-medium text-emerald-700">{locGeo.radius}m</span>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Fallback to legacy route display */
              <div className="bg-slate-50 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Route</h3>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                      <span className="text-sm text-slate-500">Shipper (Pickup)</span>
                    </div>
                    <p className="text-lg font-semibold text-slate-800 ml-5">
                      {load.origin_address && <span className="text-sm text-slate-500 block">{load.origin_address}</span>}
                      {load.origin_city}, {load.origin_state}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </div>
                  <div className="flex-1 text-right">
                    <div className="flex items-center justify-end gap-2 mb-1">
                      <span className="text-sm text-slate-500">Receiver (Delivery)</span>
                      <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                    </div>
                    <p className="text-lg font-semibold text-slate-800 mr-5">
                      {load.dest_company && <span className="text-sm font-bold text-emerald-600 block">{load.dest_company}</span>}
                      {load.dest_address && <span className="text-sm text-slate-500 block">{load.dest_address}</span>}
                      {load.dest_city}, {load.dest_state}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* HERE Geofence Tracking Section */}
            <div className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-xl p-5 border border-cyan-200">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Radar className="w-5 h-5 text-cyan-600" />
                  <span className="font-semibold text-slate-700">HERE Geofence Tracking</span>
                </div>
                <div className="flex items-center gap-2">
                  {activeGeofences.length > 0 ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                      <Wifi className="w-3 h-3" />
                      Active ({activeGeofences.length})
                    </span>
                  ) : allStopsGeocoded && totalStopCount > 0 ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                      <CheckCircle className="w-3 h-3" />
                      Locations Ready
                    </span>
                  ) : totalStopCount > 0 ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                      <AlertTriangle className="w-3 h-3" />
                      {geocodedStopCount}/{totalStopCount} Geocoded
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                      <WifiOff className="w-3 h-3" />
                      No Stops
                    </span>
                  )}
                </div>
              </div>

              {activeGeofences.length > 0 ? (
                <div className="space-y-3">
                  {/* Geofence List */}
                  <div className="grid gap-2">
                    {activeGeofences.map((gf) => (
                      <div key={gf.id} className="flex items-center gap-3 p-2.5 bg-white rounded-lg border border-cyan-100">
                        <div className="w-8 h-8 rounded-full bg-cyan-100 flex items-center justify-center flex-shrink-0">
                          <Radar className="w-4 h-4 text-cyan-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate">{gf.geofence_name}</p>
                          <p className="text-xs text-slate-500">
                            {gf.center_lat?.toFixed(4)}, {gf.center_lng?.toFixed(4)} | {gf.radius_meters}m radius
                          </p>
                        </div>
                        <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      </div>
                    ))}
                  </div>

                  {/* Webhook Events */}
                  {webhookEvents.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                        <Activity className="w-3 h-3" />
                        Recent Webhook Events
                      </p>
                      <div className="space-y-1.5 max-h-32 overflow-y-auto">
                        {webhookEvents.slice(0, 10).map((evt) => (
                          <div key={evt.id} className="flex items-center gap-2 text-xs p-2 bg-white/80 rounded border border-slate-100">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              evt.event_type === 'INSIDE' || evt.event_type === 'INSIDE_GEOFENCE' 
                                ? 'bg-emerald-500' 
                                : evt.event_type === 'OUTSIDE' || evt.event_type === 'OUTSIDE_GEOFENCE'
                                ? 'bg-amber-500'
                                : 'bg-slate-400'
                            }`} />
                            <span className="font-medium text-slate-700">{evt.event_type}</span>
                            <span className="text-slate-400 ml-auto">
                              {new Date(evt.event_timestamp).toLocaleString('en-US', {
                                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
                              })}
                            </span>
                            {evt.processed && <ShieldCheck className="w-3 h-3 text-emerald-500" />}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-2 p-2.5 bg-blue-50 rounded-lg border border-blue-100">
                    <p className="text-xs text-blue-700 flex items-start gap-2">
                      <ShieldCheck className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                      <span>
                        HERE Tracking webhook is configured. Geofence events are automatically recorded when the driver's device enters or exits monitored areas. Timestamps are GPS-verified for invoice accuracy.
                      </span>
                    </p>
                  </div>
                </div>
              ) : allStopsGeocoded && totalStopCount > 0 ? (
                /* All locations are geocoded - geofences are ready */
                <div className="space-y-3">
                  <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-emerald-800">All locations are geocoded and geofence-ready</p>
                        <p className="text-xs text-emerald-600 mt-1">
                          All {totalStopCount} stop location(s) have GPS coordinates. Geofences will be automatically activated when a driver is assigned, or you can activate them now.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Show geocoded locations */}
                  <div className="grid gap-2">
                    {stops.map((stop) => {
                      const locGeo = locationGeofenceStatus[stop.id];
                      if (!locGeo) return null;
                      return (
                        <div key={stop.id} className="flex items-center gap-3 p-2.5 bg-white rounded-lg border border-emerald-100">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                            stop.stop_type === 'pickup' ? 'bg-blue-100' : 'bg-emerald-100'
                          }`}>
                            {stop.stop_type === 'pickup' ? (
                              <Truck className="w-4 h-4 text-blue-600" />
                            ) : (
                              <Package className="w-4 h-4 text-emerald-600" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-700 truncate">
                              {stop.stop_type === 'pickup' ? 'Pickup' : 'Delivery'} - {stop.company_name || stop.city}
                            </p>
                            <p className="text-xs text-slate-500">
                              {locGeo.lat.toFixed(4)}, {locGeo.lng.toFixed(4)} | {locGeo.radius}m radius
                            </p>
                          </div>
                          <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        </div>
                      );
                    })}
                  </div>

                  {/* Activate button - only if no active geofences yet */}
                  <button
                    onClick={handleSetupGeofences}
                    disabled={settingUpGeofences}
                    className="w-full px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-xl font-medium hover:from-cyan-700 hover:to-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                  >
                    {settingUpGeofences ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Activating Geofences...
                      </>
                    ) : (
                      <>
                        <Radar className="w-4 h-4" />
                        Activate Geofences Now
                      </>
                    )}
                  </button>

                  {geofenceSetupResult && (
                    <p className={`text-sm font-medium text-center ${
                      geofenceSetupResult.includes('Failed') || geofenceSetupResult.includes('Error')
                        ? 'text-red-600'
                        : 'text-emerald-600'
                    }`}>
                      {geofenceSetupResult}
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center py-4">
                  {stops.length === 0 ? (
                    <>
                      <p className="text-sm text-slate-600 mb-3">
                        To set up geofence tracking, you need to first configure pickup and delivery stops for this load.
                      </p>
                      <p className="text-xs text-amber-600 mb-4 flex items-center justify-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Click "Edit Load" below to add shipper/receiver addresses.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-slate-600 mb-2">
                        {geocodedStopCount > 0 
                          ? `${geocodedStopCount} of ${totalStopCount} stop locations are geocoded.`
                          : 'Stop locations need to be geocoded for geofencing.'
                        }
                      </p>
                      <p className="text-xs text-slate-500 mb-4">
                        Go to <strong>Locations</strong> to geocode your shippers/receivers, or click below to geocode and activate geofences for this load.
                      </p>
                      <button
                        onClick={handleSetupGeofences}
                        disabled={settingUpGeofences}
                        className="px-6 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-xl font-medium hover:from-cyan-700 hover:to-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 mx-auto"
                      >
                        {settingUpGeofences ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Setting Up Geofences...
                          </>
                        ) : (
                          <>
                            <Radar className="w-4 h-4" />
                            Geocode & Setup Geofences
                          </>
                        )}
                      </button>
                    </>
                  )}
                  {geofenceSetupResult && (
                    <p className={`mt-3 text-sm font-medium ${
                      geofenceSetupResult.includes('Failed') || geofenceSetupResult.includes('Error') || geofenceSetupResult.includes('not found')
                        ? 'text-red-600'
                        : 'text-emerald-600'
                    }`}>
                      {geofenceSetupResult}
                    </p>
                  )}
                </div>
              )}
            </div>


            {/* Details Grid */}
            <div className="grid grid-cols-2 gap-4">
              {/* Schedule */}
              <div className="bg-slate-50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="w-5 h-5 text-purple-500" />
                  <span className="font-semibold text-slate-700">Schedule</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Pickup</span>
                    <span className="font-medium text-slate-800">
                      {new Date(load.pickup_date).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Delivery</span>
                    <span className="font-medium text-slate-800">
                      {new Date(load.delivery_date).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Cargo */}
              <div className="bg-slate-50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Package className="w-5 h-5 text-amber-500" />
                  <span className="font-semibold text-slate-700">Cargo</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Description</span>
                    <span className="font-medium text-slate-800">
                      {load.cargo_description || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Weight</span>
                    <span className="font-medium text-slate-800">
                      {load.weight ? `${load.weight.toLocaleString()} lbs` : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Driver */}
              <div className="bg-slate-50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <User className="w-5 h-5 text-indigo-500" />
                  <span className="font-semibold text-slate-700">Driver</span>
                </div>
                {load.driver ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Name</span>
                      <span className="font-medium text-slate-800">{load.driver.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Truck</span>
                      <span className="font-medium text-slate-800">{load.driver.truck_number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Phone</span>
                      <span className="font-medium text-slate-800">{load.driver.phone}</span>
                    </div>
                    {/* Resend SMS Button */}
                    {['DISPATCHED', 'IN_TRANSIT'].includes(load.status) && (
                      <div className="pt-2">
                        <button
                          onClick={handleResendSms}
                          disabled={resendingSms}
                          className="w-full px-3 py-2 bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg font-medium text-xs hover:bg-indigo-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                        >
                          {resendingSms ? (
                            <><Loader2 className="w-3.5 h-3.5 animate-spin" />Sending...</>
                          ) : (
                            <><Send className="w-3.5 h-3.5" />Resend Dispatch SMS</>
                          )}
                        </button>
                        {resendSmsResult && (
                          <p className={`mt-1.5 text-xs font-medium ${resendSmsResult.success ? 'text-emerald-600' : 'text-red-600'}`}>
                            {resendSmsResult.message}
                          </p>
                        )}
                      </div>
                    )}
                    {/* Unassign / Reassign Buttons */}
                    {canUnassign && (
                      <div className="pt-2 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => setShowUnassignConfirm(true)}
                            className="px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg font-medium text-xs hover:bg-red-100 transition-colors flex items-center justify-center gap-1.5"
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                            Unassign
                          </button>
                          {onAssignDriver && (
                            <button
                              onClick={handleReassignDriver}
                              className="px-3 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg font-medium text-xs hover:bg-amber-100 transition-colors flex items-center justify-center gap-1.5"
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                              Reassign
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-slate-500 mb-3">Not assigned</p>
                    {onAssignDriver && load.status === 'UNASSIGNED' && (
                      <button
                        onClick={() => {
                          onClose();
                          setTimeout(() => onAssignDriver(load), 100);
                        }}
                        className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg font-medium text-xs hover:bg-blue-700 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Assign Driver
                      </button>
                    )}
                  </div>
                )}
              </div>


              {/* Rate */}
              <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl p-4 border border-emerald-200">
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign className="w-5 h-5 text-emerald-600" />
                  <span className="font-semibold text-slate-700">Rate</span>
                </div>
                <p className="text-2xl font-bold text-emerald-600">
                  ${load.rate?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            {/* Timeline */}
            <div className="bg-slate-50 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-slate-500" />
                <span className="font-semibold text-slate-700">Timeline</span>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  <span className="text-slate-500">Created:</span>
                  <span className="font-medium text-slate-800">
                    {new Date(load.created_at).toLocaleString()}
                  </span>
                </div>
                {load.accepted_at && (
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                    <span className="text-slate-500">Accepted:</span>
                    <span className="font-medium text-slate-800">
                      {new Date(load.accepted_at).toLocaleString()}
                    </span>
                  </div>
                )}
                {load.delivered_at && (
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                    <span className="text-slate-500">Delivered:</span>
                    <span className="font-medium text-slate-800">
                      {new Date(load.delivered_at).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* POD Documents */}
            {documents.length > 0 && (
              <div className="bg-slate-50 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="w-5 h-5 text-blue-500" />
                  <span className="font-semibold text-slate-700">POD Documents</span>
                  <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                    {documents.length} file{documents.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <a
                      key={doc.id}
                      href={doc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-slate-400" />
                        <span className="text-sm font-medium text-slate-700">{doc.file_name}</span>
                      </div>
                      <Download className="w-4 h-4 text-slate-400" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Invoice & Billing Section */}
            {(load.status === 'DELIVERED' || load.status === 'INVOICED' || load.status === 'PAID') && (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-purple-600" />
                  Invoice & Billing
                </h3>

                {/* No invoice yet - show Generate button */}
                {!invoice && load.status === 'DELIVERED' && (
                  <div className="text-center py-4">
                    <p className="text-sm text-slate-500 mb-3">No invoice generated yet. Review POD documents above, then generate an invoice.</p>
                    <button
                      onClick={handleGenerateInvoiceFromDetails}
                      disabled={generatingInvoice}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm font-medium"
                    >
                      {generatingInvoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                      {generatingInvoice ? 'Generating...' : 'Generate Invoice'}
                    </button>
                  </div>
                )}

                {/* Invoice exists */}
                {invoice && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-sm text-slate-500">Invoice #{invoice.invoice_number}</p>
                        <p className="text-sm text-slate-500">
                          Created: {new Date(invoice.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <p className="text-xl font-bold text-slate-800">
                        ${Number(invoice.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                    </div>

                    {/* Email status */}
                    {invoice.emailed_at && (
                      <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                        <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                        <p className="text-xs text-green-700">
                          Sent to <span className="font-medium">{invoice.emailed_to}</span> on {new Date(invoice.emailed_at).toLocaleString()}
                        </p>
                      </div>
                    )}

                    {/* Email result feedback */}
                    {invoiceEmailResult && (
                      <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-lg border ${invoiceEmailResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                        {invoiceEmailResult.success ? <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />}
                        <p className={`text-xs ${invoiceEmailResult.success ? 'text-green-700' : 'text-red-700'}`}>{invoiceEmailResult.message}</p>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setShowInvoicePreview(true)}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors border border-purple-200"
                      >
                        <Eye className="w-4 h-4" />
                        Preview Invoice
                      </button>
                      <button
                        onClick={handleSendInvoiceEmail}
                        disabled={sendingInvoiceEmail}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {sendingInvoiceEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                        {sendingInvoiceEmail ? 'Sending...' : invoice.emailed_at ? 'Resend to Customer' : 'Send to Customer'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              {onEdit && (
                <button
                  onClick={() => onEdit(load)}
                  className="flex-1 px-6 py-3 text-amber-700 bg-amber-100 border border-amber-200 rounded-xl font-medium hover:bg-amber-200 transition-colors flex items-center justify-center gap-2"
                >
                  <Pencil className="w-4 h-4" />
                  Edit Load
                </button>
              )}
              <button
                onClick={onClose}
                className="flex-1 px-6 py-3 text-slate-600 bg-white border border-slate-200 rounded-xl font-medium hover:bg-slate-50 transition-colors"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      </div>


      {/* Invoice Preview Modal */}
      <InvoicePreviewModal
        isOpen={showInvoicePreview}
        load={load}
        invoice={invoice}
        onClose={() => setShowInvoicePreview(false)}
        onPodReuploadRequested={() => {
          setShowInvoicePreview(false);
          fetchDetails();
          if (onLoadUpdated) onLoadUpdated();
        }}
      />

    </>
  );
};

export default LoadDetailsModal;
