import React, { useState } from 'react';
import {
  Truck, Package, Clock, DollarSign, Fuel, FileText, Users, TrendingUp,
  Menu, X, LayoutDashboard, Archive, Settings, Building2, MapPin, Radar,
  Receipt, ShieldCheck, Plus, ChevronRight, Eye, Phone, CheckCircle2,
  MapPinned, Calendar, ArrowUpRight, Filter, Search, Bell
} from 'lucide-react';

type DemoView = 'dashboard' | 'tracking' | 'drivers' | 'customers' | 'invoicing' | 'ifta' | 'settings';

interface MockLoad {
  id: string;
  loadNumber: string;
  status: 'UNASSIGNED' | 'DISPATCHED' | 'IN_TRANSIT' | 'DELIVERED' | 'INVOICED';
  customer: string;
  origin: string;
  destination: string;
  rate: number;
  driver?: string;
  pickupDate: string;
  deliveryDate: string;
  miles: number;
}

const mockLoads: MockLoad[] = [
  { id: '1', loadNumber: 'LT-1001', status: 'IN_TRANSIT', customer: 'ABC Logistics', origin: 'Dallas, TX', destination: 'Atlanta, GA', rate: 3200, driver: 'Mike Johnson', pickupDate: '2026-02-09', deliveryDate: '2026-02-11', miles: 781 },
  { id: '2', loadNumber: 'LT-1002', status: 'IN_TRANSIT', customer: 'Summit Supply Co', origin: 'Houston, TX', destination: 'Nashville, TN', rate: 2800, driver: 'Carlos Rivera', pickupDate: '2026-02-08', deliveryDate: '2026-02-10', miles: 792 },
  { id: '3', loadNumber: 'LT-1003', status: 'DISPATCHED', customer: 'Midwest Metals', origin: 'Chicago, IL', destination: 'Memphis, TN', rate: 1950, driver: 'James Wilson', pickupDate: '2026-02-10', deliveryDate: '2026-02-11', miles: 531 },
  { id: '4', loadNumber: 'LT-1004', status: 'UNASSIGNED', customer: 'Pacific Freight Inc', origin: 'Los Angeles, CA', destination: 'Phoenix, AZ', rate: 1400, pickupDate: '2026-02-11', deliveryDate: '2026-02-12', miles: 373 },
  { id: '5', loadNumber: 'LT-1005', status: 'DELIVERED', customer: 'Eastern Distribution', origin: 'Charlotte, NC', destination: 'Jacksonville, FL', rate: 1650, driver: 'Robert Davis', pickupDate: '2026-02-06', deliveryDate: '2026-02-07', miles: 394 },
  { id: '6', loadNumber: 'LT-1006', status: 'INVOICED', customer: 'Great Plains Hauling', origin: 'Kansas City, MO', destination: 'Denver, CO', rate: 2100, driver: 'Tom Anderson', pickupDate: '2026-02-04', deliveryDate: '2026-02-05', miles: 606 },
  { id: '7', loadNumber: 'LT-1007', status: 'UNASSIGNED', customer: 'Coastal Carriers', origin: 'Miami, FL', destination: 'Savannah, GA', rate: 1800, pickupDate: '2026-02-12', deliveryDate: '2026-02-13', miles: 662 },
  { id: '8', loadNumber: 'LT-1008', status: 'INVOICED', customer: 'Northern Freight Co', origin: 'Detroit, MI', destination: 'Columbus, OH', rate: 950, driver: 'Mike Johnson', pickupDate: '2026-02-02', deliveryDate: '2026-02-03', miles: 263 },
  { id: '9', loadNumber: 'LT-1009', status: 'DELIVERED', customer: 'Valley Transport', origin: 'San Antonio, TX', destination: 'El Paso, TX', rate: 1350, driver: 'Carlos Rivera', pickupDate: '2026-02-05', deliveryDate: '2026-02-06', miles: 551 },
];

