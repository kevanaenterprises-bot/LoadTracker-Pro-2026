import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  ArrowLeft, Mail, RefreshCw, Loader2, CheckCircle, XCircle,
  AlertTriangle, Clock, Search, Filter, Send, Calendar,
  ChevronDown, ChevronUp, ExternalLink, RotateCcw, Inbox
} from 'lucide-react';

interface EmailLog {
  id: string;
  load_id: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  load_number: string | null;
  recipient_email: string;
  recipient_name: string | null;
  sender_email: string | null;
  subject: string | null;
  status: 'sent' | 'failed' | 'bounced' | 'delivered';
  resend_message_id: string | null;
  error_message: string | null;
  auto_triggered: boolean;
  created_at: string;
}

interface EmailDeliveryLogViewProps {
  onBack: () => void;
}

const EmailDeliveryLogView: React.FC<EmailDeliveryLogViewProps> = ({ onBack }) => {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resendResult, setResendResult] = useState<{ id: string; success: boolean; message: string } | null>(null);

  useEffect(() => {
    fetchLogs();
  }, [statusFilter, dateRange]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('email_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (dateRange !== 'all') {
        const now = new Date();
        let fromDate: Date;
        switch (dateRange) {
          case 'today':
            fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
          case '7days':
            fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case '30days':
            fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          default:
            fromDate = new Date(0);
        }
        query = query.gte('created_at', fromDate.toISOString());
      }

      const { data, error } = await query;
      if (error) {
        console.error('Failed to fetch email logs:', error);
      } else {
        setLogs(data || []);
      }
    } catch (err) {
      console.error('Error fetching email logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchLogs();
    setRefreshing(false);
  };

  const handleResend = async (log: EmailLog) => {
    if (!log.load_id) {
      setResendResult({ id: log.id, success: false, message: 'No load_id associated with this email log. Cannot resend.' });
      return;
    }

    setResendingId(log.id);
    setResendResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('send-invoice-email', {
        body: { load_id: log.load_id },
      });

      if (error) {
        setResendResult({ id: log.id, success: false, message: data?.error || error.message || 'Resend failed' });
      } else if (data?.success) {
        setResendResult({ id: log.id, success: true, message: data.message || 'Email resent successfully!' });
        // Refresh logs to show the new entry
        setTimeout(() => fetchLogs(), 1500);
      } else {
        setResendResult({ id: log.id, success: false, message: data?.error || 'Resend failed' });
      }
    } catch (err: any) {
      setResendResult({ id: log.id, success: false, message: err.message || 'Failed to resend' });
    } finally {
      setResendingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sent':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold">
            <CheckCircle className="w-3.5 h-3.5" />
            Sent
          </span>
        );
      case 'delivered':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
            <CheckCircle className="w-3.5 h-3.5" />
            Delivered
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold">
            <XCircle className="w-3.5 h-3.5" />
            Failed
          </span>
        );
      case 'bounced':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">
            <AlertTriangle className="w-3.5 h-3.5" />
            Bounced
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-semibold">
            <Clock className="w-3.5 h-3.5" />
            {status}
          </span>
        );
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  // Filter logs by search query
  const filteredLogs = logs.filter(log => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (log.recipient_email || '').toLowerCase().includes(q) ||
      (log.recipient_name || '').toLowerCase().includes(q) ||
      (log.invoice_number || '').toLowerCase().includes(q) ||
      (log.load_number || '').toLowerCase().includes(q) ||
      (log.subject || '').toLowerCase().includes(q)
    );
  });

  // Stats
  const totalSent = logs.filter(l => l.status === 'sent' || l.status === 'delivered').length;
  const totalFailed = logs.filter(l => l.status === 'failed').length;
  const totalBounced = logs.filter(l => l.status === 'bounced').length;
  const totalAuto = logs.filter(l => l.auto_triggered).length;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Email Delivery Log</h2>
              <p className="text-sm text-slate-500">Track all invoice email delivery status</p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      <main className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-100 rounded-lg">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{totalSent}</p>
                <p className="text-xs text-slate-500 font-medium">Sent / Delivered</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-red-100 rounded-lg">
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{totalFailed}</p>
                <p className="text-xs text-slate-500 font-medium">Failed</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-100 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{totalBounced}</p>
                <p className="text-xs text-slate-500 font-medium">Bounced</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-100 rounded-lg">
                <Send className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{totalAuto}</p>
                <p className="text-xs text-slate-500 font-medium">Auto-Triggered</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by email, invoice #, load #..."
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>

            {/* Status Filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="pl-10 pr-8 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm appearance-none bg-white min-w-[140px]"
              >
                <option value="all">All Status</option>
                <option value="sent">Sent</option>
                <option value="delivered">Delivered</option>
                <option value="failed">Failed</option>
                <option value="bounced">Bounced</option>
              </select>
            </div>

            {/* Date Range */}
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="pl-10 pr-8 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm appearance-none bg-white min-w-[140px]"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
              </select>
            </div>
          </div>
        </div>

        {/* Email Log Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <span className="ml-3 text-slate-500">Loading email logs...</span>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <Inbox className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-700 mb-1">No Email Logs Found</h3>
              <p className="text-sm text-slate-500 text-center max-w-md">
                {searchQuery || statusFilter !== 'all' || dateRange !== 'all'
                  ? 'No emails match your current filters. Try adjusting your search criteria.'
                  : 'No invoice emails have been sent yet. Email logs will appear here after you send your first invoice email.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Recipient</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Invoice / Load</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Sent At</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Type</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLogs.map((log) => (
                    <React.Fragment key={log.id}>
                      <tr
                        className={`hover:bg-slate-50 transition-colors cursor-pointer ${expandedLogId === log.id ? 'bg-blue-50/50' : ''}`}
                        onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                      >
                        <td className="px-4 py-3">
                          {getStatusBadge(log.status)}
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-slate-800 truncate max-w-[200px]">
                              {log.recipient_email}
                            </p>
                            {log.recipient_name && log.recipient_name !== 'Test' && log.recipient_name !== 'Owner Confirmation' && (
                              <p className="text-xs text-slate-500 truncate max-w-[200px]">{log.recipient_name}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <div>
                            {log.invoice_number && (
                              <p className="text-sm font-medium text-blue-600">{log.invoice_number}</p>
                            )}
                            {log.load_number && (
                              <p className="text-xs text-slate-500">Load #{log.load_number}</p>
                            )}
                            {!log.invoice_number && !log.load_number && (
                              <p className="text-xs text-slate-400 italic">Test email</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <p className="text-sm text-slate-600">{formatDate(log.created_at)}</p>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          {log.auto_triggered ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                              <Send className="w-3 h-3" />Auto
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-medium">
                              Manual
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {log.status === 'failed' && log.load_id && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleResend(log);
                                }}
                                disabled={resendingId === log.id}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                              >
                                {resendingId === log.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <RotateCcw className="w-3.5 h-3.5" />
                                )}
                                Resend
                              </button>
                            )}
                            {expandedLogId === log.id ? (
                              <ChevronUp className="w-4 h-4 text-slate-400" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Details Row */}
                      {expandedLogId === log.id && (
                        <tr>
                          <td colSpan={6} className="px-4 py-4 bg-slate-50/80">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
                              <div className="space-y-3">
                                <div>
                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Recipient</p>
                                  <p className="text-sm text-slate-800">{log.recipient_email}</p>
                                  {log.recipient_name && <p className="text-xs text-slate-500">{log.recipient_name}</p>}
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Sender</p>
                                  <p className="text-sm text-slate-800">{log.sender_email || 'N/A'}</p>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Subject</p>
                                  <p className="text-sm text-slate-800">{log.subject || 'N/A'}</p>
                                </div>
                              </div>
                              <div className="space-y-3">
                                <div>
                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Sent At</p>
                                  <p className="text-sm text-slate-800">{formatDate(log.created_at)}</p>
                                </div>
                                {log.resend_message_id && (
                                  <div>
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Resend Message ID</p>
                                    <p className="text-sm text-slate-600 font-mono text-xs break-all">{log.resend_message_id}</p>
                                  </div>
                                )}
                                {log.error_message && (
                                  <div>
                                    <p className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-1">Error</p>
                                    <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{log.error_message}</p>
                                  </div>
                                )}
                                {log.invoice_number && (
                                  <div>
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Invoice</p>
                                    <p className="text-sm text-blue-600 font-semibold">{log.invoice_number}</p>
                                  </div>
                                )}
                                {log.load_number && (
                                  <div>
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Load</p>
                                    <p className="text-sm text-slate-800">#{log.load_number}</p>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Resend result */}
                            {resendResult && resendResult.id === log.id && (
                              <div className={`mt-4 p-3 rounded-lg flex items-start gap-2 ${resendResult.success ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
                                {resendResult.success ? (
                                  <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                                ) : (
                                  <XCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                                )}
                                <p className={`text-sm ${resendResult.success ? 'text-emerald-700' : 'text-red-700'}`}>
                                  {resendResult.message}
                                </p>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer info */}
        {filteredLogs.length > 0 && (
          <div className="mt-4 text-center">
            <p className="text-xs text-slate-400">
              Showing {filteredLogs.length} of {logs.length} email log entries
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

export default EmailDeliveryLogView;
