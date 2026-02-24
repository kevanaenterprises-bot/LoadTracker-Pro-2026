import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Load, Invoice, Payment, Customer, PODDocument } from '@/types/tms';
import {
  ArrowLeft, DollarSign, Search, Loader2, Clock, AlertTriangle,
  AlertCircle, FileText, ChevronDown, ChevronRight, CreditCard, Download,
  ImageOff, Eye, RotateCcw, CheckCircle, Trash2
} from 'lucide-react';
import InvoicePreviewModal from './InvoicePreviewModal';

interface AccountsReceivableViewProps {
  onBack: () => void;
  onRecordPayment: (load: Load) => void;
}

interface ARInvoice {
  invoice: Invoice;
  load: Load;
  customer: Customer | null;
  payments: Payment[];
  totalPaid: number;
  balance: number;
  ageDays: number;
  bucket: 'current' | '31-60' | '61-90' | '90+';
  podDocuments: PODDocument[];
  podStatus: 'none' | 'checking' | 'ok' | 'broken' | 'all_broken';
  brokenPodCount: number;
}

const bucketLabels: Record<string, string> = {
  'current': 'Current (0-30 days)',
  '31-60': '31-60 Days',
  '61-90': '61-90 Days',
  '90+': '90+ Days',
};

const bucketColors: Record<string, { bg: string; text: string; border: string; headerBg: string }> = {
  'current': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', headerBg: 'bg-blue-100' },
  '31-60': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', headerBg: 'bg-amber-100' },
  '61-90': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', headerBg: 'bg-orange-100' },
  '90+': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', headerBg: 'bg-red-100' },
};

