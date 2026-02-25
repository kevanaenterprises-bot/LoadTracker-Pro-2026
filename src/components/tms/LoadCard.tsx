import React from 'react';
import { Load, PaymentStatus } from '@/types/tms';
import { Truck, MapPin, Calendar, Package, DollarSign, User, Trash2, Route, Radar, CreditCard } from 'lucide-react';


interface LoadCardProps {
  load: Load;
  onAssignDriver?: (load: Load) => void;
  onViewDetails?: (load: Load) => void;
  onMarkDelivered?: (load: Load) => void;
  onGenerateInvoice?: (load: Load) => void;
  onMarkPaid?: (load: Load) => void;
  onRecordPayment?: (load: Load) => void;
  onDelete?: (load: Load) => void;
  onUnassignDriver?: (load: Load) => void;
  paymentStatus?: PaymentStatus;
  totalPaid?: number;
  invoiceAmount?: number;
  invoiceNumber?: string | null;
}


const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  UNASSIGNED: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' },
  DISPATCHED: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300' },
  IN_TRANSIT: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
  DELIVERED: { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-300' },
  INVOICED: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300' },
  PAID: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
};

const statusLabels: Record<string, string> = {
  UNASSIGNED: 'Awaiting Dispatch',
  DISPATCHED: 'Dispatched',
  IN_TRANSIT: 'In Transit',
  DELIVERED: 'Delivered',
  INVOICED: 'Invoiced',
  PAID: 'Paid',
};

const paymentStatusConfig: Record<PaymentStatus, { bg: string; text: string; label: string }> = {
  unpaid: { bg: 'bg-red-100', text: 'text-red-700', label: 'Unpaid' },
  partial: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Partial Payment' },
  paid: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Paid in Full' },
};

