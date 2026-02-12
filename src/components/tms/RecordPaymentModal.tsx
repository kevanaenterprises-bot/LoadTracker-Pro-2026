import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Load, Invoice, Payment, PaymentMethod } from '@/types/tms';
import { X, DollarSign, CreditCard, Loader2, CheckCircle, AlertCircle, Trash2 } from 'lucide-react';

interface RecordPaymentModalProps {
  isOpen: boolean;
  load: Load | null;
  onClose: () => void;
  onPaymentRecorded: () => void;
}

const paymentMethodLabels: Record<PaymentMethod, string> = {
  check: 'Check',
  ach: 'ACH Transfer',
  wire: 'Wire Transfer',
  credit_card: 'Credit Card',
  cash: 'Cash',
  other: 'Other',
};

const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen,
  load,
  onClose,
  onPaymentRecorded,
}) => {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('check');
  const [checkNumber, setCheckNumber] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOpen && load) {
      fetchInvoiceAndPayments();
      resetForm();
    }
  }, [isOpen, load]);

  const resetForm = () => {
    setAmount('');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentMethod('check');
    setCheckNumber('');
    setReferenceNumber('');
    setNotes('');
    setError('');
    setSuccess('');
  };

  const fetchInvoiceAndPayments = async () => {
    if (!load) return;
    setLoading(true);

    const { data: inv } = await supabase
      .from('invoices')
      .select('*')
      .eq('load_id', load.id)
      .single();

    if (inv) {
      setInvoice(inv);

      const { data: pmts } = await supabase
        .from('payments')
        .select('*')
        .eq('invoice_id', inv.id)
        .order('payment_date', { ascending: true });

      if (pmts) setPayments(pmts);
    }

    setLoading(false);
  };

  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const invoiceAmount = invoice ? Number(invoice.amount) : 0;
  const remaining = invoiceAmount - totalPaid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoice || !load) return;

    const paymentAmount = parseFloat(amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      setError('Please enter a valid payment amount.');
      return;
    }

    if (paymentAmount > remaining + 0.01) {
      setError(`Payment amount ($${paymentAmount.toFixed(2)}) exceeds remaining balance ($${remaining.toFixed(2)}).`);
      return;
    }

    setSaving(true);
    setError('');

    const { error: insertError } = await supabase.from('payments').insert({
      invoice_id: invoice.id,
      load_id: load.id,
      amount: paymentAmount,
      payment_date: paymentDate,
      payment_method: paymentMethod,
      check_number: checkNumber || null,
      reference_number: referenceNumber || null,
      notes: notes || null,
    });

    if (insertError) {
      setError(`Failed to record payment: ${insertError.message}`);
      setSaving(false);
      return;
    }

    // Check if invoice is now fully paid
    const newTotalPaid = totalPaid + paymentAmount;
    if (newTotalPaid >= invoiceAmount - 0.01) {
      // Mark invoice as PAID
      await supabase
        .from('invoices')
        .update({ status: 'PAID', paid_at: new Date().toISOString() })
        .eq('id', invoice.id);

      // Mark load as PAID
      await supabase
        .from('loads')
        .update({ status: 'PAID' })
        .eq('id', load.id);

      // Release driver
      if (load.driver_id) {
        await supabase.from('drivers').update({ status: 'available' }).eq('id', load.driver_id);
      }
    }

    setSaving(false);
    setSuccess('Payment recorded successfully!');
    resetForm();
    await fetchInvoiceAndPayments();
    onPaymentRecorded();

    // Auto-close success message
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleDeletePayment = async (payment: Payment) => {
    if (!confirm(`Delete payment of $${Number(payment.amount).toFixed(2)}?`)) return;

    await supabase.from('payments').delete().eq('id', payment.id);

    // If load was PAID, revert to INVOICED since we removed a payment
    if (load && load.status === 'PAID') {
      await supabase.from('loads').update({ status: 'INVOICED' }).eq('id', load.id);
      if (invoice) {
        await supabase.from('invoices').update({ status: 'PENDING', paid_at: null }).eq('id', invoice.id);
      }
    }

    await fetchInvoiceAndPayments();
    onPaymentRecorded();
  };

  const handlePayInFull = () => {
    setAmount(remaining.toFixed(2));
  };

  if (!isOpen || !load) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-hidden m-4 flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-green-700 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Record Payment</h2>
            <p className="text-emerald-100 text-sm">
              {load.load_number} — {invoice?.invoice_number || 'Loading...'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            </div>
          ) : !invoice ? (
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No invoice found for this load. Generate an invoice first.</p>
            </div>
          ) : (
            <>
              {/* Invoice Summary */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Invoice Total</p>
                    <p className="text-2xl font-bold text-slate-800">
                      ${invoiceAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Paid</p>
                    <p className="text-2xl font-bold text-emerald-600">
                      ${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Balance Due</p>
                    <p className={`text-2xl font-bold ${remaining <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      ${remaining.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Payment Progress</span>
                    <span>{invoiceAmount > 0 ? Math.min(100, Math.round((totalPaid / invoiceAmount) * 100)) : 0}%</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2.5">
                    <div
                      className={`h-2.5 rounded-full transition-all duration-500 ${
                        remaining <= 0 ? 'bg-emerald-500' : totalPaid > 0 ? 'bg-amber-500' : 'bg-slate-300'
                      }`}
                      style={{ width: `${invoiceAmount > 0 ? Math.min(100, (totalPaid / invoiceAmount) * 100) : 0}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Payment History */}
              {payments.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Payment History</h3>
                  <div className="space-y-2">
                    {payments.map((payment) => (
                      <div
                        key={payment.id}
                        className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-4 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-emerald-100 rounded-lg flex items-center justify-center">
                            <CreditCard className="w-4 h-4 text-emerald-600" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-800">
                                ${Number(payment.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </span>
                              <span className="px-2 py-0.5 bg-slate-100 rounded text-xs text-slate-600">
                                {paymentMethodLabels[payment.payment_method as PaymentMethod] || payment.payment_method}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                              <span>{new Date(payment.payment_date).toLocaleDateString()}</span>
                              {payment.check_number && <span>Check #{payment.check_number}</span>}
                              {payment.reference_number && <span>Ref: {payment.reference_number}</span>}
                            </div>
                            {payment.notes && (
                              <p className="text-xs text-slate-400 mt-0.5">{payment.notes}</p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeletePayment(payment)}
                          className="p-2 hover:bg-red-50 rounded-lg transition-colors group"
                          title="Delete payment"
                        >
                          <Trash2 className="w-4 h-4 text-slate-400 group-hover:text-red-500" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Record New Payment Form */}
              {remaining > 0.01 && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-700">Record New Payment</h3>
                    <button
                      type="button"
                      onClick={handlePayInFull}
                      className="text-xs font-medium text-emerald-600 hover:text-emerald-700 px-3 py-1 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
                    >
                      Pay in Full (${remaining.toFixed(2)})
                    </button>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <p className="text-sm text-red-700">{error}</p>
                    </div>
                  )}

                  {success && (
                    <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      <p className="text-sm text-emerald-700">{success}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    {/* Amount */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Amount *</label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max={remaining}
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                          required
                        />
                      </div>
                    </div>

                    {/* Payment Date */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Payment Date *</label>
                      <input
                        type="date"
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        required
                      />
                    </div>

                    {/* Payment Method */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Payment Method *</label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      >
                        {Object.entries(paymentMethodLabels).map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Check Number (conditional) */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        {paymentMethod === 'check' ? 'Check Number' : 'Reference Number'}
                      </label>
                      {paymentMethod === 'check' ? (
                        <input
                          type="text"
                          value={checkNumber}
                          onChange={(e) => setCheckNumber(e.target.value)}
                          placeholder="e.g. 10452"
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        />
                      ) : (
                        <input
                          type="text"
                          value={referenceNumber}
                          onChange={(e) => setReferenceNumber(e.target.value)}
                          placeholder="Transaction reference"
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        />
                      )}
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Optional payment notes..."
                      rows={2}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full px-6 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Recording Payment...
                      </>
                    ) : (
                      <>
                        <DollarSign className="w-4 h-4" />
                        Record Payment
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* Fully Paid Message */}
              {remaining <= 0.01 && (
                <div className="text-center py-6 bg-emerald-50 rounded-xl border border-emerald-200">
                  <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                  <h3 className="text-lg font-bold text-emerald-800">Fully Paid</h3>
                  <p className="text-sm text-emerald-600 mt-1">
                    This invoice has been paid in full.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 text-slate-600 bg-white border border-slate-200 rounded-xl font-medium hover:bg-slate-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default RecordPaymentModal;