const AccountsReceivableView: React.FC<AccountsReceivableViewProps> = ({ onBack, onRecordPayment }) => {
  const [arInvoices, setArInvoices] = useState<ARInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedBuckets, setExpandedBuckets] = useState<Record<string, boolean>>({
    'current': true,
    '31-60': true,
    '61-90': true,
    '90+': true,
  });

  // Invoice Preview Modal state
  const [previewLoad, setPreviewLoad] = useState<Load | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Re-upload state
  const [reuploadingLoadId, setReuploadingLoadId] = useState<string | null>(null);
  const [reuploadResult, setReuploadResult] = useState<{ loadId: string; success: boolean; message: string } | null>(null);

  useEffect(() => {
    fetchARData();
  }, []);

  const fetchARData = async () => {
    setLoading(true);

    // Fetch all invoices that are PENDING (not fully paid)
    const { data: invoices } = await supabase
      .from('invoices')
      .select('*')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true });

    if (!invoices || invoices.length === 0) {
      setArInvoices([]);
      setLoading(false);
      return;
    }

    // Fetch associated loads with customer data
    const loadIds = invoices.map(inv => inv.load_id);
    const { data: loads } = await supabase
      .from('loads')
      .select('*, customer:customers(*), driver:drivers(*)')
      .in('id', loadIds);

    // Fetch all payments for these invoices
    const invoiceIds = invoices.map(inv => inv.id);
    const { data: payments } = await supabase
      .from('payments')
      .select('*')
      .in('invoice_id', invoiceIds)
      .order('payment_date', { ascending: true });

    // Fetch all POD documents for these loads
    const { data: allPodDocs } = await supabase
      .from('pod_documents')
      .select('*')
      .in('load_id', loadIds);

    const now = new Date();
    const arItems: ARInvoice[] = invoices.map((inv) => {
      const load = loads?.find(l => l.id === inv.load_id) || null;
      const customer = load?.customer || null;
      const invoicePayments = payments?.filter(p => p.invoice_id === inv.id) || [];
      const totalPaid = invoicePayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const balance = Number(inv.amount) - totalPaid;
      const invoiceDate = new Date(inv.created_at);
      const ageDays = Math.floor((now.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24));

      let bucket: ARInvoice['bucket'] = 'current';
      if (ageDays > 90) bucket = '90+';
      else if (ageDays > 60) bucket = '61-90';
      else if (ageDays > 30) bucket = '31-60';

      const podDocuments = allPodDocs?.filter(d => d.load_id === inv.load_id) || [];

      return {
        invoice: inv,
        load: load as Load,
        customer,
        payments: invoicePayments,
        totalPaid,
        balance,
        ageDays,
        bucket,
        podDocuments,
        podStatus: podDocuments.length === 0 ? 'none' : 'checking',
        brokenPodCount: 0,
      };
    }).filter(item => item.balance > 0.01 && item.load);

    setArInvoices(arItems);
    setLoading(false);

    // Asynchronously check POD file validity
    checkPodFilesValidity(arItems);
  };

  // Check if POD image URLs are actually accessible
  const checkPodFilesValidity = async (items: ARInvoice[]) => {
    const updatedItems = [...items];

    for (let i = 0; i < updatedItems.length; i++) {
      const item = updatedItems[i];
      if (item.podDocuments.length === 0) continue;

      let brokenCount = 0;
      for (const doc of item.podDocuments) {
        if (doc.file_type?.startsWith('image/')) {
          // Check image accessibility with a HEAD request
          try {
            const response = await fetch(doc.file_url, { method: 'HEAD' });
            if (!response.ok) {
              brokenCount++;
            }
          } catch {
            brokenCount++;
          }
        }
        // For non-image files (PDFs), we could also check but skip for now
      }

      updatedItems[i] = {
        ...item,
        brokenPodCount: brokenCount,
        podStatus: brokenCount === 0 ? 'ok' : brokenCount === item.podDocuments.length ? 'all_broken' : 'broken',
      };
    }

    setArInvoices(updatedItems);
  };

  const toggleBucket = (bucket: string) => {
    setExpandedBuckets(prev => ({ ...prev, [bucket]: !prev[bucket] }));
  };

  // Filter by search
  const filteredInvoices = arInvoices.filter(item => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      item.load?.load_number?.toLowerCase().includes(term) ||
      item.invoice.invoice_number.toLowerCase().includes(term) ||
      item.customer?.company_name?.toLowerCase().includes(term) ||
      item.load?.dest_company?.toLowerCase().includes(term) ||
      item.load?.origin_city?.toLowerCase().includes(term) ||
      item.load?.dest_city?.toLowerCase().includes(term)
    );
  });

  // Group by bucket
  const buckets: Record<string, ARInvoice[]> = {
    'current': [],
    '31-60': [],
    '61-90': [],
    '90+': [],
  };
  filteredInvoices.forEach(item => {
    buckets[item.bucket].push(item);
  });

  // Calculate totals
  const totalOutstanding = filteredInvoices.reduce((sum, item) => sum + item.balance, 0);
  const bucketTotals = Object.entries(buckets).reduce((acc, [key, items]) => {
    acc[key] = items.reduce((sum, item) => sum + item.balance, 0);
    return acc;
  }, {} as Record<string, number>);

  // Count broken PODs across all invoices
  const totalBrokenPods = filteredInvoices.reduce((sum, item) => sum + item.brokenPodCount, 0);
  const invoicesWithBrokenPods = filteredInvoices.filter(item => item.brokenPodCount > 0).length;

  const handleExportCSV = () => {
    const headers = ['Invoice #', 'Load #', 'Customer', 'Invoice Date', 'Invoice Amount', 'Paid', 'Balance', 'Age (Days)', 'Bucket', 'POD Status'];
    const rows = filteredInvoices.map(item => [
      item.invoice.invoice_number,
      item.load?.load_number || '',
      item.customer?.company_name || item.load?.dest_company || '',
      new Date(item.invoice.created_at).toLocaleDateString(),
      item.invoice.amount.toFixed(2),
      item.totalPaid.toFixed(2),
      item.balance.toFixed(2),
      item.ageDays.toString(),
      bucketLabels[item.bucket],
      item.podStatus === 'ok' ? 'OK' : item.podStatus === 'broken' ? `${item.brokenPodCount} broken` : item.podStatus === 'all_broken' ? 'ALL BROKEN' : item.podStatus === 'none' ? 'No POD' : 'Checking...',
    ]);

    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ar-aging-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleOpenPreview = (item: ARInvoice) => {
    setPreviewLoad(item.load);
    setPreviewInvoice(item.invoice);
    setShowPreview(true);
  };

  const handleReuploadPod = async (item: ARInvoice) => {
    if (!confirm(
      `This will delete all ${item.podDocuments.length} POD record(s) for load ${item.load.load_number}, remove the invoice, and reset the load to IN_TRANSIT so the driver can re-upload.\n\nContinue?`
    )) return;

    setReuploadingLoadId(item.load.id);
    setReuploadResult(null);

    try {
      let deletedCount = 0;

      // Delete all POD documents
      for (const doc of item.podDocuments) {
        try {
          const urlParts = doc.file_url.split('/pod-documents/');
          if (urlParts.length > 1) {
            const storagePath = decodeURIComponent(urlParts[1]);
            await supabase.storage.from('pod-documents').remove([storagePath]);
          }
        } catch { /* Storage file may not exist */ }

        const { error } = await supabase.from('pod_documents').delete().eq('id', doc.id);
        if (!error) deletedCount++;
      }

      // Delete the invoice
      await supabase.from('invoices').delete().eq('id', item.invoice.id);

      // Reset load to IN_TRANSIT
      await supabase
        .from('loads')
        .update({ status: 'IN_TRANSIT', delivered_at: null })
        .eq('id', item.load.id);

      setReuploadResult({
        loadId: item.load.id,
        success: true,
        message: `${item.load.load_number}: ${deletedCount} POD(s) deleted, invoice removed, load reset to IN_TRANSIT.`,
      });

      // Refresh data
      fetchARData();
    } catch (err: any) {
      setReuploadResult({
        loadId: item.load.id,
        success: false,
        message: `Failed: ${err.message}`,
      });
    } finally {
      setReuploadingLoadId(null);
    }
  };

  const handlePreviewClosed = () => {
    setShowPreview(false);
    setPreviewLoad(null);
    setPreviewInvoice(null);
  };

  const handlePodReuploadFromPreview = () => {
    // Refresh data after re-upload from preview modal
    handlePreviewClosed();
    fetchARData();
  };

  // POD status badge renderer
  const renderPodBadge = (item: ARInvoice) => {
    const { podStatus, podDocuments, brokenPodCount } = item;

    if (podStatus === 'none') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
          No POD
        </span>
      );
    }

    if (podStatus === 'checking') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
          <Loader2 className="w-3 h-3 animate-spin" />
          Checking...
        </span>
      );
    }

    if (podStatus === 'ok') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
          <CheckCircle className="w-3 h-3" />
          {podDocuments.length} POD{podDocuments.length !== 1 ? 's' : ''}
        </span>
      );
    }

    if (podStatus === 'all_broken') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 animate-pulse">
          <ImageOff className="w-3.5 h-3.5" />
          {brokenPodCount} MISSING
        </span>
      );
    }

    // Partially broken
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
        <AlertTriangle className="w-3.5 h-3.5" />
        {brokenPodCount}/{podDocuments.length} broken
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-700 to-purple-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4 mb-4">
            <button onClick={onBack} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">Accounts Receivable</h1>
              <p className="text-indigo-200">Aging report &amp; outstanding invoices</p>
            </div>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mt-6">
            <div className="bg-white/10 backdrop-blur rounded-xl p-4 lg:col-span-1">
              <div className="flex items-center gap-2 text-indigo-200 text-sm mb-1">
                <DollarSign className="w-4 h-4" /><span>Total Outstanding</span>
              </div>
              <p className="text-3xl font-bold">
                ${totalOutstanding.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-indigo-300 mt-1">{filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? 's' : ''}</p>
            </div>
            {(['current', '31-60', '61-90', '90+'] as const).map((bucket) => {
              const total = bucketTotals[bucket] || 0;
              const count = buckets[bucket].length;
              return (
                <div key={bucket} className="bg-white/10 backdrop-blur rounded-xl p-4">
                  <div className="flex items-center gap-2 text-indigo-200 text-sm mb-1">
                    {bucket === '90+' ? <AlertTriangle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                    <span>{bucketLabels[bucket]}</span>
                  </div>
                  <p className="text-2xl font-bold">
                    ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-indigo-300 mt-1">{count} invoice{count !== 1 ? 's' : ''}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Broken POD Alert Banner */}
      {invoicesWithBrokenPods > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <ImageOff className="w-5 h-5 text-red-500" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-red-800 text-sm">
                {totalBrokenPods} Missing POD File{totalBrokenPods !== 1 ? 's' : ''} Detected
              </h3>
              <p className="text-xs text-red-600 mt-1">
                {invoicesWithBrokenPods} invoice{invoicesWithBrokenPods !== 1 ? 's have' : ' has'} POD documents with missing storage files.
                These were uploaded before the storage fix was applied on Feb 9. Use the "Re-upload" button on each affected invoice
                to delete the broken records and have the driver re-upload from the Driver Portal.
              </p>
            </div>
            <div className="flex-shrink-0">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold">
                <AlertTriangle className="w-3.5 h-3.5" />
                Action Required
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Re-upload Result Banner */}
      {reuploadResult && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
          <div className={`rounded-xl p-4 flex items-center gap-3 ${reuploadResult.success ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
            {reuploadResult.success ? (
              <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            )}
            <p className={`text-sm font-medium ${reuploadResult.success ? 'text-emerald-700' : 'text-red-700'}`}>
              {reuploadResult.message}
            </p>
            <button
              onClick={() => setReuploadResult(null)}
              className="ml-auto text-slate-400 hover:text-slate-600"
            >
              <span className="sr-only">Dismiss</span>
              &times;
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Search */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by invoice #, load #, customer, or city..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-800 mb-2">No Outstanding Invoices</h3>
            <p className="text-slate-500">All invoices have been paid. Great job!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {(['current', '31-60', '61-90', '90+'] as const).map((bucket) => {
              const items = buckets[bucket];
              if (items.length === 0) return null;
              const colors = bucketColors[bucket];
              const isExpanded = expandedBuckets[bucket];

              return (
                <div key={bucket} className={`bg-white rounded-xl shadow-sm border ${colors.border} overflow-hidden`}>
                  {/* Bucket Header */}
                  <button
                    onClick={() => toggleBucket(bucket)}
                    className={`w-full flex items-center justify-between px-6 py-4 ${colors.headerBg} hover:opacity-90 transition-opacity`}
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className={`w-5 h-5 ${colors.text}`} />
                      ) : (
                        <ChevronRight className={`w-5 h-5 ${colors.text}`} />
                      )}
                      <div className="text-left">
                        <h3 className={`text-sm font-bold ${colors.text}`}>
                          {bucketLabels[bucket]}
                        </h3>
                        <p className="text-xs text-slate-500">{items.length} invoice{items.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${colors.text}`}>
                        ${(bucketTotals[bucket] || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </button>

                  {/* Invoice Table */}
                  {isExpanded && (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Invoice</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Load / Route</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Customer</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">POD</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Amount</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Balance</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Age</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {items.map((item) => {
                            const hasBrokenPods = item.brokenPodCount > 0;
                            return (
                              <tr
                                key={item.invoice.id}
                                className={`transition-colors ${hasBrokenPods ? 'bg-red-50/50 hover:bg-red-50' : 'hover:bg-slate-50'}`}
                              >
                                <td className="px-4 py-3">
                                  <span className="font-mono text-sm font-semibold text-slate-800">
                                    {item.invoice.invoice_number}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="text-sm">
                                    <p className="font-medium text-slate-800">{item.load?.load_number}</p>
                                    <p className="text-xs text-slate-500">
                                      {item.load?.origin_city}, {item.load?.origin_state} → {item.load?.dest_city}, {item.load?.dest_state}
                                    </p>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="text-sm text-slate-700">
                                    {item.customer?.company_name || item.load?.dest_company || '—'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {renderPodBadge(item)}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <span className="text-sm font-medium text-slate-800">
                                    ${Number(item.invoice.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <span className={`text-sm font-bold ${colors.text}`}>
                                    ${item.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${colors.bg} ${colors.text}`}>
                                    {item.ageDays}d
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    {/* Preview Invoice */}
                                    <button
                                      onClick={() => handleOpenPreview(item)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-purple-700 bg-purple-50 border border-purple-200 rounded-lg text-xs font-medium hover:bg-purple-100 transition-colors"
                                      title="Preview Invoice"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </button>

                                    {/* Re-upload POD (only shown for broken PODs) */}
                                    {hasBrokenPods && (
                                      <button
                                        onClick={() => handleReuploadPod(item)}
                                        disabled={reuploadingLoadId === item.load.id}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-red-700 bg-red-50 border border-red-200 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
                                        title="Delete broken PODs and reset for re-upload"
                                      >
                                        {reuploadingLoadId === item.load.id ? (
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                          <RotateCcw className="w-3.5 h-3.5" />
                                        )}
                                        <span className="hidden lg:inline">Re-upload</span>
                                      </button>
                                    )}

                                    {/* Record Payment */}
                                    <button
                                      onClick={() => onRecordPayment(item.load)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors"
                                    >
                                      <CreditCard className="w-3.5 h-3.5" />
                                      <span className="hidden lg:inline">Payment</span>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Invoice Preview Modal */}
      <InvoicePreviewModal
        isOpen={showPreview}
        load={previewLoad}
        invoice={previewInvoice}
        onClose={handlePreviewClosed}
        onPodReuploadRequested={handlePodReuploadFromPreview}
        onEmailSent={() => {
          // Refresh AR data after email sent so pipeline reflects the change
          fetchARData();
        }}
      />

    </div>
  );
};

export default AccountsReceivableView;
