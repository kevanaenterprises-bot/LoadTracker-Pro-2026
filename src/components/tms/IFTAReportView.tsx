import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Driver, IFTATrip, IFTATripState, IFTAFuelPurchase } from '@/types/tms';
import IFTATripModal from './IFTATripModal';
import IFTAFuelModal from './IFTAFuelModal';
import {
  ArrowLeft, ChevronLeft, ChevronRight, Download, Plus, Fuel, MapPin, Truck,
  FileText, RefreshCw, Trash2, Pencil, Upload, BarChart3, AlertTriangle, CheckCircle2,
  Satellite, Loader2, Signal
} from 'lucide-react';


// IFTA tax rates per state (cents per gallon - 2025 approximate rates)
const STATE_TAX_RATES: Record<string, number> = {
  AL:0.29,AK:0.0895,AZ:0.18,AR:0.245,CA:0.5387,CO:0.22,CT:0.25,DE:0.22,FL:0.35,GA:0.312,
  HI:0.16,ID:0.33,IL:0.392,IN:0.34,IA:0.30,KS:0.24,KY:0.246,LA:0.20,ME:0.312,MD:0.361,
  MA:0.24,MI:0.267,MN:0.285,MS:0.18,MO:0.195,MT:0.3275,NE:0.246,NV:0.23,NH:0.222,NJ:0.105,
  NM:0.18,NY:0.0804,NC:0.382,ND:0.23,OH:0.385,OK:0.19,OR:0.38,PA:0.576,RI:0.35,SC:0.28,
  SD:0.28,TN:0.27,TX:0.20,UT:0.315,VT:0.321,VA:0.262,WA:0.494,WV:0.357,WI:0.309,WY:0.24
};

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
  onBack: () => void;
}

type TabType = 'summary' | 'trips' | 'fuel';