const mockDrivers = [
  { name: 'Mike Johnson', status: 'on_route', truck: '2023 Freightliner Cascadia', phone: '(555) 123-4567', loads: 24 },
  { name: 'Carlos Rivera', status: 'on_route', truck: '2022 Kenworth T680', phone: '(555) 234-5678', loads: 31 },
  { name: 'James Wilson', status: 'dispatched', truck: '2024 Peterbilt 579', phone: '(555) 345-6789', loads: 18 },
  { name: 'Robert Davis', status: 'available', truck: '2023 Volvo VNL 860', phone: '(555) 456-7890', loads: 27 },
  { name: 'Tom Anderson', status: 'available', truck: '2022 Mack Anthem', phone: '(555) 567-8901', loads: 22 },
  { name: 'David Martinez', status: 'available', truck: '2024 International LT', phone: '(555) 678-9012', loads: 15 },
];

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  UNASSIGNED: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Awaiting Dispatch' },
  DISPATCHED: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Dispatched' },
  IN_TRANSIT: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'In Transit' },
  DELIVERED: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Delivered' },
  INVOICED: { bg: 'bg-indigo-100', text: 'text-indigo-700', label: 'Invoiced' },
};

const driverStatusColors: Record<string, { bg: string; text: string; dot: string }> = {
  available: { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  on_route: { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
  dispatched: { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
};

const DemoExperience: React.FC = () => {
  const [currentView, setCurrentView] = useState<DemoView>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [selectedLoad, setSelectedLoad] = useState<MockLoad | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const stats = {
    unassigned: mockLoads.filter(l => l.status === 'UNASSIGNED').length,
    dispatched: mockLoads.filter(l => l.status === 'DISPATCHED').length,
    inTransit: mockLoads.filter(l => l.status === 'IN_TRANSIT').length,
    delivered: mockLoads.filter(l => l.status === 'DELIVERED').length,
    invoiced: mockLoads.filter(l => l.status === 'INVOICED').length,
    invoicedTotal: mockLoads.filter(l => l.status === 'INVOICED').reduce((s, l) => s + l.rate, 0),
    totalRevenue: mockLoads.reduce((s, l) => s + l.rate, 0),
    availableDrivers: mockDrivers.filter(d => d.status === 'available').length,
  };

  const filteredLoads = mockLoads.filter(l => {
    const matchesTab = activeTab === 'ALL' || l.status === activeTab;
    const matchesSearch = !searchQuery || 
      l.loadNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.origin.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.destination.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const statusTabs = [
    { key: 'ALL', label: 'All Loads', count: mockLoads.length },
    { key: 'UNASSIGNED', label: 'Awaiting Dispatch', count: stats.unassigned },
    { key: 'DISPATCHED', label: 'Dispatched', count: stats.dispatched },
    { key: 'IN_TRANSIT', label: 'In Transit', count: stats.inTransit },
    { key: 'DELIVERED', label: 'Delivered', count: stats.delivered },
    { key: 'INVOICED', label: 'Pending Payment', count: stats.invoiced },
  ];

  const navItems = [
    { key: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', color: 'bg-blue-600' },
    { key: 'tracking', icon: Radar, label: 'Live Tracking', color: 'bg-emerald-600', badge: 'LIVE' },
    { key: 'invoicing', icon: Receipt, label: 'Accounts Receivable', color: 'bg-indigo-600' },
    { key: 'drivers', icon: Users, label: 'Drivers', color: 'bg-blue-600' },
    { key: 'customers', icon: Building2, label: 'Customers', color: 'bg-blue-600' },
    { key: 'ifta', icon: Fuel, label: 'IFTA Reporting', color: 'bg-amber-600' },
    { key: 'settings', icon: Settings, label: 'Settings', color: 'bg-blue-600' },
  ];

  const renderLoadCard = (load: MockLoad) => {
    const sc = statusColors[load.status];
    return (
      <div
        key={load.id}
        onClick={() => setSelectedLoad(selectedLoad?.id === load.id ? null : load)}
        className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-all cursor-pointer ${
          selectedLoad?.id === load.id ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200'
        }`}
      >
        <div className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-slate-900">{load.loadNumber}</span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${sc.bg} ${sc.text}`}>
              {sc.label}
            </span>
          </div>
          <p className="text-sm font-medium text-slate-700 mb-3">{load.customer}</p>
          <div className="space-y-2 mb-4">
            <div className="flex items-start gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0"></div>
              <span className="text-sm text-slate-600">{load.origin}</span>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 flex-shrink-0"></div>
              <span className="text-sm text-slate-600">{load.destination}</span>
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <span className="text-lg font-bold text-slate-900">${load.rate.toLocaleString()}</span>
            <span className="text-xs text-slate-400">{load.miles} mi</span>
          </div>
          {load.driver && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
              <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center">
                <Truck className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <span className="text-sm text-slate-600">{load.driver}</span>
            </div>
          )}
        </div>

        {selectedLoad?.id === load.id && (
          <div className="border-t border-slate-100 p-4 bg-slate-50 rounded-b-xl">
            <div className="grid grid-cols-2 gap-3 text-sm mb-3">
              <div>
                <p className="text-slate-400 text-xs">Pickup</p>
                <p className="font-medium text-slate-700">{load.pickupDate}</p>
              </div>
              <div>
                <p className="text-slate-400 text-xs">Delivery</p>
                <p className="font-medium text-slate-700">{load.deliveryDate}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
                View Details
              </button>
              {load.status === 'UNASSIGNED' && (
                <button className="flex-1 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors">
                  Assign Driver
                </button>
              )}
              {load.status === 'DELIVERED' && (
                <button className="flex-1 px-3 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors">
                  Generate Invoice
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderDashboard = () => (
    <>
      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { title: 'Awaiting Dispatch', value: stats.unassigned, subtitle: 'loads to assign', icon: Clock, iconColor: 'text-amber-600', iconBg: 'bg-amber-100' },
          { title: 'In Transit', value: stats.inTransit, subtitle: 'active shipments', icon: Truck, iconColor: 'text-blue-600', iconBg: 'bg-blue-100' },
          { title: 'Pending Payment', value: stats.invoiced, subtitle: 'invoices sent', icon: FileText, iconColor: 'text-purple-600', iconBg: 'bg-purple-100' },
          { title: 'Invoiced Total', value: `$${stats.invoicedTotal.toLocaleString()}`, subtitle: 'pending payment', icon: TrendingUp, iconColor: 'text-emerald-600', iconBg: 'bg-emerald-100' },
        ].map((stat, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 lg:p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs lg:text-sm font-medium text-slate-500">{stat.title}</p>
                <p className="text-xl lg:text-2xl font-bold text-slate-800 mt-1">{stat.value}</p>
                <p className="text-xs lg:text-sm text-slate-400 mt-1">{stat.subtitle}</p>
              </div>
              <div className={`p-2 lg:p-3 rounded-xl ${stat.iconBg}`}>
                <stat.icon className={`w-5 h-5 lg:w-6 lg:h-6 ${stat.iconColor}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Fleet Map Quick Access */}
      <div className="mb-6">
        <button
          onClick={() => setCurrentView('tracking')}
          className="w-full bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl shadow-sm border border-slate-700 p-4 lg:p-5 hover:from-slate-700 hover:to-slate-800 transition-all group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2.5 lg:p-3 bg-emerald-500/20 rounded-xl group-hover:bg-emerald-500/30 transition-colors">
                <Radar className="w-5 h-5 lg:w-6 lg:h-6 text-emerald-400" />
              </div>
              <div className="text-left">
                <h3 className="text-base lg:text-lg font-bold text-white">Fleet Map & Live Tracking</h3>
                <p className="text-xs lg:text-sm text-slate-400">
                  {stats.inTransit} drivers in transit — {stats.dispatched} dispatched
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/30 rounded-full">
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
                <span className="text-xs font-semibold text-emerald-300">{stats.inTransit} LIVE</span>
              </span>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" />
            </div>
          </div>
        </button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search loads by number, customer, or location..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Status Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6">
        <div className="flex overflow-x-auto">
          {statusTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 lg:px-6 py-3 lg:py-4 text-xs lg:text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs ${activeTab === tab.key ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Loads Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredLoads.map(renderLoadCard)}
      </div>

      {filteredLoads.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-800 mb-2">No Loads Found</h3>
          <p className="text-slate-500">Try adjusting your search or filter criteria.</p>
        </div>
      )}
    </>
  );

  const renderTracking = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-200">
          <h3 className="text-lg font-bold text-slate-900">Live Fleet Map</h3>
          <p className="text-sm text-slate-500">Real-time GPS positions of your active fleet</p>
        </div>
        {/* Mock Map */}
        <div className="relative bg-gradient-to-br from-slate-100 to-blue-50 h-[400px] flex items-center justify-center">
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23000000\' fill-opacity=\'0.4\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
          }}></div>
          {/* Mock truck positions */}
          <div className="absolute top-[30%] left-[45%] animate-pulse">
            <div className="relative">
              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center shadow-lg">
                <Truck className="w-5 h-5 text-white" />
              </div>
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-900 text-white text-xs px-2 py-1 rounded">
                Mike J. — I-20 E
              </div>
            </div>
          </div>
          <div className="absolute top-[55%] left-[60%]">
            <div className="relative">
              <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center shadow-lg">
                <Truck className="w-5 h-5 text-white" />
              </div>
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-900 text-white text-xs px-2 py-1 rounded">
                Carlos R. — I-65 N
              </div>
            </div>
          </div>
          <div className="absolute top-[40%] left-[30%]">
            <div className="relative">
              <div className="w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center shadow-lg">
                <Truck className="w-5 h-5 text-white" />
              </div>
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-900 text-white text-xs px-2 py-1 rounded">
                James W. — Dispatched
              </div>
            </div>
          </div>
          <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-lg border border-slate-200">
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                <span className="text-slate-600">In Transit</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
                <span className="text-slate-600">Dispatched</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
                <span className="text-slate-600">Available</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Active Shipments List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-5 border-b border-slate-200">
          <h3 className="text-lg font-bold text-slate-900">Active Shipments</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {mockLoads.filter(l => l.status === 'IN_TRANSIT' || l.status === 'DISPATCHED').map(load => (
            <div key={load.id} className="p-4 hover:bg-slate-50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    load.status === 'IN_TRANSIT' ? 'bg-blue-100' : 'bg-amber-100'
                  }`}>
                    <Truck className={`w-5 h-5 ${load.status === 'IN_TRANSIT' ? 'text-blue-600' : 'text-amber-600'}`} />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{load.loadNumber} — {load.driver}</p>
                    <p className="text-sm text-slate-500">{load.origin} → {load.destination}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusColors[load.status].bg} ${statusColors[load.status].text}`}>
                    {statusColors[load.status].label}
                  </span>
                  <p className="text-xs text-slate-400 mt-1">{load.miles} miles</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderDrivers = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {mockDrivers.map((driver, i) => {
          const ds = driverStatusColors[driver.status];
          return (
            <div key={i} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-lg">
                  {driver.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <h4 className="font-bold text-slate-900">{driver.name}</h4>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`w-2 h-2 rounded-full ${ds.dot}`}></span>
                    <span className={`text-xs font-medium capitalize ${ds.text}`}>{driver.status.replace('_', ' ')}</span>
                  </div>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-slate-600">
                  <Truck className="w-4 h-4 text-slate-400" />
                  <span>{driver.truck}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <Phone className="w-4 h-4 text-slate-400" />
                  <span>{driver.phone}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <Package className="w-4 h-4 text-slate-400" />
                  <span>{driver.loads} loads completed</span>
                </div>
              </div>
              <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
                <button className="flex-1 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors">
                  View Profile
                </button>
                <button className="flex-1 px-3 py-2 bg-slate-50 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors">
                  Send SMS
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderCustomers = () => {
    const customers = [
      { name: 'ABC Logistics', loads: 12, revenue: 38400, contact: 'Sarah Miller', email: 'sarah@abclogistics.com' },
      { name: 'Summit Supply Co', loads: 8, revenue: 22400, contact: 'Mark Thompson', email: 'mark@summitsupply.com' },
      { name: 'Midwest Metals', loads: 15, revenue: 29250, contact: 'Jennifer Lee', email: 'jlee@midwestmetals.com' },
      { name: 'Pacific Freight Inc', loads: 6, revenue: 8400, contact: 'David Chen', email: 'dchen@pacificfreight.com' },
      { name: 'Eastern Distribution', loads: 10, revenue: 16500, contact: 'Amy Rodriguez', email: 'amy@easterndist.com' },
      { name: 'Great Plains Hauling', loads: 9, revenue: 18900, contact: 'Brian Foster', email: 'bfoster@gphaul.com' },
    ];

    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Customer Database</h3>
            <p className="text-sm text-slate-500">{customers.length} customers</p>
          </div>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Customer
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Company</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Contact</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Loads</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.map((c, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors cursor-pointer">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-900">{c.name}</p>
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-sm text-slate-700">{c.contact}</p>
                    <p className="text-xs text-slate-400">{c.email}</p>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium">{c.loads}</span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <span className="font-semibold text-slate-900">${c.revenue.toLocaleString()}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderInvoicing = () => {
    const invoicedLoads = mockLoads.filter(l => l.status === 'INVOICED');
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <p className="text-sm text-slate-500">Outstanding</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">${stats.invoicedTotal.toLocaleString()}</p>
            <p className="text-sm text-amber-600 mt-1">{stats.invoiced} invoices</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <p className="text-sm text-slate-500">Collected (MTD)</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">$8,450</p>
            <p className="text-sm text-slate-400 mt-1">4 payments</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <p className="text-sm text-slate-500">Total Revenue (MTD)</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">${(stats.invoicedTotal + 8450).toLocaleString()}</p>
            <p className="text-sm text-slate-400 mt-1">All loads</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-5 border-b border-slate-200">
            <h3 className="text-lg font-bold text-slate-900">Outstanding Invoices</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {invoicedLoads.map(load => (
              <div key={load.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{load.loadNumber} — {load.customer}</p>
                  <p className="text-sm text-slate-500">{load.origin} → {load.destination}</p>
                </div>
                <div className="text-right flex items-center gap-4">
                  <div>
                    <p className="font-bold text-slate-900">${load.rate.toLocaleString()}</p>
                    <p className="text-xs text-amber-600">Pending</p>
                  </div>
                  <button className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors">
                    Record Payment
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderIFTA = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Total Miles (Q1)</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">14,832</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Total Gallons (Q1)</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">2,472</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Avg MPG</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">6.0</p>
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">IFTA Quarterly Summary</h3>
            <p className="text-sm text-slate-500">Q1 2026 — Miles and fuel by jurisdiction</p>
          </div>
          <button className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors">
            Generate Report
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">State</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Miles</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Gallons</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Tax Rate</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Tax Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[
                { state: 'Texas', miles: 4200, gallons: 700, rate: 0.20, tax: 140 },
                { state: 'Oklahoma', miles: 1800, gallons: 300, rate: 0.19, tax: 57 },
                { state: 'Arkansas', miles: 1200, gallons: 200, rate: 0.245, tax: 49 },
                { state: 'Tennessee', miles: 2400, gallons: 400, rate: 0.27, tax: 108 },
                { state: 'Georgia', miles: 2100, gallons: 350, rate: 0.315, tax: 110.25 },
                { state: 'Illinois', miles: 1632, gallons: 272, rate: 0.467, tax: 127.02 },
                { state: 'Missouri', miles: 1500, gallons: 250, rate: 0.195, tax: 48.75 },
              ].map((row, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-slate-900">{row.state}</td>
                  <td className="px-5 py-3 text-right text-slate-700">{row.miles.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right text-slate-700">{row.gallons.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right text-slate-500">${row.rate.toFixed(3)}</td>
                  <td className="px-5 py-3 text-right font-semibold text-slate-900">${row.tax.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="max-w-2xl space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-bold text-slate-900 mb-4">Company Information</h3>
        <div className="space-y-4">
          {[
            { label: 'Company Name', value: 'Demo Trucking LLC' },
            { label: 'MC Number', value: 'MC-123456' },
            { label: 'DOT Number', value: 'DOT-7890123' },
            { label: 'Contact Email', value: 'dispatch@demotrucking.com' },
            { label: 'Phone', value: '(555) 000-1234' },
          ].map((field, i) => (
            <div key={i}>
              <label className="block text-sm font-medium text-slate-700 mb-1">{field.label}</label>
              <input
                type="text"
                defaultValue={field.value}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}
          <button className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );

  const viewTitles: Record<DemoView, { title: string; subtitle: string }> = {
    dashboard: { title: 'Command Center', subtitle: 'Manage your loads and dispatch' },
    tracking: { title: 'Live Fleet Tracking', subtitle: 'Real-time GPS positions' },
    drivers: { title: 'Driver Management', subtitle: 'Manage your fleet drivers' },
    customers: { title: 'Customer Database', subtitle: 'Manage your customer relationships' },
    invoicing: { title: 'Accounts Receivable', subtitle: 'Track invoices and payments' },
    ifta: { title: 'IFTA Reporting', subtitle: 'Fuel tax reporting by jurisdiction' },
    settings: { title: 'Settings', subtitle: 'Company configuration' },
  };

  return (
    <div className="bg-slate-100 rounded-2xl shadow-2xl border border-slate-300 overflow-hidden" style={{ minHeight: '700px' }}>
      <div className="flex h-full" style={{ minHeight: '700px' }}>
        {/* Sidebar */}
        <aside className={`fixed inset-y-0 left-0 z-[60] w-64 bg-slate-900 transform transition-transform duration-300 lg:relative lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
          <div className="flex flex-col h-full" style={{ minHeight: '700px' }}>
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Truck className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-white">LoadTracker PRO</h1>
                <p className="text-[10px] text-slate-400">DEMO MODE</p>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="lg:hidden ml-auto p-1.5 hover:bg-slate-800 rounded-lg">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {navItems.map((item) => (
                <button
                  key={item.key}
                  onClick={() => { setCurrentView(item.key as DemoView); setSidebarOpen(false); }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl w-full text-left transition-colors text-sm ${
                    currentView === item.key ? `text-white ${item.color}` : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  <span className="font-medium">{item.label}</span>
                  {item.badge && (
                    <span className="ml-auto px-1.5 py-0.5 text-[9px] font-bold bg-emerald-500 text-white rounded-full">{item.badge}</span>
                  )}
                </button>
              ))}
            </nav>

            <div className="px-3 py-3 border-t border-slate-800">
              <div className="bg-slate-800 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-slate-400">Available Drivers</span>
                  <span className="text-sm font-bold text-white">{stats.availableDrivers}</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-1.5">
                  <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${(stats.availableDrivers / mockDrivers.length) * 100}%` }}></div>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">of {mockDrivers.length} total drivers</p>
              </div>
            </div>

            <div className="px-3 py-3 border-t border-slate-800">
              <div className="flex items-center gap-3 px-3 py-2">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">DM</div>
                <div>
                  <p className="text-xs text-slate-400">Demo User</p>
                  <p className="text-[10px] text-slate-500">demo@loadtrackerpro.com</p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* DEMO MODE WARNING BANNER - CRITICAL VISIBILITY */}
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900 px-6 py-4 border-b border-orange-600 shadow-lg">
            <div className="flex items-center justify-between max-w-full">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-slate-900 rounded-full animate-pulse"></div>
                <div>
                  <p className="font-bold text-sm">⚠️ THIS IS A DEMO — NOT YOUR REAL DATA</p>
                  <p className="text-xs text-slate-800 mt-0.5">All loads, drivers, and information shown here are sample data for demonstration purposes only.</p>
                </div>
              </div>
              <a
                href="/demo"
                className="ml-4 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                Back to Demo
              </a>
            </div>
          </div>
          <header className="bg-white border-b border-slate-200 shadow-sm">
            <div className="flex items-center justify-between px-4 lg:px-6 py-3">
              <div className="flex items-center gap-3">
                <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 hover:bg-slate-100 rounded-lg">
                  <Menu className="w-5 h-5 text-slate-600" />
                </button>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">{viewTitles[currentView].title}</h2>
                  <p className="text-xs text-slate-500">{viewTitles[currentView].subtitle}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Bell className="w-5 h-5 text-slate-400" />
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full text-[8px] text-white flex items-center justify-center font-bold">3</span>
                </div>
                <button className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors text-sm">
                  <Plus className="w-4 h-4" /><span className="hidden sm:inline">New Load</span>
                </button>
              </div>
            </div>
          </header>

          <main className="flex-1 p-4 lg:p-6 overflow-y-auto flex flex-col">
            <div className="flex-1">
              {currentView === 'dashboard' && renderDashboard()}
              {currentView === 'tracking' && renderTracking()}
              {currentView === 'drivers' && renderDrivers()}
              {currentView === 'customers' && renderCustomers()}
              {currentView === 'invoicing' && renderInvoicing()}
              {currentView === 'ifta' && renderIFTA()}
              {currentView === 'settings' && renderSettings()}
            </div>
            
            {/* DEMO FOOTER BANNER - FINAL REMINDER */}
            <div className="mt-8 pt-6 border-t border-slate-300 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 text-center">
              <p className="text-sm font-semibold text-slate-900 mb-2">Ready to see this with YOUR real data?</p>
              <p className="text-xs text-slate-600 mb-4">This demo uses sample information. Sign up or login to see your actual loads, drivers, and customers.</p>
              <div className="flex items-center justify-center gap-3">
                <a
                  href="/?from=demo"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
                >
                  Sign Up / Login
                </a>
                <a
                  href="mailto:kevin@go4fc.com"
                  className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-300 transition-colors"
                >
                  Contact Sales
                </a>
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-[55] lg:hidden" onClick={() => setSidebarOpen(false)}></div>
      )}
    </div>
  );
};

export default DemoExperience;
