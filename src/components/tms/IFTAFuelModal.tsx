import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { IFTAFuelPurchase, Driver } from '@/types/tms';
import { X, Fuel } from 'lucide-react';

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
  editFuel?: IFTAFuelPurchase | null;
}

const IFTAFuelModal: React.FC<Props> = ({ isOpen, onClose, onSaved, quarter, year, drivers, editFuel }) => {
  const [saving, setSaving] = useState(false);
  const [truckNumber, setTruckNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [gallons, setGallons] = useState('');
  const [pricePerGallon, setPricePerGallon] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [vendor, setVendor] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (editFuel) {
        setTruckNumber(editFuel.truck_number);
        setPurchaseDate(editFuel.purchase_date);
        setState(editFuel.state);
        setCity(editFuel.city || '');
        setGallons(String(editFuel.gallons));
        setPricePerGallon(editFuel.price_per_gallon ? String(editFuel.price_per_gallon) : '');
        setTotalCost(editFuel.total_cost ? String(editFuel.total_cost) : '');
        setVendor(editFuel.vendor || '');
        setReceiptNumber(editFuel.receipt_number || '');
        setNotes(editFuel.notes || '');
      } else {
        setTruckNumber('');
        setPurchaseDate('');
        setState('');
        setCity('');
        setGallons('');
        setPricePerGallon('');
        setTotalCost('');
        setVendor('');
        setReceiptNumber('');
        setNotes('');
      }
    }
  }, [isOpen, editFuel]);

  // Auto-calculate total cost
  useEffect(() => {
    const g = parseFloat(gallons);
    const p = parseFloat(pricePerGallon);
    if (g > 0 && p > 0) {
      setTotalCost((g * p).toFixed(2));
    }
  }, [gallons, pricePerGallon]);

  const handleSave = async () => {
    if (!truckNumber || !purchaseDate || !state || !gallons) {
      alert('Please fill in truck number, date, state, and gallons.');
      return;
    }

    setSaving(true);
    try {
      const fuelData = {
        truck_number: truckNumber.trim(),
        quarter,
        year,
        purchase_date: purchaseDate,
        state,
        gallons: parseFloat(gallons),
        price_per_gallon: pricePerGallon ? parseFloat(pricePerGallon) : null,
        total_cost: totalCost ? parseFloat(totalCost) : null,
        vendor: vendor.trim() || null,
        city: city.trim() || null,
        receipt_number: receiptNumber.trim() || null,
        notes: notes.trim() || null,
      };

      if (editFuel) {
        await supabase.from('ifta_fuel_purchases').update(fuelData).eq('id', editFuel.id);
      } else {
        const { error } = await supabase.from('ifta_fuel_purchases').insert(fuelData);
        if (error) throw error;
      }

      onSaved();
      onClose();
    } catch (err: any) {
      alert('Failed to save fuel purchase: ' + (err?.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const truckNumbers = [...new Set(drivers.filter(d => d.truck_number).map(d => d.truck_number))].sort();

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-amber-50 rounded-t-2xl">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{editFuel ? 'Edit Fuel Purchase' : 'Add Fuel Purchase'}</h2>
            <p className="text-sm text-slate-500">Q{quarter} {year}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-amber-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Truck & Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Truck Number *</label>
              <input type="text" value={truckNumber} onChange={e => setTruckNumber(e.target.value)} placeholder="e.g. 101" className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500" list="fuel-truck-numbers" />
              <datalist id="fuel-truck-numbers">
                {truckNumbers.map(t => <option key={t} value={t} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Purchase Date *</label>
              <input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
            </div>
          </div>

          {/* Location */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">State *</label>
              <select value={state} onChange={e => setState(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500">
                <option value="">Select state...</option>
                {US_STATES.map(s => <option key={s} value={s}>{s} — {STATE_NAMES[s]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
              <input type="text" value={city} onChange={e => setCity(e.target.value)} placeholder="City" className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
            </div>
          </div>

          {/* Fuel Details */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Gallons *</label>
              <input type="number" value={gallons} onChange={e => setGallons(e.target.value)} placeholder="0.000" step="0.001" min="0" className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">$/Gallon</label>
              <input type="number" value={pricePerGallon} onChange={e => setPricePerGallon(e.target.value)} placeholder="0.000" step="0.001" min="0" className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Total Cost</label>
              <input type="number" value={totalCost} onChange={e => setTotalCost(e.target.value)} placeholder="0.00" step="0.01" min="0" className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
            </div>
          </div>

          {/* Vendor & Receipt */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Vendor / Station</label>
              <input type="text" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="e.g. Pilot, Love's" className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Receipt #</label>
              <input type="text" value={receiptNumber} onChange={e => setReceiptNumber(e.target.value)} placeholder="Receipt number" className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes..." className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-none" />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-lg">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg disabled:opacity-50 flex items-center gap-2">
            <Fuel className="w-4 h-4" />
            {saving ? 'Saving...' : editFuel ? 'Update' : 'Save Fuel Purchase'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default IFTAFuelModal;