const IFTAReportView: React.FC<Props> = ({ onBack }) => {
  const now = new Date();
  const currentQuarter = Math.ceil((now.getMonth() + 1) / 3);
  const currentYear = now.getFullYear();

  const [quarter, setQuarter] = useState(currentQuarter);
  const [year, setYear] = useState(currentYear);
  const [truckFilter, setTruckFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<TabType>('summary');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trips, setTrips] = useState<IFTATrip[]>([]);
  const [fuelPurchases, setFuelPurchases] = useState<IFTAFuelPurchase[]>([]);

  const [tripModalOpen, setTripModalOpen] = useState(false);
  const [fuelModalOpen, setFuelModalOpen] = useState(false);
  const [editTrip, setEditTrip] = useState<IFTATrip | null>(null);
  const [editFuel, setEditFuel] = useState<IFTAFuelPurchase | null>(null);

  useEffect(() => {
    fetchDrivers();
  }, []);

  useEffect(() => {
    fetchData();
  }, [quarter, year]);

  const fetchDrivers = async () => {
    const { data } = await supabase.from('drivers').select('*').order('name');
    if (data) setDrivers(data);
  };

  const fetchData = async () => {
    setLoading(true);
    const [tripsRes, fuelRes] = await Promise.all([
      supabase.from('ifta_trips').select('*, states:ifta_trip_states(*)').eq('quarter', quarter).eq('year', year).order('trip_date', { ascending: false }),
      supabase.from('ifta_fuel_purchases').select('*').eq('quarter', quarter).eq('year', year).order('purchase_date', { ascending: false }),
    ]);
    if (tripsRes.data) setTrips(tripsRes.data);
    if (fuelRes.data) setFuelPurchases(fuelRes.data);
    setLoading(false);
  };

  // Get unique truck numbers from trips + fuel + drivers
  const allTruckNumbers = useMemo(() => {
    const set = new Set<string>();
    trips.forEach(t => set.add(t.truck_number));
    fuelPurchases.forEach(f => set.add(f.truck_number));
    drivers.forEach(d => { if (d.truck_number) set.add(d.truck_number); });
    return [...set].sort();
  }, [trips, fuelPurchases, drivers]);

  // Filter by truck
  const filteredTrips = truckFilter === 'all' ? trips : trips.filter(t => t.truck_number === truckFilter);
  const filteredFuel = truckFilter === 'all' ? fuelPurchases : fuelPurchases.filter(f => f.truck_number === truckFilter);

  // Calculate summary
  const summary = useMemo(() => {
    const stateMap: Record<string, { miles: number; gallons: number }> = {};

    filteredTrips.forEach(trip => {
      if (trip.states) {
        trip.states.forEach(s => {
          if (!stateMap[s.state]) stateMap[s.state] = { miles: 0, gallons: 0 };
          stateMap[s.state].miles += Number(s.miles);
        });
      }
    });

    filteredFuel.forEach(fp => {
      if (!stateMap[fp.state]) stateMap[fp.state] = { miles: 0, gallons: 0 };
      stateMap[fp.state].gallons += Number(fp.gallons);
    });

    const totalMiles = Object.values(stateMap).reduce((sum, s) => sum + s.miles, 0);
    const totalGallons = Object.values(stateMap).reduce((sum, s) => sum + s.gallons, 0);
    const fleetMPG = totalGallons > 0 ? totalMiles / totalGallons : 0;

    const states = Object.entries(stateMap)
      .map(([state, data]) => {
        const taxRate = STATE_TAX_RATES[state] || 0;
        const taxableGallons = fleetMPG > 0 ? data.miles / fleetMPG : 0;
        const taxOwed = taxableGallons * taxRate;
        const taxPaid = data.gallons * taxRate;
        const netTax = taxOwed - taxPaid;

        return {
          state,
          totalMiles: data.miles,
          taxableMiles: data.miles,
          taxPaidGallons: data.gallons,
          taxRate,
          taxOwed,
          taxPaid,
          netTax,
          mpg: fleetMPG,
          taxableGallons,
        };
      })
      .sort((a, b) => a.state.localeCompare(b.state));

    return { states, totalMiles, totalGallons, fleetMPG };
  }, [filteredTrips, filteredFuel]);

  const totalNetTax = summary.states.reduce((sum, s) => sum + s.netTax, 0);
  const totalTaxOwed = summary.states.reduce((sum, s) => sum + s.taxOwed, 0);
  const totalTaxPaid = summary.states.reduce((sum, s) => sum + s.taxPaid, 0);

  // Import loads from the loads table - enhanced with GPS-tracked state miles
  const handleImportLoads = async () => {
    setImporting(true);
    try {
      // Determine date range for the quarter
      const startMonth = (quarter - 1) * 3 + 1;
      const endMonth = startMonth + 2;
      const startDate = `${year}-${String(startMonth).padStart(2, '0')}-01`;
      const endDate = endMonth === 12
        ? `${year}-12-31`
        : `${year}-${String(endMonth + 1).padStart(2, '0')}-01`;

      // Fetch delivered/invoiced/paid loads in this quarter
      const { data: loads } = await supabase
        .from('loads')
        .select('*, driver:drivers(*)')
        .in('status', ['DELIVERED', 'INVOICED', 'PAID'])
        .gte('delivery_date', startDate)
        .lt('delivery_date', endDate)
        .order('delivery_date');

      if (!loads || loads.length === 0) {
        alert('No delivered loads found for this quarter.');
        setImporting(false);
        return;
      }

      // Check which loads are already imported
      const existingLoadIds = new Set(trips.filter(t => t.load_id).map(t => t.load_id));
      const newLoads = loads.filter(l => !existingLoadIds.has(l.id));

      if (newLoads.length === 0) {
        alert('All loads for this quarter have already been imported.');
        setImporting(false);
        return;
      }

      // Fetch GPS-tracked state mileage for this quarter
      let gpsTrackedMiles: Record<string, Array<{ state_code: string; miles: number }>> = {};
      try {
        const { data: gpsMiles } = await supabase
          .from('ifta_state_mileage')
          .select('*')
          .eq('quarter', quarter)
          .eq('year', year);
        
        if (gpsMiles && gpsMiles.length > 0) {
          // Group by load_id
          gpsMiles.forEach((m: any) => {
            if (m.load_id) {
              if (!gpsTrackedMiles[m.load_id]) gpsTrackedMiles[m.load_id] = [];
              gpsTrackedMiles[m.load_id].push({ state_code: m.state_code, miles: m.miles });
            }
          });
          console.log(`[IFTA Import] Found GPS-tracked miles for ${Object.keys(gpsTrackedMiles).length} loads`);
        }
      } catch (err) {
        console.warn('[IFTA Import] Could not fetch GPS-tracked miles:', err);
      }

      let imported = 0;
      let gpsTrackedCount = 0;
      let estimatedCount = 0;

      for (const load of newLoads) {
        const truckNum = load.driver?.truck_number || 'UNKNOWN';
        const totalMiles = Number(load.total_miles) || 0;

        // Create trip
        const { data: tripData, error: tripError } = await supabase.from('ifta_trips').insert({
          driver_id: load.driver_id,
          load_id: load.id,
          truck_number: truckNum,
          quarter,
          year,
          trip_date: load.delivery_date || load.pickup_date,
          origin_state: load.origin_state,
          origin_city: load.origin_city,
          destination_state: load.dest_state,
          destination_city: load.dest_city,
          total_miles: totalMiles,
          notes: gpsTrackedMiles[load.id] 
            ? `Auto-imported from Load #${load.load_number} (GPS-tracked state miles)` 
            : `Auto-imported from Load #${load.load_number} (estimated split)`,
        }).select('id').single();

        if (tripError || !tripData) continue;

        // Create state entries
        const stateEntries: { ifta_trip_id: string; state: string; miles: number }[] = [];
        
        // Check if we have GPS-tracked state miles for this load
        const gpsData = gpsTrackedMiles[load.id];
        
        if (gpsData && gpsData.length > 0) {
          // USE GPS-TRACKED STATE MILES - these are actual miles from HERE Maps tracking
          const gpsTotalMiles = gpsData.reduce((sum, g) => sum + g.miles, 0);
          
          gpsData.forEach(g => {
            if (g.miles > 0.1) { // Only include states with meaningful mileage
              // Scale GPS miles to match the load's total miles (GPS may have slight differences)
              const scaledMiles = gpsTotalMiles > 0 
                ? (g.miles / gpsTotalMiles) * totalMiles 
                : g.miles;
              stateEntries.push({ 
                ifta_trip_id: tripData.id, 
                state: g.state_code, 
                miles: Math.round(scaledMiles * 10) / 10 
              });
            }
          });
          
          gpsTrackedCount++;
          console.log(`[IFTA Import] Load ${load.load_number}: GPS-tracked ${gpsData.length} states (${gpsTotalMiles.toFixed(1)} GPS mi / ${totalMiles} total mi)`);
        } else if (load.origin_state === load.dest_state) {
          // Same state trip
          stateEntries.push({ ifta_trip_id: tripData.id, state: load.origin_state, miles: totalMiles });
          estimatedCount++;
        } else {
          // Different states, no GPS data - split evenly (user can edit later)
          const halfMiles = totalMiles / 2;
          stateEntries.push({ ifta_trip_id: tripData.id, state: load.origin_state, miles: Math.round(halfMiles * 10) / 10 });
          stateEntries.push({ ifta_trip_id: tripData.id, state: load.dest_state, miles: Math.round(halfMiles * 10) / 10 });
          estimatedCount++;
        }

        if (stateEntries.length > 0) {
          await supabase.from('ifta_trip_states').insert(stateEntries);
        }
        imported++;
      }

      const parts = [`Successfully imported ${imported} load${imported !== 1 ? 's' : ''} as IFTA trips.`];
      if (gpsTrackedCount > 0) parts.push(`${gpsTrackedCount} with GPS-tracked state miles.`);
      if (estimatedCount > 0) parts.push(`${estimatedCount} with estimated state splits (review recommended).`);
      alert(parts.join(' '));
      fetchData();
    } catch (err: any) {
      alert('Import failed: ' + (err?.message || 'Unknown error'));
    } finally {
      setImporting(false);
    }
  };



  const handleDeleteTrip = async (tripId: string) => {
    if (!confirm('Delete this trip? This cannot be undone.')) return;
    await supabase.from('ifta_trip_states').delete().eq('ifta_trip_id', tripId);
    await supabase.from('ifta_trips').delete().eq('id', tripId);
    fetchData();
  };

  const handleDeleteFuel = async (fuelId: string) => {
    if (!confirm('Delete this fuel purchase? This cannot be undone.')) return;
    await supabase.from('ifta_fuel_purchases').delete().eq('id', fuelId);
    fetchData();
  };

  const handleEditTrip = (trip: IFTATrip) => {
    setEditTrip(trip);
    setTripModalOpen(true);
  };

  const handleEditFuel = (fuel: IFTAFuelPurchase) => {
    setEditFuel(fuel);
    setFuelModalOpen(true);
  };

  // CSV Export
  const exportCSV = () => {
    if (activeTab === 'summary') {
      const headers = ['State', 'State Name', 'Total Miles', 'Taxable Gallons', 'Tax-Paid Gallons', 'Tax Rate ($/gal)', 'Tax Owed', 'Tax Paid', 'Net Tax'];
      const rows = summary.states.map(s => [
        s.state, STATE_NAMES[s.state] || s.state, s.totalMiles.toFixed(1), s.taxableGallons.toFixed(3),
        s.taxPaidGallons.toFixed(3), s.taxRate.toFixed(4), s.taxOwed.toFixed(2), s.taxPaid.toFixed(2), s.netTax.toFixed(2)
      ]);
      rows.push(['', 'TOTALS', summary.totalMiles.toFixed(1), '', summary.totalGallons.toFixed(3), '', totalTaxOwed.toFixed(2), totalTaxPaid.toFixed(2), totalNetTax.toFixed(2)]);
      downloadCSV(`IFTA_Summary_Q${quarter}_${year}${truckFilter !== 'all' ? `_Truck${truckFilter}` : ''}.csv`, headers, rows);
    } else if (activeTab === 'trips') {
      const headers = ['Date', 'Truck', 'Origin', 'Destination', 'Total Miles', 'State Miles Breakdown'];
      const rows = filteredTrips.map(t => [
        t.trip_date, t.truck_number,
        `${t.origin_city || ''} ${t.origin_state}`.trim(),
        `${t.destination_city || ''} ${t.destination_state}`.trim(),
        String(t.total_miles),
        (t.states || []).map(s => `${s.state}:${s.miles}`).join('; ')
      ]);
      downloadCSV(`IFTA_Trips_Q${quarter}_${year}${truckFilter !== 'all' ? `_Truck${truckFilter}` : ''}.csv`, headers, rows);
    } else {
      const headers = ['Date', 'Truck', 'State', 'City', 'Gallons', '$/Gallon', 'Total Cost', 'Vendor', 'Receipt #'];
      const rows = filteredFuel.map(f => [
        f.purchase_date, f.truck_number, f.state, f.city || '', String(f.gallons),
        f.price_per_gallon ? String(f.price_per_gallon) : '', f.total_cost ? String(f.total_cost) : '',
        f.vendor || '', f.receipt_number || ''
      ]);
      downloadCSV(`IFTA_Fuel_Q${quarter}_${year}${truckFilter !== 'all' ? `_Truck${truckFilter}` : ''}.csv`, headers, rows);
    }
  };

  const downloadCSV = (filename: string, headers: string[], rows: string[][]) => {
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const prevQuarter = () => {
    if (quarter === 1) { setQuarter(4); setYear(year - 1); }
    else setQuarter(quarter - 1);
  };

  const nextQuarter = () => {
    if (quarter === 4) { setQuarter(1); setYear(year + 1); }
    else setQuarter(quarter + 1);
  };

  const quarterDateRange = () => {
    const months = ['Jan-Mar', 'Apr-Jun', 'Jul-Sep', 'Oct-Dec'];
    return months[quarter - 1];
  };

  const getDriverName = (trip: IFTATrip) => {
    const driver = drivers.find(d => d.id === trip.driver_id);
    return driver?.name || '';
  };

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div>
              <h2 className="text-xl font-bold text-slate-800">IFTA Reporting</h2>
              <p className="text-sm text-slate-500">International Fuel Tax Agreement — State Mileage & Fuel</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors">
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </div>
        </div>
      </header>

      <main className="p-4 sm:p-6 lg:p-8">
        {/* Quarter Selector & Truck Filter */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            {/* Quarter Navigator */}
            <div className="flex items-center gap-3">
              <button onClick={prevQuarter} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <ChevronLeft className="w-5 h-5 text-slate-600" />
              </button>
              <div className="text-center min-w-[140px]">
                <div className="text-lg font-bold text-slate-800">Q{quarter} {year}</div>
                <div className="text-xs text-slate-500">{quarterDateRange()}</div>
              </div>
              <button onClick={nextQuarter} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <ChevronRight className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            {/* Truck Filter */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-slate-600">Truck:</label>
              <select value={truckFilter} onChange={e => setTruckFilter(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                <option value="all">All Trucks</option>
                {allTruckNumbers.map(t => <option key={t} value={t}>Truck #{t}</option>)}
              </select>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button onClick={handleImportLoads} disabled={importing} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50">
                <Upload className="w-4 h-4" />
                {importing ? 'Importing...' : 'Import Loads'}
              </button>
              <button onClick={() => { setEditTrip(null); setTripModalOpen(true); }} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
                <Plus className="w-4 h-4" /> Add Trip
              </button>
              <button onClick={() => { setEditFuel(null); setFuelModalOpen(true); }} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors">
                <Fuel className="w-4 h-4" /> Add Fuel
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-100 rounded-xl"><MapPin className="w-5 h-5 text-blue-600" /></div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Total Miles</p>
                <p className="text-xl font-bold text-slate-800">{summary.totalMiles.toLocaleString('en-US', { maximumFractionDigits: 1 })}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-100 rounded-xl"><Fuel className="w-5 h-5 text-amber-600" /></div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Total Gallons</p>
                <p className="text-xl font-bold text-slate-800">{summary.totalGallons.toLocaleString('en-US', { maximumFractionDigits: 1 })}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-100 rounded-xl"><BarChart3 className="w-5 h-5 text-emerald-600" /></div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Fleet MPG</p>
                <p className="text-xl font-bold text-slate-800">{summary.fleetMPG > 0 ? summary.fleetMPG.toFixed(2) : '—'}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-purple-100 rounded-xl"><FileText className="w-5 h-5 text-purple-600" /></div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Jurisdictions</p>
                <p className="text-xl font-bold text-slate-800">{summary.states.length}</p>
              </div>
            </div>
          </div>
          <div className={`rounded-xl shadow-sm border p-4 ${totalNetTax >= 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${totalNetTax >= 0 ? 'bg-red-100' : 'bg-emerald-100'}`}>
                {totalNetTax >= 0 ? <AlertTriangle className="w-5 h-5 text-red-600" /> : <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
              </div>
              <div>
                <p className="text-xs font-medium" style={{ color: totalNetTax >= 0 ? '#dc2626' : '#059669' }}>
                  {totalNetTax >= 0 ? 'Net Tax Owed' : 'Net Credit'}
                </p>
                <p className="text-xl font-bold" style={{ color: totalNetTax >= 0 ? '#dc2626' : '#059669' }}>
                  ${Math.abs(totalNetTax).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6">
          <div className="flex border-b border-slate-200">
            {[
              { key: 'summary' as TabType, label: 'Tax Summary', icon: BarChart3, count: summary.states.length },
              { key: 'trips' as TabType, label: 'Trips', icon: Truck, count: filteredTrips.length },
              { key: 'fuel' as TabType, label: 'Fuel Purchases', icon: Fuel, count: filteredFuel.length },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span>{tab.label}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs ${activeTab === tab.key ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <>
            {/* Summary Tab */}
            {activeTab === 'summary' && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {summary.states.length === 0 ? (
                  <div className="p-12 text-center">
                    <BarChart3 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-slate-800 mb-2">No Data for This Quarter</h3>
                    <p className="text-slate-500 mb-4">Add trips or import loads to generate the IFTA summary.</p>
                    <div className="flex items-center justify-center gap-3">
                      <button onClick={handleImportLoads} disabled={importing} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100">
                        <Upload className="w-4 h-4" /> Import from Loads
                      </button>
                      <button onClick={() => { setEditTrip(null); setTripModalOpen(true); }} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                        <Plus className="w-4 h-4" /> Add Trip Manually
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="text-left px-4 py-3 font-semibold text-slate-600">State</th>
                          <th className="text-right px-4 py-3 font-semibold text-slate-600">Total Miles</th>
                          <th className="text-right px-4 py-3 font-semibold text-slate-600">Taxable Gal</th>
                          <th className="text-right px-4 py-3 font-semibold text-slate-600">Tax-Paid Gal</th>
                          <th className="text-right px-4 py-3 font-semibold text-slate-600">Tax Rate</th>
                          <th className="text-right px-4 py-3 font-semibold text-slate-600">Tax Owed</th>
                          <th className="text-right px-4 py-3 font-semibold text-slate-600">Tax Paid</th>
                          <th className="text-right px-4 py-3 font-semibold text-slate-600">Net Tax</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.states.map((s, idx) => (
                          <tr key={s.state} className={`border-b border-slate-100 hover:bg-slate-50 ${idx % 2 === 0 ? '' : 'bg-slate-50/50'}`}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-800">{s.state}</span>
                                <span className="text-slate-500">{STATE_NAMES[s.state]}</span>
                              </div>
                            </td>
                            <td className="text-right px-4 py-3 font-medium text-slate-800">{s.totalMiles.toLocaleString('en-US', { maximumFractionDigits: 1 })}</td>
                            <td className="text-right px-4 py-3 text-slate-700">{s.taxableGallons.toFixed(3)}</td>
                            <td className="text-right px-4 py-3 text-slate-700">{s.taxPaidGallons.toFixed(3)}</td>
                            <td className="text-right px-4 py-3 text-slate-500">${s.taxRate.toFixed(4)}</td>
                            <td className="text-right px-4 py-3 text-slate-700">${s.taxOwed.toFixed(2)}</td>
                            <td className="text-right px-4 py-3 text-slate-700">${s.taxPaid.toFixed(2)}</td>
                            <td className={`text-right px-4 py-3 font-semibold ${s.netTax >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                              {s.netTax >= 0 ? '' : '-'}${Math.abs(s.netTax).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold">
                          <td className="px-4 py-3 text-slate-800">TOTALS</td>
                          <td className="text-right px-4 py-3 text-slate-800">{summary.totalMiles.toLocaleString('en-US', { maximumFractionDigits: 1 })}</td>
                          <td className="text-right px-4 py-3 text-slate-700">—</td>
                          <td className="text-right px-4 py-3 text-slate-700">{summary.totalGallons.toFixed(3)}</td>
                          <td className="text-right px-4 py-3 text-slate-500">—</td>
                          <td className="text-right px-4 py-3 text-slate-700">${totalTaxOwed.toFixed(2)}</td>
                          <td className="text-right px-4 py-3 text-slate-700">${totalTaxPaid.toFixed(2)}</td>
                          <td className={`text-right px-4 py-3 ${totalNetTax >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                            {totalNetTax >= 0 ? '' : '-'}${Math.abs(totalNetTax).toFixed(2)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                {summary.states.length > 0 && (
                  <div className="px-4 py-3 bg-slate-50 border-t border-slate-200">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Fleet MPG: {summary.fleetMPG.toFixed(2)} — Taxable gallons = State Miles / Fleet MPG</span>
                      <span>Q{quarter} {year} — {truckFilter === 'all' ? 'All Trucks' : `Truck #${truckFilter}`}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Trips Tab */}
            {activeTab === 'trips' && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {filteredTrips.length === 0 ? (
                  <div className="p-12 text-center">
                    <Truck className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-slate-800 mb-2">No Trips Recorded</h3>
                    <p className="text-slate-500 mb-4">Add trips manually or import from your completed loads.</p>
                    <div className="flex items-center justify-center gap-3">
                      <button onClick={handleImportLoads} disabled={importing} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100">
                        <Upload className="w-4 h-4" /> Import from Loads
                      </button>
                      <button onClick={() => { setEditTrip(null); setTripModalOpen(true); }} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                        <Plus className="w-4 h-4" /> Add Trip
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="text-left px-4 py-3 font-semibold text-slate-600">Date</th>
                          <th className="text-left px-4 py-3 font-semibold text-slate-600">Truck</th>
                          <th className="text-left px-4 py-3 font-semibold text-slate-600">Driver</th>
                          <th className="text-left px-4 py-3 font-semibold text-slate-600">Route</th>
                          <th className="text-right px-4 py-3 font-semibold text-slate-600">Total Miles</th>
                          <th className="text-left px-4 py-3 font-semibold text-slate-600">State Breakdown</th>
                          <th className="text-left px-4 py-3 font-semibold text-slate-600">Source</th>
                          <th className="text-right px-4 py-3 font-semibold text-slate-600">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTrips.map((trip, idx) => (
                          <tr key={trip.id} className={`border-b border-slate-100 hover:bg-slate-50 ${idx % 2 === 0 ? '' : 'bg-slate-50/50'}`}>
                            <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                              {new Date(trip.trip_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 rounded text-xs font-medium text-slate-700">
                                <Truck className="w-3 h-3" /> #{trip.truck_number}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-700">{getDriverName(trip) || '—'}</td>
                            <td className="px-4 py-3">
                              <span className="text-slate-800">
                                {trip.origin_city ? `${trip.origin_city}, ` : ''}{trip.origin_state}
                              </span>
                              <span className="text-slate-400 mx-1.5">&rarr;</span>
                              <span className="text-slate-800">
                                {trip.destination_city ? `${trip.destination_city}, ` : ''}{trip.destination_state}
                              </span>
                            </td>
                            <td className="text-right px-4 py-3 font-medium text-slate-800">{Number(trip.total_miles).toLocaleString('en-US', { maximumFractionDigits: 1 })}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {(trip.states || []).map(s => (
                                  <span key={s.id} className="inline-flex items-center px-2 py-0.5 bg-blue-50 border border-blue-200 rounded text-xs font-medium text-blue-700">
                                    {s.state}: {Number(s.miles).toFixed(1)}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {trip.notes?.includes('GPS-tracked') ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-cyan-50 border border-cyan-200 rounded text-xs font-medium text-cyan-700">
                                  <Satellite className="w-3 h-3" />
                                  GPS Tracked
                                </span>
                              ) : trip.load_id ? (
                                <span className="inline-flex items-center px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded text-xs font-medium text-emerald-700">
                                  Imported
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 bg-slate-50 border border-slate-200 rounded text-xs font-medium text-slate-600">
                                  Manual
                                </span>
                              )}
                            </td>

                            <td className="text-right px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => handleEditTrip(trip)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleDeleteTrip(trip.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Fuel Tab */}
            {activeTab === 'fuel' && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {filteredFuel.length === 0 ? (
                  <div className="p-12 text-center">
                    <Fuel className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-slate-800 mb-2">No Fuel Purchases Recorded</h3>
                    <p className="text-slate-500 mb-4">Track fuel purchases by state for accurate IFTA tax calculations.</p>
                    <button onClick={() => { setEditFuel(null); setFuelModalOpen(true); }} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 mx-auto">
                      <Plus className="w-4 h-4" /> Add Fuel Purchase
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Date</th>
                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Truck</th>
                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Location</th>
                            <th className="text-right px-4 py-3 font-semibold text-slate-600">Gallons</th>
                            <th className="text-right px-4 py-3 font-semibold text-slate-600">$/Gallon</th>
                            <th className="text-right px-4 py-3 font-semibold text-slate-600">Total Cost</th>
                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Vendor</th>
                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Receipt #</th>
                            <th className="text-right px-4 py-3 font-semibold text-slate-600">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredFuel.map((fp, idx) => (
                            <tr key={fp.id} className={`border-b border-slate-100 hover:bg-slate-50 ${idx % 2 === 0 ? '' : 'bg-slate-50/50'}`}>
                              <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                                {new Date(fp.purchase_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </td>
                              <td className="px-4 py-3">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 rounded text-xs font-medium text-slate-700">
                                  <Truck className="w-3 h-3" /> #{fp.truck_number}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-slate-700">
                                {fp.city ? `${fp.city}, ` : ''}{fp.state}
                              </td>
                              <td className="text-right px-4 py-3 font-medium text-slate-800">{Number(fp.gallons).toFixed(3)}</td>
                              <td className="text-right px-4 py-3 text-slate-700">
                                {fp.price_per_gallon ? `$${Number(fp.price_per_gallon).toFixed(3)}` : '—'}
                              </td>
                              <td className="text-right px-4 py-3 font-medium text-slate-800">
                                {fp.total_cost ? `$${Number(fp.total_cost).toFixed(2)}` : '—'}
                              </td>
                              <td className="px-4 py-3 text-slate-700">{fp.vendor || '—'}</td>
                              <td className="px-4 py-3 text-slate-500 text-xs">{fp.receipt_number || '—'}</td>
                              <td className="text-right px-4 py-3">
                                <div className="flex items-center justify-end gap-1">
                                  <button onClick={() => handleEditFuel(fp)} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => handleDeleteFuel(fp.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold">
                            <td className="px-4 py-3 text-slate-800" colSpan={3}>TOTALS</td>
                            <td className="text-right px-4 py-3 text-slate-800">
                              {filteredFuel.reduce((sum, f) => sum + Number(f.gallons), 0).toFixed(3)}
                            </td>
                            <td className="text-right px-4 py-3 text-slate-500">—</td>
                            <td className="text-right px-4 py-3 text-slate-800">
                              ${filteredFuel.reduce((sum, f) => sum + Number(f.total_cost || 0), 0).toFixed(2)}
                            </td>
                            <td colSpan={3}></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Fuel by State Summary */}
                    <div className="border-t border-slate-200 p-4">
                      <h4 className="text-sm font-semibold text-slate-700 mb-3">Fuel by State</h4>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(
                          filteredFuel.reduce<Record<string, { gallons: number; cost: number }>>((acc, f) => {
                            if (!acc[f.state]) acc[f.state] = { gallons: 0, cost: 0 };
                            acc[f.state].gallons += Number(f.gallons);
                            acc[f.state].cost += Number(f.total_cost || 0);
                            return acc;
                          }, {})
                        )
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([state, data]) => (
                            <div key={state} className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                              <span className="font-bold text-amber-800">{state}</span>
                              <span className="text-xs text-amber-700">{data.gallons.toFixed(1)} gal</span>
                              {data.cost > 0 && <span className="text-xs text-amber-600">${data.cost.toFixed(2)}</span>}
                            </div>
                          ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Modals */}
      <IFTATripModal
        isOpen={tripModalOpen}
        onClose={() => { setTripModalOpen(false); setEditTrip(null); }}
        onSaved={fetchData}
        quarter={quarter}
        year={year}
        drivers={drivers}
        editTrip={editTrip}
      />
      <IFTAFuelModal
        isOpen={fuelModalOpen}
        onClose={() => { setFuelModalOpen(false); setEditFuel(null); }}
        onSaved={fetchData}
        quarter={quarter}
        year={year}
        drivers={drivers}
        editFuel={editFuel}
      />
    </div>
  );
};

export default IFTAReportView;
