import React, { useState, useEffect } from 'react';
import { db } from '@/lib/supabaseCompat';
import { generateNextInvoiceNumber } from '@/lib/invoiceUtils';

import { useAuth } from '@/contexts/AuthContext';
import { useUsage, TIER_LIMITS, FEATURE_LABELS, FeatureKey } from '@/contexts/UsageContext';
import { Load, Driver, Customer, LoadStatus, PaymentStatus } from '@/types/tms';

import LoadCard from './tms/LoadCard';
import CreateLoadModal from './tms/CreateLoadModal';
import EditLoadModal from './tms/EditLoadModal';
import AssignDriverModal from './tms/AssignDriverModal';
import LoadDetailsModal from './tms/LoadDetailsModal';
import RecordPaymentModal from './tms/RecordPaymentModal';
import NotificationBell from './tms/NotificationBell';
import StatsCard from './tms/StatsCard';
import DriversView from './tms/DriversView';
import RateMatrixView from './tms/RateMatrixView';
import PaidLoadsView from './tms/PaidLoadsView';
import AccountsReceivableView from './tms/AccountsReceivableView';
import UpgradeModal from './tms/UpgradeModal';

import CustomersView from './tms/CustomersView';
import LocationsView from './tms/LocationsView';
import SettingsView from './tms/SettingsView';
import LiveTrackingView from './tms/LiveTrackingView';
import IFTAReportView from './tms/IFTAReportView';
import StaffManagementView from './tms/StaffManagementView';

import { 
  Truck, Plus, Package, Clock, DollarSign, Fuel,
  FileText, Users, TrendingUp, RefreshCw, Menu, X,
  LayoutDashboard, Archive, Settings, Building2, MapPin, LogOut, Radar, Receipt, ShieldCheck,
  Crown, Brain, Zap, MessageSquare, ChevronDown, ChevronRight, Send, CheckCircle2, AlertCircle
} from 'lucide-react';




type ViewType = 'dashboard' | 'paid-loads' | 'drivers' | 'rate-matrix' | 'customers' | 'locations' | 'settings' | 'live-tracking' | 'accounts-receivable' | 'ifta' | 'staff';




interface PaymentInfo {
  totalPaid: number;
  invoiceAmount: number;
  status: PaymentStatus;
}

const AppLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const { tier, usage, limits, canUseFeature, incrementUsage, checkAndPromptUpgrade, getUsagePercent, getRemainingUses } = useUsage();

  
  const [loads, setLoads] = useState<Load[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedLoad, setSelectedLoad] = useState<Load | null>(null);

  // Payment tracking data for INVOICED loads
  const [paymentData, setPaymentData] = useState<Record<string, PaymentInfo>>({});

  // Fuel surcharge & auto-invoice settings
  const [fuelSurchargeRate, setFuelSurchargeRate] = useState<string>('');
  const [autoInvoiceEnabled, setAutoInvoiceEnabled] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // NOTE: Token-based driver portal access is handled by the /driver-portal route in App.tsx
  // The admin dashboard should NEVER show the driver portal view



  // Fetch settings on mount
  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (currentView === 'dashboard') {
      fetchData();
    }
  }, [currentView]);

  const fetchSettings = async () => {
    try {
      const { data: settings, error } = await db
        .from('settings')
        .select('key, value')
        .in('key', ['fuel_surcharge_rate', 'auto_invoice_enabled']);
      
      if (error) {
        console.error('[AppLayout] Error fetching settings:', error);
        return;
      }
      
      if (settings) {
        for (const s of settings) {
          if (s.key === 'fuel_surcharge_rate') setFuelSurchargeRate(s.value || '');
          if (s.key === 'auto_invoice_enabled') setAutoInvoiceEnabled(s.value === 'true');
        }
      }
    } catch (err) {
      console.error('[AppLayout] Failed to fetch settings:', err);
    }
  };

  const saveSetting = async (key: string, value: string) => {
    setSavingSettings(true);
    // Upsert the setting
    const { error } = await db
      .from('settings')
      .upsert({ key, value }, { onConflict: 'key' });
    if (error) {
      console.error('Error saving setting:', error);
    }
    setSavingSettings(false);
  };

  const handleFuelSurchargeChange = (value: string) => {
    setFuelSurchargeRate(value);
  };

  const handleFuelSurchargeSave = () => {
    saveSetting('fuel_surcharge_rate', fuelSurchargeRate);
  };

  const handleAutoInvoiceToggle = (enabled: boolean) => {
    setAutoInvoiceEnabled(enabled);
    saveSetting('auto_invoice_enabled', enabled ? 'true' : 'false');
  };



  // Auto-fix stale driver statuses on dashboard load
  const cleanupStaleDriverStatuses = async (loadsData: Load[], driversData: Driver[]) => {
    const onRouteDrivers = driversData.filter(d => d.status === 'on_route');
    
    for (const driver of onRouteDrivers) {
      const hasActiveLoad = loadsData.some(
        l => l.driver_id === driver.id && (l.status === 'DISPATCHED' || l.status === 'IN_TRANSIT')
      );
      
      if (!hasActiveLoad) {
        const { data: activeLoads } = await db
          .from('loads')
          .select('id')
          .eq('driver_id', driver.id)
          .in('status', ['DISPATCHED', 'IN_TRANSIT'])
          .limit(1);
        
        if (!activeLoads || activeLoads.length === 0) {
          console.log(`Auto-releasing driver ${driver.name} (${driver.id}) - no active loads found`);
          await db
            .from('drivers')
            .update({ status: 'available' })
            .eq('id', driver.id);
        }
      }
    }
  };

  const fetchPaymentData = async (loadsData: Load[]) => {
    const invoicedLoads = loadsData.filter(l => l.status === 'INVOICED');
    if (invoicedLoads.length === 0) {
      setPaymentData({});
      return;
    }

    const loadIds = invoicedLoads.map(l => l.id);

    // Fetch invoices for these loads
    const { data: invoices } = await db
      .from('invoices')
      .select('*')
      .in('load_id', loadIds);

    if (!invoices || invoices.length === 0) {
      setPaymentData({});
      return;
    }

    const invoiceIds = invoices.map(inv => inv.id);

    // Fetch payments for these invoices
    const { data: payments } = await db
      .from('payments')
      .select('*')
      .in('invoice_id', invoiceIds);

    const paymentMap: Record<string, PaymentInfo> = {};

    for (const load of invoicedLoads) {
      const invoice = invoices.find(inv => inv.load_id === load.id);
      if (!invoice) {
        paymentMap[load.id] = { totalPaid: 0, invoiceAmount: 0, status: 'unpaid' };
        continue;
      }

      const loadPayments = payments?.filter(p => p.invoice_id === invoice.id) || [];
      const totalPaid = loadPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const invoiceAmount = Number(invoice.amount);

      let status: PaymentStatus = 'unpaid';
      if (totalPaid >= invoiceAmount - 0.01) {
        status = 'paid';
      } else if (totalPaid > 0) {
        status = 'partial';
      }

      paymentMap[load.id] = { totalPaid, invoiceAmount, status };
    }

    setPaymentData(paymentMap);
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('[AppLayout] Fetching loads and drivers...');
      
      const { data: loadsData, error: loadsError } = await db
        .from('loads')
        .select('*, customer:customers(*), driver:drivers(*)')
        .neq('status', 'PAID')
        .order('delivery_date', { ascending: true });
      
      if (loadsError) {
        console.error('[AppLayout] Error fetching loads:', loadsError);
        throw loadsError;
      }
      
      const { data: driversData, error: driversError } = await db
        .from('drivers')
        .select('*')
        .order('name');
        
      if (driversError) {
        console.error('[AppLayout] Error fetching drivers:', driversError);
        throw driversError;
      }

      console.log(`[AppLayout] Fetched ${loadsData?.length || 0} loads and ${driversData?.length || 0} drivers`);

      if (loadsData) {
        setLoads(loadsData);
        // Fetch payment data for invoiced loads
        fetchPaymentData(loadsData);
      }
      if (driversData) setDrivers(driversData);

      if (loadsData && driversData) {
        cleanupStaleDriverStatuses(loadsData, driversData).then(() => {
          db.from('drivers').select('*').order('name').then(({ data }) => {
            if (data) setDrivers(data);
          });
        });
      }
    } catch (err: any) {
      console.error('[AppLayout] Failed to fetch data:', err);
      setError(err?.message || 'Failed to load data. Please try refreshing.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleAssignDriver = (load: Load) => {
    setSelectedLoad(load);
    setDetailsModalOpen(false); // Close details modal if reassigning from there
    setAssignModalOpen(true);
  };


  const handleViewDetails = (load: Load) => {
    setSelectedLoad(load);
    setDetailsModalOpen(true);
  };

  const handleEditLoad = (load: Load) => {
    setSelectedLoad(load);
    setDetailsModalOpen(false);
    setEditModalOpen(true);
  };

  const handleDeleteLoad = async (load: Load) => {
    if (!confirm(`Are you sure you want to delete load ${load.load_number}? This action cannot be undone.`)) {
      return;
    }
    
    try {
      // Delete associated records in correct order (PostgreSQL will handle cascades based on schema)
      await db.from('payments').delete().eq('load_id', load.id);
      await db.from('load_stops').delete().eq('load_id', load.id);
      await db.from('pod_documents').delete().eq('load_id', load.id);
      await db.from('invoices').delete().eq('load_id', load.id);
      await db.from('loads').delete().eq('id', load.id);

      if (load.driver_id) {
        await db.from('drivers').update({ status: 'available' }).eq('id', load.driver_id);
      }
      
      setDetailsModalOpen(false);
      setSelectedLoad(null);
      fetchData();
    } catch (error: any) {
      alert(`Failed to delete load: ${error?.message || 'Please try again.'}`);
    }
  };

  const handleMarkDelivered = async (load: Load) => {
    await db
      .from('loads')
      .update({ status: 'DELIVERED', delivered_at: new Date().toISOString() })
      .eq('id', load.id);

    if (load.driver_id) {
      await db.from('drivers').update({ status: 'available' }).eq('id', load.driver_id);
    }

    try {
      await db.functions.invoke('here-webhook', {
        body: { action: 'deactivate-load-geofences', load_id: load.id },
      });
    } catch (err) {
      console.warn('Geofence deactivation failed (non-critical):', err);
    }

    fetchData();
  };
  const handleGenerateInvoice = async (load: Load) => {
    // Check usage limit for invoices
    const canGenerate = await incrementUsage('invoices_generated');
    if (!canGenerate) return;

    const invoiceNumber = await generateNextInvoiceNumber();
    const totalAmount = Number(load.rate || 0) + Number(load.extra_stop_fee || 0) + Number(load.lumper_fee || 0);

    await db.from('invoices').insert({
      invoice_number: invoiceNumber,
      load_id: load.id,
      amount: totalAmount,
      status: 'PENDING',
    });

    await db
      .from('loads')
      .update({ status: 'INVOICED' })
      .eq('id', load.id);

    if (load.driver_id) {
      await db.from('drivers').update({ status: 'available' }).eq('id', load.driver_id);
    }

    fetchData();
  };

  // Usage-gated create load
  const handleNewLoad = () => {
    if (!checkAndPromptUpgrade('loads_created')) return;
    setCreateModalOpen(true);
  };

  const handleLoadCreated = async () => {
    await incrementUsage('loads_created');
    fetchData();
  };


  const handleRecordPayment = (load: Load) => {
    setSelectedLoad(load);
    setPaymentModalOpen(true);
  };

  const handlePaymentRecorded = () => {
    fetchData();
  };

  // Calculate today's invoiced total for pipeline
  const todayInvoicedTotal = loads
    .filter(l => l.status === 'INVOICED')
    .reduce((sum, l) => sum + Number(l.rate || 0) + Number(l.extra_stop_fee || 0) + Number(l.lumper_fee || 0), 0);

  const stats = {
    unassigned: loads.filter(l => l.status === 'UNASSIGNED').length,
    dispatched: loads.filter(l => l.status === 'DISPATCHED').length,
    inTransit: loads.filter(l => l.status === 'IN_TRANSIT').length,
    delivered: loads.filter(l => l.status === 'DELIVERED').length,
    invoiced: loads.filter(l => l.status === 'INVOICED').length,
    invoicedTotal: todayInvoicedTotal,
    totalRevenue: loads.reduce((sum, l) => sum + Number(l.rate || 0) + Number(l.extra_stop_fee || 0) + Number(l.lumper_fee || 0), 0),
    availableDrivers: drivers.filter(d => d.status === 'available').length,
  };

  const toggleSection = (key: string) => {

    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Pipeline sections - loads grouped by status in workflow order
  const pipelineSections = [
    {
      key: 'awaiting-dispatch',
      title: 'Waiting on Dispatch',
      subtitle: 'Loads that need a driver assigned',
      statuses: ['UNASSIGNED'] as LoadStatus[],
      icon: Clock,
      accentColor: 'amber',
      borderColor: 'border-amber-300',
      bgColor: 'bg-amber-50',
      iconBg: 'bg-amber-100',
      iconColor: 'text-amber-600',
      badgeBg: 'bg-amber-100',
      badgeText: 'text-amber-700',
    },
    {
      key: 'dispatched',
      title: 'Dispatched',
      subtitle: 'Driver assigned, en route to pickup',
      statuses: ['DISPATCHED'] as LoadStatus[],
      icon: Send,
      accentColor: 'sky',
      borderColor: 'border-sky-300',
      bgColor: 'bg-sky-50',
      iconBg: 'bg-sky-100',
      iconColor: 'text-sky-600',
      badgeBg: 'bg-sky-100',
      badgeText: 'text-sky-700',
    },
    {
      key: 'in-transit',
      title: 'In Transit',
      subtitle: 'Actively on the road',
      statuses: ['IN_TRANSIT'] as LoadStatus[],
      icon: Truck,
      accentColor: 'blue',
      borderColor: 'border-blue-300',
      bgColor: 'bg-blue-50',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      badgeBg: 'bg-blue-100',
      badgeText: 'text-blue-700',
    },
    {
      key: 'awaiting-invoicing',
      title: 'Waiting on Invoicing',
      subtitle: 'Delivered — ready to generate invoice',
      statuses: ['DELIVERED'] as LoadStatus[],
      icon: CheckCircle2,
      accentColor: 'emerald',
      borderColor: 'border-emerald-300',
      bgColor: 'bg-emerald-50',
      iconBg: 'bg-emerald-100',
      iconColor: 'text-emerald-600',
      badgeBg: 'bg-emerald-100',
      badgeText: 'text-emerald-700',
    },
    {
      key: 'invoiced',
      title: 'Invoiced',
      subtitle: 'Invoice sent — awaiting payment',
      statuses: ['INVOICED'] as LoadStatus[],
      icon: FileText,
      accentColor: 'purple',
      borderColor: 'border-purple-300',
      bgColor: 'bg-purple-50',
      iconBg: 'bg-purple-100',
      iconColor: 'text-purple-600',
      badgeBg: 'bg-purple-100',
      badgeText: 'text-purple-700',
    },
  ];





  if (currentView === 'paid-loads') return <PaidLoadsView onBack={() => setCurrentView('dashboard')} />;
  if (currentView === 'drivers') return <DriversView onBack={() => setCurrentView('dashboard')} />;
  if (currentView === 'rate-matrix') return <RateMatrixView onBack={() => setCurrentView('dashboard')} />;
  if (currentView === 'customers') return <CustomersView onBack={() => setCurrentView('dashboard')} />;
  if (currentView === 'locations') return <LocationsView onBack={() => setCurrentView('dashboard')} />;
  if (currentView === 'settings') return <SettingsView onBack={() => setCurrentView('dashboard')} />;
  if (currentView === 'live-tracking') return <LiveTrackingView onBack={() => setCurrentView('dashboard')} />;
  if (currentView === 'ifta') return <IFTAReportView onBack={() => setCurrentView('dashboard')} />;
  if (currentView === 'staff') return <StaffManagementView onBack={() => setCurrentView('dashboard')} />;


  if (currentView === 'accounts-receivable') return (
    <>
      <AccountsReceivableView
        onBack={() => setCurrentView('dashboard')}
        onRecordPayment={(load) => {
          setSelectedLoad(load);
          setPaymentModalOpen(true);
        }}
      />
      <RecordPaymentModal
        isOpen={paymentModalOpen}
        load={selectedLoad}
        onClose={() => { setPaymentModalOpen(false); setSelectedLoad(null); }}
        onPaymentRecorded={handlePaymentRecorded}
      />
    </>
  );

  return (
    <div className="min-h-screen bg-slate-100 flex">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 transform transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-800">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Truck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">LoadTracker PRO</h1>
              <p className="text-xs text-slate-400">Carrier TMS</p>

            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden ml-auto p-2 hover:bg-slate-800 rounded-lg">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">

            <button onClick={() => setCurrentView('dashboard')} className={`flex items-center gap-3 px-4 py-3 rounded-xl w-full text-left transition-colors ${currentView === 'dashboard' ? 'text-white bg-blue-600' : 'text-slate-300 hover:bg-slate-800'}`}>
              <LayoutDashboard className="w-5 h-5" /><span className="font-medium">Dashboard</span>
            </button>
            <button onClick={() => setCurrentView('live-tracking')} className={`flex items-center gap-3 px-4 py-3 rounded-xl w-full text-left transition-colors ${currentView === 'live-tracking' ? 'text-white bg-emerald-600' : 'text-slate-300 hover:bg-slate-800'}`}>
              <Radar className="w-5 h-5" /><span className="font-medium">Live Tracking</span>
              <span className="ml-auto px-1.5 py-0.5 text-[10px] font-bold bg-emerald-500 text-white rounded-full">LIVE</span>
            </button>
            <button onClick={() => setCurrentView('accounts-receivable')} className={`flex items-center gap-3 px-4 py-3 rounded-xl w-full text-left transition-colors ${currentView === 'accounts-receivable' ? 'text-white bg-indigo-600' : 'text-slate-300 hover:bg-slate-800'}`}>
              <Receipt className="w-5 h-5" /><span className="font-medium">Accounts Receivable</span>
            </button>
            <button onClick={() => setCurrentView('paid-loads')} className={`flex items-center gap-3 px-4 py-3 rounded-xl w-full text-left transition-colors ${currentView === 'paid-loads' ? 'text-white bg-blue-600' : 'text-slate-300 hover:bg-slate-800'}`}>
              <Archive className="w-5 h-5" /><span className="font-medium">Paid Loads</span>
            </button>

            <div className="pt-4 pb-2">
              <p className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Management</p>
            </div>
            
            <button onClick={() => setCurrentView('customers')} className={`flex items-center gap-3 px-4 py-3 rounded-xl w-full text-left transition-colors ${currentView === 'customers' ? 'text-white bg-blue-600' : 'text-slate-300 hover:bg-slate-800'}`}>
              <Building2 className="w-5 h-5" /><span className="font-medium">Customers</span>
            </button>
            <button onClick={() => setCurrentView('locations')} className={`flex items-center gap-3 px-4 py-3 rounded-xl w-full text-left transition-colors ${currentView === 'locations' ? 'text-white bg-blue-600' : 'text-slate-300 hover:bg-slate-800'}`}>
              <MapPin className="w-5 h-5" /><span className="font-medium">Locations</span>
            </button>
            <button onClick={() => setCurrentView('drivers')} className={`flex items-center gap-3 px-4 py-3 rounded-xl w-full text-left transition-colors ${currentView === 'drivers' ? 'text-white bg-blue-600' : 'text-slate-300 hover:bg-slate-800'}`}>
              <Users className="w-5 h-5" /><span className="font-medium">Drivers</span>
            </button>
            <button onClick={() => setCurrentView('rate-matrix')} className={`flex items-center gap-3 px-4 py-3 rounded-xl w-full text-left transition-colors ${currentView === 'rate-matrix' ? 'text-white bg-blue-600' : 'text-slate-300 hover:bg-slate-800'}`}>
              <DollarSign className="w-5 h-5" /><span className="font-medium">Rate Matrix</span>
            </button>
            <button onClick={() => setCurrentView('ifta')} className={`flex items-center gap-3 px-4 py-3 rounded-xl w-full text-left transition-colors ${currentView === 'ifta' ? 'text-white bg-amber-600' : 'text-slate-300 hover:bg-slate-800'}`}>
              <Fuel className="w-5 h-5" /><span className="font-medium">IFTA Reporting</span>
            </button>

            <div className="pt-4 pb-2">
              <p className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">System</p>
            </div>
            
            <button onClick={() => setCurrentView('staff')} className={`flex items-center gap-3 px-4 py-3 rounded-xl w-full text-left transition-colors ${currentView === 'staff' ? 'text-white bg-purple-600' : 'text-slate-300 hover:bg-slate-800'}`}>
              <ShieldCheck className="w-5 h-5" /><span className="font-medium">Staff Management</span>
            </button>
            <button onClick={() => setCurrentView('settings')} className={`flex items-center gap-3 px-4 py-3 rounded-xl w-full text-left transition-colors ${currentView === 'settings' ? 'text-white bg-blue-600' : 'text-slate-300 hover:bg-slate-800'}`}>
              <Settings className="w-5 h-5" /><span className="font-medium">Settings</span>
            </button>
          </nav>

          <div className="px-4 py-4 border-t border-slate-800">
            {/* Usage / Tier Meter */}
            {tier === 'free' && (
              <div className="bg-gradient-to-br from-amber-900/40 to-orange-900/40 border border-amber-700/50 rounded-xl p-3 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Crown className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">Starter Plan</span>
                </div>
                <p className="text-[9px] text-slate-500 mb-2">Monthly usage resets on the 1st</p>
                {([
                  { key: 'loads_created' as FeatureKey, label: 'Loads', icon: <Package className="w-3 h-3" /> },
                  { key: 'ai_dispatch_calls' as FeatureKey, label: 'AI Advisor', icon: <Brain className="w-3 h-3" /> },
                  { key: 'invoices_generated' as FeatureKey, label: 'Invoices', icon: <Receipt className="w-3 h-3" /> },
                  { key: 'sms_sent' as FeatureKey, label: 'SMS', icon: <MessageSquare className="w-3 h-3" /> },
                ]).map(item => {
                  const used = usage[item.key] || 0;
                  const limit = TIER_LIMITS.free[item.key];
                  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
                  return (
                    <div key={item.key} className="mb-1.5 last:mb-0">
                      <div className="flex items-center justify-between text-[10px] mb-0.5">
                        <span className="text-slate-400 flex items-center gap-1">{item.icon}{item.label}</span>
                        <span className={`font-semibold ${pct >= 100 ? 'text-red-400' : pct >= 80 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {used} / {limit} used
                        </span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-1">
                        <div className={`h-1 rounded-full transition-all ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                    </div>
                  );
                })}
                <a
                  href="mailto:kevin@go4fc.com?subject=Upgrade to LoadTracker PRO"
                  className="flex items-center justify-center gap-1.5 mt-2.5 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold rounded-lg hover:from-amber-600 hover:to-orange-600 transition-all"
                >
                  <Zap className="w-3 h-3" />Go Pro — $300/mo Unlimited
                </a>
              </div>
            )}
            {tier === 'standard' && (
              <div className="bg-gradient-to-br from-emerald-900/30 to-blue-900/30 border border-emerald-700/40 rounded-xl p-3 mb-4">
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">Pro Plan</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Unlimited access to all features</p>
              </div>
            )}
            {user && (
              <div className="mb-4">
                <p className="text-sm text-slate-400 truncate">{user.name}</p>
                <p className="text-xs text-slate-500 truncate">{user.email}</p>
              </div>
            )}
            <button onClick={logout} className="flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors w-full text-left">
              <LogOut className="w-5 h-5" /><span className="font-medium">Sign Out</span>
            </button>
          </div>

          <div className="px-4 py-4 border-t border-slate-800">
            <div className="bg-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-400">Available Drivers</span>
                <span className="text-lg font-bold text-white">{stats.availableDrivers}</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${(stats.availableDrivers / Math.max(drivers.length, 1)) * 100}%` }}></div>
              </div>
              <p className="text-xs text-slate-500 mt-2">of {drivers.length} total drivers</p>
            </div>
          </div>
        </div>
      </aside>


      {/* Main Content */}
      <div className="flex-1 lg:ml-64">
        <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
          <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center gap-4">
              <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 hover:bg-slate-100 rounded-lg">
                <Menu className="w-5 h-5 text-slate-600" />
              </button>
              <div>
                <h2 className="text-xl font-bold text-slate-800">Command Center</h2>
                <p className="text-sm text-slate-500">Manage your loads and dispatch</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleRefresh} disabled={refreshing} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <RefreshCw className={`w-5 h-5 text-slate-600 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <NotificationBell loads={loads} />
              <button onClick={handleNewLoad} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors">
                <Plus className="w-5 h-5" /><span className="hidden sm:inline">New Load</span>
              </button>
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatsCard title="Awaiting Dispatch" value={stats.unassigned} subtitle="loads to assign" icon={Clock} iconColor="text-amber-600" iconBg="bg-amber-100" />
            <StatsCard title="In Transit" value={stats.inTransit} subtitle="active shipments" icon={Truck} iconColor="text-blue-600" iconBg="bg-blue-100" />
            <StatsCard title="Pending Payment" value={stats.invoiced} subtitle="invoices sent" icon={FileText} iconColor="text-purple-600" iconBg="bg-purple-100" />
            <StatsCard
              title="Invoiced Total"
              value={`$${stats.invoicedTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              subtitle="pending payment"
              icon={TrendingUp}
              iconColor="text-emerald-600"
              iconBg="bg-emerald-100"
            />
          </div>

          {/* Fleet Overview */}
          <div className="mb-6">
            <button onClick={() => setCurrentView('live-tracking')} className="w-full bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl shadow-sm border border-slate-700 p-5 hover:from-slate-700 hover:to-slate-800 transition-all group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-emerald-500/20 rounded-xl group-hover:bg-emerald-500/30 transition-colors">
                    <Radar className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-lg font-bold text-white">Fleet Map & Live Tracking</h3>
                    <p className="text-sm text-slate-400">
                      {stats.inTransit > 0 ? `${stats.inTransit} driver${stats.inTransit !== 1 ? 's' : ''} in transit — ${stats.dispatched} dispatched` : 'View real-time GPS positions of your fleet on the map'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {stats.inTransit > 0 && (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/30 rounded-full">
                      <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
                      <span className="text-xs font-semibold text-emerald-300">{stats.inTransit} LIVE</span>
                    </span>
                  )}
                  <svg className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </div>
              </div>
            </button>
          </div>

          {/* AR Quick Access */}
          {stats.invoiced > 0 && (
            <div className="mb-6">
              <button onClick={() => setCurrentView('accounts-receivable')} className="w-full bg-gradient-to-r from-indigo-600 to-purple-700 rounded-xl shadow-sm p-4 hover:from-indigo-700 hover:to-purple-800 transition-all group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 bg-white/20 rounded-xl group-hover:bg-white/30 transition-colors"><Receipt className="w-5 h-5 text-white" /></div>
                    <div className="text-left">
                      <h3 className="text-base font-bold text-white">Accounts Receivable</h3>
                      <p className="text-sm text-indigo-200">{stats.invoiced} outstanding invoice{stats.invoiced !== 1 ? 's' : ''} — ${stats.invoicedTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} pending</p>
                    </div>
                  </div>
                  <svg className="w-5 h-5 text-indigo-200 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </div>
              </button>
            </div>
          )}

          {/* Pipeline Summary Bar */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6 p-3">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
              {pipelineSections.map((section, idx) => {
                const sectionLoads = loads.filter(l => section.statuses.includes(l.status));
                const count = sectionLoads.length;
                return (
                  <React.Fragment key={section.key}>
                    {idx > 0 && (
                      <svg className="w-4 h-4 text-slate-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                    <button
                      onClick={() => {
                        const el = document.getElementById(`section-${section.key}`);
                        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg whitespace-nowrap transition-colors ${count > 0 ? `${section.bgColor} hover:opacity-80` : 'bg-slate-50 hover:bg-slate-100'}`}
                    >
                      <section.icon className={`w-4 h-4 ${count > 0 ? section.iconColor : 'text-slate-400'}`} />
                      <span className={`text-sm font-medium ${count > 0 ? section.badgeText : 'text-slate-400'}`}>{section.title}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${count > 0 ? `${section.badgeBg} ${section.badgeText}` : 'bg-slate-100 text-slate-400'}`}>{count}</span>
                    </button>
                  </React.Fragment>
                );
              })}
              <svg className="w-4 h-4 text-slate-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <button
                onClick={() => setCurrentView('paid-loads')}
                className="flex items-center gap-2 px-3 py-2 rounded-lg whitespace-nowrap bg-green-50 hover:bg-green-100 transition-colors"
              >
                <DollarSign className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-700">Paid</span>
                <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </button>
            </div>
          </div>

          {/* Load Pipeline Sections */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-4">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
                <p className="text-slate-500">Loading loads...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-4">
                <AlertCircle className="w-12 h-12 text-red-500" />
                <p className="text-red-600 font-medium">{error}</p>
                <button 
                  onClick={handleRefresh}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Try Again
                </button>
              </div>
            </div>
          ) : loads.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
              <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-800 mb-2">No Loads Found</h3>
              <p className="text-slate-500 mb-6">Create your first load to get started.</p>
              <button onClick={handleNewLoad} className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors">
                <Plus className="w-5 h-5" />Create New Load
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {pipelineSections.map((section) => {
                const sectionLoads = loads.filter(l => section.statuses.includes(l.status));
                const isCollapsed = collapsedSections[section.key] ?? false;
                const sectionRevenue = sectionLoads.reduce((sum, l) => sum + Number(l.rate || 0) + Number(l.extra_stop_fee || 0) + Number(l.lumper_fee || 0), 0);

                return (
                  <div key={section.key} id={`section-${section.key}`} className="scroll-mt-24">
                    {/* Section Header */}
                    <button
                      onClick={() => toggleSection(section.key)}
                      className={`w-full flex items-center justify-between px-5 py-4 rounded-xl border ${section.borderColor} ${section.bgColor} hover:opacity-90 transition-all group`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${section.iconBg}`}>
                          <section.icon className={`w-5 h-5 ${section.iconColor}`} />
                        </div>
                        <div className="text-left">
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-bold text-slate-800">{section.title}</h3>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${section.badgeBg} ${section.badgeText}`}>
                              {sectionLoads.length}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">{section.subtitle}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {sectionLoads.length > 0 && (
                          <span className="text-sm font-semibold text-slate-600 hidden sm:block">
                            ${sectionRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                        )}
                        {isCollapsed ? (
                          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
                        )}
                      </div>
                    </button>

                    {/* Section Content */}
                    {!isCollapsed && (
                      <div className="mt-3">
                        {sectionLoads.length === 0 ? (
                          <div className="bg-white rounded-xl border border-dashed border-slate-200 p-6 text-center">
                            <p className="text-sm text-slate-400">No loads in this stage</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {sectionLoads.map((load) => {
                              const pInfo = paymentData[load.id];
                              return (
                                <LoadCard
                                  key={load.id}
                                  load={load}
                                  onAssignDriver={handleAssignDriver}
                                  onViewDetails={handleViewDetails}
                                  onMarkDelivered={handleMarkDelivered}
                                  onGenerateInvoice={handleGenerateInvoice}
                                  onRecordPayment={handleRecordPayment}
                                  onDelete={handleDeleteLoad}
                                  paymentStatus={pInfo?.status}
                                  totalPaid={pInfo?.totalPaid}
                                  invoiceAmount={pInfo?.invoiceAmount}
                                />
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Paid Loads CTA - at the bottom of the pipeline */}
              <div className="mt-2">
                <button
                  onClick={() => setCurrentView('paid-loads')}
                  className="w-full flex items-center justify-between px-5 py-4 rounded-xl border border-green-300 bg-gradient-to-r from-green-50 to-emerald-50 hover:from-green-100 hover:to-emerald-100 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-100">
                      <DollarSign className="w-5 h-5 text-green-600" />
                    </div>
                    <div className="text-left">
                      <h3 className="text-base font-bold text-slate-800">Paid Loads</h3>
                      <p className="text-xs text-slate-500 mt-0.5">View completed and paid loads on a separate page</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-green-600 hidden sm:block">View All</span>
                    <svg className="w-5 h-5 text-green-500 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </div>
                </button>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)}></div>
      )}

      {/* Modals */}
      <CreateLoadModal isOpen={createModalOpen} onClose={() => setCreateModalOpen(false)} onLoadCreated={handleLoadCreated} />
      <EditLoadModal isOpen={editModalOpen} load={selectedLoad} onClose={() => { setEditModalOpen(false); setSelectedLoad(null); }} onLoadUpdated={fetchData} />
      <AssignDriverModal isOpen={assignModalOpen} load={selectedLoad} onClose={() => { setAssignModalOpen(false); setSelectedLoad(null); }} onDriverAssigned={fetchData} />
      <LoadDetailsModal isOpen={detailsModalOpen} load={selectedLoad} onClose={() => { setDetailsModalOpen(false); setSelectedLoad(null); }} onEdit={handleEditLoad} onDelete={handleDeleteLoad} onLoadUpdated={fetchData} onAssignDriver={handleAssignDriver} />
      <RecordPaymentModal isOpen={paymentModalOpen} load={selectedLoad} onClose={() => { setPaymentModalOpen(false); setSelectedLoad(null); }} onPaymentRecorded={handlePaymentRecorded} />
      <UpgradeModal />
    </div>
  );
};

export default AppLayout;
