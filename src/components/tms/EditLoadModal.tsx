import React, { useState, useEffect } from 'react';
import { X, MapPin, Calendar, Package, DollarSign, Loader2, Hash, Building2, ChevronDown, Plus, Trash2, Truck, User, Radar, AlertCircle, CheckCircle, Route, Send } from 'lucide-react';
import { db } from '@/lib/supabaseCompat';
import { Customer, Location, Load, LoadStop, Driver } from '@/types/tms';


interface EditLoadModalProps {
  isOpen: boolean;
  load: Load | null;
  onClose: () => void;
  onLoadUpdated: () => void;
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

const EditLoadModal: React.FC<EditLoadModalProps> = ({ isOpen, load, onClose, onLoadUpdated }) => {
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [shippers, setShippers] = useState<Location[]>([]);
  const [receivers, setReceivers] = useState<Location[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [totalRate, setTotalRate] = useState<number>(0);
  
  // Multiple stops
  const [pickupStops, setPickupStops] = useState<StopData[]>([emptyStop()]);
  const [deliveryStops, setDeliveryStops] = useState<StopData[]>([emptyStop()]);

  // Tracking
  const [initiatingTracking, setInitiatingTracking] = useState(false);
  const [trackingResult, setTrackingResult] = useState<{ success: boolean; message: string } | null>(null);
  const [calculatingMiles, setCalculatingMiles] = useState(false);
  
  const [formData, setFormData] = useState({
    load_number: '',
    customer_id: '',
    driver_id: '',
    pickup_date: '',
    delivery_date: '',
    cargo_description: '',
    weight: '',
    manual_rate: '',
    extra_stop_fee: '',
    lumper_fee: '',
    total_miles: '',
  });

  useEffect(() => {
    if (isOpen && load) {
      fetchCustomers();
      fetchDrivers();
      fetchLocations();
      fetchLoadStops();
      populateFormData();
      setTrackingResult(null);
    }
  }, [isOpen, load]);

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

  const populateFormData = () => {
    if (!load) return;
    
    setFormData({
      load_number: load.load_number || '',
      customer_id: load.customer_id || '',
      driver_id: load.driver_id || '',
      pickup_date: load.pickup_date ? load.pickup_date.split('T')[0] : '',
      delivery_date: load.delivery_date ? load.delivery_date.split('T')[0] : '',
      cargo_description: load.cargo_description || '',
      weight: load.weight?.toString() || '',
      manual_rate: load.rate?.toString() || '',
      extra_stop_fee: load.extra_stop_fee?.toString() || '0',
      lumper_fee: load.lumper_fee?.toString() || '0',
      total_miles: load.total_miles?.toString() || '',
    });
  };

  const fetchLoadStops = async () => {
    if (!load) return;
    
    const { data: stops } = await db
      .from('load_stops')
      .select('*')
      .eq('load_id', load.id)
      .order('stop_type')
      .order('stop_sequence');
    
    if (stops && stops.length > 0) {
      const pickups = stops.filter(s => s.stop_type === 'pickup').map(s => ({
        id: s.id,
        location_id: s.location_id || '',
        company_name: s.company_name || '',
        address: s.address || '',
        city: s.city || '',
        state: s.state || 'TX',
        zip: s.zip || '',
        contact_name: s.contact_name || '',
        contact_phone: s.contact_phone || '',
        instructions: s.instructions || '',
      }));
      
      const deliveries = stops.filter(s => s.stop_type === 'delivery').map(s => ({
        id: s.id,
        location_id: s.location_id || '',
        company_name: s.company_name || '',
        address: s.address || '',
        city: s.city || '',
        state: s.state || 'TX',
        zip: s.zip || '',
        contact_name: s.contact_name || '',
        contact_phone: s.contact_phone || '',
        instructions: s.instructions || '',
      }));
      
      if (pickups.length > 0) setPickupStops(pickups);
      if (deliveries.length > 0) setDeliveryStops(deliveries);
    } else {
      setPickupStops([{
        id: crypto.randomUUID(),
        location_id: '',
        company_name: '',
        address: load.origin_address || '',
        city: load.origin_city || '',
        state: load.origin_state || 'TX',
        zip: '',
        contact_name: '',
        contact_phone: '',
        instructions: '',
      }]);
      setDeliveryStops([{
        id: crypto.randomUUID(),
        location_id: '',
        company_name: load.dest_company || '',
        address: load.dest_address || '',
        city: load.dest_city || '',
        state: load.dest_state || 'TX',
        zip: '',
        contact_name: '',
        contact_phone: '',
        instructions: '',
      }]);
    }
  };

  const fetchCustomers = async () => {
    const { data } = await db.from('customers').select('*').order('company_name');
    if (data) {
      setCustomers(data);
      if (load?.customer_id) {
        const customer = data.find(c => c.id === load.customer_id);
        setSelectedCustomer(customer || null);
      }
    }
  };

  const fetchDrivers = async () => {
    const { data } = await db.from('drivers').select('*').order('name');
    if (data) setDrivers(data);
  };

  const fetchLocations = async () => {
    const { data } = await db.from('locations').select('*').order('company_name');
    if (data) {
      setShippers(data.filter(l => l.location_type === 'shipper'));
      setReceivers(data.filter(l => l.location_type === 'receiver'));
    }
  };

  const handleCustomerChange = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    setSelectedCustomer(customer || null);
    setFormData(prev => ({ ...prev, customer_id: customerId }));
  };

  const handleDriverChange = async (driverId: string) => {
    setFormData(prev => ({ ...prev, driver_id: driverId }));
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

  const addPickupStop = () => setPickupStops(prev => [...prev, emptyStop()]);
  const removePickupStop = (index: number) => { if (pickupStops.length > 1) setPickupStops(prev => prev.filter((_, i) => i !== index)); };
  const addDeliveryStop = () => setDeliveryStops(prev => [...prev, emptyStop()]);
  const removeDeliveryStop = (index: number) => { if (deliveryStops.length > 1) setDeliveryStops(prev => prev.filter((_, i) => i !== index)); };

  const handleInitiateTracking = async () => {
    if (!load) return;
    setInitiatingTracking(true);
    setTrackingResult(null);

    try {
      // First save the current stops so geofences can be created
      await saveStops();

      const { data, error } = await db.functions.invoke('here-webhook', {
        body: {
          action: 'setup-load-geofences',
          load_id: load.id,
        },
      });

      if (error) {
        setTrackingResult({ success: false, message: `Error: ${error.message}` });
      } else if (data?.success) {
        setTrackingResult({ 
          success: true, 
          message: `Tracking initiated! ${data.geofences_created} geofence(s) created.` 
        });
        // Update miles if calculated
        if (data.total_miles) {
          setFormData(prev => ({ ...prev, total_miles: data.total_miles.toString() }));
        }
      } else {
        setTrackingResult({ success: false, message: data?.error || 'Failed to initiate tracking' });
      }
    } catch (err: any) {
      setTrackingResult({ success: false, message: err.message || 'Failed to initiate tracking' });
    } finally {
      setInitiatingTracking(false);
    }
  };

  const handleCalculateMiles = async () => {
    if (!load) return;
    setCalculatingMiles(true);

    try {
      // Save stops first
      await saveStops();

      const { data, error } = await db.functions.invoke('here-webhook', {
        body: {
          action: 'calculate-route',
          load_id: load.id,
        },
      });

      if (data?.success && data.total_miles) {
        setFormData(prev => ({ ...prev, total_miles: data.total_miles.toString() }));
      } else {
        alert(data?.error || 'Could not calculate miles. Make sure addresses are filled in.');
      }
    } catch (err: any) {
      alert('Failed to calculate miles: ' + (err.message || 'Unknown error'));
    } finally {
      setCalculatingMiles(false);
    }
  };

  const saveStops = async () => {
    if (!load) return;
    // Delete existing stops
    await db.from('load_stops').delete().eq('load_id', load.id);

    // Insert all stops
    const stopsToInsert = [
      ...pickupStops.map((stop, index) => ({
        load_id: load.id,
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
        load_id: load.id,
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

    await db.from('load_stops').insert(stopsToInsert);
  };

  const generateAcceptanceToken = () => {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!load) return;
    setLoading(true);

    try {
      const firstPickup = pickupStops[0];
      const firstDelivery = deliveryStops[0];
      const finalRate = formData.manual_rate ? parseFloat(formData.manual_rate) : (totalRate || load.rate);

      // Handle driver change
      const newDriverId = formData.driver_id || null;
      const oldDriverId = load.driver_id;
      let newStatus = load.status;
      let acceptanceToken = load.acceptance_token;

      // If driver changed
      if (newDriverId !== oldDriverId) {
        // Release old driver
        if (oldDriverId) {
          await db.from('drivers').update({ status: 'available' }).eq('id', oldDriverId);
        }
        // Assign new driver
        if (newDriverId) {
          await db.from('drivers').update({ status: 'on_route' }).eq('id', newDriverId);
          if (load.status === 'UNASSIGNED') {
            newStatus = 'DISPATCHED';
          }
          // Generate a new acceptance token for the new driver
          acceptanceToken = generateAcceptanceToken();
        } else {
          // No driver assigned - clear token and reset status
          acceptanceToken = null;
          if (load.status === 'DISPATCHED' || load.status === 'IN_TRANSIT') {
            newStatus = 'UNASSIGNED';
          }
        }
      }

      const updatePayload: any = {
        load_number: formData.load_number.trim(),
        customer_id: formData.customer_id || null,
        driver_id: newDriverId,
        status: newStatus,
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
        extra_stop_fee: parseFloat(formData.extra_stop_fee) || 0,
        lumper_fee: parseFloat(formData.lumper_fee) || 0,
        total_miles: formData.total_miles ? parseFloat(formData.total_miles) : null,
        acceptance_token: acceptanceToken,
      };

      // If driver was removed, also clear accepted_at
      if (!newDriverId && oldDriverId) {
        updatePayload.accepted_at = null;
      }

      const { error: loadError } = await db.from('loads').update(updatePayload).eq('id', load.id);

      if (loadError) throw loadError;
      await saveStops();

      // Always auto-setup geofences after saving stops (fire-and-forget)
      // This ensures geofences are created/updated whenever stops change
      db.functions.invoke('here-webhook', {
        body: {
          action: 'auto-setup-geofences',
          load_id: load.id,
        },
      }).then(({ data: geoData }) => {
        if (geoData?.success) {
          console.log(`Auto-geofences: ${geoData.geofences_created} created for load ${formData.load_number}`);
        } else {
          console.warn('Auto-geofence setup:', geoData?.error || 'unknown error');
        }
      }).catch((geoErr) => {
        console.warn('Auto-geofence setup failed (non-critical):', geoErr);
      });

      // If a NEW driver was assigned, send them the dispatch SMS (fire-and-forget, don't block save)
      if (newDriverId && newDriverId !== oldDriverId) {
        const newDriver = drivers.find(d => d.id === newDriverId);
        if (newDriver?.phone && acceptanceToken) {
          const acceptanceUrl = `${window.location.origin}/driver-portal?token=${acceptanceToken}`;
          
          console.log(`Sending dispatch SMS to ${newDriver.name} (${newDriver.phone}) for load ${formData.load_number}`);

          // Fire-and-forget SMS - don't block the save
          db.functions.invoke('send-driver-sms', {
            body: {
              driverPhone: newDriver.phone,
              driverName: newDriver.name,
              loadNumber: formData.load_number.trim(),
              origin: `${firstPickup.city}, ${firstPickup.state}`,
              destination: `${firstDelivery.city}, ${firstDelivery.state}`,
              acceptanceUrl,
              totalMiles: formData.total_miles ? parseFloat(formData.total_miles) : null,
              pickupDate: formData.pickup_date || null,
              deliveryDate: formData.delivery_date || null,
            },
          }).then(({ data: smsData, error: smsError }) => {

            if (smsError) {
              console.warn('SMS sending failed from edit modal:', smsError);
            } else if (smsData && !smsData.success) {
              console.warn('SMS sending failed from edit modal:', smsData.error);
            } else {
              console.log('Dispatch SMS sent successfully from edit modal');
            }
          }).catch((smsErr) => {
            console.warn('SMS sending error (non-critical):', smsErr);
          });

          // Fire-and-forget device registration
          db.functions.invoke('here-webhook', {
            body: {
              action: 'register-device',
              driver_id: newDriverId,
              device_name: `${newDriver.name}'s Device`,
            },
          }).catch((devErr) => {
            console.warn('Device registration failed (non-critical):', devErr);
          });
        } else {
          console.warn('Could not send SMS: driver phone or acceptance token missing', {
            driverFound: !!newDriver,
            hasPhone: !!newDriver?.phone,
            hasToken: !!acceptanceToken,
          });
        }
      }

      // Close immediately - don't wait for SMS/geofence
      onLoadUpdated();
      onClose();
    } catch (error) {
      console.error('Error updating load:', error);
      alert('Failed to update load. Please try again.');
    } finally {
      setLoading(false);
    }
  };



  if (!isOpen || !load) return null;

  // Available drivers: show all drivers but mark which are available
  const availableDrivers = drivers.filter(d => d.status === 'available' || d.id === load.driver_id);
  const currentDriver = drivers.find(d => d.id === formData.driver_id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto m-4">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-amber-600 to-amber-700 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <h2 className="text-xl font-bold text-white">Edit Load - {load.load_number}</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Load Number */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-slate-700">
              <Hash className="w-5 h-5 text-indigo-500" />
              <span className="font-semibold">Load Number</span>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Load/Reference Number *</label>
              <input
                type="text"
                required
                value={formData.load_number}
                onChange={(e) => setFormData({ ...formData, load_number: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all"
                placeholder="LD-2026-1234 or your reference number"
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

          {/* Driver Assignment / Change */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-slate-700">
              <User className="w-5 h-5 text-indigo-500" />
              <span className="font-semibold">Driver Assignment</span>
              {load.driver_id && (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">Currently Assigned</span>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">
                {load.driver_id ? 'Change Driver' : 'Assign Driver'}
              </label>
              <div className="relative">
                <select
                  value={formData.driver_id}
                  onChange={(e) => handleDriverChange(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all appearance-none bg-white"
                >
                  <option value="">-- No Driver Assigned --</option>
                  {drivers.map(driver => (
                    <option key={driver.id} value={driver.id} disabled={driver.status === 'on_route' && driver.id !== load.driver_id}>
                      {driver.name} ({driver.truck_number}) - {driver.status === 'available' ? 'Available' : driver.id === load.driver_id ? 'Current' : driver.status}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
              </div>
              {formData.driver_id && formData.driver_id !== load.driver_id && (
                <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
                  <p className="text-amber-800 font-medium">
                    Driver will be changed from {load.driver?.name || 'previous driver'} to {drivers.find(d => d.id === formData.driver_id)?.name || 'new driver'}
                  </p>
                  <p className="text-amber-600 text-xs mt-1">The previous driver will be released back to available status.</p>
                </div>
              )}
            </div>
          </div>

          {/* Tracking & Mileage Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-slate-700">
              <Radar className="w-5 h-5 text-cyan-500" />
              <span className="font-semibold">Tracking & Mileage</span>
              {load.tracking_enabled && (
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">Tracking Active</span>
              )}
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Total Miles</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.1"
                    value={formData.total_miles}
                    onChange={(e) => setFormData({ ...formData, total_miles: e.target.value })}
                    className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all"
                    placeholder="Auto-calculated or manual"
                  />
                  <button
                    type="button"
                    onClick={handleCalculateMiles}
                    disabled={calculatingMiles}
                    className="px-3 py-2.5 bg-cyan-100 text-cyan-700 rounded-lg hover:bg-cyan-200 transition-colors disabled:opacity-50 flex items-center gap-1 text-sm font-medium"
                  >
                    {calculatingMiles ? <Loader2 className="w-4 h-4 animate-spin" /> : <Route className="w-4 h-4" />}
                    Calc
                  </button>
                </div>
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleInitiateTracking}
                  disabled={initiatingTracking}
                  className={`w-full px-4 py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors ${
                    load.tracking_enabled
                      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                      : 'bg-cyan-600 text-white hover:bg-cyan-700'
                  } disabled:opacity-50`}
                >
                  {initiatingTracking ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Setting up...</>
                  ) : load.tracking_enabled ? (
                    <><Radar className="w-4 h-4" />Re-initiate Tracking</>
                  ) : (
                    <><Radar className="w-4 h-4" />Initiate Tracking</>
                  )}
                </button>
              </div>
            </div>

            {trackingResult && (
              <div className={`p-3 rounded-lg flex items-center gap-2 text-sm ${
                trackingResult.success 
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                  : 'bg-red-50 border border-red-200 text-red-700'
              }`}>
                {trackingResult.success ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                {trackingResult.message}
              </div>
            )}
          </div>

          {/* Shippers (Pickup Locations) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-700">
                <Truck className="w-5 h-5 text-blue-500" />
                <span className="font-semibold">Shipper(s) - Pickup Location(s)</span>
              </div>
              <button type="button" onClick={addPickupStop} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors">
                <Plus className="w-4 h-4" />Add Pickup
              </button>
            </div>

            {pickupStops.map((stop, index) => (
              <div key={stop.id} className="border border-blue-200 rounded-xl p-4 bg-blue-50/50">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-blue-700">Pickup #{index + 1}</span>
                  {pickupStops.length > 1 && (
                    <button type="button" onClick={() => removePickupStop(index)} className="p-1.5 text-red-500 hover:bg-red-100 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Select Shipper</label>
                    <div className="relative">
                      <select value={stop.location_id} onChange={(e) => handleShipperChange(index, e.target.value)} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all appearance-none bg-white">
                        <option value="">-- Select a Shipper or Enter Manually --</option>
                        {shippers.map(shipper => (<option key={shipper.id} value={shipper.id}>{shipper.company_name} - {shipper.city}, {shipper.state}</option>))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-slate-600 mb-1">Company Name</label>
                      <input type="text" value={stop.company_name} onChange={(e) => { const updated = [...pickupStops]; updated[index].company_name = e.target.value; setPickupStops(updated); }} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all" placeholder="Shipper company name" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-slate-600 mb-1">Address</label>
                      <input type="text" value={stop.address} onChange={(e) => { const updated = [...pickupStops]; updated[index].address = e.target.value; setPickupStops(updated); }} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all" placeholder="123 Main Street" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-1">City *</label>
                      <input type="text" required={index === 0} value={stop.city} onChange={(e) => { const updated = [...pickupStops]; updated[index].city = e.target.value; setPickupStops(updated); }} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all" placeholder="Dallas" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-1">State *</label>
                      <select required={index === 0} value={stop.state} onChange={(e) => { const updated = [...pickupStops]; updated[index].state = e.target.value; setPickupStops(updated); }} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all">
                        {US_STATES.map(state => (<option key={state} value={state}>{state}</option>))}
                      </select>
                    </div>
                  </div>
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
              <button type="button" onClick={addDeliveryStop} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors">
                <Plus className="w-4 h-4" />Add Drop-off
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
                        <span className="px-2 py-0.5 bg-emerald-200 text-emerald-800 text-xs font-medium rounded-full">${selectedReceiver.rate.toLocaleString()}</span>
                      )}
                    </div>
                    {deliveryStops.length > 1 && (
                      <button type="button" onClick={() => removeDeliveryStop(index)} className="p-1.5 text-red-500 hover:bg-red-100 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-1">Select Receiver</label>
                      <div className="relative">
                        <select value={stop.location_id} onChange={(e) => handleReceiverChange(index, e.target.value)} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all appearance-none bg-white">
                          <option value="">-- Select a Receiver or Enter Manually --</option>
                          {receivers.map(receiver => (<option key={receiver.id} value={receiver.id}>{receiver.company_name} - {receiver.city}, {receiver.state} {receiver.rate ? `($${receiver.rate.toLocaleString()})` : ''}</option>))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-slate-600 mb-1">Company Name</label>
                        <input type="text" value={stop.company_name} onChange={(e) => { const updated = [...deliveryStops]; updated[index].company_name = e.target.value; setDeliveryStops(updated); }} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all" placeholder="Receiver company name" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-slate-600 mb-1">Address</label>
                        <input type="text" value={stop.address} onChange={(e) => { const updated = [...deliveryStops]; updated[index].address = e.target.value; setDeliveryStops(updated); }} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all" placeholder="456 Industrial Blvd" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-600 mb-1">City *</label>
                        <input type="text" required={index === 0} value={stop.city} onChange={(e) => { const updated = [...deliveryStops]; updated[index].city = e.target.value; setDeliveryStops(updated); }} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all" placeholder="Los Angeles" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-600 mb-1">State *</label>
                        <select required={index === 0} value={stop.state} onChange={(e) => { const updated = [...deliveryStops]; updated[index].state = e.target.value; setDeliveryStops(updated); }} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all">
                          {US_STATES.map(state => (<option key={state} value={state}>{state}</option>))}
                        </select>
                      </div>
                    </div>
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
                <input type="date" required value={formData.pickup_date} onChange={(e) => setFormData({ ...formData, pickup_date: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Delivery Date *</label>
                <input type="date" required value={formData.delivery_date} onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all" />
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
                <input type="text" value={formData.cargo_description} onChange={(e) => setFormData({ ...formData, cargo_description: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all" placeholder="Electronics, Furniture, etc." />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-medium text-slate-600 mb-1">Weight (lbs)</label>
                <input type="number" value={formData.weight} onChange={(e) => setFormData({ ...formData, weight: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all" placeholder="15000" />
              </div>
            </div>
          </div>

          {/* Rate Summary + Extra Costs */}
          <div className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-600" />
                <span className="font-semibold text-slate-700">Load Rate & Extra Costs</span>
              </div>
              {totalRate > 0 && (
                <span className="text-2xl font-bold text-emerald-600">
                  ${totalRate.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Base Rate</label>
                <input type="number" step="0.01" value={formData.manual_rate} onChange={(e) => setFormData({ ...formData, manual_rate: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all" placeholder="Enter load rate" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Extra Stop Fee</label>
                <input type="number" step="0.01" value={formData.extra_stop_fee} onChange={(e) => setFormData({ ...formData, extra_stop_fee: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all" placeholder="0.00" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Lumper Fee</label>
                <input type="number" step="0.01" value={formData.lumper_fee} onChange={(e) => setFormData({ ...formData, lumper_fee: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all" placeholder="0.00" />
              </div>
            </div>
            {(parseFloat(formData.extra_stop_fee) > 0 || parseFloat(formData.lumper_fee) > 0) && (
              <div className="mt-3 pt-3 border-t border-emerald-200">
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Base Rate:</span>
                  <span>${parseFloat(formData.manual_rate || '0').toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
                {parseFloat(formData.extra_stop_fee) > 0 && (
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>Extra Stop Fee:</span>
                    <span>${parseFloat(formData.extra_stop_fee).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                {parseFloat(formData.lumper_fee) > 0 && (
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>Lumper Fee:</span>
                    <span>${parseFloat(formData.lumper_fee).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-emerald-700 mt-1 pt-1 border-t border-emerald-200">
                  <span>Total to Bill:</span>
                  <span>${(
                    (parseFloat(formData.manual_rate) || 0) +
                    (parseFloat(formData.extra_stop_fee) || 0) +
                    (parseFloat(formData.lumper_fee) || 0)
                  ).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-6 py-3 text-slate-600 bg-slate-100 rounded-xl font-medium hover:bg-slate-200 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="flex-1 px-6 py-3 text-white bg-amber-600 rounded-xl font-medium hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? (<><Loader2 className="w-5 h-5 animate-spin" />Saving...</>) : ('Save Changes')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditLoadModal;
