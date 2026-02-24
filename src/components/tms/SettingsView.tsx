import React, { useState, useEffect } from 'react';
import { db } from '@/lib/supabaseCompat';
import { 
  ArrowLeft, Settings, Phone, CheckCircle, 
  AlertCircle, MessageSquare, TestTube, Loader2, Info,
  Radar, Globe, Copy, Wifi, ShieldCheck, MapPin, Activity,
  FileText, Mail, ToggleLeft, ToggleRight, Send, ExternalLink, AtSign
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
  const [invoiceNotificationEmail, setInvoiceNotificationEmail] = useState('kevin@go4fc.com');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Resend email settings
  const [resendFromEmail, setResendFromEmail] = useState('');
  const [savingFromEmail, setSavingFromEmail] = useState(false);
  const [fromEmailSaved, setFromEmailSaved] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{ success: boolean; message: string } | null>(null);

  const webhookUrl = `${window.location.origin.includes('localhost') ? 'https://tlksfrowyjprvjerydrp.db.co' : ''}/functions/v1/here-webhook`;

  useEffect(() => {
    fetchGeofenceStats();
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data } = await db
        .from('settings')
        .select('key, value')
        .in('key', ['auto_invoice_enabled', 'invoice_notification_email', 'resend_from_email']);

      if (data) {
        data.forEach(s => {
          if (s.key === 'auto_invoice_enabled') setAutoInvoiceEnabled(s.value === 'true');
          if (s.key === 'invoice_notification_email') setInvoiceNotificationEmail(s.value || 'kevin@go4fc.com');
          if (s.key === 'resend_from_email') setResendFromEmail(s.value || '');
        });
      }
    } catch (err) {
      console.warn('Failed to fetch settings:', err);
    }
  };

  const handleToggleAutoInvoice = async () => {
    const newValue = !autoInvoiceEnabled;
    setAutoInvoiceEnabled(newValue);
    
    try {
      await db
        .from('settings')
        .upsert({ key: 'auto_invoice_enabled', value: newValue.toString() }, { onConflict: 'key' });
    } catch (err) {
      console.error('Failed to save auto-invoice setting:', err);
      setAutoInvoiceEnabled(!newValue); // revert
    }
  };

  const handleSaveNotificationEmail = async () => {
    setSavingSettings(true);
    setSettingsSaved(false);
    try {
      await db
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

  const handleSaveFromEmail = async () => {
    setSavingFromEmail(true);
    setFromEmailSaved(false);
    try {
      await db
        .from('settings')
        .upsert({ key: 'resend_from_email', value: resendFromEmail.trim() }, { onConflict: 'key' });
      setFromEmailSaved(true);
      setTimeout(() => setFromEmailSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save from email:', err);
      alert('Failed to save. Please try again.');
    } finally {
      setSavingFromEmail(false);
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
      // Call new backend API instead of Supabase Edge Function
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${API_URL}/api/send-invoice-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ load_id: '__test__', test_email: testEmailAddress }),
      });
      const data = await response.json();
      const error = response.ok ? null : { message: data.error || 'Test failed' };

      if (error) {
        setTestEmailResult({ 
          success: false, 
          message: data?.error || error.message || 'Test failed - check configuration' 
        });
      } else if (data?.success) {
        let msg = data.message || `Test email sent to ${testEmailAddress}!`;
        if (data.warning) msg += ` (${data.warning})`;
        setTestEmailResult({ success: true, message: msg });
      } else {
        setTestEmailResult({ 
          success: false, 
          message: data?.error || 'Test failed - check your Resend API key and domain configuration' 
        });
      }
    } catch (err: any) {
      setTestEmailResult({ success: false, message: err.message || 'Failed to test email configuration' });
    } finally {
      setSendingTestEmail(false);
    }
  };


  const fetchGeofenceStats = async () => {
    setLoadingStats(true);
    try {
      const { count: totalGf } = await db.from('here_geofences').select('*', { count: 'exact', head: true });
      const { count: activeGf } = await db.from('here_geofences').select('*', { count: 'exact', head: true }).eq('status', 'active');
      const { count: totalDevices } = await db.from('here_devices').select('*', { count: 'exact', head: true }).eq('status', 'active');
      const { count: totalEvents } = await db.from('here_webhook_events').select('*', { count: 'exact', head: true });
      const { count: processedEvents } = await db.from('here_webhook_events').select('*', { count: 'exact', head: true }).eq('processed', true);

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
      const { data, error } = await db.functions.invoke('send-driver-sms', {
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

        {/* Resend Email Delivery Settings */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-cyan-600">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Mail className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Email Delivery (Resend)</h3>
                <p className="text-blue-200 text-sm">Send invoices directly to customer inboxes</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Status */}
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-emerald-800">Resend API Configured</h4>
                <p className="text-sm text-emerald-700 mt-1">
                  Invoice emails will be delivered via <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="font-medium underline hover:text-emerald-900">Resend</a>. 
                  Emails include the full HTML invoice with POD document links.
                </p>
              </div>
            </div>

            {/* How it works */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-800 mb-2">Invoice Email Includes:</h4>
                  <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
                    <li>Professional HTML invoice with company branding</li>
                    <li>Invoice number, load number, BOL/POD reference</li>
                    <li>Bill-to customer details and billing address</li>
                    <li>Pickup and delivery route information</li>
                    <li>Line items with total amount due</li>
                    <li><strong>POD document links</strong> - clickable View/Download buttons for each uploaded POD</li>
                    <li>Payment terms and company contact info</li>
                    <li>CC to notification email (if configured below)</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* From Email Address */}
            <div className="pt-4 border-t border-slate-200">
              <h4 className="font-medium text-slate-800 mb-2 flex items-center gap-2">
                <AtSign className="w-5 h-5 text-slate-600" />
                Sender Email Address (From)
              </h4>
              <p className="text-sm text-slate-500 mb-3">
                The email address invoices will be sent from. This must be from a domain verified in your{' '}
                <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline inline-flex items-center gap-1">
                  Resend dashboard <ExternalLink className="w-3 h-3" />
                </a>. 
                Leave blank to use your company email from Company Settings, or <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">onboarding@resend.dev</code> as a fallback for testing.
              </p>
              <div className="flex gap-3">
                <input
                  type="email"
                  value={resendFromEmail}
                  onChange={(e) => setResendFromEmail(e.target.value)}
                  placeholder="invoices@yourdomain.com (or leave blank for default)"
                  className="flex-1 px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                />
                <button
                  onClick={handleSaveFromEmail}
                  disabled={savingFromEmail}
                  className={`px-6 py-3 rounded-xl font-medium transition-colors flex items-center gap-2 ${
                    fromEmailSaved 
                      ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  } disabled:opacity-50`}
                >
                  {savingFromEmail ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : fromEmailSaved ? (
                    <><CheckCircle className="w-5 h-5" />Saved</>
                  ) : (
                    'Save'
                  )}
                </button>
              </div>
              {!resendFromEmail && (
                <p className="mt-2 text-xs text-amber-600 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  No custom from address set. Will use company email or fall back to onboarding@resend.dev for testing.
                </p>
              )}
            </div>

            {/* Domain Setup Guide */}
            <div className="pt-4 border-t border-slate-200">
              <h4 className="font-medium text-slate-800 mb-3 flex items-center gap-2">
                <Globe className="w-5 h-5 text-slate-600" />
                Domain Verification
              </h4>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <p className="text-sm text-slate-600 mb-3">
                  To send emails from your own domain (e.g., <code className="bg-white px-1.5 py-0.5 rounded text-xs font-mono border">invoices@go4fc.com</code>), you need to verify your domain in Resend:
                </p>
                <ol className="text-sm text-slate-600 space-y-2 list-decimal list-inside">
                  <li>Go to <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline font-medium">resend.com/domains</a></li>
                  <li>Click "Add Domain" and enter your domain (e.g., go4fc.com)</li>
                  <li>Add the DNS records (MX, SPF, DKIM) to your domain provider</li>
                  <li>Wait for verification (usually a few minutes)</li>
                  <li>Enter your verified email address in the "Sender Email" field above</li>
                </ol>
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs text-amber-700 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>
                      Until your domain is verified, emails will be sent from <code className="bg-white px-1 py-0.5 rounded font-mono">onboarding@resend.dev</code> (Resend's test sender). 
                      The customer will still receive the invoice, but it may land in spam. Verify your domain for reliable delivery.
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* Test Email */}
            <div className="pt-4 border-t border-slate-200">
              <h4 className="font-medium text-slate-800 mb-4 flex items-center gap-2">
                <TestTube className="w-5 h-5 text-slate-600" />
                Send Test Email
              </h4>
              <p className="text-sm text-slate-500 mb-3">
                Send a test email to verify your Resend configuration is working. A confirmation email will be delivered to the address below.
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
                    <><Send className="w-5 h-5" />Test Config</>
                  )}
                </button>
              </div>
              {testEmailResult && (
                <div className={`mt-4 p-4 rounded-xl flex items-start gap-3 ${testEmailResult.success ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                  {testEmailResult.success ? <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />}
                  <p className="text-sm">{testEmailResult.message}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Auto-Invoice Settings */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-purple-600 to-indigo-600">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Auto-Invoice Settings</h3>
                <p className="text-purple-200 text-sm">Automatic invoice generation after POD upload</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Auto-Invoice Toggle */}
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <h4 className="font-medium text-slate-800">Automatic Invoicing</h4>
                <p className="text-sm text-slate-500 mt-1">
                  When enabled, invoices are automatically generated when a driver uploads POD documents. 
                  When disabled, loads go to "Delivered" status for your review before invoicing.
                </p>
              </div>
              <button
                onClick={handleToggleAutoInvoice}
                className="flex-shrink-0 ml-4"
              >
                {autoInvoiceEnabled ? (
                  <ToggleRight className="w-12 h-12 text-emerald-500" />
                ) : (
                  <ToggleLeft className="w-12 h-12 text-slate-400" />
                )}
              </button>
            </div>

            <div className={`p-4 rounded-xl border ${autoInvoiceEnabled ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
              {autoInvoiceEnabled ? (
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-emerald-800">Auto-Invoice is ON</h4>
                    <p className="text-sm text-emerald-700 mt-1">
                      When a driver uploads POD, the load will automatically be marked as delivered, an invoice will be generated, and the load status will change to "Invoiced".
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-amber-800">Auto-Invoice is OFF</h4>
                    <p className="text-sm text-amber-700 mt-1">
                      When a driver uploads POD, the load will be marked as "Delivered". You can review the load and POD documents before manually generating the invoice from the dashboard.
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
                This email will automatically be CC'd on all invoice emails sent to customers. Used for accounting records.
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
