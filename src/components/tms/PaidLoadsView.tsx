import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Load, Invoice, Payment } from '@/types/tms';
import { ArrowLeft, CheckCircle, DollarSign, Search, Loader2, Download, CreditCard, ChevronDown, ChevronRight } from 'lucide-react';

interface PaidLoadsViewProps {
  onBack: () => void;
}

interface PaidLoadWithInvoice extends Load {
  invoice?: Invoice;
  payments?: Payment[];
}

const paymentMethodLabels: Record<string, string> = {
  check: 'Check',
  ach: 'ACH',
  wire: 'Wire',
  credit_card: 'Credit Card',
  cash: 'Cash',
  other: 'Other',
};

const PaidLoadsView: React.FC<PaidLoadsViewProps> = ({ onBack }) => {
  const [loads, setLoads] = useState<PaidLoadWithInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [expandedLoadId, setExpandedLoadId] = useState<string | null>(null);

  useEffect(() => {
    fetchPaidLoads();
  }, []);

  const fetchPaidLoads = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('loads')
      .select('*, driver:drivers(*)')
      .eq('status', 'PAID')
      .order('created_at', { ascending: false });

    if (data) {
      // Fetch invoices
      const loadIds = data.map(l => l.id);
      const { data: invoices } = await supabase
        .from('invoices')
        .select('*')
        .in('load_id', loadIds);

      // Fetch payments
      const invoiceIds = invoices?.map(inv => inv.id) || [];
      const { data: payments } = invoiceIds.length > 0
        ? await supabase.from('payments').select('*').in('invoice_id', invoiceIds).order('payment_date', { ascending: true })
        : { data: [] };

      const loadsWithData = data.map((load) => {
        const invoice = invoices?.find(inv => inv.load_id === load.id) || undefined;
        const loadPayments = invoice
          ? (payments?.filter(p => p.invoice_id === invoice.id) || [])
          : [];
        return { ...load, invoice, payments: loadPayments };
      });

      setLoads(loadsWithData);
      setTotalRevenue(loadsWithData.reduce((sum, l) => sum + Number(l.invoice?.amount || l.rate || 0), 0));
    }
    setLoading(false);
  };

  const filteredLoads = loads.filter(load =>
    load.load_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    load.origin_city.toLowerCase().includes(searchTerm.toLowerCase()) ||
    load.dest_city.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (load.dest_company && load.dest_company.toLowerCase().includes(searchTerm.toLowerCase())) ||
    load.driver?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    load.invoice?.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleExpand = (loadId: string) => {
    setExpandedLoadId(prev => prev === loadId ? null : loadId);
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-gradient-to-r from-green-600 to-emerald-700 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4 mb-4">
            <button onClick={onBack} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold">Paid Loads Archive</h1>
              <p className="text-green-200">Completed and paid shipments with payment details</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="bg-white/10 backdrop-blur rounded-xl p-4">
              <div className="flex items-center gap-2 text-green-200 text-sm mb-1">
                <CheckCircle className="w-4 h-4" /><span>Total Paid Loads</span>
              </div>
              <p className="text-3xl font-bold">{loads.length}</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-4">
              <div className="flex items-center gap-2 text-green-200 text-sm mb-1">
                <DollarSign className="w-4 h-4" /><span>Total Revenue</span>
              </div>
              <p className="text-3xl font-bold">${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by load number, invoice, city, or driver..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-green-600" />
          </div>
        ) : filteredLoads.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <CheckCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-800 mb-2">No Paid Loads</h3>
            <p className="text-slate-500">Paid loads will appear here once payments are processed.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-slate-500 uppercase w-8"></th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-slate-500 uppercase">Load</th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-slate-500 uppercase">Route</th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-slate-500 uppercase">Driver</th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-slate-500 uppercase">Invoice</th>
                    <th className="px-4 py-4 text-right text-xs font-semibold text-slate-500 uppercase">Amount</th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-slate-500 uppercase">Payment Method</th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-slate-500 uppercase">Paid Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredLoads.map((load) => {
                    const isExpanded = expandedLoadId === load.id;
                    const hasPayments = load.payments && load.payments.length > 0;
                    const primaryPayment = hasPayments ? load.payments![0] : null;
                    const paymentCount = load.payments?.length || 0;

                    return (
                      <React.Fragment key={load.id}>
                        <tr
                          className={`hover:bg-slate-50 transition-colors ${hasPayments ? 'cursor-pointer' : ''}`}
                          onClick={() => hasPayments && toggleExpand(load.id)}
                        >
                          <td className="px-4 py-4">
                            {hasPayments && paymentCount > 1 ? (
                              isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-slate-400" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-slate-400" />
                              )
                            ) : (
                              <div className="w-4 h-4" />
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                                <CheckCircle className="w-5 h-5 text-green-600" />
                              </div>
                              <div>
                                <p className="font-semibold text-slate-800">{load.load_number}</p>
                                <p className="text-sm text-slate-500">{new Date(load.delivery_date).toLocaleDateString()}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm">
                              <div className="flex items-center gap-2">
                                <span className="text-slate-800">{load.origin_city}, {load.origin_state}</span>
                                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                </svg>
                                <span className="text-slate-800">{load.dest_city}, {load.dest_state}</span>
                              </div>
                              {load.dest_company && (
                                <p className="text-xs text-emerald-600 font-medium mt-1">{load.dest_company}</p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4"><span className="text-slate-800">{load.driver?.name || 'N/A'}</span></td>
                          <td className="px-4 py-4"><span className="text-slate-600 font-mono text-sm">{load.invoice?.invoice_number || 'N/A'}</span></td>
                          <td className="px-4 py-4 text-right">
                            <span className="font-semibold text-green-600">
                              ${Number(load.invoice?.amount || load.rate || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            {primaryPayment ? (
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs font-medium">
                                  {paymentMethodLabels[primaryPayment.payment_method] || primaryPayment.payment_method}
                                </span>
                                {primaryPayment.check_number && (
                                  <span className="text-xs text-slate-500">#{primaryPayment.check_number}</span>
                                )}
                                {paymentCount > 1 && (
                                  <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-medium">
                                    +{paymentCount - 1} more
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-sm">—</span>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <span className="text-slate-600">
                              {load.invoice?.paid_at
                                ? new Date(load.invoice.paid_at).toLocaleDateString()
                                : primaryPayment
                                ? new Date(primaryPayment.payment_date).toLocaleDateString()
                                : 'N/A'}
                            </span>
                          </td>
                        </tr>

                        {/* Expanded payment details */}
                        {isExpanded && hasPayments && (
                          <tr>
                            <td colSpan={8} className="px-4 py-0">
                              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-4 mb-3 ml-12">
                                <h4 className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                                  <CreditCard className="w-3.5 h-3.5" />
                                  Payment History ({paymentCount} payment{paymentCount !== 1 ? 's' : ''})
                                </h4>
                                <div className="space-y-2">
                                  {load.payments!.map((payment) => (
                                    <div
                                      key={payment.id}
                                      className="flex items-center justify-between bg-white rounded-lg px-4 py-2.5 border border-emerald-100"
                                    >
                                      <div className="flex items-center gap-3">
                                        <span className="text-sm font-bold text-emerald-700">
                                          ${Number(payment.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                        </span>
                                        <span className="px-2 py-0.5 bg-slate-100 rounded text-xs text-slate-600">
                                          {paymentMethodLabels[payment.payment_method] || payment.payment_method}
                                        </span>
                                        {payment.check_number && (
                                          <span className="text-xs text-slate-500">Check #{payment.check_number}</span>
                                        )}
                                        {payment.reference_number && (
                                          <span className="text-xs text-slate-500">Ref: {payment.reference_number}</span>
                                        )}
                                      </div>
                                      <div className="text-right">
                                        <span className="text-sm text-slate-600">
                                          {new Date(payment.payment_date).toLocaleDateString()}
                                        </span>
                                        {payment.notes && (
                                          <p className="text-xs text-slate-400 mt-0.5">{payment.notes}</p>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaidLoadsView;