const LoadCard: React.FC<LoadCardProps> = ({
  load,
  onAssignDriver,
  onViewDetails,
  onMarkDelivered,
  onGenerateInvoice,
  onMarkPaid,
  onRecordPayment,
  onDelete,
  onUnassignDriver,
  paymentStatus,
  totalPaid,
  invoiceAmount,
  invoiceNumber,
}) => {

  const colors = statusColors[load.status] || statusColors.UNASSIGNED;

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete && window.confirm(`Are you sure you want to delete load ${load.load_number}? This action cannot be undone.`)) {
      onDelete(load);
    }
  };

  return (
    <div className={`bg-white rounded-xl shadow-sm border ${colors.border} hover:shadow-md transition-all duration-200 overflow-hidden`}>
      {/* Header */}
      <div className={`px-4 py-3 ${colors.bg} border-b ${colors.border}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className={`w-5 h-5 ${colors.text}`} />
            <span className="font-bold text-slate-800">{load.load_number}</span>
            {invoiceNumber && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/80 text-slate-600 border border-slate-200">
                Invoice #{invoiceNumber}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${colors.bg} ${colors.text} border ${colors.border}`}>
              {statusLabels[load.status]}
            </span>
            {onDelete && (
              <button
                onClick={handleDeleteClick}
                className="p-1.5 hover:bg-red-100 rounded-lg transition-colors group"
                title="Delete Load"
              >
                <Trash2 className="w-4 h-4 text-slate-400 group-hover:text-red-500" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        {/* Route */}
        <div className="flex items-start gap-3">
          <MapPin className="w-4 h-4 text-slate-400 mt-1 flex-shrink-0" />
          <div className="flex-1">
            <div className="text-xs text-blue-600 font-medium mb-0.5">Shipper</div>
            <div className="text-sm font-medium text-slate-800">
              {load.origin_address && <span className="text-slate-500">{load.origin_address}, </span>}
              {load.origin_city}, {load.origin_state}
            </div>
            <div className="flex items-center gap-2 my-1">
              <div className="flex-1 h-px bg-slate-200"></div>
              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
              <div className="flex-1 h-px bg-slate-200"></div>
            </div>
            <div className="text-xs text-emerald-600 font-medium mb-0.5">Receiver</div>
            <div className="text-sm font-medium text-slate-800">
              {load.dest_company && <span className="font-semibold">{load.dest_company} - </span>}
              {load.dest_address && <span className="text-slate-500">{load.dest_address}, </span>}
              {load.dest_city}, {load.dest_state}
            </div>
          </div>
        </div>

        {/* Miles & Tracking indicators */}
        <div className="flex items-center gap-3 flex-wrap">
          {load.total_miles && (
            <div className="flex items-center gap-1.5 text-sm">
              <Route className="w-4 h-4 text-cyan-500" />
              <span className="text-cyan-700 font-medium">{load.total_miles} mi</span>
            </div>
          )}
          {load.tracking_enabled && (
            <div className="flex items-center gap-1 text-xs">
              <Radar className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-emerald-600 font-medium">Tracking</span>
            </div>
          )}
        </div>

        {/* Dates */}
        <div className="flex items-center gap-3 text-sm">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span className="text-slate-600">
            {new Date(load.pickup_date).toLocaleDateString()} - {new Date(load.delivery_date).toLocaleDateString()}
          </span>
        </div>

        {/* Cargo */}
        {load.cargo_description && (
          <div className="flex items-center gap-3 text-sm">
            <Package className="w-4 h-4 text-slate-400" />
            <span className="text-slate-600 truncate">{load.cargo_description}</span>
          </div>
        )}

        {/* Driver */}
        {load.driver && (
          <div className="flex items-center gap-3 text-sm">
            <User className="w-4 h-4 text-slate-400" />
            <span className="text-slate-600">{load.driver.name} ({load.driver.truck_number})</span>
          </div>
        )}

        {/* Rate */}
        <div className="flex items-center gap-3">
          <DollarSign className="w-4 h-4 text-emerald-500" />
          <span className="text-lg font-bold text-emerald-600">
            ${Number(load.rate || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
        </div>

        {/* Payment Status Badge - only for INVOICED loads */}
        {load.status === 'INVOICED' && paymentStatus && (
          <div className={`flex items-center justify-between p-2.5 rounded-lg ${paymentStatusConfig[paymentStatus].bg}`}>
            <div className="flex items-center gap-2">
              <CreditCard className={`w-4 h-4 ${paymentStatusConfig[paymentStatus].text}`} />
              <span className={`text-sm font-semibold ${paymentStatusConfig[paymentStatus].text}`}>
                {paymentStatusConfig[paymentStatus].label}
              </span>
            </div>
            {paymentStatus === 'partial' && totalPaid !== undefined && invoiceAmount !== undefined && (
              <div className="text-right">
                <span className="text-xs text-amber-700 font-medium">
                  ${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })} / ${invoiceAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
                <div className="w-20 bg-amber-200 rounded-full h-1.5 mt-1">
                  <div
                    className="bg-amber-600 h-1.5 rounded-full"
                    style={{ width: `${Math.min(100, (totalPaid / invoiceAmount) * 100)}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex gap-2 flex-wrap">
        <button
          onClick={() => onViewDetails?.(load)}
          className="flex-1 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          View Details
        </button>
        
        {load.status === 'UNASSIGNED' && onAssignDriver && (
          <button
            onClick={() => onAssignDriver(load)}
            className="flex-1 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Assign Driver
          </button>
        )}

        {load.status === 'DISPATCHED' && onAssignDriver && (
          <button
            onClick={() => onAssignDriver(load)}
            className="flex-1 px-3 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors"
          >
            Reassign
          </button>
        )}
        
        {load.status === 'IN_TRANSIT' && onMarkDelivered && (
          <button
            onClick={() => onMarkDelivered(load)}
            className="flex-1 px-3 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
          >
            Mark Delivered
          </button>
        )}
        
        {load.status === 'DELIVERED' && onGenerateInvoice && (
          <button
            onClick={() => onGenerateInvoice(load)}
            className="flex-1 px-3 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors"
          >
            Generate Invoice
          </button>
        )}
        
        {load.status === 'INVOICED' && onRecordPayment && (
          <button
            onClick={() => onRecordPayment(load)}
            className="flex-1 px-3 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1.5"
          >
            <CreditCard className="w-4 h-4" />
            Record Payment
          </button>
        )}
      </div>
    </div>
  );
};

export default LoadCard;
