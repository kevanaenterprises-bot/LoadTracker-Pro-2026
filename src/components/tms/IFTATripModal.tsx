import React, { useState, useEffect } from 'react';
import { db } from '@/lib/supabaseCompat';
import { IFTATrip, Driver } from '@/types/tms';
import { X, Plus, Trash2, MapPin } from 'lucide-react';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
];

const STATE_NAMES: Record<string, string> = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',
  DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',
  KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',
  MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',
  NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',
  OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',
  TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',
  WI:'Wisconsin',WY:'Wyoming'
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  quarter: number;
  year: number;
  drivers: Driver[];
  editTrip?: IFTATrip | null;
}

interface StateMileEntry {
  state: string;
  miles: string;
}

const IFTATripModal: React.FC<Props> = ({ isOpen, onClose, onSaved, quarter, year, drivers, editTrip }) => {
  const [saving, setSaving] = useState(false);
  const [truckNumber, setTruckNumber] = useState('');
  const [driverId, setDriverId] = useState('');
  const [tripDate, setTripDate] = useState('');
  const [originState, setOriginState] = useState('');
  const [originCity, setOriginCity] = useState('');
  const [destState, setDestState] = useState('');
  const [destCity, setDestCity] = useState('');
  const [totalMiles, setTotalMiles] = useState('');
  const [notes, setNotes] = useState('');
  const [stateMiles, setStateMiles] = useState<StateMileEntry[]>([{ state: '', miles: '' }]);

  useEffect(() => {
    if (isOpen) {
      if (editTrip) {
        setTruckNumber(editTrip.truck_number);
        setDriverId(editTrip.driver_id || '');
        setTripDate(editTrip.trip_date);
        setOriginState(editTrip.origin_state);
        setOriginCity(editTrip.origin_city || '');
        setDestState(editTrip.destination_state);
        setDestCity(editTrip.destination_city || '');
        setTotalMiles(String(editTrip.total_miles));
        setNotes(editTrip.notes || '');
        if (editTrip.states && editTrip.states.length > 0) {
          setStateMiles(editTrip.states.map(s => ({ state: s.state, miles: String(s.miles) })));
        } else {
          setStateMiles([{ state: '', miles: '' }]);
        }
      } else {
        setTruckNumber('');
        setDriverId('');
        setTripDate('');
        setOriginState('');
        setOriginCity('');
        setDestState('');
        setDestCity('');
        setTotalMiles('');
        setNotes('');
        setStateMiles([{ state: '', miles: '' }]);
      }
    }
  }, [isOpen, editTrip]);

  // Auto-fill truck number when driver is selected
  useEffect(() => {
    if (driverId) {
      const driver = drivers.find(d => d.id === driverId);
      if (driver?.truck_number) {
        setTruckNumber(driver.truck_number);
      }
    }
  }, [driverId, drivers]);

  const addStateRow = () => {
    setStateMiles([...stateMiles, { state: '', miles: '' }]);
  };

  const removeStateRow = (index: number) => {
    setStateMiles(stateMiles.filter((_, i) => i !== index));
  };

  const updateStateRow = (index: number, field: 'state' | 'miles', value: string) => {
    const updated = [...stateMiles];
    updated[index] = { ...updated[index], [field]: value };
    setStateMiles(updated);
  };

  const stateTotal = stateMiles.reduce((sum, s) => sum + (parseFloat(s.miles) || 0), 0);

  const handleSave = async () => {
    if (!truckNumber || !tripDate || !originState || !destState) {
      alert('Please fill in truck number, trip date, origin state, and destination state.');
      return;
    }

    const validStates = stateMiles.filter(s => s.state && parseFloat(s.miles) > 0);
    if (validStates.length === 0) {
      alert('Please add at least one state with miles.');
      return;
    }

    setSaving(true);
    try {
      const tripData = {
        truck_number: truckNumber.trim(),
        driver_id: driverId || null,
        quarter,
        year,
        trip_date: tripDate,
        origin_state: originState,
        origin_city: originCity.trim() || null,
        destination_state: destState,
        destination_city: destCity.trim() || null,
        total_miles: parseFloat(totalMiles) || stateTotal,
        notes: notes.trim() || null,
      };

      let tripId: string;

      if (editTrip) {
        await db.from('ifta_trips').update(tripData).eq('id', editTrip.id);
        tripId = editTrip.id;
        // Delete old state entries
        await db.from('ifta_trip_states').delete().eq('ifta_trip_id', tripId);
      } else {
        const { data, error } = await db.from('ifta_trips').insert(tripData).select('id').single();
        if (error) throw error;
        tripId = data.id;
      }

      // Insert state mileage entries
      const stateEntries = validStates.map(s => ({
        ifta_trip_id: tripId,
        state: s.state,
        miles: parseFloat(s.miles),
      }));

      await db.from('ifta_trip_states').insert(stateEntries);

      onSaved();
      onClose();
    } catch (err: any) {
      alert('Failed to save trip: ' + (err?.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  // Get unique truck numbers from drivers
  const truckNumbers = [...new Set(drivers.filter(d => d.truck_number).map(d => d.truck_number))].sort();

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 rounded-t-2xl">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{editTrip ? 'Edit Trip' : 'Add IFTA Trip'}</h2>
            <p className="text-sm text-slate-500">Q{quarter} {year} — Enter state-by-state mileage</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Driver & Truck */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Driver</label>
              <select value={driverId} onChange={e => setDriverId(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                <option value="">Select driver...</option>
                {drivers.filter(d => d.employment_status === 'active').map(d => (
                  <option key={d.id} value={d.id}>{d.name} — Truck #{d.truck_number}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Truck Number *</label>
              <input type="text" value={truckNumber} onChange={e => setTruckNumber(e.target.value)} placeholder="e.g. 101" className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" list="truck-numbers" />
              <datalist id="truck-numbers">
                {truckNumbers.map(t => <option key={t} value={t} />)}
              </datalist>
            </div>
          </div>

          {/* Trip Date */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Trip Date *</label>
            <input type="date" value={tripDate} onChange={e => setTripDate(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
          </div>

          {/* Origin / Destination */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Origin</label>
              <div className="flex gap-2">
                <input type="text" value={originCity} onChange={e => setOriginCity(e.target.value)} placeholder="City" className="flex-1 border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                <select value={originState} onChange={e => setOriginState(e.target.value)} className="w-20 border border-slate-300 rounded-lg px-2 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <option value="">ST</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Destination</label>
              <div className="flex gap-2">
                <input type="text" value={destCity} onChange={e => setDestCity(e.target.value)} placeholder="City" className="flex-1 border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                <select value={destState} onChange={e => setDestState(e.target.value)} className="w-20 border border-slate-300 rounded-lg px-2 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <option value="">ST</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* State-by-State Mileage */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">State-by-State Mileage *</label>
              <button onClick={addStateRow} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                <Plus className="w-3.5 h-3.5" /> Add State
              </button>
            </div>
            <div className="space-y-2 bg-slate-50 rounded-xl p-3">
              {stateMiles.map((entry, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select value={entry.state} onChange={e => updateStateRow(idx, 'state', e.target.value)} className="w-48 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    <option value="">Select state...</option>
                    {US_STATES.map(s => (
                      <option key={s} value={s}>{s} — {STATE_NAMES[s]}</option>
                    ))}
                  </select>
                  <div className="relative flex-1">
                    <input type="number" value={entry.miles} onChange={e => updateStateRow(idx, 'miles', e.target.value)} placeholder="Miles" step="0.1" min="0" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm pr-12 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">mi</span>
                  </div>
                  {stateMiles.length > 1 && (
                    <button onClick={() => removeStateRow(idx)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <span className="text-sm font-medium text-slate-600">State Miles Total</span>
                <span className="text-sm font-bold text-slate-800">{stateTotal.toFixed(1)} mi</span>
              </div>
            </div>
          </div>

          {/* Total Miles Override */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Total Trip Miles (override)</label>
            <input type="number" value={totalMiles} onChange={e => setTotalMiles(e.target.value)} placeholder={`Auto: ${stateTotal.toFixed(1)}`} step="0.1" min="0" className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            <p className="text-xs text-slate-400 mt-1">Leave blank to use sum of state miles</p>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes..." className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none" />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-lg">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            {saving ? 'Saving...' : editTrip ? 'Update Trip' : 'Save Trip'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default IFTATripModal;
