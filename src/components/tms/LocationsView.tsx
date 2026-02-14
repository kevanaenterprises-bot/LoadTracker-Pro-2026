import React, { useState, useEffect } from 'react';
import { db } from '@/lib/supabaseCompat';
import { Location, LocationType } from '@/types/tms';
import { 
  ArrowLeft, Plus, Search, MapPin, Building2, User, Phone, 
  DollarSign, Edit2, Trash2, X, Loader2, Save, FileText,
  Truck, Package, Radar, CheckCircle, AlertTriangle, RefreshCw
} from 'lucide-react';

interface LocationsViewProps {
  onBack: () => void;
  defaultTab?: LocationType;
}

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

const LocationsView: React.FC<LocationsViewProps> = ({ onBack, defaultTab = 'shipper' }) => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<LocationType>(defaultTab);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [saving, setSaving] = useState(false);
  const [geocodingIds, setGeocodingIds] = useState<Set<string>>(new Set());

  const [formData, setFormData] = useState({
    company_name: '',
    address: '',
    city: '',
    state: 'TX',
    zip: '',
    contact_name: '',
    contact_phone: '',
    instructions: '',
    rate: '',
    geofence_radius: '500',
    location_type: activeTab as LocationType,
  });

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    setLoading(true);
    const { data, error } = await db
      .from('locations')
      .select('*')
      .order('company_name');
    
    if (data) setLocations(data);
    setLoading(false);
  };

  const handleOpenModal = (location?: Location) => {
    if (location) {
      setEditingLocation(location);
      setFormData({
        company_name: location.company_name,
        address: location.address || '',
        city: location.city,
        state: location.state,
        zip: location.zip || '',
        contact_name: location.contact_name || '',
        contact_phone: location.contact_phone || '',
        instructions: location.instructions || '',
        rate: location.rate?.toString() || '',
        geofence_radius: (location.geofence_radius || 500).toString(),
        location_type: location.location_type,
      });
    } else {
      setEditingLocation(null);
      setFormData({
        company_name: '',
        address: '',
        city: '',
        state: 'TX',
        zip: '',
        contact_name: '',
        contact_phone: '',
        instructions: '',
        rate: '',
        geofence_radius: '500',
        location_type: activeTab,
      });
    }
    setModalOpen(true);
  };

  // Geocode a single location by ID
  const geocodeLocation = async (locationId: string, address: string, city: string, state: string, zip: string, geofenceRadius?: number) => {
    setGeocodingIds(prev => new Set(prev).add(locationId));
    try {
      const { data, error } = await db.functions.invoke('here-webhook', {
        body: {
          action: 'geocode-and-save-location',
          location_id: locationId,
          address,
          city,
          state,
          zip,
          geofence_radius: geofenceRadius || 500,
        },
      });

      if (data?.success) {
        // Update local state with new coordinates
        setLocations(prev => prev.map(loc => 
          loc.id === locationId 
            ? { ...loc, latitude: data.latitude, longitude: data.longitude, geofence_radius: data.geofence_radius }
            : loc
        ));
        console.log(`Geocoded location ${locationId}: ${data.latitude}, ${data.longitude}`);
      } else {
        console.warn(`Failed to geocode location ${locationId}:`, data?.error || error);
      }
    } catch (err) {
      console.warn(`Geocoding error for ${locationId}:`, err);
    } finally {
      setGeocodingIds(prev => {
        const next = new Set(prev);
        next.delete(locationId);
        return next;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const submitData = {
      company_name: formData.company_name,
      address: formData.address,
      city: formData.city,
      state: formData.state,
      zip: formData.zip,
      contact_name: formData.contact_name,
      contact_phone: formData.contact_phone,
      instructions: formData.instructions,
      rate: parseFloat(formData.rate) || 0,
      geofence_radius: parseInt(formData.geofence_radius) || 500,
      location_type: formData.location_type,
    };

    try {
      if (editingLocation) {
        const { error } = await db
          .from('locations')
          .update(submitData)
          .eq('id', editingLocation.id);
        
        if (!error) {
          // Auto-geocode after update (fire-and-forget with local state update)
          geocodeLocation(
            editingLocation.id,
            submitData.address,
            submitData.city,
            submitData.state,
            submitData.zip,
            submitData.geofence_radius
          );
        }
      } else {
        const { data: inserted, error } = await db
          .from('locations')
          .insert(submitData)
          .select()
          .single();
        
        if (inserted && !error) {
          // Auto-geocode the new location
          geocodeLocation(
            inserted.id,
            submitData.address,
            submitData.city,
            submitData.state,
            submitData.zip,
            submitData.geofence_radius
          );
        }
      }
      setModalOpen(false);
      fetchLocations();
    } catch (error) {
      console.error('Error saving location:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this location?')) return;
    
    await db.from('locations').delete().eq('id', id);
    fetchLocations();
  };

  // Bulk geocode all locations that don't have coordinates
  const handleBulkGeocode = async () => {
    const ungeocodedLocations = locations.filter(
      loc => loc.location_type === activeTab && (!loc.latitude || !loc.longitude)
    );
    
    for (const loc of ungeocodedLocations) {
      await geocodeLocation(loc.id, loc.address, loc.city, loc.state, loc.zip, loc.geofence_radius || 500);
    }
  };

  const filteredLocations = locations.filter(loc =>
    loc.location_type === activeTab && (
      loc.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      loc.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
      loc.state.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const ungeocodedCount = filteredLocations.filter(l => !l.latitude || !l.longitude).length;
  const geocodedCount = filteredLocations.filter(l => l.latitude && l.longitude).length;
  const isShipper = activeTab === 'shipper';
  const primaryColor = isShipper ? 'blue' : 'emerald';

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Locations</h2>
              <p className="text-sm text-slate-500">Manage shippers and receivers</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {ungeocodedCount > 0 && (
              <button
                onClick={handleBulkGeocode}
                disabled={geocodingIds.size > 0}
                className="flex items-center gap-2 px-3 py-2.5 bg-cyan-50 text-cyan-700 border border-cyan-200 rounded-xl font-medium text-sm hover:bg-cyan-100 transition-colors disabled:opacity-50"
                title={`Geocode ${ungeocodedCount} location(s) without coordinates`}
              >
                {geocodingIds.size > 0 ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Radar className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">Geocode All ({ungeocodedCount})</span>
              </button>
            )}
            <button
              onClick={() => handleOpenModal()}
              className={`flex items-center gap-2 px-4 py-2.5 ${isShipper ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white rounded-xl font-medium transition-colors`}
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">Add {isShipper ? 'Shipper' : 'Receiver'}</span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 sm:px-6 lg:px-8 pb-4">
          <div className="flex gap-2 bg-slate-100 p-1 rounded-xl w-fit">
            <button
              onClick={() => setActiveTab('shipper')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                activeTab === 'shipper'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Truck className="w-4 h-4" />
              Shippers
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'shipper' ? 'bg-blue-500' : 'bg-slate-300'
              }`}>
                {locations.filter(l => l.location_type === 'shipper').length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('receiver')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                activeTab === 'receiver'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Package className="w-4 h-4" />
              Receivers
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'receiver' ? 'bg-emerald-500' : 'bg-slate-300'
              }`}>
                {locations.filter(l => l.location_type === 'receiver').length}
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="p-4 sm:p-6 lg:p-8">
        {/* Geofence Status Bar */}
        {filteredLocations.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4 flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Radar className="w-4 h-4 text-cyan-600" />
                <span className="font-medium text-slate-700">Geofence Status:</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                <span className="text-emerald-700 font-medium">{geocodedCount} geocoded</span>
              </div>
              {ungeocodedCount > 0 && (
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span className="text-amber-700 font-medium">{ungeocodedCount} pending</span>
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500 hidden md:block">
              Geocoded locations automatically have geofences when used in loads
            </p>
          </div>
        )}

        {/* Search */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder={`Search ${isShipper ? 'shippers' : 'receivers'} by company, city, or state...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 ${isShipper ? 'focus:ring-blue-500 focus:border-blue-500' : 'focus:ring-emerald-500 focus:border-emerald-500'}`}
            />
          </div>
        </div>

        {/* Locations Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className={`w-8 h-8 animate-spin ${isShipper ? 'text-blue-600' : 'text-emerald-600'}`} />
          </div>
        ) : filteredLocations.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <MapPin className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-800 mb-2">No {isShipper ? 'Shippers' : 'Receivers'} Found</h3>
            <p className="text-slate-500 mb-6">
              {isShipper 
                ? 'Add shipper locations for pickup points. Geofences are set up automatically.'
                : 'Add receiver locations for delivery points with rates. Geofences are set up automatically.'
              }
            </p>
            <button
              onClick={() => handleOpenModal()}
              className={`inline-flex items-center gap-2 px-6 py-3 ${isShipper ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white rounded-xl font-medium transition-colors`}
            >
              <Plus className="w-5 h-5" />
              Add {isShipper ? 'Shipper' : 'Receiver'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredLocations.map((location) => {
              const isGeocoded = !!(location.latitude && location.longitude);
              const isGeocoding = geocodingIds.has(location.id);
              
              return (
                <div
                  key={location.id}
                  className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 ${isShipper ? 'bg-blue-100' : 'bg-emerald-100'} rounded-lg`}>
                        {isShipper ? (
                          <Truck className="w-5 h-5 text-blue-600" />
                        ) : (
                          <Package className="w-5 h-5 text-emerald-600" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-800">{location.company_name}</h3>
                        <p className="text-sm text-slate-500">{location.city}, {location.state}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenModal(location)}
                        className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4 text-slate-500" />
                      </button>
                      <button
                        onClick={() => handleDelete(location.id)}
                        className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </div>

                  {/* Geofence Status Badge */}
                  <div className="mb-4">
                    {isGeocoding ? (
                      <div className="flex items-center gap-2 px-3 py-2 bg-cyan-50 border border-cyan-200 rounded-lg">
                        <Loader2 className="w-4 h-4 text-cyan-600 animate-spin" />
                        <span className="text-xs font-medium text-cyan-700">Geocoding...</span>
                      </div>
                    ) : isGeocoded ? (
                      <div className="flex items-center justify-between px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Radar className="w-4 h-4 text-emerald-600" />
                          <span className="text-xs font-medium text-emerald-700">
                            Geofence Ready
                          </span>
                        </div>
                        <span className="text-xs text-emerald-600">
                          {location.geofence_radius || 500}m radius
                        </span>
                      </div>
                    ) : (
                      <button
                        onClick={() => geocodeLocation(location.id, location.address, location.city, location.state, location.zip, location.geofence_radius || 500)}
                        className="w-full flex items-center justify-between px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                          <span className="text-xs font-medium text-amber-700">
                            Not Geocoded
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                          <RefreshCw className="w-3 h-3" />
                          Geocode Now
                        </div>
                      </button>
                    )}
                  </div>

                  {/* Rate Badge - Only show for receivers */}
                  {location.location_type === 'receiver' && location.rate > 0 && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-emerald-700">Delivery Rate</span>
                        <span className="text-lg font-bold text-emerald-600">
                          ${location.rate?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 text-sm">
                    {location.address && (
                      <div className="flex items-start gap-2 text-slate-600">
                        <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                        <span>{location.address}, {location.city}, {location.state} {location.zip}</span>
                      </div>
                    )}
                    {location.contact_name && (
                      <div className="flex items-center gap-2 text-slate-600">
                        <User className="w-4 h-4 text-slate-400" />
                        <span>{location.contact_name}</span>
                      </div>
                    )}
                    {location.contact_phone && (
                      <div className="flex items-center gap-2 text-slate-600">
                        <Phone className="w-4 h-4 text-slate-400" />
                        <span>{location.contact_phone}</span>
                      </div>
                    )}
                    {location.instructions && (
                      <div className="flex items-start gap-2 text-slate-600 mt-2 pt-2 border-t border-slate-100">
                        <FileText className="w-4 h-4 text-slate-400 mt-0.5" />
                        <span className="text-xs">{location.instructions}</span>
                      </div>
                    )}
                    {/* Coordinates display */}
                    {isGeocoded && (
                      <div className="flex items-center gap-2 text-slate-400 mt-2 pt-2 border-t border-slate-100">
                        <MapPin className="w-3.5 h-3.5" />
                        <span className="text-xs font-mono">
                          {location.latitude?.toFixed(5)}, {location.longitude?.toFixed(5)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
            <div className={`sticky top-0 bg-gradient-to-r ${formData.location_type === 'shipper' ? 'from-blue-600 to-blue-700' : 'from-emerald-600 to-emerald-700'} px-6 py-4 flex items-center justify-between rounded-t-2xl`}>
              <h2 className="text-xl font-bold text-white">
                {editingLocation ? 'Edit' : 'Add New'} {formData.location_type === 'shipper' ? 'Shipper' : 'Receiver'}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Location Type Toggle */}
              {!editingLocation && (
                <div className="flex gap-2 bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, location_type: 'shipper' })}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                      formData.location_type === 'shipper'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <Truck className="w-4 h-4" />
                    Shipper
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, location_type: 'receiver' })}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                      formData.location_type === 'receiver'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <Package className="w-4 h-4" />
                    Receiver
                  </button>
                </div>
              )}

              {/* Auto-geocode notice */}
              <div className="flex items-center gap-3 p-3 bg-cyan-50 border border-cyan-200 rounded-xl">
                <Radar className="w-5 h-5 text-cyan-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-cyan-800">Automatic Geofencing</p>
                  <p className="text-xs text-cyan-600">
                    This location will be automatically geocoded when saved. Geofences are ready for any load that uses this location.
                  </p>
                </div>
              </div>

              {/* Company Info */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-slate-700">
                  <Building2 className={`w-5 h-5 ${formData.location_type === 'shipper' ? 'text-blue-500' : 'text-emerald-500'}`} />
                  <span className="font-semibold">{formData.location_type === 'shipper' ? 'Shipper' : 'Receiver'} Information</span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Company/Location Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 ${formData.location_type === 'shipper' ? 'focus:ring-blue-500 focus:border-blue-500' : 'focus:ring-emerald-500 focus:border-emerald-500'}`}
                    placeholder={formData.location_type === 'shipper' ? 'ABC Manufacturing' : 'XYZ Distribution Center'}
                  />
                </div>
              </div>

              {/* Address */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-slate-700">
                  <MapPin className="w-5 h-5 text-purple-500" />
                  <span className="font-semibold">Address</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-slate-600 mb-1">Street Address</label>
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 ${formData.location_type === 'shipper' ? 'focus:ring-blue-500 focus:border-blue-500' : 'focus:ring-emerald-500 focus:border-emerald-500'}`}
                      placeholder="123 Industrial Blvd"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">City *</label>
                    <input
                      type="text"
                      required
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 ${formData.location_type === 'shipper' ? 'focus:ring-blue-500 focus:border-blue-500' : 'focus:ring-emerald-500 focus:border-emerald-500'}`}
                      placeholder="Dallas"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-1">State *</label>
                      <select
                        required
                        value={formData.state}
                        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                        className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 ${formData.location_type === 'shipper' ? 'focus:ring-blue-500 focus:border-blue-500' : 'focus:ring-emerald-500 focus:border-emerald-500'}`}
                      >
                        {US_STATES.map(state => (
                          <option key={state} value={state}>{state}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-1">ZIP</label>
                      <input
                        type="text"
                        value={formData.zip}
                        onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                        className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 ${formData.location_type === 'shipper' ? 'focus:ring-blue-500 focus:border-blue-500' : 'focus:ring-emerald-500 focus:border-emerald-500'}`}
                        placeholder="75001"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Contact Info */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-slate-700">
                  <User className="w-5 h-5 text-amber-500" />
                  <span className="font-semibold">Contact Information</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Contact Name</label>
                    <input
                      type="text"
                      value={formData.contact_name}
                      onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                      className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 ${formData.location_type === 'shipper' ? 'focus:ring-blue-500 focus:border-blue-500' : 'focus:ring-emerald-500 focus:border-emerald-500'}`}
                      placeholder="John Smith"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Contact Phone</label>
                    <input
                      type="tel"
                      value={formData.contact_phone}
                      onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                      className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 ${formData.location_type === 'shipper' ? 'focus:ring-blue-500 focus:border-blue-500' : 'focus:ring-emerald-500 focus:border-emerald-500'}`}
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </div>
              </div>

              {/* Geofence Settings */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-slate-700">
                  <Radar className="w-5 h-5 text-cyan-500" />
                  <span className="font-semibold">Geofence Settings</span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Geofence Radius (meters)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="100"
                      max="2000"
                      step="50"
                      value={formData.geofence_radius}
                      onChange={(e) => setFormData({ ...formData, geofence_radius: e.target.value })}
                      className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-cyan-600"
                    />
                    <div className="flex items-center gap-1 min-w-[80px]">
                      <input
                        type="number"
                        min="50"
                        max="5000"
                        value={formData.geofence_radius}
                        onChange={(e) => setFormData({ ...formData, geofence_radius: e.target.value })}
                        className="w-20 px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-center focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                      />
                      <span className="text-xs text-slate-500">m</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {parseInt(formData.geofence_radius) <= 200 ? 'Small facility' : 
                     parseInt(formData.geofence_radius) <= 500 ? 'Standard facility (recommended)' :
                     parseInt(formData.geofence_radius) <= 1000 ? 'Large facility / yard' :
                     'Very large area'} — 
                    ~{Math.round(parseInt(formData.geofence_radius) * 3.28084)} ft / ~{(parseInt(formData.geofence_radius) * 0.000621371).toFixed(2)} mi
                  </p>
                </div>
              </div>

              {/* Rate - Only for receivers */}
              {formData.location_type === 'receiver' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-slate-700">
                    <DollarSign className="w-5 h-5 text-emerald-500" />
                    <span className="font-semibold">Pricing</span>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Delivery Rate ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.rate}
                      onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder="2500.00"
                    />
                    <p className="text-xs text-slate-400 mt-1">This rate will be automatically applied when this receiver is selected for a load.</p>
                  </div>
                </div>
              )}

              {/* Instructions */}
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  {formData.location_type === 'shipper' ? 'Pickup' : 'Delivery'} Instructions
                </label>
                <textarea
                  value={formData.instructions}
                  onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                  rows={3}
                  className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 ${formData.location_type === 'shipper' ? 'focus:ring-blue-500 focus:border-blue-500' : 'focus:ring-emerald-500 focus:border-emerald-500'}`}
                  placeholder={formData.location_type === 'shipper' 
                    ? 'Loading dock info, hours of operation, check-in procedures...'
                    : 'Delivery instructions, dock numbers, hours of operation...'
                  }
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 px-6 py-3 text-slate-600 bg-slate-100 rounded-xl font-medium hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className={`flex-1 px-6 py-3 text-white ${formData.location_type === 'shipper' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'} rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2`}
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      {editingLocation ? 'Update' : 'Add'} {formData.location_type === 'shipper' ? 'Shipper' : 'Receiver'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LocationsView;
