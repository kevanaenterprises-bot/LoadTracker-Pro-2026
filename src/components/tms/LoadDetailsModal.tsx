import React, { useState, useEffect, useRef } from 'react';
import { X, MapPin, Calendar, Package, DollarSign, User, Truck, FileText, Download, Clock, Pencil, Trash2, Eye, Loader2, AlertTriangle, Send, Phone, UserMinus, UserPlus, CheckCircle, Mail, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { generateNextInvoiceNumber } from '@/lib/invoiceUtils';
import { Load, PODDocument, Invoice, LoadStop } from '@/types/tms';

import InvoicePreviewModal from './InvoicePreviewModal';




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
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [stops, setStops] = useState<LoadStop[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showInvoicePreview, setShowInvoicePreview] = useState(false);
  const [resendingSms, setResendingSms] = useState(false);
  const [resendSmsResult, setResendSmsResult] = useState<{ success: boolean; message: string } | null>(null);
  const [unassigning, setUnassigning] = useState(false);
  const [showUnassignConfirm, setShowUnassignConfirm] = useState(false);

  // Invoice generation & email sending state
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [sendingInvoiceEmail, setSendingInvoiceEmail] = useState(false);
  const [invoiceEmailResult, setInvoiceEmailResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showEmailConfirmModal, setShowEmailConfirmModal] = useState(false);
  const [additionalCcEmails, setAdditionalCcEmails] = useState<string>('');


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
      setResendSmsResult(null);
      setShowUnassignConfirm(false);
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

    if (load.customer) {
      setCustomer(load.customer);
    }

    // Fetch customer if load has customer_id (needed for email button to enable)
    if (load.customer_id) {
      const { data: cust } = await supabase
        .from('customers')
        .select('*')
        .eq('id', load.customer_id)
        .single();
      
      if (currentLoadIdRef.current !== loadId) return;
      if (cust) {
        setCustomer(cust);
      }
    }

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
    }

    if (currentLoadIdRef.current === loadId) {
      setLoading(false);
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
  // Send invoice to customer email
  const handleSendInvoiceEmail = async () => {
    if (!load) return;
    setSendingInvoiceEmail(true);
    setInvoiceEmailResult(null);
    setShowEmailConfirmModal(false);

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'https://loadtracker-pro-2026-production.up.railway.app';
      
      // Parse additional CC emails if provided
      const ccList = additionalCcEmails
        .split(',')
        .map(email => email.trim())
        .filter(email => email && email.includes('@'));

      const response = await fetch(`${apiUrl}/api/send-invoice-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          load_id: load.id,
          additional_cc: ccList.length > 0 ? ccList : undefined
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setInvoiceEmailResult({ success: false, message: data.error || 'Failed to send invoice' });
      } else if (data.success) {
        setInvoiceEmailResult({ 
          success: true, 
          message: data.message || `Invoice sent successfully` 
        });

        // Update emailed_at in database
        const now = new Date().toISOString();
        const emailedTo = data.emailed_to || '';
        try {
          await supabase
            .from('invoices')
            .update({ emailed_at: now, emailed_to: emailedTo })
            .eq('load_id', load.id);
          console.log(`[LoadDetails Email] Updated emailed_at for load ${load.id}`);
        } catch (dbErr) {
          console.warn('[LoadDetails Email] Failed to update emailed_at:', dbErr);
        }

        // Update local invoice state
        if (invoice) {
          setInvoice({ ...invoice, emailed_at: now, emailed_to: emailedTo });
        }

        // Refresh parent data
        if (onLoadUpdated) onLoadUpdated();
        
        // Clear additional CC emails
        setAdditionalCcEmails('');
      } else {
        setInvoiceEmailResult({ success: false, message: data.error || 'Failed to send invoice' });
      }
    } catch (err: any) {
      console.error('[Email Error]:', err);
      setInvoiceEmailResult({ success: false, message: err.message || 'Network error - check connection' });
    } finally {
      setSendingInvoiceEmail(false);
    }
  };




  if (!isOpen || !load) return null;


  const colors = statusColors[load.status] || statusColors.UNASSIGNED;
  const pickupStops = stops.filter(s => s.stop_type === 'pickup');
  const deliveryStops = stops.filter(s => s.stop_type === 'delivery');
  const canUnassign = load.driver_id && ['DISPATCHED', 'IN_TRANSIT'].includes(load.status);
  const canReassign = load.driver_id && ['DISPATCHED', 'IN_TRANSIT'].includes(load.status);
  const customerEmail = (customer?.pod_email || customer?.email || '').trim();

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
                      {pickupStops.map((stop, index) => (
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
                            </div>
                          </div>
                      ))}
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
                      {deliveryStops.map((stop, index) => (
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
                            </div>
                          </div>
                      ))}
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
                        onClick={() => setShowEmailConfirmModal(true)}
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
        customer={customer}
        onClose={() => setShowInvoicePreview(false)}
        onPodReuploadRequested={() => {
          setShowInvoicePreview(false);
          fetchDetails();
          if (onLoadUpdated) onLoadUpdated();
        }}
        onEmailSent={() => {
          // Refresh local invoice data to show updated emailed_at
          fetchDetails();
          // Refresh parent pipeline data so load moves from "To Be Emailed" → "Waiting On Payment"
          if (onLoadUpdated) onLoadUpdated();
        }}
      />

      {/* Email Confirmation Modal with CC options */}
      {showEmailConfirmModal && load && invoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900">Send Invoice Email</h3>
              <p className="text-sm text-slate-600 mt-1">Review recipients before sending</p>
            </div>

            <div className="p-6 space-y-4">
              {/* To: Field */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">To:</label>
                <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900">
                  {customerEmail || 'No customer email configured'}
                </div>
              </div>

              {/* Default CC: Field */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">CC (default):</label>
                <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600">
                  <div>kevin@go4fc.com</div>
                  <div>gofarmsbills@gmail.com</div>
                </div>
              </div>

              {/* Additional CC: Field */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Additional CC (optional):
                </label>
                <input
                  type="text"
                  value={additionalCcEmails}
                  onChange={(e) => setAdditionalCcEmails(e.target.value)}
                  placeholder="email1@example.com, email2@example.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">Separate multiple emails with commas</p>
              </div>

              {/* Invoice Details */}
              <div className="pt-4 border-t border-slate-200">
                <div className="text-sm text-slate-600 space-y-1">
                  <div className="flex justify-between">
                    <span>Invoice #:</span>
                    <span className="font-medium text-slate-900">{invoice.invoice_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Amount:</span>
                    <span className="font-medium text-slate-900">${invoice.amount?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Load #:</span>
                    <span className="font-medium text-slate-900">{load.bol_number}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 flex gap-3">
              <button
                onClick={() => {
                  setShowEmailConfirmModal(false);
                  setAdditionalCcEmails('');
                }}
                className="flex-1 px-4 py-2 text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSendInvoiceEmail}
                disabled={sendingInvoiceEmail || !customerEmail}
                className="flex-1 px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {sendingInvoiceEmail ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send Email
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
};

export default LoadDetailsModal;
