import React, { useState, useEffect } from 'react';
import { supabase, supabaseUrl, supabaseKey } from '@/lib/supabase';
import { 
  ArrowLeft, Settings, Phone, CheckCircle, 
  AlertCircle, MessageSquare, TestTube, Loader2, Info,
  Radar, Globe, Copy, Wifi, ShieldCheck, MapPin, Activity,
  FileText, Mail, ToggleLeft, ToggleRight, Send, ExternalLink, AtSign,
  Database, Wrench, AlertTriangle, XCircle, Server, Lock, RefreshCw, Zap
} from 'lucide-react';


interface SettingsViewProps {
  onBack: () => void;
}

interface GeofenceStats {
  total_geofences: number;
  active_geofences: number;
  total_devices: number;
  total_webhook_events: number;
  processed_events: number;
}

const SettingsView: React.FC<SettingsViewProps> = ({ onBack }) => {
  const [testPhone, setTestPhone] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [geofenceStats, setGeofenceStats] = useState<GeofenceStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [webhookUrlCopied, setWebhookUrlCopied] = useState(false);
  const [defaultRadius, setDefaultRadius] = useState(500);

  // Auto-invoice settings
  const [autoInvoiceEnabled, setAutoInvoiceEnabled] = useState(false);
  const [autoEmailEnabled, setAutoEmailEnabled] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [invoiceNotificationEmail, setInvoiceNotificationEmail] = useState('kevin@go4fc.com');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [toggleSaving, setToggleSaving] = useState<string | null>(null); // which toggle is currently saving


  // Test email
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{ success: boolean; message: string } | null>(null);

  // Email diagnostics
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagResult, setDiagResult] = useState<any>(null);

  // Database migration state
  const [dbCheckLoading, setDbCheckLoading] = useState(false);
  const [customerIdExists, setCustomerIdExists] = useState<boolean | null>(null);
  const [dbCheckError, setDbCheckError] = useState<string | null>(null);
  const [migrationRunning, setMigrationRunning] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showMigrationSql, setShowMigrationSql] = useState(false);
  const [sqlCopied, setSqlCopied] = useState(false);
  // Backfill state
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{ success: boolean; message: string; count?: number } | null>(null);

  const webhookUrl = `${window.location.origin.includes('localhost') ? 'https://tlksfrowyjprvjerydrp.supabase.co' : ''}/functions/v1/here-webhook`;

  useEffect(() => {
    fetchGeofenceStats();
    fetchSettings();
    checkCustomerIdColumn();
  }, []);

  const fetchSettings = async () => {
    setLoadingSettings(true);
    try {
      const { data } = await supabase
        .from('settings')
        .select('key, value')
        .in('key', ['auto_invoice_enabled', 'auto_email_invoice', 'invoice_notification_email']);

      if (data) {
        data.forEach(s => {
          if (s.key === 'auto_invoice_enabled') setAutoInvoiceEnabled(s.value === 'true');
          if (s.key === 'auto_email_invoice') setAutoEmailEnabled(s.value === 'true');
          if (s.key === 'invoice_notification_email') setInvoiceNotificationEmail(s.value || 'kevin@go4fc.com');
        });
      }
      console.log('[Settings] Loaded from DB:', data?.map(s => `${s.key}=${s.value}`).join(', '));
    } catch (err) {
      console.warn('Failed to fetch settings:', err);
    } finally {
      setLoadingSettings(false);
    }
  };


  // Save a single setting to DB with proper error checking
  const saveSetting = async (key: string, value: string): Promise<boolean> => {
    console.log(`[Settings] Saving ${key} = ${value}`);
    const { error } = await supabase
      .from('settings')
      .upsert({ key, value }, { onConflict: 'key' });
    
    if (error) {
      console.error(`[Settings] FAILED to save ${key}:`, error.message);
      return false;
    }
    console.log(`[Settings] Saved ${key} = ${value} successfully`);
    return true;
  };

  // Single master toggle: turns BOTH auto-invoice and auto-email on/off together
  const handleToggleAutomation = async () => {
    const newValue = !(autoInvoiceEnabled && autoEmailEnabled);
    setToggleSaving('automation');
    
    // Optimistically update UI
    setAutoInvoiceEnabled(newValue);
    setAutoEmailEnabled(newValue);
    
    // Save both settings
    const [invoiceOk, emailOk] = await Promise.all([
      saveSetting('auto_invoice_enabled', newValue.toString()),
      saveSetting('auto_email_invoice', newValue.toString()),
    ]);
    
    // If either failed, revert and show error
    if (!invoiceOk || !emailOk) {
      console.error('[Settings] Toggle failed, reverting...');
      setAutoInvoiceEnabled(!newValue);
      setAutoEmailEnabled(!newValue);
      alert('Failed to save setting. Please try again.');
    } else {
      // Verify by re-reading from DB
      const { data: verify } = await supabase
        .from('settings')
        .select('key, value')
        .in('key', ['auto_invoice_enabled', 'auto_email_invoice']);
      console.log('[Settings] Verification read:', verify?.map(s => `${s.key}=${s.value}`).join(', '));
    }
    
    setToggleSaving(null);
  };




  const handleSaveNotificationEmail = async () => {
    setSavingSettings(true);
    setSettingsSaved(false);
    try {
      await supabase
        .from('settings')
        .upsert({ key: 'invoice_notification_email', value: invoiceNotificationEmail.trim() }, { onConflict: 'key' });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save notification email:', err);
      alert('Failed to save. Please try again.');
    } finally {
      setSavingSettings(false);
    }
  };


  const handleSendTestEmail = async () => {
    if (!testEmailAddress) {
      setTestEmailResult({ success: false, message: 'Please enter a test email address' });
      return;
    }
    setSendingTestEmail(true);
    setTestEmailResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('send-invoice-email', {
        body: { load_id: '__test__', test_email: testEmailAddress },
      });

      if (error) {
        const errorMsg = data?.error || data?.message || error.message || 'Unknown error';
        const isNetworkError = errorMsg.toLowerCase().includes('failed to send') || errorMsg.toLowerCase().includes('network') || errorMsg.toLowerCase().includes('fetch');
        setTestEmailResult({ 
          success: false, 
          message: isNetworkError 
            ? `Network error reaching the edge function. This can happen if the function is cold-starting. Please try again in a few seconds. (${errorMsg})`
            : `${errorMsg}${data?.fix_instructions ? ' — ' + data.fix_instructions : ''}`
        });
      } else if (data?.success) {
        let msg = data.message || `Test email sent to ${testEmailAddress}!`;
        if (data.warning) msg += ` (${data.warning})`;
        if (data.resend_id) msg += ` [Resend ID: ${data.resend_id.substring(0, 12)}...]`;
        setTestEmailResult({ success: true, message: msg });
      } else {
        let msg = data?.error || data?.message || 'Test failed';
        if (data?.fix_instructions) msg += ` — Fix: ${data.fix_instructions}`;
        setTestEmailResult({ success: false, message: msg });
      }
    } catch (err: any) {
      setTestEmailResult({ 
        success: false, 
        message: `Request failed: ${err.message || 'Unknown error'}. Try clicking "Run Diagnostics" below for detailed analysis.` 
      });
    } finally {
      setSendingTestEmail(false);
    }
  };


  const handleDiagnoseEmail = async () => {
    setDiagnosing(true);
    setDiagResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('send-invoice-email', {
        body: { load_id: '__diagnose__' },
      });
      if (error) {
        setDiagResult({ error: error.message });
      } else {
        setDiagResult(data);
      }
    } catch (err: any) {
      setDiagResult({ error: err.message });
    } finally {
      setDiagnosing(false);
    }
  };



  const fetchGeofenceStats = async () => {
    setLoadingStats(true);
    try {
      const { count: totalGf } = await supabase.from('here_geofences').select('*', { count: 'exact', head: true });
      const { count: activeGf } = await supabase.from('here_geofences').select('*', { count: 'exact', head: true }).eq('status', 'active');
      const { count: totalDevices } = await supabase.from('here_devices').select('*', { count: 'exact', head: true }).eq('status', 'active');
      const { count: totalEvents } = await supabase.from('here_webhook_events').select('*', { count: 'exact', head: true });
      const { count: processedEvents } = await supabase.from('here_webhook_events').select('*', { count: 'exact', head: true }).eq('processed', true);

      setGeofenceStats({
        total_geofences: totalGf || 0,
        active_geofences: activeGf || 0,
        total_devices: totalDevices || 0,
        total_webhook_events: totalEvents || 0,
        processed_events: processedEvents || 0,
      });
    } catch (err) {
      console.warn('Failed to fetch geofence stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const handleSendTestSms = async () => {
    if (!testPhone) { setTestResult({ success: false, message: 'Please enter a test phone number' }); return; }
    setSendingTest(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('send-driver-sms', {
        body: {
          driverPhone: testPhone, driverName: 'Test Driver', loadNumber: 'TEST-001',
          origin: 'Test Origin, TX', destination: 'Test Destination, CA',
          acceptanceUrl: window.location.origin + '/driver-portal?token=test123',
          totalMiles: 350, pickupDate: new Date().toISOString(), deliveryDate: new Date().toISOString(),
        },
      });
      if (error) setTestResult({ success: false, message: error.message || 'Failed to send test SMS' });
      else if (data?.success) setTestResult({ success: true, message: 'Test SMS sent successfully!' });
      else setTestResult({ success: false, message: data?.error || 'Failed to send test SMS' });
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Failed to send test SMS' });
    } finally {
      setSendingTest(false);
    }
  };

  const handleCopyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setWebhookUrlCopied(true);
    setTimeout(() => setWebhookUrlCopied(false), 2000);
  };

  const formatPhoneNumber = (value: string) => {
    let cleaned = value.replace(/[^\d+]/g, '');
    if (cleaned && !cleaned.startsWith('+')) cleaned = '+' + cleaned;
    return cleaned;
  };


  // ─── Database Migration: customer_id column ───
  const MIGRATION_SQL = `-- Add customer_id column to loads table (required for invoice emails)
ALTER TABLE loads ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_loads_customer_id ON loads(customer_id);`;

  const checkCustomerIdColumn = async () => {
    setDbCheckLoading(true);
    setDbCheckError(null);
    try {
      const { data, error } = await supabase
        .from('loads')
        .select('customer_id')
        .limit(1);

      if (error) {
        const msg = error.message || '';
        if (msg.includes('customer_id') || msg.includes('does not exist') || msg.includes('column') || error.code === '42703') {
          setCustomerIdExists(false);
          console.log('[DB Check] customer_id column is MISSING from loads table');
        } else {
          setDbCheckError(msg);
          setCustomerIdExists(null);
          console.warn('[DB Check] Unexpected error checking customer_id:', msg);
        }
      } else {
        setCustomerIdExists(true);
        console.log('[DB Check] customer_id column EXISTS on loads table');
      }
    } catch (err: any) {
      setDbCheckError(err.message || 'Failed to check database schema');
      setCustomerIdExists(null);
    } finally {
      setDbCheckLoading(false);
    }
  };

  const handleRunMigration = async () => {
    setMigrationRunning(true);
    setMigrationResult(null);

    try {
      console.log('[Migration] Attempting to add customer_id column via edge function...');
      
      const { data, error } = await supabase.functions.invoke('scan-broken-pods', {
        body: { 
          action: 'run_migration',
          migration_sql: 'ALTER TABLE loads ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id)',
        },
      });

      if (error) {
        console.warn('[Migration] Edge function approach failed:', error.message);
        console.log('[Migration] Trying direct REST API approach...');
        
        const restResult = await tryDirectMigration();
        if (restResult.success) {
          setMigrationResult({ success: true, message: 'customer_id column added successfully! The email system should now work.' });
          setCustomerIdExists(true);
        } else {
          setMigrationResult({ 
            success: false, 
            message: `Automatic migration failed. Please run the SQL manually in your database dashboard. Error: ${restResult.error}` 
          });
          setShowMigrationSql(true);
        }
      } else if (data?.success) {
        setMigrationResult({ success: true, message: 'customer_id column added successfully! The email system should now work.' });
        setCustomerIdExists(true);
      } else {
        const restResult = await tryDirectMigration();
        if (restResult.success) {
          setMigrationResult({ success: true, message: 'customer_id column added successfully!' });
          setCustomerIdExists(true);
        } else {
          setMigrationResult({ 
            success: false, 
            message: data?.error || 'Migration returned an unexpected result. Please run the SQL manually.' 
          });
          setShowMigrationSql(true);
        }
      }
    } catch (err: any) {
      console.error('[Migration] Exception:', err);
      setMigrationResult({ 
        success: false, 
        message: `Migration failed: ${err.message}. Please run the SQL manually in your database dashboard.` 
      });
      setShowMigrationSql(true);
    } finally {
      setMigrationRunning(false);
    }
  };

  const tryDirectMigration = async (): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error: rpcError } = await supabase.rpc('exec_sql', { 
        query: 'ALTER TABLE loads ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id)' 
      });
      
      if (!rpcError) {
        return { success: true };
      }

      const { error: checkError } = await supabase.from('loads').select('customer_id').limit(1);
      if (!checkError) {
        return { success: true };
      }

      return { success: false, error: rpcError.message || 'RPC function not available' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const handleCopyMigrationSql = () => {
    navigator.clipboard.writeText(MIGRATION_SQL);
    setSqlCopied(true);
    setTimeout(() => setSqlCopied(false), 3000);
  };

  const handleBackfillCustomerIds = async () => {
    setBackfillRunning(true);
    setBackfillResult(null);

    try {
      const { data: loadsWithoutCustomer, error: fetchError } = await supabase
        .from('loads')
        .select('id, load_number, customer_id')
        .is('customer_id', null);

      if (fetchError) {
        setBackfillResult({ success: false, message: `Failed to fetch loads: ${fetchError.message}` });
        return;
      }

      if (!loadsWithoutCustomer || loadsWithoutCustomer.length === 0) {
        setBackfillResult({ success: true, message: 'All loads already have a customer_id assigned. No backfill needed.', count: 0 });
        return;
      }

      setBackfillResult({ 
        success: true, 
        message: `Found ${loadsWithoutCustomer.length} load(s) without a customer_id. These loads were created before the column was added. You can assign customers by editing each load.`,
        count: loadsWithoutCustomer.length 
      });
    } catch (err: any) {
      setBackfillResult({ success: false, message: `Backfill check failed: ${err.message}` });
    } finally {
      setBackfillRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Settings</h2>
              <p className="text-sm text-slate-500">Configure your LoadTracker system</p>
            </div>
          </div>
        </div>
      </header>

      <main className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* DATABASE HEALTH: customer_id column check & migration         */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className={`px-6 py-4 bg-gradient-to-r ${customerIdExists === false ? 'from-red-600 to-orange-600' : customerIdExists === true ? 'from-emerald-600 to-teal-600' : 'from-slate-600 to-slate-700'}`}>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Database className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Database Health — Email System</h3>
                <p className={`text-sm ${customerIdExists === false ? 'text-red-200' : customerIdExists === true ? 'text-emerald-200' : 'text-slate-300'}`}>
                  {customerIdExists === false 
                    ? 'Action required: Missing column blocking invoice emails' 
                    : customerIdExists === true 
                    ? 'All required columns present — email system ready'
                    : 'Checking database schema...'}
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-4">
            {dbCheckLoading && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
                <span className="ml-3 text-slate-600">Checking database schema...</span>
              </div>
            )}

            {customerIdExists === true && !dbCheckLoading && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-emerald-800">customer_id Column Present</h4>
                  <p className="text-sm text-emerald-700 mt-1">
                    The <code className="bg-emerald-100 px-1.5 py-0.5 rounded text-xs font-mono">loads.customer_id</code> column exists. 
                    The email system can look up customer email addresses when sending invoices.
                  </p>
                </div>
              </div>
            )}

            {customerIdExists === false && !dbCheckLoading && (
              <>
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-red-800">Missing: customer_id Column on loads Table</h4>
                    <p className="text-sm text-red-700 mt-1">
                      The <code className="bg-red-100 px-1.5 py-0.5 rounded text-xs font-mono">loads</code> table is missing the <code className="bg-red-100 px-1.5 py-0.5 rounded text-xs font-mono">customer_id</code> column. 
                      This is why invoice emails are failing — the system cannot look up which customer to email because the load has no link to the customer record.
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-blue-800 mb-2">How this affects the email system:</h4>
                      <ol className="text-sm text-blue-700 space-y-1.5 list-decimal list-inside">
                        <li>Driver uploads POD → invoice is auto-generated</li>
                        <li>System calls <code className="bg-blue-100 px-1 py-0.5 rounded text-xs font-mono">send-invoice-email</code> with the load_id</li>
                        <li>Edge function queries the load to find <code className="bg-blue-100 px-1 py-0.5 rounded text-xs font-mono">customer_id</code></li>
                        <li className="text-red-700 font-semibold">Column doesn't exist → customer_id is null → no email address found → email fails</li>
                      </ol>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={handleRunMigration}
                    disabled={migrationRunning}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-xl font-medium hover:from-red-700 hover:to-orange-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {migrationRunning ? (
                      <><Loader2 className="w-5 h-5 animate-spin" />Running Migration...</>
                    ) : (
                      <><Wrench className="w-5 h-5" />Add customer_id Column Now</>
                    )}
                  </button>
                  <button
                    onClick={() => setShowMigrationSql(!showMigrationSql)}
                    className="px-6 py-3 bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-medium hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
                  >
                    <FileText className="w-5 h-5" />
                    {showMigrationSql ? 'Hide SQL' : 'Show SQL'}
                  </button>
                </div>

                {migrationResult && (
                  <div className={`p-4 rounded-xl flex items-start gap-3 ${migrationResult.success ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
                    {migrationResult.success ? (
                      <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    )}
                    <p className={`text-sm ${migrationResult.success ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {migrationResult.message}
                    </p>
                  </div>
                )}

                {showMigrationSql && (
                  <div className="bg-slate-900 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2 bg-slate-800">
                      <span className="text-xs font-medium text-slate-400">SQL Migration</span>
                      <button
                        onClick={handleCopyMigrationSql}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${sqlCopied ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                      >
                        {sqlCopied ? <><CheckCircle className="w-3 h-3" />Copied</> : <><Copy className="w-3 h-3" />Copy SQL</>}
                      </button>
                    </div>
                    <pre className="p-4 text-sm text-emerald-400 font-mono overflow-x-auto whitespace-pre-wrap">
                      {MIGRATION_SQL}
                    </pre>
                    <div className="px-4 py-3 bg-slate-800 border-t border-slate-700">
                      <p className="text-xs text-slate-400">
                        Run this SQL in your Supabase SQL Editor (Dashboard → SQL Editor → New Query → Paste → Run)
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}

            {dbCheckError && !dbCheckLoading && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-amber-800">Could not check database schema</h4>
                  <p className="text-sm text-amber-700 mt-1">{dbCheckError}</p>
                </div>
              </div>
            )}

            {customerIdExists === true && (
              <div className="pt-4 border-t border-slate-200">
                <h4 className="font-medium text-slate-800 mb-2 flex items-center gap-2">
                  <Wrench className="w-5 h-5 text-slate-600" />
                  Backfill Check
                </h4>
                <p className="text-sm text-slate-500 mb-3">
                  Check if any existing loads are missing a customer assignment. Loads without a customer_id won't have invoice emails sent.
                </p>
                <button
                  onClick={handleBackfillCustomerIds}
                  disabled={backfillRunning}
                  className="px-5 py-2.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-medium hover:bg-slate-200 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {backfillRunning ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Checking...</>
                  ) : (
                    <><Database className="w-4 h-4" />Check for Missing Customer IDs</>
                  )}
                </button>
                {backfillResult && (
                  <div className={`mt-3 p-4 rounded-xl flex items-start gap-3 ${backfillResult.success && backfillResult.count === 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
                    {backfillResult.success && backfillResult.count === 0 ? (
                      <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    )}
                    <p className={`text-sm ${backfillResult.success && backfillResult.count === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {backfillResult.message}
                    </p>
                  </div>
                )}
              </div>
            )}

            {!dbCheckLoading && (
              <div className="pt-2">
                <button
                  onClick={checkCustomerIdColumn}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <Database className="w-4 h-4" />
                  Re-check Database Schema
                </button>
              </div>
            )}
          </div>
        </div>




        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* EMAIL DELIVERY: Resend API (Primary & Only Method)             */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-blue-700 to-blue-500">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Mail className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Email Delivery</h3>
                <p className="text-blue-200 text-sm">Invoice emails sent via Resend API from kevin@go4fc.com</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Resend API — Primary Method Card */}
            <div className="p-4 bg-blue-50 border-2 border-blue-300 rounded-xl">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500">Email Provider</span>
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 border border-emerald-300 rounded-full">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-[10px] font-semibold text-emerald-700">Active</span>
                </div>
              </div>
              <div className="flex items-center gap-2.5 mb-2">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Zap className="w-5 h-5 text-blue-700" />
                </div>
                <div>
                  <h4 className="font-semibold text-blue-900 text-sm">Resend API</h4>
                  <p className="text-[11px] text-blue-600">HTTPS Email API — go4fc.com verified domain</p>
                </div>
              </div>
              <div className="space-y-1.5 mt-3">
                <div className="flex items-center gap-2 text-xs text-blue-700">
                  <CheckCircle className="w-3 h-3 flex-shrink-0" />
                  <span>Sends FROM <strong>kevin@go4fc.com</strong> (verified domain)</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-blue-700">
                  <CheckCircle className="w-3 h-3 flex-shrink-0" />
                  <span>Up to 40MB attachments per email</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-blue-700">
                  <CheckCircle className="w-3 h-3 flex-shrink-0" />
                  <span>Auto-CC to kevin@go4fc.com &amp; gofarmsbills@gmail.com</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-blue-700">
                  <CheckCircle className="w-3 h-3 flex-shrink-0" />
                  <span>Retry with exponential backoff (2 attempts)</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-blue-700">
                  <Lock className="w-3 h-3 flex-shrink-0" />
                  <span>HTTPS secured — no SMTP ports needed</span>
                </div>
              </div>
              <div className="mt-3 p-2 bg-blue-100/50 rounded-lg">
                <p className="text-[10px] text-blue-600 font-mono">
                  RESEND_API_KEY (stored in Supabase Edge Function secrets)
                </p>
              </div>
            </div>

            {/* How it works */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-800 mb-2">How Email Delivery Works:</h4>
                  <ol className="text-sm text-blue-700 space-y-1.5 list-decimal list-inside">
                    <li>Invoice is generated (auto or manual) for a load with a customer assigned</li>
                    <li>System sends the invoice PDF to the <code className="bg-blue-100 px-1 py-0.5 rounded text-xs font-mono">send-invoice-email</code> edge function</li>
                    <li>Edge function fetches POD files from Supabase storage</li>
                    <li>Email is sent via <strong>Resend API</strong> from <strong>kevin@go4fc.com</strong></li>
                    <li>Invoice PDF + POD attachments are included</li>
                    <li>CC copy sent to kevin@go4fc.com &amp; gofarmsbills@gmail.com</li>
                  </ol>
                </div>
              </div>
            </div>

            {/* Invoice Email Contents */}
            <div className="pt-4 border-t border-slate-200">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <FileText className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-emerald-800 mb-2">Invoice Email Includes:</h4>
                    <ul className="text-sm text-emerald-700 space-y-1 list-disc list-inside">
                      <li>Professional HTML invoice with company branding</li>
                      <li>Invoice number, load number, BOL/POD reference</li>
                      <li>Bill-to customer details and billing address</li>
                      <li>Total amount due with payment terms</li>
                      <li><strong>POD PDF attachments</strong> — fetched from storage, attached individually</li>
                      <li>Confirmation copy to your accounting email addresses</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Test Email */}
            <div className="pt-4 border-t border-slate-200">
              <h4 className="font-medium text-slate-800 mb-2 flex items-center gap-2">
                <TestTube className="w-5 h-5 text-slate-600" />
                Send Test Email
              </h4>
              <p className="text-sm text-slate-500 mb-3">
                Send a test email to verify your Resend API configuration is working correctly.
              </p>
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="email"
                    value={testEmailAddress}
                    onChange={(e) => setTestEmailAddress(e.target.value)}
                    placeholder="Enter test email address"
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  />
                </div>
                <button
                  onClick={handleSendTestEmail}
                  disabled={sendingTestEmail || !testEmailAddress}
                  className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {sendingTestEmail ? (
                    <><Loader2 className="w-5 h-5 animate-spin" />Testing...</>
                  ) : (
                    <><Send className="w-5 h-5" />Send Test</>
                  )}
                </button>
              </div>
              {testEmailResult && (
                <div className={`mt-4 p-4 rounded-xl flex items-start gap-3 ${testEmailResult.success ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                  {testEmailResult.success ? <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />}
                  <div className="flex-1">
                    <p className="text-sm">{testEmailResult.message}</p>
                    {!testEmailResult.success && testEmailResult.message.toLowerCase().includes('api key') && (
                      <div className="mt-3 p-3 bg-red-100 border border-red-300 rounded-lg">
                        <p className="text-xs font-bold text-red-800 mb-1">Resend API Key Issue</p>
                        <p className="text-xs text-red-700">
                          Your Resend API key may be invalid or expired. 
                          Get a new key at <a href="https://resend.com/api-keys" target="_blank" rel="noopener" className="underline font-semibold">resend.com/api-keys</a> and 
                          update the <code className="bg-red-200 px-1 rounded font-mono">RESEND_API_KEY</code> secret in your Supabase Edge Function settings.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>


            {/* Diagnose Email Configuration */}
            <div className="pt-4 border-t border-slate-200">
              <h4 className="font-medium text-slate-800 mb-2 flex items-center gap-2">
                <Wrench className="w-5 h-5 text-slate-600" />
                Diagnose Email Configuration
              </h4>
              <p className="text-sm text-slate-500 mb-3">
                Tests the Resend API connection and reports whether email delivery is working. Use this to troubleshoot failed invoice emails.
              </p>
              <button
                onClick={handleDiagnoseEmail}
                disabled={diagnosing}
                className="px-6 py-3 bg-amber-600 text-white rounded-xl font-medium hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {diagnosing ? (
                  <><Loader2 className="w-5 h-5 animate-spin" />Diagnosing...</>
                ) : (
                  <><Activity className="w-5 h-5" />Run Diagnostics</>
                )}
              </button>

              {diagResult && (
                <div className="mt-4 space-y-3">
                  {/* Summary banner */}
                  {diagResult.summary && (
                    <div className={`p-4 rounded-xl border-2 flex items-center gap-3 ${
                      diagResult.summary.startsWith('Ready') 
                        ? 'bg-emerald-50 border-emerald-400' 
                        : 'bg-red-50 border-red-400'
                    }`}>
                      {diagResult.summary.startsWith('Ready') ? (
                        <CheckCircle className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
                      )}
                      <div>
                        <p className={`font-bold text-sm ${diagResult.summary.startsWith('Ready') ? 'text-emerald-800' : 'text-red-800'}`}>
                          {diagResult.summary}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Credentials summary */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Configured Credentials</h5>
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <span className="text-slate-500">RESEND_API_KEY:</span>
                      <span className="text-slate-700">{diagResult.resend_key || 'N/A'}</span>
                      <span className="text-slate-500">FROM_EMAIL:</span>
                      <span className="text-slate-700">kevin@go4fc.com</span>
                      <span className="text-slate-500">AUTO_CC:</span>
                      <span className="text-slate-700">kevin@go4fc.com, gofarmsbills@gmail.com</span>
                    </div>
                  </div>

                  {/* Method results — only show Resend */}
                  {diagResult.methods && Object.entries(diagResult.methods)
                    .filter(([method]) => method === 'resend')
                    .map(([method, result]: [string, any]) => {
                    const isOk = result.status === 'READY';
                    const isFailed = result.status === 'SEND_FAILED' || result.status === 'TOKEN_FAIL' || result.status === 'INVALID_KEY' || result.status === 'PERM_DENIED' || result.status === 'ERROR';
                    const isNotConfigured = result.status === 'NOT_CONFIGURED';
                    return (
                      <div key={method} className={`p-4 rounded-xl border ${isOk ? 'bg-emerald-50 border-emerald-200' : isFailed ? 'bg-red-50 border-red-200' : isNotConfigured ? 'bg-slate-50 border-slate-200' : 'bg-amber-50 border-amber-200'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-sm text-slate-800">Resend API</span>
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${isOk ? 'bg-emerald-200 text-emerald-800' : isFailed ? 'bg-red-200 text-red-800' : 'bg-slate-200 text-slate-700'}`}>
                            {result.status}
                          </span>
                        </div>
                        {result.message && (
                          <p className={`text-xs mt-1 ${isOk ? 'text-emerald-700' : isFailed ? 'text-red-700' : 'text-slate-600'}`}>{result.message}</p>
                        )}

                        {/* Resend domain info */}
                        {result.domain_list && (
                          <div className="mt-2 p-2 bg-white/60 rounded-lg border border-slate-200">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-slate-500 font-medium">Verified Domains ({result.domains}):</span>
                              <span className="text-slate-700 font-mono text-[10px]">{result.domain_list}</span>
                            </div>
                          </div>
                        )}

                        {result.send_error && (
                          <div className="mt-2 p-2 bg-red-100/50 rounded-lg">
                            <p className="text-xs text-red-700 font-mono break-all">{result.send_error}</p>
                          </div>
                        )}
                        {result.send_full_error && (
                          <details className="mt-1">
                            <summary className="text-[10px] text-red-500 cursor-pointer hover:text-red-700">Show full error response</summary>
                            <pre className="mt-1 p-2 bg-red-100/30 rounded text-[10px] text-red-600 font-mono break-all whitespace-pre-wrap">{result.send_full_error}</pre>
                          </details>
                        )}
                        {result.error && !result.send_error && (
                          <p className="text-xs text-red-700 mt-1 break-all leading-relaxed">{typeof result.error === 'string' ? result.error : JSON.stringify(result.error)}</p>
                        )}
                      </div>
                    );
                  })}

                  {/* Fix instructions */}
                  {diagResult.fixes && diagResult.fixes.length > 0 && (
                    <div className="p-5 bg-red-50 border-2 border-red-400 rounded-xl">
                      <h5 className="font-bold text-red-800 text-base mb-3 flex items-center gap-2">
                        <AlertTriangle className="w-6 h-6" />
                        {diagResult.fixes.length === 1 ? 'Fix Required' : `${diagResult.fixes.length} Issues Found`}
                      </h5>
                      
                      {diagResult.fixes.map((fix: string, idx: number) => (
                        <div key={idx} className="mb-3 p-4 bg-white border border-red-200 rounded-lg">
                          <p className="text-sm text-red-700 leading-relaxed">{fix}</p>
                        </div>
                      ))}

                      {/* Resend key fix */}
                      {diagResult.methods?.resend?.status === 'INVALID_KEY' && (
                        <div className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                          <h6 className="font-bold text-amber-800 mb-1 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4" />
                            Resend API Key Invalid
                          </h6>
                          <p className="text-xs text-amber-700">
                            Your Resend API key is expired or invalid. 
                            Get a new key at <a href="https://resend.com/api-keys" target="_blank" rel="noopener" className="underline font-semibold">resend.com/api-keys</a> and update the <code className="bg-amber-100 px-1 rounded font-mono">RESEND_API_KEY</code> secret in Supabase Edge Function settings.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Success case - no fixes needed */}
                  {diagResult.fixes && diagResult.fixes.length === 0 && diagResult.summary?.startsWith('Ready') && (
                    <div className="p-4 bg-emerald-50 border-2 border-emerald-400 rounded-xl">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-6 h-6 text-emerald-600" />
                        <div>
                          <p className="font-bold text-emerald-800">Resend API is working!</p>
                          <p className="text-sm text-emerald-700 mt-1">
                            Try sending a test email above to confirm end-to-end delivery.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Raw diagnostic data (collapsible) */}
                  <details className="mt-2">
                    <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">Show raw diagnostic JSON</summary>
                    <pre className="mt-2 p-3 bg-slate-900 rounded-xl text-[10px] text-emerald-400 font-mono overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
                      {JSON.stringify(diagResult, null, 2)}
                    </pre>
                  </details>

                </div>
              )}

            </div>
          </div>
        </div>




        {/* Auto-Invoice & Auto-Email Settings — ONE Toggle */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-purple-600 to-indigo-600">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Automation Pipeline</h3>
                <p className="text-purple-200 text-sm">Auto-invoice + auto-email after POD upload</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Single Master Toggle */}
            <div className="flex items-center justify-between p-5 bg-slate-50 rounded-xl border-2 border-slate-200">
              <div>
                <h4 className="font-semibold text-slate-800 text-lg">Full Automation</h4>
                <p className="text-sm text-slate-500 mt-1">
                  When ON: driver uploads POD → invoice auto-generated → email auto-sent to customer via Resend.
                  <br />
                  When OFF: driver uploads POD → load goes to "Delivered" for your manual review.
                </p>
              </div>
              <button
                onClick={handleToggleAutomation}
                disabled={!!toggleSaving}
                className="flex-shrink-0 ml-4"
              >
                {toggleSaving === 'automation' ? (
                  <Loader2 className="w-12 h-12 text-purple-500 animate-spin" />
                ) : (autoInvoiceEnabled && autoEmailEnabled) ? (
                  <ToggleRight className="w-14 h-14 text-emerald-500" />
                ) : (
                  <ToggleLeft className="w-14 h-14 text-slate-400" />
                )}
              </button>
            </div>

            {/* Status Banner */}
            <div className={`p-4 rounded-xl border-2 ${(autoInvoiceEnabled && autoEmailEnabled) ? 'bg-emerald-50 border-emerald-300' : 'bg-amber-50 border-amber-300'}`}>
              {(autoInvoiceEnabled && autoEmailEnabled) ? (
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-emerald-800 text-base">Full Automation is ON</h4>
                    <p className="text-sm text-emerald-700 mt-1">
                      When a driver uploads POD, the system will automatically:
                    </p>
                    <ol className="text-sm text-emerald-700 mt-2 space-y-1 list-decimal list-inside">
                      <li>Mark the load as "Delivered"</li>
                      <li>Generate an invoice</li>
                      <li>Email the invoice to the customer via Resend from kevin@go4fc.com</li>
                      <li>Move the load to "Waiting On Payment" in your pipeline</li>
                    </ol>
                    <div className="mt-3 flex items-center gap-2 text-xs text-emerald-600 font-medium">
                      <Send className="w-3.5 h-3.5" />
                      <span>POD Upload → Invoice Generated → Email Sent via Resend API</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-amber-800 text-base">Full Automation is OFF</h4>
                    <p className="text-sm text-amber-700 mt-1">
                      When a driver uploads POD, the load will be marked as "Delivered". You can review the load and POD documents, 
                      then manually generate the invoice and send the email from the dashboard.
                    </p>
                  </div>
                </div>
              )}
            </div>




            {/* Invoice Notification Email */}
            <div className="pt-4 border-t border-slate-200">
              <h4 className="font-medium text-slate-800 mb-2 flex items-center gap-2">
                <Mail className="w-5 h-5 text-slate-600" />
                Invoice CC Email (Accounting)
              </h4>
              <p className="text-sm text-slate-500 mb-3">
                A confirmation copy of every invoice email is sent to this address for your accounting records.
              </p>
              <div className="flex gap-3">
                <input
                  type="email"
                  value={invoiceNotificationEmail}
                  onChange={(e) => setInvoiceNotificationEmail(e.target.value)}
                  placeholder="kevin@go4fc.com"
                  className="flex-1 px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
                />
                <button
                  onClick={handleSaveNotificationEmail}
                  disabled={savingSettings}
                  className={`px-6 py-3 rounded-xl font-medium transition-colors flex items-center gap-2 ${
                    settingsSaved 
                      ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                      : 'bg-purple-600 text-white hover:bg-purple-700'
                  } disabled:opacity-50`}
                >
                  {savingSettings ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : settingsSaved ? (
                    <><CheckCircle className="w-5 h-5" />Saved</>
                  ) : (
                    'Save'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* SMS Settings */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-purple-600">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <MessageSquare className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">SMS Dispatch Settings</h3>
                <p className="text-indigo-200 text-sm">Telnyx SMS configuration for driver notifications</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-emerald-800">Telnyx SMS Configured</h4>
                <p className="text-sm text-emerald-700 mt-1">
                  SMS notifications will be sent from <span className="font-mono font-medium">+1-214-817-0744</span>
                </p>
              </div>
            </div>

            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-800 mb-2">SMS now includes:</h4>
                  <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
                    <li>Load number and route (origin to destination)</li>
                    <li>Total miles (calculated via HERE Maps)</li>
                    <li>Pickup and delivery dates</li>
                    <li>Load rate</li>
                    <li>Acceptance link for the Driver Portal</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-200">
              <h4 className="font-medium text-slate-800 mb-4 flex items-center gap-2">
                <TestTube className="w-5 h-5 text-slate-600" />
                Test SMS Configuration
              </h4>
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="tel"
                    value={testPhone}
                    onChange={(e) => setTestPhone(formatPhoneNumber(e.target.value))}
                    placeholder="Enter test phone number (e.g., +15551234567)"
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  />
                </div>
                <button
                  onClick={handleSendTestSms}
                  disabled={sendingTest || !testPhone}
                  className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {sendingTest ? (<><Loader2 className="w-5 h-5 animate-spin" />Sending...</>) : (<><MessageSquare className="w-5 h-5" />Send Test</>)}
                </button>
              </div>
              {testResult && (
                <div className={`mt-4 p-4 rounded-xl flex items-center gap-3 ${testResult.success ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                  {testResult.success ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
                  <p>{testResult.message}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* HERE Maps Geofencing Settings */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-cyan-600 to-blue-600">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Radar className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">HERE Maps Geofencing</h3>
                <p className="text-cyan-200 text-sm">GPS-verified geofence tracking for automated timestamps</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-emerald-800">HERE API Configured</h4>
                <p className="text-sm text-emerald-700 mt-1">Geocoding, routing, and geofence verification are active.</p>
              </div>
            </div>

            {loadingStats ? (
              <div className="flex items-center justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-cyan-600" /></div>
            ) : geofenceStats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-4 text-center">
                  <Radar className="w-5 h-5 text-cyan-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-cyan-700">{geofenceStats.active_geofences}</p>
                  <p className="text-xs text-cyan-600 font-medium">Active Geofences</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                  <MapPin className="w-5 h-5 text-blue-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-blue-700">{geofenceStats.total_geofences}</p>
                  <p className="text-xs text-blue-600 font-medium">Total Geofences</p>
                </div>
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-center">
                  <Wifi className="w-5 h-5 text-indigo-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-indigo-700">{geofenceStats.total_devices}</p>
                  <p className="text-xs text-indigo-600 font-medium">Tracked Devices</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                  <Activity className="w-5 h-5 text-emerald-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-emerald-700">{geofenceStats.total_webhook_events}</p>
                  <p className="text-xs text-emerald-600 font-medium">Webhook Events</p>
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-slate-200">
              <h4 className="font-medium text-slate-800 mb-2 flex items-center gap-2">
                <Globe className="w-5 h-5 text-slate-600" />
                Webhook Endpoint URL
              </h4>
              <div className="flex gap-2">
                <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-mono text-sm text-slate-700 overflow-x-auto">
                  {webhookUrl}
                </div>
                <button onClick={handleCopyWebhookUrl} className={`px-4 py-3 rounded-xl font-medium transition-all flex items-center gap-2 ${webhookUrlCopied ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200'}`}>
                  {webhookUrlCopied ? (<><CheckCircle className="w-4 h-4" />Copied</>) : (<><Copy className="w-4 h-4" />Copy</>)}
                </button>
              </div>
            </div>

            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-800 mb-2">Tracking Workflow (Updated):</h4>
                  <ul className="text-sm text-blue-700 space-y-1.5 list-disc list-inside">
                    <li><strong>Before dispatch:</strong> Open Edit Load and click "Initiate Tracking" to set up geofences and calculate mileage</li>
                    <li><strong>On dispatch:</strong> Geofences are also auto-created when assigning a driver (as a backup)</li>
                    <li>Mileage is calculated via HERE Routing API and included in the dispatch SMS</li>
                    <li>Driver can view route map in the Driver Portal</li>
                    <li>GPS tracking from driver's phone checks geofence boundaries every 30 seconds</li>
                    <li>Arrival/departure timestamps are auto-recorded and GPS-verified</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default SettingsView;
