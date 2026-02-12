import React, { useState, useEffect, useRef } from 'react';
import { X, MapPin, Calendar, Package, DollarSign, Loader2, Hash, Building2, ChevronDown, Plus, Trash2, Truck, AlertTriangle, Lock, ShieldAlert } from 'lucide-react';
import { supabase, supabaseUrl, supabaseKey } from '@/lib/supabase';
import { Customer, Location } from '@/types/tms';

interface CreateLoadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadCreated: () => void;
}


interface StopData {
  id: string;
  location_id: string;
  company_name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  contact_name: string;
  contact_phone: string;
  instructions: string;
}

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

const emptyStop = (): StopData => ({
  id: crypto.randomUUID(),
  location_id: '',
  company_name: '',
  address: '',
  city: '',
  state: 'TX',
  zip: '',
  contact_name: '',
  contact_phone: '',
  instructions: '',
});

const OVERRIDE_CODE = '1159';

const CreateLoadModal: React.FC<CreateLoadModalProps> = ({ isOpen, onClose, onLoadCreated }) => {
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [shippers, setShippers] = useState<Location[]>([]);
  const [receivers, setReceivers] = useState<Location[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [totalRate, setTotalRate] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const submitInProgress = useRef(false);

  // Override dialog state
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const [overrideCode, setOverrideCode] = useState('');
  const [overrideError, setOverrideError] = useState('');
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [duplicateLoadId, setDuplicateLoadId] = useState<string | null>(null);
  const [pendingFormData, setPendingFormData] = useState<any>(null);
  const overrideInputRef = useRef<HTMLInputElement>(null);
  
  // Multiple stops
  const [pickupStops, setPickupStops] = useState<StopData[]>([emptyStop()]);
  const [deliveryStops, setDeliveryStops] = useState<StopData[]>([emptyStop()]);
  
  const [formData, setFormData] = useState({
    load_number: '',
    customer_id: '',
    pickup_date: '',
    delivery_date: '',
    cargo_description: '',
    weight: '',
    manual_rate: '',
  });

  useEffect(() => {
    if (isOpen) {
      fetchCustomers();
      fetchLocations();
      setErrorMessage('');
    }
  }, [isOpen]);

  // Focus the override input when dialog opens
  useEffect(() => {
    if (showOverrideDialog && overrideInputRef.current) {
      setTimeout(() => overrideInputRef.current?.focus(), 100);
    }
  }, [showOverrideDialog]);

  useEffect(() => {
    let total = 0;
    deliveryStops.forEach(stop => {
      if (stop.location_id) {
        const receiver = receivers.find(r => r.id === stop.location_id);
        if (receiver?.rate) {
          total += receiver.rate;
        }
      }
    });
    setTotalRate(total);
  }, [deliveryStops, receivers]);

  const fetchCustomers = async () => {
    const { data } = await supabase.from('customers').select('*').order('company_name');
    if (data) setCustomers(data);
  };

  const fetchLocations = async () => {
    const { data } = await supabase.from('locations').select('*').order('company_name');
    if (data) {
      setShippers(data.filter(l => l.location_type === 'shipper'));
      setReceivers(data.filter(l => l.location_type === 'receiver'));
    }
  };

  const handleCustomerChange = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    setSelectedCustomer(customer || null);
    setFormData(prev => ({
      ...prev,
      customer_id: customerId,
    }));
  };

  const handleShipperChange = (index: number, locationId: string) => {
    const shipper = shippers.find(s => s.id === locationId);
    setPickupStops(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        location_id: locationId,
        company_name: shipper?.company_name || '',
        address: shipper?.address || '',
        city: shipper?.city || '',
        state: shipper?.state || 'TX',
        zip: shipper?.zip || '',
        contact_name: shipper?.contact_name || '',
        contact_phone: shipper?.contact_phone || '',
        instructions: shipper?.instructions || '',
      };
      return updated;
    });
  };

  const handleReceiverChange = (index: number, locationId: string) => {
    const receiver = receivers.find(r => r.id === locationId);
    setDeliveryStops(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        location_id: locationId,
        company_name: receiver?.company_name || '',
        address: receiver?.address || '',
        city: receiver?.city || '',
        state: receiver?.state || 'TX',
        zip: receiver?.zip || '',
        contact_name: receiver?.contact_name || '',
        contact_phone: receiver?.contact_phone || '',
        instructions: receiver?.instructions || '',
      };
      return updated;
    });
  };

  const addPickupStop = () => {
    setPickupStops(prev => [...prev, emptyStop()]);
  };

  const removePickupStop = (index: number) => {
    if (pickupStops.length > 1) {
      setPickupStops(prev => prev.filter((_, i) => i !== index));
    }
  };

  const addDeliveryStop = () => {
    setDeliveryStops(prev => [...prev, emptyStop()]);
  };

  const removeDeliveryStop = (index: number) => {
    if (deliveryStops.length > 1) {
      setDeliveryStops(prev => prev.filter((_, i) => i !== index));
    }
  };

  /** Build the load insert payload */
  const buildLoadPayload = () => {
    const firstPickup = pickupStops[0];
    const firstDelivery = deliveryStops[0];
    const finalRate = formData.manual_rate ? parseFloat(formData.manual_rate) : totalRate;

    return {
      load_number: formData.load_number.trim(),
      customer_id: formData.customer_id || null,
      origin_address: firstPickup.address,
      origin_city: firstPickup.city,
      origin_state: firstPickup.state,
      dest_company: firstDelivery.company_name,
      dest_address: firstDelivery.address,
      dest_city: firstDelivery.city,
      dest_state: firstDelivery.state,
      pickup_date: formData.pickup_date,
      delivery_date: formData.delivery_date,
      cargo_description: formData.cargo_description,
      weight: parseFloat(formData.weight) || null,
      rate: finalRate,
      status: 'UNASSIGNED',
    };
  };

  /** Insert the load + stops + geofences */
  const insertLoad = async () => {
    const payload = buildLoadPayload();

    const { data: loadData, error: loadError } = await supabase.from('loads').insert(payload).select().single();
    if (loadError) throw loadError;

    // Insert all stops
    const stopsToInsert = [
      ...pickupStops.map((stop, index) => ({
        load_id: loadData.id,
        location_id: stop.location_id || null,
        stop_type: 'pickup',
        stop_sequence: index + 1,
        company_name: stop.company_name,
        address: stop.address,
        city: stop.city,
        state: stop.state,
        zip: stop.zip,
        contact_name: stop.contact_name,
        contact_phone: stop.contact_phone,
        instructions: stop.instructions,
      })),
      ...deliveryStops.map((stop, index) => ({
        load_id: loadData.id,
        location_id: stop.location_id || null,
        stop_type: 'delivery',
        stop_sequence: index + 1,
        company_name: stop.company_name,
        address: stop.address,
        city: stop.city,
        state: stop.state,
        zip: stop.zip,
        contact_name: stop.contact_name,
        contact_phone: stop.contact_phone,
        instructions: stop.instructions,
      })),
    ];

    await supabase.from('load_stops').insert(stopsToInsert);

    // Auto-setup geofences (fire-and-forget)
    if (loadData?.id) {
      supabase.functions.invoke('here-webhook', {
        body: { action: 'auto-setup-geofences', load_id: loadData.id },
      }).then(({ data: geoData }) => {
        if (geoData?.success) {
          console.log(`Auto-geofences: ${geoData.geofences_created} created for load ${payload.load_number}`);
        }
      }).catch((err) => {
        console.warn('Auto-geofence setup failed (non-critical):', err);
      });
    }

    return loadData;
  };

  /** Delete a load and all its related records using direct REST API calls */
  const deleteLoadDirect = async (loadId: string, driverId?: string | null) => {
    const headers = {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
    };

    // Delete related records first (same pattern as handleDeleteLoad in AppLayout)
    await fetch(`${supabaseUrl}/rest/v1/payments?load_id=eq.${loadId}`, { method: 'DELETE', headers });
    await fetch(`${supabaseUrl}/rest/v1/load_stops?load_id=eq.${loadId}`, { method: 'DELETE', headers });
    await fetch(`${supabaseUrl}/rest/v1/pod_documents?load_id=eq.${loadId}`, { method: 'DELETE', headers });
    await fetch(`${supabaseUrl}/rest/v1/invoices?load_id=eq.${loadId}`, { method: 'DELETE', headers });

    const loadResponse = await fetch(`${supabaseUrl}/rest/v1/loads?id=eq.${loadId}`, { method: 'DELETE', headers });

    if (!loadResponse.ok) {
      const errorText = await loadResponse.text();
      throw new Error(`Failed to delete existing load: ${errorText}`);
    }

    // Release the driver if one was assigned
    if (driverId) {
      await supabase.from('drivers').update({ status: 'available' }).eq('id', driverId);
    }
  };

  /** Show the override dialog for a duplicate load number */
  const showDuplicateOverride = (existingLoadId: string) => {
    setDuplicateLoadId(existingLoadId);
    setShowOverrideDialog(true);
    setOverrideCode('');
    setOverrideError('');
    setLoading(false);
    submitInProgress.current = false;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (submitInProgress.current || loading) return;
    submitInProgress.current = true;
    setLoading(true);
    setErrorMessage('');

    try {
      const trimmedLoadNumber = formData.load_number.trim();
      
      if (!trimmedLoadNumber) {
        setErrorMessage('Load number is required.');
        setLoading(false);
        submitInProgress.current = false;
        return;
      }

      // Pre-check: does this load number already exist?
      // Wrapped in its own try/catch so query failures don't prevent the insert attempt
      let existingLoadId: string | null = null;
      try {
        const { data: existing, error: checkError } = await supabase
          .from('loads')
          .select('id, driver_id')
          .eq('load_number', trimmedLoadNumber)
          .maybeSingle();

        if (checkError) {
          console.warn('Pre-check query error (proceeding with insert):', checkError.message);
        } else if (existing) {
          // Duplicate found — show override dialog
          showDuplicateOverride(existing.id);
          return;
        }
      } catch (preCheckErr) {
        console.warn('Pre-check failed (proceeding with insert):', preCheckErr);
      }

      // No duplicate found — insert normally
      await insertLoad();

      onLoadCreated();
      onClose();
      resetForm();

    } catch (error: any) {
      console.error('Error creating load:', error);
      
      // Check if this is a duplicate key error (race condition or pre-check missed it)
      const errMsg = (error?.message || '').toLowerCase();
      const errCode = error?.code || '';
      const isDuplicate = errCode === '23505' 
        || errMsg.includes('duplicate key')
        || errMsg.includes('already exists')
        || errMsg.includes('unique constraint')
        || errMsg.includes('violates unique');

      if (isDuplicate) {
        // Look up the existing load id for override
        try {
          const { data: existing } = await supabase
            .from('loads')
            .select('id')
            .eq('load_number', formData.load_number.trim())
            .maybeSingle();
          
          if (existing) {
            showDuplicateOverride(existing.id);
            return;
          }
        } catch { /* fall through to generic error */ }
        
        setErrorMessage('This load number already exists. Please try again or use a different number.');
      } else {
        setErrorMessage(error?.message || 'Failed to create load. Please try again.');
      }
    } finally {
      // Only reset loading if we're NOT showing the override dialog
      if (!showOverrideDialog) {
        setLoading(false);
        submitInProgress.current = false;
      }
    }
  };

  /** Handle override submission — delete old load, insert new one */
  const handleOverrideSubmit = async () => {
    if (overrideCode !== OVERRIDE_CODE) {
      setOverrideError('Incorrect override code. Please try again.');
      setOverrideCode('');
      return;
    }

    if (!duplicateLoadId) {
      setOverrideError('Could not find the existing load to replace.');
      return;
    }

    setOverrideLoading(true);
    setOverrideError('');

    try {
      // Get the existing load's driver_id so we can release them
      let existingDriverId: string | null = null;
      try {
        const { data: existingLoad } = await supabase
          .from('loads')
          .select('driver_id')
          .eq('id', duplicateLoadId)
          .single();
        existingDriverId = existingLoad?.driver_id || null;
      } catch { /* non-critical */ }

      // Delete the existing load using direct REST API calls (same pattern as admin delete)
      await deleteLoadDirect(duplicateLoadId, existingDriverId);

      // Now insert the new load
      await insertLoad();

      // Success — close everything
      setShowOverrideDialog(false);
      setDuplicateLoadId(null);
      onLoadCreated();
      onClose();
      resetForm();

    } catch (error: any) {
      console.error('Override error:', error);
      setOverrideError(error?.message || 'Failed to replace load. Please try again.');
    } finally {
      setOverrideLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      load_number: '',
      customer_id: '',
      pickup_date: '',
      delivery_date: '',
      cargo_description: '',
      weight: '',
      manual_rate: '',
    });
    setSelectedCustomer(null);
    setPickupStops([emptyStop()]);
    setDeliveryStops([emptyStop()]);
    setTotalRate(0);
    setErrorMessage('');
    setShowOverrideDialog(false);
    setOverrideCode('');
    setOverrideError('');
    setDuplicateLoadId(null);
    setPendingFormData(null);
    submitInProgress.current = false;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto m-4">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <h2 className="text-xl font-bold text-white">Create New Load</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* General Error Banner */}
          {errorMessage && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">Error Creating Load</p>
                <p className="text-sm text-red-600 mt-0.5">{errorMessage}</p>
              </div>
              <button type="button" onClick={() => setErrorMessage('')} className="ml-auto p-1 hover:bg-red-100 rounded">
                <X className="w-4 h-4 text-red-400" />
              </button>
            </div>
          )}

          {/* Load Number */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-slate-700">
              <Hash className="w-5 h-5 text-indigo-500" />
              <span className="font-semibold">Load Number</span>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Load/BOL Number *</label>
              <input
                type="text"
                required
                value={formData.load_number}
                onChange={(e) => {
                  setFormData({ ...formData, load_number: e.target.value });
                  setErrorMessage('');
                }}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                placeholder="Enter load or BOL number"
              />
            </div>
          </div>

          {/* Customer Selection */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-slate-700">
              <Building2 className="w-5 h-5 text-purple-500" />
              <span className="font-semibold">Customer (Bill To)</span>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Select Customer</label>
              <div className="relative">
                <select
                  value={formData.customer_id}
                  onChange={(e) => handleCustomerChange(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all appearance-none bg-white"
                >
                  <option value="">-- Select a Customer --</option>
                  {customers.map(customer => (
                    <option key={customer.id} value={customer.id}>
                      {customer.company_name} {customer.contact_name ? `(${customer.contact_name})` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
              </div>
              {selectedCustomer && (
                <div className="mt-2 p-3 bg-purple-50 border border-purple-200 rounded-lg text-sm">
                  <p className="font-medium text-purple-800">{selectedCustomer.company_name}</p>
                  {selectedCustomer.contact_name && <p className="text-purple-600">{selectedCustomer.contact_name}</p>}
                  {selectedCustomer.phone && <p className="text-purple-600">{selectedCustomer.phone}</p>}
                  <p className="text-purple-500 text-xs mt-1">This customer will be billed for this load</p>
                </div>
              )}
            </div>
          </div>

          {/* Shippers (Pickup Locations) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-700">
                <Truck className="w-5 h-5 text-blue-500" />
                <span className="font-semibold">Shipper(s) - Pickup Location(s)</span>
              </div>
              <button
                type="button"
                onClick={addPickupStop}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Pickup
              </button>
            </div>

            {pickupStops.map((stop, index) => (
              <div key={stop.id} className="border border-blue-200 rounded-xl p-4 bg-blue-50/50">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-blue-700">Pickup #{index + 1}</span>
                  {pickupStops.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePickupStop(index)}
                      className="p-1.5 text-red-500 hover:bg-red-100 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Select Shipper</label>
                    <div className="relative">
                      <select
                        value={stop.location_id}
                        onChange={(e) => handleShipperChange(index, e.target.value)}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all appearance-none bg-white"
                      >
                        <option value="">-- Select a Shipper or Enter Manually --</option>
                        {shippers.map(shipper => (
                          <option key={shipper.id} value={shipper.id}>
                            {shipper.company_name} - {shipper.city}, {shipper.state}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-slate-600 mb-1">Company Name</label>
                      <input
                        type="text"
                        value={stop.company_name}
                        onChange={(e) => {
                          const updated = [...pickupStops];
                          updated[index].company_name = e.target.value;
                          setPickupStops(updated);
                        }}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                        placeholder="Shipper company name"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-slate-600 mb-1">Address</label>
                      <input
                        type="text"
                        value={stop.address}
                        onChange={(e) => {
                          const updated = [...pickupStops];
                          updated[index].address = e.target.value;
                          setPickupStops(updated);
                        }}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                        placeholder="123 Main Street"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-1">City *</label>
                      <input
                        type="text"
                        required={index === 0}
                        value={stop.city}
                        onChange={(e) => {
                          const updated = [...pickupStops];
                          updated[index].city = e.target.value;
                          setPickupStops(updated);
                        }}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                        placeholder="Dallas"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-1">State *</label>
                      <select
                        required={index === 0}
                        value={stop.state}
                        onChange={(e) => {
                          const updated = [...pickupStops];
                          updated[index].state = e.target.value;
                          setPickupStops(updated);
                        }}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      >
                        {US_STATES.map(state => (
                          <option key={state} value={state}>{state}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {stop.instructions && (
                    <div className="p-2 bg-blue-100 border border-blue-200 rounded-lg">
                      <p className="text-xs font-medium text-blue-700 mb-0.5">Pickup Instructions:</p>
                      <p className="text-xs text-blue-600">{stop.instructions}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Receivers (Delivery Locations) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-700">
                <Package className="w-5 h-5 text-emerald-500" />
                <span className="font-semibold">Receiver(s) - Delivery Location(s)</span>
              </div>
              <button
                type="button"
                onClick={addDeliveryStop}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Drop-off
              </button>
            </div>

            {deliveryStops.map((stop, index) => {
              const selectedReceiver = receivers.find(r => r.id === stop.location_id);
              return (
                <div key={stop.id} className="border border-emerald-200 rounded-xl p-4 bg-emerald-50/50">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-emerald-700">Delivery #{index + 1}</span>
                      {selectedReceiver?.rate && (
                        <span className="px-2 py-0.5 bg-emerald-200 text-emerald-800 text-xs font-medium rounded-full">
                          ${selectedReceiver.rate.toLocaleString()}
                        </span>
                      )}
                    </div>
                    {deliveryStops.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeDeliveryStop(index)}
                        className="p-1.5 text-red-500 hover:bg-red-100 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-1">Select Receiver</label>
                      <div className="relative">
                        <select
                          value={stop.location_id}
                          onChange={(e) => handleReceiverChange(index, e.target.value)}
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all appearance-none bg-white"
                        >
                          <option value="">-- Select a Receiver or Enter Manually --</option>
                          {receivers.map(receiver => (
                            <option key={receiver.id} value={receiver.id}>
                              {receiver.company_name} - {receiver.city}, {receiver.state} {receiver.rate ? `($${receiver.rate.toLocaleString()})` : ''}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-slate-600 mb-1">Company Name</label>
                        <input
                          type="text"
                          value={stop.company_name}
                          onChange={(e) => {
                            const updated = [...deliveryStops];
                            updated[index].company_name = e.target.value;
                            setDeliveryStops(updated);
                          }}
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                          placeholder="Receiver company name"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-slate-600 mb-1">Address</label>
                        <input
                          type="text"
                          value={stop.address}
                          onChange={(e) => {
                            const updated = [...deliveryStops];
                            updated[index].address = e.target.value;
                            setDeliveryStops(updated);
                          }}
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                          placeholder="456 Industrial Blvd"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-600 mb-1">City *</label>
                        <input
                          type="text"
                          required={index === 0}
                          value={stop.city}
                          onChange={(e) => {
                            const updated = [...deliveryStops];
                            updated[index].city = e.target.value;
                            setDeliveryStops(updated);
                          }}
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                          placeholder="Los Angeles"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-600 mb-1">State *</label>
                        <select
                          required={index === 0}
                          value={stop.state}
                          onChange={(e) => {
                            const updated = [...deliveryStops];
                            updated[index].state = e.target.value;
                            setDeliveryStops(updated);
                          }}
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                        >
                          {US_STATES.map(state => (
                            <option key={state} value={state}>{state}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {stop.instructions && (
                      <div className="p-2 bg-amber-100 border border-amber-200 rounded-lg">
                        <p className="text-xs font-medium text-amber-700 mb-0.5">Delivery Instructions:</p>
                        <p className="text-xs text-amber-600">{stop.instructions}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Dates */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-slate-700">
              <Calendar className="w-5 h-5 text-purple-500" />
              <span className="font-semibold">Schedule</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Pickup Date *</label>
                <input
                  type="date"
                  required
                  value={formData.pickup_date}
                  onChange={(e) => setFormData({ ...formData, pickup_date: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Delivery Date *</label>
                <input
                  type="date"
                  required
                  value={formData.delivery_date}
                  onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Cargo Details */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-slate-700">
              <Package className="w-5 h-5 text-amber-500" />
              <span className="font-semibold">Cargo Details</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-medium text-slate-600 mb-1">Description</label>
                <input
                  type="text"
                  value={formData.cargo_description}
                  onChange={(e) => setFormData({ ...formData, cargo_description: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  placeholder="Electronics, Furniture, etc."
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-medium text-slate-600 mb-1">Weight (lbs)</label>
                <input
                  type="number"
                  value={formData.weight}
                  onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  placeholder="15000"
                />
              </div>
            </div>
          </div>

          {/* Rate Summary */}
          <div className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-600" />
                <span className="font-semibold text-slate-700">Load Rate</span>
              </div>
              {totalRate > 0 && (
                <span className="text-2xl font-bold text-emerald-600">
                  ${totalRate.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">
                {totalRate > 0 ? 'Override Rate (optional)' : 'Enter Rate'}
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.manual_rate}
                onChange={(e) => setFormData({ ...formData, manual_rate: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                placeholder={totalRate > 0 ? `Auto-calculated: $${totalRate.toLocaleString()}` : 'Enter load rate'}
              />
              {totalRate > 0 && (
                <p className="text-xs text-slate-500 mt-1">
                  Rate auto-calculated from selected receiver(s). Enter a value above to override.
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 text-slate-600 bg-slate-100 rounded-xl font-medium hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 text-white bg-blue-600 rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Load'
              )}
            </button>
          </div>
        </form>
      </div>

      {/* ===== OVERRIDE PASSWORD DIALOG ===== */}
      {showOverrideDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md m-4 overflow-hidden">
            {/* Dialog Header */}
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4 flex items-center gap-3">
              <ShieldAlert className="w-6 h-6 text-white" />
              <h3 className="text-lg font-bold text-white">Duplicate Load Number</h3>
            </div>

            <div className="p-6 space-y-4">
              {/* Warning message */}
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">
                    Load number "{formData.load_number.trim()}" already exists.
                  </p>
                  <p className="text-sm text-amber-700 mt-1">
                    The existing load and all its associated data (invoices, payments, PODs, stops) will be permanently deleted and replaced with this new load.
                  </p>
                </div>
              </div>

              {/* Override code input */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Enter 4-digit override code to continue:
                </label>
                <div className="flex items-center gap-2">
                  <Lock className="w-5 h-5 text-slate-400" />
                  <input
                    ref={overrideInputRef}
                    type="password"
                    maxLength={4}
                    value={overrideCode}
                    onChange={(e) => {
                      // Only allow digits
                      const val = e.target.value.replace(/\D/g, '');
                      setOverrideCode(val);
                      setOverrideError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleOverrideSubmit();
                      }
                    }}
                    className="flex-1 px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all text-center text-2xl tracking-[0.5em] font-mono"
                    placeholder="----"
                  />
                </div>
                {overrideError && (
                  <div className="flex items-center gap-2 mt-2 p-2.5 bg-red-50 border border-red-200 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-600">{overrideError}</p>
                  </div>
                )}
              </div>

              {/* Dialog Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowOverrideDialog(false);
                    setOverrideCode('');
                    setOverrideError('');
                    setDuplicateLoadId(null);
                  }}
                  disabled={overrideLoading}
                  className="flex-1 px-5 py-3 text-slate-600 bg-slate-100 rounded-xl font-medium hover:bg-slate-200 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleOverrideSubmit}
                  disabled={overrideLoading || overrideCode.length < 4}
                  className="flex-1 px-5 py-3 text-white bg-amber-600 rounded-xl font-medium hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {overrideLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Replacing...
                    </>
                  ) : (
                    'Override & Replace'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateLoadModal;
