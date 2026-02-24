import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { RateMatrix } from '@/types/tms';
import { ArrowLeft, DollarSign, MapPin, Plus, Search, Loader2, Edit2, Trash2, Save, X } from 'lucide-react';

interface RateMatrixViewProps {
  onBack: () => void;
}

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

const RateMatrixView: React.FC<RateMatrixViewProps> = ({ onBack }) => {
  const [rates, setRates] = useState<RateMatrix[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState<number>(0);
  const [newRate, setNewRate] = useState({ city: '', state: 'TX', base_rate: '', per_mile_rate: '2.50' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchRates(); }, []);

  const fetchRates = async () => {
    setLoading(true);
    const { data } = await supabase.from('rate_matrix').select('*').order('state').order('city');
    if (data) setRates(data);
    setLoading(false);
  };

  const handleAddRate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await supabase.from('rate_matrix').insert({
        city: newRate.city,
        state: newRate.state,
        base_rate: parseFloat(newRate.base_rate),
        per_mile_rate: parseFloat(newRate.per_mile_rate),
      });
      setShowAddModal(false);
      setNewRate({ city: '', state: 'TX', base_rate: '', per_mile_rate: '2.50' });
      fetchRates();
    } catch (error) {
      alert('Failed to add rate. City/State may already exist.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateRate = async (id: string) => {
    await supabase.from('rate_matrix').update({ base_rate: editRate }).eq('id', id);
    setEditingId(null);
    fetchRates();
  };

  const handleDeleteRate = async (id: string) => {
    if (!confirm('Delete this rate?')) return;
    await supabase.from('rate_matrix').delete().eq('id', id);
    fetchRates();
  };

  const filteredRates = rates.filter(r => r.city.toLowerCase().includes(searchTerm.toLowerCase()) || r.state.toLowerCase().includes(searchTerm.toLowerCase()));
  const groupedRates = filteredRates.reduce((acc, rate) => {
    if (!acc[rate.state]) acc[rate.state] = [];
    acc[rate.state].push(rate);
    return acc;
  }, {} as Record<string, RateMatrix[]>);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4 mb-4">
            <button onClick={onBack} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold">Rate Matrix</h1>
              <p className="text-emerald-200">Manage destination-based pricing</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="bg-white/10 backdrop-blur rounded-xl p-4">
              <div className="flex items-center gap-2 text-emerald-200 text-sm mb-1">
                <MapPin className="w-4 h-4" /><span>Total Destinations</span>
              </div>
              <p className="text-3xl font-bold">{rates.length}</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-4">
              <div className="flex items-center gap-2 text-emerald-200 text-sm mb-1">
                <DollarSign className="w-4 h-4" /><span>Avg. Base Rate</span>
              </div>
              <p className="text-3xl font-bold">${rates.length > 0 ? (rates.reduce((sum, r) => sum + r.base_rate, 0) / rates.length).toFixed(0) : '0'}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input type="text" placeholder="Search by city or state..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500" />
            </div>
            <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
              <Plus className="w-5 h-5" /><span>Add Rate</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>
        ) : Object.keys(groupedRates).length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <DollarSign className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-800 mb-2">No Rates Found</h3>
            <p className="text-slate-500">Add destination rates to enable automatic pricing.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedRates).sort().map(([state, stateRates]) => (
              <div key={state} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-3 bg-slate-50 border-b border-slate-200">
                  <h3 className="font-semibold text-slate-800">{state}</h3>
                </div>
                <div className="divide-y divide-slate-100">
                  {stateRates.map((rate) => (
                    <div key={rate.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                          <MapPin className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">{rate.city}</p>
                          <p className="text-sm text-slate-500">Per mile: ${rate.per_mile_rate}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {editingId === rate.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500">$</span>
                            <input type="number" value={editRate} onChange={(e) => setEditRate(parseFloat(e.target.value))} className="w-24 px-3 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500" />
                            <button onClick={() => handleUpdateRate(rate.id)} className="p-2 bg-emerald-100 text-emerald-600 rounded-lg hover:bg-emerald-200"><Save className="w-4 h-4" /></button>
                            <button onClick={() => setEditingId(null)} className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200"><X className="w-4 h-4" /></button>
                          </div>
                        ) : (
                          <>
                            <span className="text-xl font-bold text-emerald-600">${rate.base_rate.toLocaleString()}</span>
                            <button onClick={() => { setEditingId(rate.id); setEditRate(rate.base_rate); }} className="p-2 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => handleDeleteRate(rate.id)} className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md m-4">
            <div className="px-6 py-4 border-b border-slate-200"><h2 className="text-xl font-bold text-slate-800">Add New Rate</h2></div>
            <form onSubmit={handleAddRate} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">City</label>
                  <input type="text" required value={newRate.city} onChange={(e) => setNewRate({ ...newRate, city: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500" placeholder="Austin" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">State</label>
                  <select required value={newRate.state} onChange={(e) => setNewRate({ ...newRate, state: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500">
                    {US_STATES.map(state => <option key={state} value={state}>{state}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Base Rate ($)</label>
                <input type="number" required step="0.01" value={newRate.base_rate} onChange={(e) => setNewRate({ ...newRate, base_rate: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500" placeholder="2500.00" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Per Mile Rate ($)</label>
                <input type="number" required step="0.01" value={newRate.per_mile_rate} onChange={(e) => setNewRate({ ...newRate, per_mile_rate: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500" placeholder="2.50" />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 px-6 py-3 text-slate-600 bg-slate-100 rounded-xl font-medium hover:bg-slate-200">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 px-6 py-3 text-white bg-emerald-600 rounded-xl font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <><Loader2 className="w-5 h-5 animate-spin" />Saving...</> : 'Add Rate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RateMatrixView;
