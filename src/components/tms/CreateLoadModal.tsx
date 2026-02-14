import React, { useState, useEffect, useRef } from 'react';
import { X, MapPin, Calendar, Package, DollarSign, Loader2, Hash, Building2, ChevronDown, Plus, Trash2, Truck, AlertTriangle, Lock, ShieldAlert, FileText, Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import { db } from '@/lib/supabaseCompat';
import { Customer, Location } from '@/types/tms';
import { extractTextFromImage, parseRateConfirmation, saveOcrTrainingData, ParsedRateConData } from '@/lib/ocrService';

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
  
  // OCR state
  const [showOcrUpload, setShowOcrUpload] = useState(false);
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [ocrResult, setOcrResult] = useState<ParsedRateConData | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [showOcrReview, setShowOcrReview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createdLoadIdRef = useRef<string | null>(null);
  
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
    const { data } = await db.from('customers').select('*').order('company_name');
    if (data) setCustomers(data);
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

  /** Handle OCR file upload */
  const handleOcrFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setOcrFile(file);
    setOcrProcessing(true);
    setErrorMessage('');

    try {
      // Extract text from image/PDF
      const text = await extractTextFromImage(file);
      setOcrText(text);
      
      if (!text || text.trim().length === 0) {
        throw new Error('No text could be extracted from the document. Please ensure the image is clear and try again.');
      }
      
      // Parse the text into structured data
      const parsed = await parseRateConfirmation(text);
      setOcrResult(parsed);
      
      // Show review panel
      setShowOcrReview(true);
      
    } catch (error: any) {
      console.error('OCR processing failed:', error);
      setErrorMessage(error?.message || 'Failed to scan document. Please enter information manually.');
      setOcrFile(null);
      setOcrText('');
      setOcrResult(null);
    } finally {
      setOcrProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  /** Accept and pre-fill form with OCR results */
  const handleAcceptOcrData = () => {
    if (!ocrResult) return;

    // Pre-fill form fields
    if (ocrResult.load_number) {
      setFormData(prev => ({ ...prev, load_number: ocrResult.load_number || '' }));
    }
    if (ocrResult.pickup_date) {
      setFormData(prev => ({ ...prev, pickup_date: ocrResult.pickup_date || '' }));
    }
    if (ocrResult.delivery_date) {
      setFormData(prev => ({ ...prev, delivery_date: ocrResult.delivery_date || '' }));
    }
    if (ocrResult.rate) {
      setFormData(prev => ({ ...prev, manual_rate: ocrResult.rate?.toString() || '' }));
    }
    if (ocrResult.cargo_description) {
      setFormData(prev => ({ ...prev, cargo_description: ocrResult.cargo_description || '' }));
    }
    if (ocrResult.weight) {
      setFormData(prev => ({ ...prev, weight: ocrResult.weight || '' }));
    }
    
    // Pre-fill pickup stop if address was found
    if (ocrResult.pickup_city || ocrResult.pickup_address) {
      setPickupStops([{
        ...emptyStop(),
        company_name: ocrResult.pickup_company || '',
        address: ocrResult.pickup_address || '',
        city: ocrResult.pickup_city || '',
        state: ocrResult.pickup_state || 'TX',
        zip: ocrResult.pickup_zip || '',
      }]);
    }
    
    // Pre-fill delivery stop if address was found
    if (ocrResult.delivery_city || ocrResult.delivery_address) {
      setDeliveryStops([{
        ...emptyStop(),
        company_name: ocrResult.delivery_company || '',
        address: ocrResult.delivery_address || '',
        city: ocrResult.delivery_city || '',
        state: ocrResult.delivery_state || 'TX',
        zip: ocrResult.delivery_zip || '',
      }]);
    }

    // Close review panel and show success message
    setShowOcrReview(false);
    setShowOcrUpload(false);
  };

  /** Discard OCR results */
  const handleDiscardOcrData = () => {
    setOcrFile(null);
    setOcrText('');
    setOcrResult(null);
    setShowOcrReview(false);
    setShowOcrUpload(false);
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

    const { data: loadData, error: loadError } = await db.from('loads').insert(payload).select().single();
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

    await db.from('load_stops').insert(stopsToInsert);

    // Auto-setup geofences (fire-and-forget)
    if (loadData?.id) {
      db.functions.invoke('here-webhook', {
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

  /** Delete a load and all its related records */
  const deleteLoadDirect = async (loadId: string, driverId?: string | null) => {
    // Delete related records first (foreign key constraints require this order)
    await db.from('payments').delete().eq('load_id', loadId);
    await db.from('load_stops').delete().eq('load_id', loadId);
    await db.from('pod_documents').delete().eq('load_id', loadId);
    await db.from('invoices').delete().eq('load_id', loadId);
    await db.from('loads').delete().eq('id', loadId);

    // Release the driver if one was assigned
    if (driverId) {
      await db.from('drivers').update({ status: 'available' }).eq('id', driverId);
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
        const { data: existing, error: checkError } = await db
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
      const loadData = await insertLoad();
      
      // Store the created load ID for OCR training data
      if (loadData?.id) {
        createdLoadIdRef.current = loadData.id;
        
        // Save OCR training data if OCR was used
        if (ocrResult && ocrText) {
          try {
            // Handle rate conversion properly - if user entered 0 explicitly, use it
            const finalRate = formData.manual_rate 
              ? parseFloat(formData.manual_rate) 
              : (ocrResult.rate || undefined);
            
            await saveOcrTrainingData({
              load_id: loadData.id,
              original_text: ocrText,
              extracted_data: ocrResult,
              corrected_data: {
                load_number: formData.load_number,
                pickup_date: formData.pickup_date,
                delivery_date: formData.delivery_date,
                rate: finalRate,
                weight: formData.weight,
                cargo_description: formData.cargo_description,
                pickup_company: pickupStops[0]?.company_name,
                pickup_address: pickupStops[0]?.address,
                pickup_city: pickupStops[0]?.city,
                pickup_state: pickupStops[0]?.state,
                pickup_zip: pickupStops[0]?.zip,
                delivery_company: deliveryStops[0]?.company_name,
                delivery_address: deliveryStops[0]?.address,
                delivery_city: deliveryStops[0]?.city,
                delivery_state: deliveryStops[0]?.state,
                delivery_zip: deliveryStops[0]?.zip,
              },
              file_type: ocrFile?.type,
              confidence_scores: ocrResult.confidence_scores,
            });
          } catch (ocrError) {
            console.error('Failed to save OCR training data:', ocrError);
            // Non-critical, don't fail the load creation
          }
        }
      }

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
          const { data: existing } = await db
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
        const { data: existingLoad } = await db
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
    
    // Reset OCR state
    setShowOcrUpload(false);
    setOcrFile(null);
    setOcrProcessing(false);
    setOcrResult(null);
    setOcrText('');
    setShowOcrReview(false);
    createdLoadIdRef.current = null;
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

          {/* OCR Scan Rate Confirmation Button */}
          {!showOcrUpload && !ocrResult && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setShowOcrUpload(true)}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-medium hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl"
              >
                <FileText className="w-5 h-5" />
                📄 Scan Rate Confirmation
              </button>
            </div>
          )}

          {/* OCR Upload Section */}
          {showOcrUpload && !showOcrReview && (
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border-2 border-purple-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-purple-900 flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Upload Rate Confirmation
                </h3>
                <button
                  type="button"
                  onClick={() => setShowOcrUpload(false)}
                  className="p-1 hover:bg-purple-200 rounded transition-colors"
                >
                  <X className="w-5 h-5 text-purple-600" />
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff"
                onChange={handleOcrFileUpload}
                disabled={ocrProcessing}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={ocrProcessing}
                className={`w-full border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                  ocrProcessing 
                    ? 'border-purple-200 bg-purple-50 cursor-wait' 
                    : 'border-purple-300 hover:border-purple-400 hover:bg-purple-100 cursor-pointer'
                }`}
              >
                {ocrProcessing ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-10 h-10 animate-spin text-purple-600" />
                    <span className="text-purple-700 font-medium">Scanning document...</span>
                    <span className="text-sm text-purple-600">This may take a few seconds</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Upload className="w-10 h-10 text-purple-600" />
                    <div>
                      <p className="text-purple-900 font-medium">Click to upload rate confirmation</p>
                      <p className="text-sm text-purple-600 mt-1">Supports PDF, JPG, PNG, TIFF</p>
                    </div>
                  </div>
                )}
              </button>
            </div>
          )}

          {/* OCR Review Panel */}
          {showOcrReview && ocrResult && (
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-green-900 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  Document Scanned Successfully
                </h3>
                <button
                  type="button"
                  onClick={handleDiscardOcrData}
                  className="p-1 hover:bg-green-200 rounded transition-colors"
                >
                  <X className="w-5 h-5 text-green-600" />
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-sm text-green-700">
                  Review the extracted data below. You can accept all fields or edit them manually after accepting.
                </p>

                {/* Extracted Data Summary */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {ocrResult.load_number && (
                    <div className="bg-white p-3 rounded-lg border border-green-200">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-xs text-green-600 font-medium">Load Number</p>
                          <p className="text-sm text-slate-800 font-semibold mt-1">{ocrResult.load_number}</p>
                        </div>
                        {(ocrResult.confidence_scores?.load_number || 0) > 0.7 ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        )}
                      </div>
                    </div>
                  )}

                  {ocrResult.rate && (
                    <div className="bg-white p-3 rounded-lg border border-green-200">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-xs text-green-600 font-medium">Rate</p>
                          <p className="text-sm text-slate-800 font-semibold mt-1">${ocrResult.rate.toFixed(2)}</p>
                        </div>
                        {(ocrResult.confidence_scores?.rate || 0) > 0.7 ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        )}
                      </div>
                    </div>
                  )}

                  {ocrResult.pickup_date && (
                    <div className="bg-white p-3 rounded-lg border border-green-200">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-xs text-green-600 font-medium">Pickup Date</p>
                          <p className="text-sm text-slate-800 font-semibold mt-1">{ocrResult.pickup_date}</p>
                        </div>
                        {(ocrResult.confidence_scores?.pickup_date || 0) > 0.7 ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        )}
                      </div>
                    </div>
                  )}

                  {ocrResult.delivery_date && (
                    <div className="bg-white p-3 rounded-lg border border-green-200">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-xs text-green-600 font-medium">Delivery Date</p>
                          <p className="text-sm text-slate-800 font-semibold mt-1">{ocrResult.delivery_date}</p>
                        </div>
                        {(ocrResult.confidence_scores?.delivery_date || 0) > 0.7 ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        )}
                      </div>
                    </div>
                  )}

                  {ocrResult.pickup_city && (
                    <div className="bg-white p-3 rounded-lg border border-green-200">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-xs text-green-600 font-medium">Pickup Location</p>
                          <p className="text-sm text-slate-800 font-semibold mt-1">
                            {ocrResult.pickup_city}, {ocrResult.pickup_state} {ocrResult.pickup_zip}
                          </p>
                        </div>
                        {(ocrResult.confidence_scores?.pickup_location || 0) > 0.7 ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        )}
                      </div>
                    </div>
                  )}

                  {ocrResult.delivery_city && (
                    <div className="bg-white p-3 rounded-lg border border-green-200">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-xs text-green-600 font-medium">Delivery Location</p>
                          <p className="text-sm text-slate-800 font-semibold mt-1">
                            {ocrResult.delivery_city}, {ocrResult.delivery_state} {ocrResult.delivery_zip}
                          </p>
                        </div>
                        {(ocrResult.confidence_scores?.delivery_location || 0) > 0.7 ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        )}
                      </div>
                    </div>
                  )}

                  {ocrResult.weight && (
                    <div className="bg-white p-3 rounded-lg border border-green-200">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-xs text-green-600 font-medium">Weight</p>
                          <p className="text-sm text-slate-800 font-semibold mt-1">{ocrResult.weight} lbs</p>
                        </div>
                        {(ocrResult.confidence_scores?.weight || 0) > 0.7 ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        )}
                      </div>
                    </div>
                  )}

                  {ocrResult.cargo_description && (
                    <div className="bg-white p-3 rounded-lg border border-green-200">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-xs text-green-600 font-medium">Cargo Description</p>
                          <p className="text-sm text-slate-800 font-semibold mt-1">{ocrResult.cargo_description}</p>
                        </div>
                        {(ocrResult.confidence_scores?.cargo_description || 0) > 0.7 ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleAcceptOcrData}
                    className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    Use All Data
                  </button>
                  <button
                    type="button"
                    onClick={handleDiscardOcrData}
                    className="px-6 py-3 bg-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-300 transition-colors"
                  >
                    Discard
                  </button>
                </div>

                {/* Show extracted text (collapsible) */}
                {ocrText && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm text-green-700 font-medium hover:text-green-800">
                      View extracted text
                    </summary>
                    <div className="mt-2 p-3 bg-white rounded-lg border border-green-200">
                      <pre className="text-xs text-slate-600 whitespace-pre-wrap max-h-40 overflow-y-auto">
                        {ocrText}
                      </pre>
                    </div>
                  </details>
                )}
              </div>
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
