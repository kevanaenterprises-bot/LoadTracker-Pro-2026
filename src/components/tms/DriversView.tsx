import React, { useState, useEffect } from 'react';
import { db } from '@/lib/supabaseCompat';
import { Driver } from '@/types/tms';
import DriverProfileModal from './DriverProfileModal';
import { 
  ArrowLeft, User, Phone, Mail, MapPin, Truck, 
  Plus, Search, Loader2, Trash2, CheckCircle, XCircle, Clock,
  Key, UserPlus, Shield, FileText, AlertTriangle, Calendar,
  Filter, ChevronDown, Download, Users
} from 'lucide-react';

interface DriversViewProps {
  onBack: () => void;
}

interface DriverUser {
  id: string;
  email: string;
  name: string;
  driver_id: string | null;
}

function getDaysUntilExpiration(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const expDate = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getExpirationStatus(dateStr: string | null): 'expired' | 'warning' | 'ok' | 'none' {
  const days = getDaysUntilExpiration(dateStr);
  if (days === null) return 'none';
  if (days < 0) return 'expired';
  if (days <= 30) return 'warning';
  return 'ok';
}

type StatusFilter = 'all' | 'active' | 'terminated';
type ComplianceFilter = 'all' | 'expiring' | 'expired' | 'missing';

const DriversView: React.FC<DriversViewProps> = ({ onBack }) => {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driverUsers, setDriverUsers] = useState<DriverUser[]>([]);
  const [driverFileCounts, setDriverFileCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [complianceFilter, setComplianceFilter] = useState<ComplianceFilter>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCreateLoginModal, setShowCreateLoginModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [selectedDriverForLogin, setSelectedDriverForLogin] = useState<Driver | null>(null);
  const [newDriver, setNewDriver] = useState({
    name: '',
    phone: '',
    email: '',
    truck_number: '',
    current_location: '',
    hire_date: new Date().toISOString().split('T')[0],
    license_number: '',
    license_state: '',
    license_expiration: '',
    medical_card_number: '',
    medical_card_expiration: '',
  });
  const [newLogin, setNewLogin] = useState({
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [saving, setSaving] = useState(false);
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    fetchDrivers();
  }, []);

  const fetchDrivers = async () => {
    setLoading(true);
    const { data: driversData } = await db.from('drivers').select('*').order('name');
    if (driversData) setDrivers(driversData);

    const { data: usersData } = await db
      .from('users')
      .select('id, email, name, driver_id')
      .eq('role', 'driver');
    if (usersData) setDriverUsers(usersData);

    // Fetch file counts per driver
    const { data: fileCounts } = await db
      .from('driver_files')
      .select('driver_id');
    if (fileCounts) {
      const counts: Record<string, number> = {};
      fileCounts.forEach((f: any) => {
        counts[f.driver_id] = (counts[f.driver_id] || 0) + 1;
      });
      setDriverFileCounts(counts);
    }

    setLoading(false);
  };

  const handleAddDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const insertData: any = {
        name: newDriver.name,
        phone: newDriver.phone,
        email: newDriver.email || null,
        truck_number: newDriver.truck_number,
        current_location: newDriver.current_location || null,
        status: 'available',
        employment_status: 'active',
        hire_date: newDriver.hire_date || null,
        license_number: newDriver.license_number || null,
        license_state: newDriver.license_state || null,
        license_expiration: newDriver.license_expiration || null,
        medical_card_number: newDriver.medical_card_number || null,
        medical_card_expiration: newDriver.medical_card_expiration || null,
      };
      await db.from('drivers').insert(insertData);
      setShowAddModal(false);
      setNewDriver({
        name: '', phone: '', email: '', truck_number: '', current_location: '',
        hire_date: new Date().toISOString().split('T')[0],
        license_number: '', license_state: '', license_expiration: '',
        medical_card_number: '', medical_card_expiration: '',
      });
      fetchDrivers();
    } catch (error) {
      alert('Failed to add driver');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDriver = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this driver? This will also delete all associated files.')) return;
    
    // Delete associated driver files first
    await db.from('driver_files').delete().eq('driver_id', id);
    
    // Delete the driver
    await db.from('drivers').delete().eq('id', id);
    
    fetchDrivers();
  };

  const handleUpdateStatus = async (id: string, status: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await db.from('drivers').update({ status }).eq('id', id);
    fetchDrivers();
  };

  const openCreateLoginModal = (driver: Driver, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedDriverForLogin(driver);
    setNewLogin({
      email: driver.email || '',
      password: '',
      confirmPassword: '',
    });
    setLoginError('');
    setShowCreateLoginModal(true);
  };

  const handleCreateLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDriverForLogin) return;

    setLoginError('');

    if (newLogin.password !== newLogin.confirmPassword) {
      setLoginError('Passwords do not match');
      return;
    }

    if (newLogin.password.length < 6) {
      setLoginError('Password must be at least 6 characters');
      return;
    }

    setSaving(true);
    try {
      const { data: existingUser } = await db
        .from('users')
        .select('id')
        .eq('email', newLogin.email.toLowerCase().trim())
        .single();

      if (existingUser) {
        setLoginError('A user with this email already exists');
        setSaving(false);
        return;
      }

      const { error } = await db.from('users').insert({
        email: newLogin.email.toLowerCase().trim(),
        password_hash: newLogin.password,
        role: 'driver',
        driver_id: selectedDriverForLogin.id,
        name: selectedDriverForLogin.name,
        is_active: true,
      });

      if (error) {
        setLoginError('Failed to create login. Please try again.');
        setSaving(false);
        return;
      }

      if (newLogin.email !== selectedDriverForLogin.email) {
        await db
          .from('drivers')
          .update({ email: newLogin.email.toLowerCase().trim() })
          .eq('id', selectedDriverForLogin.id);
      }

      setShowCreateLoginModal(false);
      setSelectedDriverForLogin(null);
      fetchDrivers();
      alert('Driver login created successfully!');
    } catch (error) {
      setLoginError('An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  };

  const openDriverProfile = (driver: Driver) => {
    setSelectedDriver(driver);
    setShowProfileModal(true);
  };

  const getDriverUser = (driverId: string) => {
    return driverUsers.find(u => u.driver_id === driverId);
  };

  // Filter drivers
  const filteredDrivers = drivers.filter(d => {
    // Search
    const matchesSearch = 
      d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.phone.includes(searchTerm) ||
      (d.truck_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.license_number || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!matchesSearch) return false;

    // Status filter
    if (statusFilter === 'active' && d.employment_status === 'terminated') return false;
    if (statusFilter === 'terminated' && d.employment_status !== 'terminated') return false;

    // Compliance filter
    if (complianceFilter === 'expired') {
      const licStatus = getExpirationStatus(d.license_expiration);
      const medStatus = getExpirationStatus(d.medical_card_expiration);
      return licStatus === 'expired' || medStatus === 'expired';
    }
    if (complianceFilter === 'expiring') {
      const licStatus = getExpirationStatus(d.license_expiration);
      const medStatus = getExpirationStatus(d.medical_card_expiration);
      return licStatus === 'warning' || medStatus === 'warning';
    }
    if (complianceFilter === 'missing') {
      return !d.license_number || !d.medical_card_number;
    }

    return true;
  });

  const statusColors: Record<string, { bg: string; text: string; icon: any }> = {
    available: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: CheckCircle },
    on_route: { bg: 'bg-blue-100', text: 'text-blue-700', icon: Truck },
    off_duty: { bg: 'bg-slate-100', text: 'text-slate-700', icon: XCircle },
  };

  // Stats
  const activeDrivers = drivers.filter(d => d.employment_status !== 'terminated');
  const terminatedDrivers = drivers.filter(d => d.employment_status === 'terminated');
  const expiringCount = drivers.filter(d => {
    const lic = getDaysUntilExpiration(d.license_expiration);
    const med = getDaysUntilExpiration(d.medical_card_expiration);
    return (lic !== null && lic >= 0 && lic <= 30) || (med !== null && med >= 0 && med <= 30);
  }).length;
  const expiredCount = drivers.filter(d => {
    const lic = getDaysUntilExpiration(d.license_expiration);
    const med = getDaysUntilExpiration(d.medical_card_expiration);
    return (lic !== null && lic < 0) || (med !== null && med < 0);
  }).length;

  const US_STATES = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
    'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
    'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
  ];

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-700 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4 mb-4">
            <button onClick={onBack} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold">Driver Management</h1>
              <p className="text-indigo-200">Manage drivers, compliance, and documents</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <div className="bg-white/10 backdrop-blur rounded-xl p-4">
              <div className="flex items-center gap-2 text-indigo-200 text-sm mb-1">
                <Users className="w-4 h-4" /><span>Active Drivers</span>
              </div>
              <p className="text-3xl font-bold">{activeDrivers.length}</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-4">
              <div className="flex items-center gap-2 text-indigo-200 text-sm mb-1">
                <CheckCircle className="w-4 h-4" /><span>Available</span>
              </div>
              <p className="text-3xl font-bold">{drivers.filter(d => d.status === 'available' && d.employment_status !== 'terminated').length}</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-4 cursor-pointer hover:bg-white/15 transition-colors" onClick={() => setComplianceFilter(complianceFilter === 'expiring' ? 'all' : 'expiring')}>
              <div className="flex items-center gap-2 text-amber-300 text-sm mb-1">
                <AlertTriangle className="w-4 h-4" /><span>Expiring Soon</span>
              </div>
              <p className="text-3xl font-bold">{expiringCount}</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-4 cursor-pointer hover:bg-white/15 transition-colors" onClick={() => setComplianceFilter(complianceFilter === 'expired' ? 'all' : 'expired')}>
              <div className="flex items-center gap-2 text-red-300 text-sm mb-1">
                <XCircle className="w-4 h-4" /><span>Expired</span>
              </div>
              <p className="text-3xl font-bold">{expiredCount}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Toolbar */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, phone, truck #, or license #..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="all">All Status</option>
                <option value="active">Active Only</option>
                <option value="terminated">Terminated</option>
              </select>
              {/* Compliance Filter */}
              <select
                value={complianceFilter}
                onChange={(e) => setComplianceFilter(e.target.value as ComplianceFilter)}
                className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="all">All Compliance</option>
                <option value="expiring">Expiring (30d)</option>
                <option value="expired">Expired</option>
                <option value="missing">Missing Docs</option>
              </select>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
              >
                <Plus className="w-4 h-4" /><span>Add Driver</span>
              </button>
            </div>
          </div>
        </div>

        {/* Drivers Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        ) : filteredDrivers.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <User className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-800 mb-2">No Drivers Found</h3>
            <p className="text-slate-500 mb-4">
              {searchTerm || statusFilter !== 'active' || complianceFilter !== 'all'
                ? 'Try adjusting your filters.'
                : 'Add your first driver to get started.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Table Header */}
            <div className="hidden lg:grid lg:grid-cols-12 gap-4 px-6 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <div className="col-span-3">Driver</div>
              <div className="col-span-2">License</div>
              <div className="col-span-2">Medical Card</div>
              <div className="col-span-2">Employment</div>
              <div className="col-span-1">Files</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>

            {/* Driver Rows */}
            <div className="divide-y divide-slate-100">
              {filteredDrivers.map((driver) => {
                const status = statusColors[driver.status] || statusColors.available;
                const StatusIcon = status.icon;
                const driverUser = getDriverUser(driver.id);
                const licStatus = getExpirationStatus(driver.license_expiration);
                const medStatus = getExpirationStatus(driver.medical_card_expiration);
                const licDays = getDaysUntilExpiration(driver.license_expiration);
                const medDays = getDaysUntilExpiration(driver.medical_card_expiration);
                const fileCount = driverFileCounts[driver.id] || 0;
                const isTerminated = driver.employment_status === 'terminated';

                return (
                  <div
                    key={driver.id}
                    onClick={() => openDriverProfile(driver)}
                    className={`px-6 py-4 hover:bg-slate-50 cursor-pointer transition-colors ${isTerminated ? 'opacity-60' : ''}`}
                  >
                    {/* Desktop Layout */}
                    <div className="hidden lg:grid lg:grid-cols-12 gap-4 items-center">
                      {/* Driver Info */}
                      <div className="col-span-3 flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                          isTerminated ? 'bg-slate-200' : 'bg-indigo-100'
                        }`}>
                          <User className={`w-5 h-5 ${isTerminated ? 'text-slate-400' : 'text-indigo-600'}`} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-slate-800 truncate">{driver.name}</h3>
                            {driverUser && (
                              <span className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0" title="Has login"></span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="flex items-center gap-1"><Truck className="w-3 h-3" />{driver.truck_number}</span>
                            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${status.bg} ${status.text}`}>
                              <StatusIcon className="w-2.5 h-2.5" />
                              {driver.status.replace('_', ' ')}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* License */}
                      <div className="col-span-2">
                        {driver.license_number ? (
                          <div>
                            <p className="text-sm text-slate-700 font-medium">{driver.license_number}</p>
                            <div className="flex items-center gap-1 mt-0.5">
                              {driver.license_state && (
                                <span className="text-xs text-slate-400">{driver.license_state}</span>
                              )}
                              {driver.license_expiration && (
                                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                  licStatus === 'expired' ? 'bg-red-100 text-red-700' :
                                  licStatus === 'warning' ? 'bg-amber-100 text-amber-700' :
                                  'bg-emerald-50 text-emerald-700'
                                }`}>
                                  {licStatus === 'expired' ? `Exp ${Math.abs(licDays!)}d ago` :
                                   licStatus === 'warning' ? `${licDays}d left` :
                                   new Date(driver.license_expiration + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Not on file
                          </span>
                        )}
                      </div>

                      {/* Medical Card */}
                      <div className="col-span-2">
                        {driver.medical_card_number ? (
                          <div>
                            <p className="text-sm text-slate-700 font-medium">{driver.medical_card_number}</p>
                            {driver.medical_card_expiration && (
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium mt-0.5 inline-block ${
                                medStatus === 'expired' ? 'bg-red-100 text-red-700' :
                                medStatus === 'warning' ? 'bg-amber-100 text-amber-700' :
                                'bg-emerald-50 text-emerald-700'
                              }`}>
                                {medStatus === 'expired' ? `Exp ${Math.abs(medDays!)}d ago` :
                                 medStatus === 'warning' ? `${medDays}d left` :
                                 new Date(driver.medical_card_expiration + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Not on file
                          </span>
                        )}
                      </div>

                      {/* Employment */}
                      <div className="col-span-2">
                        <div className="flex flex-col gap-1">
                          {isTerminated ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
                              <XCircle className="w-3 h-3" /> Terminated
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                              <CheckCircle className="w-3 h-3" /> Active
                            </span>
                          )}
                          {driver.hire_date && (
                            <span className="text-xs text-slate-400">
                              Hired {new Date(driver.hire_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          )}
                          {driver.termination_date && (
                            <span className="text-xs text-red-400">
                              Term {new Date(driver.termination_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Files */}
                      <div className="col-span-1">
                        <span className="inline-flex items-center gap-1 text-sm text-slate-600">
                          <FileText className="w-3.5 h-3.5 text-slate-400" />
                          {fileCount}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="col-span-2 flex items-center justify-end gap-1">
                        {!driverUser && (
                          <button
                            onClick={(e) => openCreateLoginModal(driver, e)}
                            className="p-2 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-lg transition-colors"
                            title="Create Login"
                          >
                            <UserPlus className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={(e) => handleUpdateStatus(driver.id, driver.status === 'available' ? 'off_duty' : 'available', e)}
                          className={`p-2 rounded-lg transition-colors ${
                            driver.status === 'available' 
                              ? 'hover:bg-slate-100 text-emerald-500' 
                              : 'hover:bg-emerald-50 text-slate-400 hover:text-emerald-600'
                          }`}
                          title={driver.status === 'available' ? 'Set Off Duty' : 'Set Available'}
                        >
                          {driver.status === 'available' ? <CheckCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={(e) => handleDeleteDriver(driver.id, e)}
                          className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors"
                          title="Delete Driver"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Mobile Layout */}
                    <div className="lg:hidden">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            isTerminated ? 'bg-slate-200' : 'bg-indigo-100'
                          }`}>
                            <User className={`w-5 h-5 ${isTerminated ? 'text-slate-400' : 'text-indigo-600'}`} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-slate-800">{driver.name}</h3>
                              {isTerminated && (
                                <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded">Terminated</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                              <span>{driver.truck_number}</span>
                              <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full ${status.bg} ${status.text}`}>
                                <StatusIcon className="w-2.5 h-2.5" />
                                {driver.status.replace('_', ' ')}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center gap-1 text-slate-500">
                          <Shield className="w-3 h-3" />
                          <span>License: </span>
                          {driver.license_number ? (
                            <span className={`font-medium ${licStatus === 'expired' ? 'text-red-600' : licStatus === 'warning' ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {licStatus === 'expired' ? 'EXPIRED' : licStatus === 'warning' ? `${licDays}d` : 'Valid'}
                            </span>
                          ) : (
                            <span className="text-slate-400">Missing</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-slate-500">
                          <FileText className="w-3 h-3" />
                          <span>Medical: </span>
                          {driver.medical_card_number ? (
                            <span className={`font-medium ${medStatus === 'expired' ? 'text-red-600' : medStatus === 'warning' ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {medStatus === 'expired' ? 'EXPIRED' : medStatus === 'warning' ? `${medDays}d` : 'Valid'}
                            </span>
                          ) : (
                            <span className="text-slate-400">Missing</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Table Footer */}
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 text-sm text-slate-500">
              Showing {filteredDrivers.length} of {drivers.length} drivers
            </div>
          </div>
        )}
      </div>

      {/* Add Driver Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg m-4 my-8">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-xl font-bold text-slate-800">Add New Driver</h2>
              <p className="text-sm text-slate-500 mt-1">Enter driver details, license, and medical card info</p>
            </div>
            <form onSubmit={handleAddDriver} className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              {/* Basic Info */}
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Basic Information</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-600 mb-1">Full Name *</label>
                    <input type="text" required value={newDriver.name} onChange={(e) => setNewDriver({ ...newDriver, name: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="John Smith" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Phone *</label>
                    <input type="tel" required value={newDriver.phone} onChange={(e) => setNewDriver({ ...newDriver, phone: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="+1-555-0100" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Email</label>
                    <input type="email" value={newDriver.email} onChange={(e) => setNewDriver({ ...newDriver, email: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="john@example.com" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Truck Number *</label>
                    <input type="text" required value={newDriver.truck_number} onChange={(e) => setNewDriver({ ...newDriver, truck_number: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="TRK-001" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Hire Date</label>
                    <input type="date" value={newDriver.hire_date} onChange={(e) => setNewDriver({ ...newDriver, hire_date: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>
              </div>

              {/* License */}
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5" /> Driver's License
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">License #</label>
                    <input type="text" value={newDriver.license_number} onChange={(e) => setNewDriver({ ...newDriver, license_number: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="DL12345" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">State</label>
                    <select value={newDriver.license_state} onChange={(e) => setNewDriver({ ...newDriver, license_state: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500">
                      <option value="">State</option>
                      {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Expires</label>
                    <input type="date" value={newDriver.license_expiration} onChange={(e) => setNewDriver({ ...newDriver, license_expiration: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>
              </div>

              {/* Medical Card */}
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5" /> Medical Card
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Card Number</label>
                    <input type="text" value={newDriver.medical_card_number} onChange={(e) => setNewDriver({ ...newDriver, medical_card_number: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="MC-123456" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Expires</label>
                    <input type="date" value={newDriver.medical_card_expiration} onChange={(e) => setNewDriver({ ...newDriver, medical_card_expiration: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 px-6 py-3 text-slate-600 bg-slate-100 rounded-xl font-medium hover:bg-slate-200">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 px-6 py-3 text-white bg-indigo-600 rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <><Loader2 className="w-5 h-5 animate-spin" />Saving...</> : 'Add Driver'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Login Modal */}
      {showCreateLoginModal && selectedDriverForLogin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md m-4">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-xl font-bold text-slate-800">Create Driver Login</h2>
              <p className="text-sm text-slate-500 mt-1">Create login credentials for {selectedDriverForLogin.name}</p>
            </div>
            <form onSubmit={handleCreateLogin} className="p-6 space-y-4">
              {loginError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {loginError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Email Address</label>
                <input 
                  type="email" 
                  required 
                  value={newLogin.email} 
                  onChange={(e) => setNewLogin({ ...newLogin, email: e.target.value })} 
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500" 
                  placeholder="driver@company.com" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Password</label>
                <input 
                  type="password" 
                  required 
                  value={newLogin.password} 
                  onChange={(e) => setNewLogin({ ...newLogin, password: e.target.value })} 
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500" 
                  placeholder="Minimum 6 characters" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Confirm Password</label>
                <input 
                  type="password" 
                  required 
                  value={newLogin.confirmPassword} 
                  onChange={(e) => setNewLogin({ ...newLogin, confirmPassword: e.target.value })} 
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500" 
                  placeholder="Re-enter password" 
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => {
                    setShowCreateLoginModal(false);
                    setSelectedDriverForLogin(null);
                  }} 
                  className="flex-1 px-6 py-3 text-slate-600 bg-slate-100 rounded-xl font-medium hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={saving} 
                  className="flex-1 px-6 py-3 text-white bg-indigo-600 rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? <><Loader2 className="w-5 h-5 animate-spin" />Creating...</> : 'Create Login'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Driver Profile Modal */}
      <DriverProfileModal
        isOpen={showProfileModal}
        driver={selectedDriver}
        onClose={() => {
          setShowProfileModal(false);
          setSelectedDriver(null);
        }}
        onDriverUpdated={fetchDrivers}
      />
    </div>
  );
};

export default DriversView;
