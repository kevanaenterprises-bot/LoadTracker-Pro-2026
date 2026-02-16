import React, { useState, useEffect, useRef } from 'react';
import { supabase, supabaseUrl, supabaseKey } from '@/lib/supabase';
import { Driver, DriverFile, DriverFileCategory } from '@/types/tms';
import {
  X, User, Truck, Save, Loader2,
  Shield, FileText, Upload, Trash2, Download, AlertTriangle,
  CheckCircle, XCircle, Clock, Paperclip, Eye
} from 'lucide-react';


interface DriverProfileModalProps {
  isOpen: boolean;
  driver: Driver | null;
  onClose: () => void;
  onDriverUpdated: () => void;
}

const FILE_CATEGORIES: { value: DriverFileCategory; label: string }[] = [
  { value: 'medical_card', label: 'Medical Card' },
  { value: 'drivers_license', label: "Driver's License" },
  { value: 'mvr', label: 'MVR Report' },
  { value: 'drug_test', label: 'Drug Test' },
  { value: 'training_cert', label: 'Training Certificate' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'contract', label: 'Contract / Agreement' },
  { value: 'other', label: 'Other' },
];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
];

function getDaysUntilExpiration(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const expDate = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getExpirationBadge(dateStr: string | null) {
  const days = getDaysUntilExpiration(dateStr);
  if (days === null) return null;
  if (days < 0) return { label: `Expired ${Math.abs(days)}d ago`, color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle };
  if (days <= 30) return { label: `Expires in ${days}d`, color: 'bg-amber-100 text-amber-700 border-amber-200', icon: AlertTriangle };
  if (days <= 60) return { label: `Expires in ${days}d`, color: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: Clock };
  return { label: `Valid (${days}d)`, color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle };
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

const DriverProfileModal: React.FC<DriverProfileModalProps> = ({ isOpen, driver, onClose, onDriverUpdated }) => {
  const [activeTab, setActiveTab] = useState<'details' | 'compliance' | 'files'>('details');
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<DriverFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<DriverFileCategory>('other');
  const [uploadDescription, setUploadDescription] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    truck_number: '',
    current_location: '',
    license_number: '',
    license_state: '',
    license_expiration: '',
    medical_card_number: '',
    medical_card_expiration: '',
    hire_date: '',
    termination_date: '',
    employment_status: 'active' as 'active' | 'terminated',
    date_of_birth: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    notes: '',
  });

  useEffect(() => {
    if (driver && isOpen) {
      setForm({
        name: driver.name || '',
        phone: driver.phone || '',
        email: driver.email || '',
        truck_number: driver.truck_number || '',
        current_location: driver.current_location || '',
        license_number: driver.license_number || '',
        license_state: driver.license_state || '',
        license_expiration: driver.license_expiration || '',
        medical_card_number: driver.medical_card_number || '',
        medical_card_expiration: driver.medical_card_expiration || '',
        hire_date: driver.hire_date || '',
        termination_date: driver.termination_date || '',
        employment_status: driver.employment_status || 'active',
        date_of_birth: driver.date_of_birth || '',
        emergency_contact_name: driver.emergency_contact_name || '',
        emergency_contact_phone: driver.emergency_contact_phone || '',
        notes: driver.notes || '',
      });
      setActiveTab('details');
      fetchFiles(driver.id);
    }
  }, [driver, isOpen]);

  const fetchFiles = async (driverId: string) => {
    setLoadingFiles(true);
    const { data } = await supabase
      .from('driver_files')
      .select('*')
      .eq('driver_id', driverId)
      .order('uploaded_at', { ascending: false });
    if (data) setFiles(data);
    setLoadingFiles(false);
  };

  const handleSave = async () => {
    if (!driver) return;
    setSaving(true);
    try {
      const updateData: any = {
        name: form.name,
        phone: form.phone,
        email: form.email || null,
        truck_number: form.truck_number,
        current_location: form.current_location || null,
        license_number: form.license_number || null,
        license_state: form.license_state || null,
        license_expiration: form.license_expiration || null,
        medical_card_number: form.medical_card_number || null,
        medical_card_expiration: form.medical_card_expiration || null,
        hire_date: form.hire_date || null,
        termination_date: form.termination_date || null,
        employment_status: form.employment_status,
        date_of_birth: form.date_of_birth || null,
        emergency_contact_name: form.emergency_contact_name || null,
        emergency_contact_phone: form.emergency_contact_phone || null,
        notes: form.notes || null,
      };

      await supabase.from('drivers').update(updateData).eq('id', driver.id);
      onDriverUpdated();
      onClose();
    } catch (error) {
      alert('Failed to save driver profile');
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!driver || !e.target.files || e.target.files.length === 0) return;
    setUploading(true);

    try {
      for (const file of Array.from(e.target.files)) {
        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `${driver.id}/${timestamp}_${safeName}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('driver-files')
          .upload(filePath, file);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          alert(`Failed to upload ${file.name}: ${uploadError.message}`);
          continue;
        }

        const { data: urlData } = supabase.storage
          .from('driver-files')
          .getPublicUrl(filePath);

        await supabase.from('driver_files').insert({
          driver_id: driver.id,
          file_name: file.name,
          file_url: urlData.publicUrl,
          file_type: file.type,
          file_size: file.size,
          category: uploadCategory,
          description: uploadDescription || null,
        });
      }

      setUploadDescription('');
      setUploadCategory('other');
      fetchFiles(driver.id);
    } catch (error) {
      alert('File upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteFile = async (file: DriverFile) => {
    if (!confirm(`Delete "${file.file_name}"?`)) return;

    // Extract path from URL for storage deletion
    const pathMatch = file.file_url.match(/driver-files\/(.+)$/);
    if (pathMatch) {
      await supabase.storage.from('driver-files').remove([pathMatch[1]]);
    }

    await fetch(`${supabaseUrl}/rest/v1/driver_files?id=eq.${file.id}`, {
      method: 'DELETE',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    });

    if (driver) fetchFiles(driver.id);
  };

  const handleTerminate = async () => {
    if (!driver) return;
    if (!confirm(`Are you sure you want to terminate ${driver.name}? This will set their status to off_duty.`)) return;
    
    const today = new Date().toISOString().split('T')[0];
    await supabase.from('drivers').update({
      employment_status: 'terminated',
      termination_date: today,
      status: 'off_duty',
    }).eq('id', driver.id);
    
    setForm(prev => ({ ...prev, employment_status: 'terminated', termination_date: today }));
    onDriverUpdated();
  };

  const handleRehire = async () => {
    if (!driver) return;
    if (!confirm(`Rehire ${driver.name}?`)) return;
    
    const today = new Date().toISOString().split('T')[0];
    await supabase.from('drivers').update({
      employment_status: 'active',
      termination_date: null,
      hire_date: today,
    }).eq('id', driver.id);
    
    setForm(prev => ({ ...prev, employment_status: 'active', termination_date: '', hire_date: today }));
    onDriverUpdated();
  };

  if (!isOpen || !driver) return null;

  const licenseExp = getExpirationBadge(form.license_expiration);
  const medicalExp = getExpirationBadge(form.medical_card_expiration);

  const tabs = [
    { key: 'details', label: 'Driver Details', icon: User },
    { key: 'compliance', label: 'License & Medical', icon: Shield },
    { key: 'files', label: `Files (${files.length})`, icon: Paperclip },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl m-4 my-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-700 rounded-t-2xl px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/20 backdrop-blur rounded-full flex items-center justify-center">
                <User className="w-7 h-7 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{driver.name}</h2>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-indigo-200 text-sm flex items-center gap-1">
                    <Truck className="w-3.5 h-3.5" /> {driver.truck_number}
                  </span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                    form.employment_status === 'active' 
                      ? 'bg-emerald-400/20 text-emerald-100 border border-emerald-400/30' 
                      : 'bg-red-400/20 text-red-100 border border-red-400/30'
                  }`}>
                    {form.employment_status === 'active' ? (
                      <><CheckCircle className="w-3 h-3" /> Active</>
                    ) : (
                      <><XCircle className="w-3 h-3" /> Terminated</>
                    )}
                  </span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
              <X className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Expiration warnings in header */}
          <div className="flex gap-2 mt-4 flex-wrap">
            {licenseExp && (
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border ${licenseExp.color}`}>
                <licenseExp.icon className="w-3.5 h-3.5" />
                License: {licenseExp.label}
              </span>
            )}
            {medicalExp && (
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border ${medicalExp.color}`}>
                <medicalExp.icon className="w-3.5 h-3.5" />
                Medical: {medicalExp.label}
              </span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-200 flex">
          {tabs.map(tab => {
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                <TabIcon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {/* Details Tab */}
          {activeTab === 'details' && (
            <div className="space-y-6">
              {/* Basic Info */}
              <div>
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Basic Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Full Name *</label>
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Date of Birth</label>
                    <input
                      type="date"
                      value={form.date_of_birth}
                      onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Phone *</label>
                    <input
                      type="tel"
                      required
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Truck Number</label>
                    <input
                      type="text"
                      value={form.truck_number}
                      onChange={(e) => setForm({ ...form, truck_number: e.target.value })}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Current Location</label>
                    <input
                      type="text"
                      value={form.current_location}
                      onChange={(e) => setForm({ ...form, current_location: e.target.value })}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Employment Info */}
              <div>
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Employment</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Hire Date</label>
                    <input
                      type="date"
                      value={form.hire_date}
                      onChange={(e) => setForm({ ...form, hire_date: e.target.value })}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Termination Date</label>
                    <input
                      type="date"
                      value={form.termination_date}
                      onChange={(e) => setForm({ ...form, termination_date: e.target.value })}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      disabled={form.employment_status === 'active'}
                    />
                    {form.employment_status === 'active' && (
                      <p className="text-xs text-slate-400 mt-1">Use the Terminate button to set termination date</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Employment Status</label>
                    <div className="flex items-center gap-3 mt-1">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border ${
                        form.employment_status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-red-50 text-red-700 border-red-200'
                      }`}>
                        {form.employment_status === 'active' ? (
                          <><CheckCircle className="w-4 h-4" /> Active</>
                        ) : (
                          <><XCircle className="w-4 h-4" /> Terminated</>
                        )}
                      </span>
                      {form.employment_status === 'active' ? (
                        <button
                          onClick={handleTerminate}
                          className="px-3 py-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                        >
                          Terminate
                        </button>
                      ) : (
                        <button
                          onClick={handleRehire}
                          className="px-3 py-2 text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                        >
                          Rehire
                        </button>
                      )}
                    </div>
                  </div>
                  {form.hire_date && (
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-1">Tenure</label>
                      <p className="text-sm text-slate-700 mt-2">
                        {(() => {
                          const hire = new Date(form.hire_date + 'T00:00:00');
                          const end = form.termination_date ? new Date(form.termination_date + 'T00:00:00') : new Date();
                          const diffMs = end.getTime() - hire.getTime();
                          const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                          const years = Math.floor(days / 365);
                          const months = Math.floor((days % 365) / 30);
                          const parts = [];
                          if (years > 0) parts.push(`${years}y`);
                          if (months > 0) parts.push(`${months}m`);
                          if (parts.length === 0) parts.push(`${days}d`);
                          return parts.join(' ');
                        })()}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Emergency Contact */}
              <div>
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Emergency Contact</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Contact Name</label>
                    <input
                      type="text"
                      value={form.emergency_contact_name}
                      onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Jane Smith"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Contact Phone</label>
                    <input
                      type="tel"
                      value={form.emergency_contact_phone}
                      onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value })}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="+1-555-0100"
                    />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Notes</h3>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Internal notes about this driver..."
                />
              </div>
            </div>
          )}

          {/* Compliance Tab */}
          {activeTab === 'compliance' && (
            <div className="space-y-6">
              {/* Driver's License */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                    <div className="p-1.5 bg-blue-100 rounded-lg">
                      <Shield className="w-4 h-4 text-blue-600" />
                    </div>
                    Driver's License
                  </h3>
                  {licenseExp && (
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border ${licenseExp.color}`}>
                      <licenseExp.icon className="w-3.5 h-3.5" />
                      {licenseExp.label}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">License Number</label>
                    <input
                      type="text"
                      value={form.license_number}
                      onChange={(e) => setForm({ ...form, license_number: e.target.value })}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                      placeholder="DL12345678"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">State</label>
                    <select
                      value={form.license_state}
                      onChange={(e) => setForm({ ...form, license_state: e.target.value })}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                    >
                      <option value="">Select State</option>
                      {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Expiration Date</label>
                    <input
                      type="date"
                      value={form.license_expiration}
                      onChange={(e) => setForm({ ...form, license_expiration: e.target.value })}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Medical Card */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                    <div className="p-1.5 bg-rose-100 rounded-lg">
                      <FileText className="w-4 h-4 text-rose-600" />
                    </div>
                    Medical Card (DOT Physical)
                  </h3>
                  {medicalExp && (
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border ${medicalExp.color}`}>
                      <medicalExp.icon className="w-3.5 h-3.5" />
                      {medicalExp.label}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Medical Card Number</label>
                    <input
                      type="text"
                      value={form.medical_card_number}
                      onChange={(e) => setForm({ ...form, medical_card_number: e.target.value })}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                      placeholder="MC-123456"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Expiration Date</label>
                    <input
                      type="date"
                      value={form.medical_card_expiration}
                      onChange={(e) => setForm({ ...form, medical_card_expiration: e.target.value })}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Compliance Summary */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Compliance Summary</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-slate-100">
                    <span className="text-sm text-slate-600">Driver's License</span>
                    {form.license_number ? (
                      licenseExp ? (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${licenseExp.color}`}>
                          <licenseExp.icon className="w-3 h-3" /> {licenseExp.label}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">No expiration set</span>
                      )
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500">
                        <AlertTriangle className="w-3 h-3" /> Not on file
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-slate-100">
                    <span className="text-sm text-slate-600">Medical Card</span>
                    {form.medical_card_number ? (
                      medicalExp ? (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${medicalExp.color}`}>
                          <medicalExp.icon className="w-3 h-3" /> {medicalExp.label}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">No expiration set</span>
                      )
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500">
                        <AlertTriangle className="w-3 h-3" /> Not on file
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-slate-600">Files on Record</span>
                    <span className="text-sm font-medium text-slate-700">{files.length} file{files.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Files Tab */}
          {activeTab === 'files' && (
            <div className="space-y-6">
              {/* Upload Section */}
              <div className="bg-indigo-50 rounded-xl border border-indigo-200 p-5">
                <h3 className="text-sm font-semibold text-indigo-800 mb-3 flex items-center gap-2">
                  <Upload className="w-4 h-4" /> Upload Files
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-indigo-700 mb-1">Category</label>
                    <select
                      value={uploadCategory}
                      onChange={(e) => setUploadCategory(e.target.value as DriverFileCategory)}
                      className="w-full px-3 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-sm"
                    >
                      {FILE_CATEGORIES.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-indigo-700 mb-1">Description (optional)</label>
                    <input
                      type="text"
                      value={uploadDescription}
                      onChange={(e) => setUploadDescription(e.target.value)}
                      className="w-full px-3 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-sm"
                      placeholder="e.g. 2026 renewal"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.tif,.tiff"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium transition-colors"
                  >
                    {uploading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
                    ) : (
                      <><Upload className="w-4 h-4" /> Choose Files</>
                    )}
                  </button>
                  <span className="text-xs text-indigo-600">PDF, JPG, PNG, DOC, TIFF</span>
                </div>
              </div>

              {/* Files List */}
              {loadingFiles ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                </div>
              ) : files.length === 0 ? (
                <div className="text-center py-8">
                  <Paperclip className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm">No files uploaded yet</p>
                  <p className="text-slate-400 text-xs mt-1">Upload medical cards, licenses, MVRs, and other documents</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {files.map((file) => {
                    const catLabel = FILE_CATEGORIES.find(c => c.value === file.category)?.label || file.category;
                    const isImage = file.file_type?.startsWith('image/');
                    const isPdf = file.file_type === 'application/pdf';

                    return (
                      <div key={file.id} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200 hover:border-slate-300 transition-colors group">
                        {/* File icon */}
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          isImage ? 'bg-purple-100' : isPdf ? 'bg-red-100' : 'bg-slate-100'
                        }`}>
                          {isImage ? (
                            <Eye className="w-5 h-5 text-purple-600" />
                          ) : isPdf ? (
                            <FileText className="w-5 h-5 text-red-600" />
                          ) : (
                            <FileText className="w-5 h-5 text-slate-500" />
                          )}
                        </div>

                        {/* File info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{file.file_name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">{catLabel}</span>
                            {file.description && (
                              <span className="text-xs text-slate-400 truncate">{file.description}</span>
                            )}
                            <span className="text-xs text-slate-400">{formatFileSize(file.file_size)}</span>
                            <span className="text-xs text-slate-400">
                              {new Date(file.uploaded_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <a
                            href={file.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded-lg transition-colors"
                            title="View / Download"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                          <button
                            onClick={() => handleDeleteFile(file)}
                            className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-slate-600 bg-white border border-slate-200 rounded-xl font-medium hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.name || !form.phone}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
            ) : (
              <><Save className="w-4 h-4" /> Save Changes</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DriverProfileModal;
