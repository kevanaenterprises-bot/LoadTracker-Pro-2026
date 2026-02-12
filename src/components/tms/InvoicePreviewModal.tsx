import React, { useState, useEffect, useRef } from 'react';
import { X, Download, Printer, Loader2, ShieldCheck, MapPin, Fuel, AlertTriangle, RotateCcw, Trash2, ImageOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Load, Invoice, PODDocument, LoadStop, GeofenceTimestamp, CompanySettings, Customer } from '@/types/tms';

interface InvoicePreviewModalProps {
  isOpen: boolean;
  load: Load | null;
  invoice: Invoice | null;
  onClose: () => void;
  onPodReuploadRequested?: () => void;
}

const InvoicePreviewModal: React.FC<InvoicePreviewModalProps> = ({ isOpen, load, invoice, onClose, onPodReuploadRequested }) => {
  const [documents, setDocuments] = useState<PODDocument[]>([]);
  const [stops, setStops] = useState<LoadStop[]>([]);
  const [timestamps, setTimestamps] = useState<GeofenceTimestamp[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [fuelSurchargeRate, setFuelSurchargeRate] = useState<string>('');
  const [companySettings, setCompanySettings] = useState<CompanySettings>({
    company_name: 'GO 4 Farms & Cattle',
    company_address: '1510 Crystal Valley Way',
    company_city: 'Melissa',
    company_state: 'TX',
    company_zip: '75454',
    company_phone: '903-803-7500',
    company_email: 'accounting@go4fc.com',
  });
  const [loading, setLoading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // Broken POD tracking
  const [brokenPodIds, setBrokenPodIds] = useState<Set<string>>(new Set());
  const [showReuploadConfirm, setShowReuploadConfirm] = useState(false);
  const [deletingBrokenPods, setDeletingBrokenPods] = useState(false);
  const [reuploadResult, setReuploadResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (isOpen && load && invoice) {
      setBrokenPodIds(new Set());
      setShowReuploadConfirm(false);
      setReuploadResult(null);
      fetchData();
    }
  }, [isOpen, load, invoice]);

  const fetchData = async () => {
    if (!load) return;
    setLoading(true);

    try {
      // Fetch company settings + fuel surcharge rate in one query
      const { data: settings } = await supabase
        .from('settings')
        .select('key, value')
        .in('key', [
          'company_name', 'company_address', 'company_city',
          'company_state', 'company_zip', 'company_phone', 'company_email',
          'fuel_surcharge_rate'
        ]);

      if (settings && settings.length > 0) {
        const settingsMap: Record<string, string> = {};
        settings.forEach(s => { settingsMap[s.key] = s.value; });
        setCompanySettings({
          company_name: settingsMap.company_name || companySettings.company_name,
          company_address: settingsMap.company_address || companySettings.company_address,
          company_city: settingsMap.company_city || companySettings.company_city,
          company_state: settingsMap.company_state || companySettings.company_state,
          company_zip: settingsMap.company_zip || companySettings.company_zip,
          company_phone: settingsMap.company_phone || companySettings.company_phone,
          company_email: settingsMap.company_email || companySettings.company_email,
        });
        if (settingsMap.fuel_surcharge_rate) {
          setFuelSurchargeRate(settingsMap.fuel_surcharge_rate);
        }
      }

      // Fetch customer if load has a customer_id
      if (load.customer_id) {
        const { data: customerData } = await supabase
          .from('customers')
          .select('*')
          .eq('id', load.customer_id)
          .single();
        if (customerData) setCustomer(customerData);
      } else {
        setCustomer(null);
      }

      // Fetch POD documents
      const { data: docs } = await supabase
        .from('pod_documents')
        .select('*')
        .eq('load_id', load.id);
      if (docs) setDocuments(docs);

      // Fetch load stops
      const { data: loadStops } = await supabase
        .from('load_stops')
        .select('*')
        .eq('load_id', load.id)
        .order('stop_type')
        .order('stop_sequence');
      if (loadStops) setStops(loadStops);

      // Fetch geofence timestamps
      const { data: geoData } = await supabase
        .from('geofence_timestamps')
        .select('*')
        .eq('load_id', load.id)
        .order('timestamp', { ascending: true });
      if (geoData) setTimestamps(geoData);
    } catch (error) {
      console.error('Error fetching invoice data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle broken POD image
  const handlePodImageError = (docId: string) => {
    setBrokenPodIds(prev => {
      const next = new Set(prev);
      next.add(docId);
      return next;
    });
  };

  // Delete broken POD records and reset load for re-upload
  const handleDeleteBrokenPods = async () => {
    if (!load) return;
    setDeletingBrokenPods(true);
    setReuploadResult(null);

    try {
      const brokenDocs = documents.filter(d => brokenPodIds.has(d.id));
      let deletedCount = 0;

      for (const doc of brokenDocs) {
        // Try to delete the storage file (may not exist, that's OK)
        try {
          // Extract the storage path from the URL
          const urlParts = doc.file_url.split('/pod-documents/');
          if (urlParts.length > 1) {
            const storagePath = decodeURIComponent(urlParts[1]);
            await supabase.storage.from('pod-documents').remove([storagePath]);
          }
        } catch {
          // Storage file already missing, that's expected
        }

        // Delete the database record
        const { error } = await supabase
          .from('pod_documents')
          .delete()
          .eq('id', doc.id);

        if (!error) {
          deletedCount++;
        } else {
          console.error(`Failed to delete pod_document ${doc.id}:`, error.message);
        }
      }

      // Check if there are any remaining valid POD documents
      const remainingDocs = documents.filter(d => !brokenPodIds.has(d.id));

      if (remainingDocs.length === 0) {
        // No valid PODs left — reset load status so driver can re-upload
        // If load is INVOICED, delete the invoice and reset to IN_TRANSIT
        if (load.status === 'INVOICED' || load.status === 'DELIVERED') {
          // Delete the invoice if it exists
          if (invoice) {
            await supabase.from('invoices').delete().eq('id', invoice.id);
          }
          // Reset load to IN_TRANSIT so driver portal allows re-upload
          await supabase
            .from('loads')
            .update({ status: 'IN_TRANSIT', delivered_at: null })
            .eq('id', load.id);

          setReuploadResult({
            success: true,
            message: `${deletedCount} broken POD record(s) deleted. Load reset to IN_TRANSIT — driver can now re-upload POD documents from the Driver Portal.`,
          });
        } else {
          setReuploadResult({
            success: true,
            message: `${deletedCount} broken POD record(s) deleted. Driver can re-upload from the Driver Portal.`,
          });
        }
      } else {
        // Some valid PODs remain
        setReuploadResult({
          success: true,
          message: `${deletedCount} broken POD record(s) deleted. ${remainingDocs.length} valid document(s) remain. Driver can upload additional documents from the Driver Portal.`,
        });
      }

      // Update local state
      setDocuments(remainingDocs);
      setBrokenPodIds(new Set());
      setShowReuploadConfirm(false);

      // Notify parent to refresh data
      if (onPodReuploadRequested) {
        onPodReuploadRequested();
      }
    } catch (err: any) {
      setReuploadResult({
        success: false,
        message: `Error: ${err.message || 'Failed to delete broken POD records'}`,
      });
    } finally {
      setDeletingBrokenPods(false);
    }
  };

  // Delete ALL pod documents (broken + valid) for a full re-upload
  const handleDeleteAllPods = async () => {
    if (!load) return;
    setDeletingBrokenPods(true);
    setReuploadResult(null);

    try {
      let deletedCount = 0;

      for (const doc of documents) {
        // Try to delete the storage file
        try {
          const urlParts = doc.file_url.split('/pod-documents/');
          if (urlParts.length > 1) {
            const storagePath = decodeURIComponent(urlParts[1]);
            await supabase.storage.from('pod-documents').remove([storagePath]);
          }
        } catch { /* Storage file may not exist */ }

        // Delete the database record
        const { error } = await supabase
          .from('pod_documents')
          .delete()
          .eq('id', doc.id);

        if (!error) deletedCount++;
      }

      // Delete the invoice if it exists
      if (invoice) {
        await supabase.from('invoices').delete().eq('id', invoice.id);
      }

      // Reset load to IN_TRANSIT
      await supabase
        .from('loads')
        .update({ status: 'IN_TRANSIT', delivered_at: null })
        .eq('id', load.id);

      setReuploadResult({
        success: true,
        message: `All ${deletedCount} POD record(s) deleted. Invoice removed. Load reset to IN_TRANSIT — driver can now re-upload all documents from the Driver Portal.`,
      });

      setDocuments([]);
      setBrokenPodIds(new Set());
      setShowReuploadConfirm(false);

      if (onPodReuploadRequested) {
        onPodReuploadRequested();
      }
    } catch (err: any) {
      setReuploadResult({
        success: false,
        message: `Error: ${err.message || 'Failed to delete POD records'}`,
      });
    } finally {
      setDeletingBrokenPods(false);
    }
  };

  const getTimestamp = (stopType: string, eventType: string, stopId?: string): GeofenceTimestamp | undefined => {
    return timestamps.find(t => {
      if (stopId) {
        return t.stop_id === stopId && t.event_type === eventType;
      }
      return t.stop_type === stopType && t.event_type === eventType;
    });
  };

  const formatTimestamp = (ts: GeofenceTimestamp | undefined): string => {
    if (!ts) return '';
    const date = new Date(ts.timestamp);
    return date.toLocaleString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const isAnyTimestampVerified = timestamps.some(t => t.verified);

  const handlePrint = async () => {
    if (!load || !invoice) return;

    // Format invoice date
    const invoiceDate = new Date(invoice.created_at).toLocaleDateString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
    });

    // Get destination information
    const destination = deliveryStops.length > 0
      ? `${deliveryStops[0].company_name || ''}, ${deliveryStops[0].city} ${deliveryStops[0].state}`
      : `${load.dest_company || ''}, ${load.dest_city} ${load.dest_state}`;

    const invoiceAmount = fmt(invoice.amount);

    // Format GPS timestamps for print
    const pickupArrived = formatTimestamp(getTimestamp('pickup', 'arrived'));
    const pickupDeparted = formatTimestamp(getTimestamp('pickup', 'departed'));
    const deliveryArrived = formatTimestamp(getTimestamp('delivery', 'arrived'));
    const deliveryDeparted = formatTimestamp(getTimestamp('delivery', 'departed'));

    // Get pickup and delivery location info for route section
    const pickupLocation = pickupStops.length > 0
      ? {
          name: pickupStops[0].company_name || load.origin_company,
          city: pickupStops[0].city || load.origin_city,
          state: pickupStops[0].state || load.origin_state,
        }
      : {
          name: load.origin_company,
          city: load.origin_city,
          state: load.origin_state,
        };

    const deliveryLocation = deliveryStops.length > 0
      ? {
          name: deliveryStops[0].company_name || load.dest_company,
          city: deliveryStops[0].city || load.dest_city,
          state: deliveryStops[0].state || load.dest_state,
        }
      : {
          name: load.dest_company,
          city: load.dest_city,
          state: load.dest_state,
        };

    const pickupDate = new Date(load.pickup_date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const deliveryDate = new Date(load.delivery_date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    // Build POD images HTML
    const podImagesHtml = documents
      .filter(doc => doc.file_type?.startsWith('image/') && !brokenPodIds.has(doc.id))
      .map(doc => `
        <div class="pod-image-wrapper">
          <img src="${doc.file_url}" alt="${doc.file_name}" class="pod-image" />
          <p class="pod-caption">${doc.file_name}</p>
        </div>
      `)
      .join('');

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice ${invoice.invoice_number || ''}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
              color: #1e293b; 
              padding: 40px; 
              background: white;
            }
            .invoice-container { max-width: 800px; margin: 0 auto; }

            /* Header */
            .company-header { text-align: center; margin-bottom: 32px; }
            .company-name { 
              font-size: 32px; 
              font-weight: 700; 
              color: #1e293b;
              margin-bottom: 12px; 
              letter-spacing: -0.5px;
            }
            .company-details { 
              font-size: 14px; 
              color: #64748b; 
              line-height: 1.8; 
            }

            /* Horizontal divider */
            .divider { 
              border: none;
              border-top: 2px solid #cbd5e1; 
              margin: 24px 0; 
            }

            /* Two-column invoice meta */
            .invoice-meta { 
              display: flex; 
              justify-content: space-between; 
              align-items: flex-start;
              margin-bottom: 32px; 
            }
            .invoice-left { flex: 1; }
            .invoice-right { flex: 1; text-align: right; }

            .invoice-number { 
              font-size: 28px; 
              font-weight: 700; 
              color: #1e293b; 
              margin-bottom: 8px; 
            }
            .invoice-date { 
              font-size: 15px; 
              color: #475569; 
              margin-bottom: 4px;
            }

            .meta-line { 
              font-size: 15px; 
              color: #475569; 
              margin-bottom: 4px;
              line-height: 1.6;
            }
            .meta-label { font-weight: 600; color: #1e293b; }

            /* Table */
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin-bottom: 32px; 
            }
            th { 
              background: #f1f5f9; 
              padding: 12px 16px; 
              text-align: left; 
              font-weight: 600; 
              font-size: 15px; 
              border: 1px solid #cbd5e1; 
              color: #1e293b;
            }
            th:last-child { text-align: right; }
            td { 
              padding: 12px 16px; 
              font-size: 14px; 
              border: 1px solid #cbd5e1; 
              line-height: 1.6;
            }
            td:last-child { 
              text-align: right; 
              font-weight: 600;
              font-size: 15px;
            }

            /* Fuel surcharge row */
            .fuel-surcharge-row td {
              background: #fffbeb;
            }

            /* GPS Section */
            .gps-section { 
              border: 2px solid #cbd5e1; 
              border-radius: 8px; 
              padding: 20px; 
              background: #f8fafc;
              margin-top: 24px;
            }
            .gps-header { 
              display: flex; 
              justify-content: space-between; 
              align-items: center;
              margin-bottom: 16px;
            }
            .gps-title { 
              font-size: 16px; 
              font-weight: 700; 
              color: #1e293b; 
            }
            .verified-badge { 
              font-size: 11px; 
              font-weight: 600; 
              color: #10b981; 
              background: #d1fae5;
              padding: 4px 12px;
              border-radius: 4px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .gps-disclaimer { 
              font-size: 12px; 
              color: #64748b; 
              margin-bottom: 16px;
              line-height: 1.5;
            }

            .location-box { 
              background: white;
              border: 1px solid #cbd5e1;
              border-radius: 6px;
              padding: 16px;
              margin-bottom: 12px;
            }
            .location-box:last-child { margin-bottom: 0; }

            .location-header { 
              font-size: 14px; 
              font-weight: 700; 
              color: #1e293b; 
              margin-bottom: 12px;
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .location-times { 
              display: flex; 
              justify-content: space-between;
              gap: 16px;
            }
            .time-col { flex: 1; }
            .time-label { 
              font-size: 12px; 
              font-weight: 600; 
              color: #64748b; 
              text-transform: uppercase;
              letter-spacing: 0.3px;
              margin-bottom: 4px;
            }
            .time-value { 
              font-size: 13px; 
              color: #1e293b; 
              font-family: 'Monaco', 'Courier New', monospace;
            }

            /* Amount Due Section */
            .amount-due {
              background: linear-gradient(to right, #10b981, #059669, #14b8a6);
              border-radius: 12px;
              padding: 32px;
              margin-bottom: 32px !important;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            .amount-due-left h4 {
              font-size: 14px;
              color: #d1fae5;
              text-transform: uppercase;
              letter-spacing: 1px;
              font-weight: 600;
              margin-bottom: 8px;
            }
            .amount-due-left .amount {
              font-size: 48px;
              font-weight: 900;
              color: white;
            }
            .amount-due-right {
              text-align: right;
            }
            .load-badge {
              background: rgba(255,255,255,0.2);
              border-radius: 8px;
              padding: 12px 16px;
              margin-bottom: 8px;
            }
            .load-badge p:first-child {
              font-size: 11px;
              color: #d1fae5;
              margin-bottom: 4px;
            }
            .load-badge p:last-child {
              font-size: 20px;
              font-weight: 700;
              color: white;
            }
            .bol-badge {
              background: rgba(255,255,255,0.2);
              border-radius: 8px;
              padding: 8px 12px;
            }
            .bol-badge p:first-child {
              font-size: 11px;
              color: #d1fae5;
              margin-bottom: 4px;
            }
            .bol-badge p:last-child {
              font-size: 16px;
              font-weight: 700;
              color: white;
            }

            /* Route Info Section */
            .route-info {
              background: linear-gradient(to right, #eff6ff, #e0e7ff);
              border: 2px solid #bfdbfe;
              border-radius: 12px;
              padding: 24px;
              margin-bottom: 24px !important;
            }
            .route-title {
              font-size: 14px;
              font-weight: 700;
              color: #1e3a8a;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-bottom: 16px;
            }
            .route-flow {
              display: flex;
              align-items: center;
              gap: 16px;
            }
            .route-location {
              flex: 1;
            }
            .route-icon {
              width: 40px;
              height: 40px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: 700;
              color: white;
              font-size: 16px;
            }
            .pickup-icon {
              background: #10b981;
            }
            .delivery-icon {
              background: #ef4444;
            }
            .route-arrow {
              width: 60px;
              height: 2px;
              background: #3b82f6;
              position: relative;
            }
            .route-arrow::after {
              content: '▶';
              position: absolute;
              right: -8px;
              top: -8px;
              color: #3b82f6;
              font-size: 16px;
            }
            .route-label {
              font-size: 11px;
              color: #059669;
              font-weight: 600;
              text-transform: uppercase;
              margin-bottom: 4px;
            }
            .delivery-label {
              color: #dc2626;
            }
            .route-company {
              font-weight: 700;
              color: #1e293b;
              font-size: 15px;
              margin-bottom: 2px;
            }
            .route-location-text {
              font-size: 13px;
              color: #64748b;
              margin-bottom: 2px;
            }
            .route-date {
              font-size: 11px;
              color: #94a3b8;
            }

            /* POD Section */
            .pod-section {
              margin-top: 32px;
            }
            .pod-title {
              font-size: 14px;
              font-weight: 700;
              color: #64748b;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-bottom: 16px;
              padding-top: 16px;
              border-top: 2px solid #e2e8f0;
            }
            .pod-image-wrapper {
              margin-bottom: 16px;
            }
            .pod-image {
              max-width: 100%;
              height: auto;
              display: block;
              border: 1px solid #e2e8f0;
              border-radius: 4px;
              margin-bottom: 8px;
            }
            .pod-caption {
              font-size: 12px;
              color: #64748b;
              text-align: center;
            }

            @media print {
              body { 
                padding: 20px; 
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              
              /* Prevent page breaks in critical sections */
              .invoice-header,
              .company-info,
              .load-info,
              .line-items,
              .amount-due {
                page-break-inside: avoid !important;
              }
              
              /* Force route and GPS section to stay together */
              .route-info,
              .gps-section {
                page-break-inside: avoid !important;
                page-break-before: auto !important;
              }
              
              /* POD section should start on new page */
              .pod-section { 
                page-break-before: always !important;
                page-break-inside: avoid !important;
              }
              
              /* Each POD image on its own page (except first) */
              .pod-image-wrapper:not(:first-child) { 
                page-break-before: always !important;
                page-break-after: auto !important;
                page-break-inside: avoid !important;
              }
              
              .pod-image-wrapper:first-child {
                page-break-inside: avoid !important;
              }
              
              .no-print { display: none !important; }
              .broken-pod { display: none !important; }
              
              /* Ensure gradients print correctly */
              .amount-due,
              .bg-gradient-to-r,
              .bg-gradient-to-br {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              
              /* Prevent orphaned content */
              * {
                orphans: 3;
                widows: 3;
              }

              .invoice-container { 
                max-width: 800px; 
                margin: 0 auto;
                overflow: visible !important;
              }
            }
          </style>
        </head>
        <body>
          <div class="invoice-container">
            <!-- Header -->
            <div class="company-header">
              <div class="company-name">${companySettings.company_name}</div>
              <div class="company-details">
                ${companySettings.company_address}<br>
                ${companySettings.company_city}, ${companySettings.company_state} ${companySettings.company_zip}<br>
                Phone: ${companySettings.company_phone}<br>
                Email: ${companySettings.company_email}
              </div>
            </div>

            <hr class="divider">

            <!-- Two-column invoice meta -->
            <div class="invoice-meta">
              <div class="invoice-left">
                <div class="invoice-number">Invoice ${invoice.invoice_number || 'N/A'}</div>
                <div class="invoice-date">Date: ${invoiceDate}</div>
              </div>
              <div class="invoice-right">
                <div class="meta-line"><span class="meta-label">Load #:</span> ${load.load_number || 'N/A'}</div>
                <div class="meta-line"><span class="meta-label">BOL/POD #:</span> ${load.bol_number || 'N/A'}</div>
                <div class="meta-line"><span class="meta-label">Driver:</span> ${load.driver?.name || 'N/A'}</div>
              </div>
            </div>

            <!-- Line items table -->
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                ${showItemized ? `
                  <tr>
                    <td>Transportation Services - ${destination} - BOL/POD: ${load.bol_number || 'N/A'}</td>
                    <td>$${fmt(load.rate || 0)}</td>
                  </tr>
                  ${(load.extra_stop_fee || 0) > 0 ? `
                    <tr>
                      <td>Extra Stop Fee</td>
                      <td>$${fmt(load.extra_stop_fee || 0)}</td>
                    </tr>
                  ` : ''}
                  ${(load.lumper_fee || 0) > 0 ? `
                    <tr>
                      <td>Lumper Fee</td>
                      <td>$${fmt(load.lumper_fee || 0)}</td>
                    </tr>
                  ` : ''}
                  <tr class="fuel-surcharge-row">
                    <td>Fuel Surcharge${miles > 0 ? ` (${miles.toLocaleString()} mi × $${perMileRate.toFixed(4)}/mi)` : ''}</td>
                    <td>$${fmt(fuelSurchargeAmount)}</td>
                  </tr>
                ` : `
                  <tr>
                    <td>Transportation Services - ${destination} - BOL/POD: ${load.bol_number || 'N/A'}</td>
                    <td>$${invoiceAmount}</td>
                  </tr>
                `}
              </tbody>
            </table>

            <!-- Amount Due - BIG and BOLD -->
            <div class="amount-due">
              <div class="amount-due-left">
                <h4>Total Amount Due</h4>
                <div class="amount">$${invoiceAmount}</div>
              </div>
              <div class="amount-due-right">
                <div class="load-badge">
                  <p>Load Number</p>
                  <p>#${load.load_number || 'N/A'}</p>
                </div>
                ${load.bol_number ? `
                  <div class="bol-badge">
                    <p>BOL Number</p>
                    <p>${load.bol_number}</p>
                  </div>
                ` : ''}
              </div>
            </div>

            <!-- Route Info with Visual Flow -->
            <div class="route-info">
              <div class="route-title">📍 Delivery Route</div>
              <div class="route-flow">
                <div class="route-location">
                  <div class="route-label">Pickup</div>
                  <div class="route-company">${pickupLocation.name || 'N/A'}</div>
                  <div class="route-location-text">${pickupLocation.city || ''}, ${pickupLocation.state || ''}</div>
                  <div class="route-date">${pickupDate}</div>
                </div>
                <div class="route-arrow"></div>
                <div class="route-location">
                  <div class="route-label delivery-label">Delivery</div>
                  <div class="route-company">${deliveryLocation.name || 'N/A'}</div>
                  <div class="route-location-text">${deliveryLocation.city || ''}, ${deliveryLocation.state || ''}</div>
                  <div class="route-date">${deliveryDate}</div>
                </div>
              </div>
            </div>

            <!-- GPS section (only if timestamps exist) -->
            ${timestamps.length > 0 ? `
              <div class="gps-section">
                <div class="gps-header">
                  <div class="gps-title">GPS-Verified Arrival & Departure Times</div>
                  <div class="verified-badge">GEOFENCE VERIFIED</div>
                </div>
                <div class="gps-disclaimer">
                  Times recorded automatically via GPS geofencing technology. No manual driver input - legally verifiable timestamps.
                </div>
                
                <!-- Pickup location box -->
                <div class="location-box">
                  <div class="location-header">📦 SHIPPER / PICKUP LOCATION</div>
                  <div class="location-times">
                    <div class="time-col">
                      <div class="time-label">ARRIVED (IN)</div>
                      <div class="time-value">${pickupArrived || 'Pending GPS verification'}</div>
                    </div>
                    <div class="time-col">
                      <div class="time-label">DEPARTED (OUT)</div>
                      <div class="time-value">${pickupDeparted || 'Pending GPS verification'}</div>
                    </div>
                  </div>
                </div>

                <!-- Delivery location box -->
                <div class="location-box">
                  <div class="location-header">📍 RECEIVER / DELIVERY LOCATION</div>
                  <div class="location-times">
                    <div class="time-col">
                      <div class="time-label">ARRIVED (IN)</div>
                      <div class="time-value">${deliveryArrived || 'Pending GPS verification'}</div>
                    </div>
                    <div class="time-col">
                      <div class="time-label">DEPARTED (OUT)</div>
                      <div class="time-value">${deliveryDeparted || 'Pending GPS verification'}</div>
                    </div>
                  </div>
                </div>
              </div>
            ` : ''}

            <!-- POD Documents -->
            ${podImagesHtml ? `
              <div class="pod-section">
                <div class="pod-title">Attached POD Documents</div>
                ${podImagesHtml}
              </div>
            ` : ''}
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    
     // Wait for all images to load before printing
    const images = printWindow.document.querySelectorAll('img');
    const imagePromises = Array.from(images).map(img => {
      return new Promise<void>((resolve) => {
        if (img.complete) {
          resolve();
        } else {
          img.onload = () => resolve();
          img.onerror = () => resolve(); // Still resolve on error to not block
        }
      });
    });

    await Promise.all(imagePromises);
    
    printWindow.focus();
    
    const PRINT_RENDER_DELAY_MS = 1000;
    setTimeout(() => {
      printWindow.print();
    }, PRINT_RENDER_DELAY_MS);
  };

  if (!isOpen || !load || !invoice) return null;

  const pickupStops = stops.filter(s => s.stop_type === 'pickup');
  const deliveryStops = stops.filter(s => s.stop_type === 'delivery');

  // Build description line
  const destCity = deliveryStops.length > 0
    ? `${deliveryStops[0].company_name || ''}, ${deliveryStops[0].city} ${deliveryStops[0].state}`
    : `${load.dest_company || ''}, ${load.dest_city} ${load.dest_state}`;
  const bolDisplay = load.bol_number || 'N/A';
  const descriptionLine = `Transportation Services - ${destCity.trim()} - BOL/POD: ${bolDisplay}`;

  // --- Fuel Surcharge Calculation ---
  const hasFuelSurcharge = customer?.has_fuel_surcharge === true;
  const baseCharges = (load.rate || 0) + (load.extra_stop_fee || 0) + (load.lumper_fee || 0);
  const fuelSurchargeAmount = hasFuelSurcharge ? Math.max(0, invoice.amount - baseCharges) : 0;
  const miles = load.total_miles || 0;
  const perMileRate = (hasFuelSurcharge && miles > 0 && fuelSurchargeAmount > 0)
    ? fuelSurchargeAmount / miles
    : 0;
  const showItemized = hasFuelSurcharge && fuelSurchargeAmount > 0;

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const hasBrokenPods = brokenPodIds.size > 0;
  const allPodsBroken = documents.length > 0 && brokenPodIds.size === documents.length;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] overflow-hidden m-4 flex flex-col">
        {/* Toolbar */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-3 flex items-center justify-between rounded-t-2xl z-10">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-white">Invoice Preview</h2>
            {hasBrokenPods && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-500/90 text-white rounded-full text-xs font-semibold animate-pulse">
                <AlertTriangle className="w-3.5 h-3.5" />
                {brokenPodIds.size} Broken File{brokenPodIds.size !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasBrokenPods && (
              <button
                onClick={() => setShowReuploadConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/80 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Re-upload POD
              </button>
            )}
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Re-upload Confirmation Banner */}
        {showReuploadConfirm && (
          <div className="bg-red-50 border-b-2 border-red-200 px-6 py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-bold text-red-800 mb-1">Re-upload POD Documents</h3>
                <p className="text-sm text-red-700 mb-3">
                  {brokenPodIds.size} of {documents.length} POD file(s) are missing from storage. Choose an action:
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleDeleteBrokenPods}
                    disabled={deletingBrokenPods}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
                  >
                    {deletingBrokenPods ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                    Delete Broken Only ({brokenPodIds.size})
                  </button>
                  <button
                    onClick={handleDeleteAllPods}
                    disabled={deletingBrokenPods}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    {deletingBrokenPods ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RotateCcw className="w-4 h-4" />
                    )}
                    Delete All & Re-upload ({documents.length})
                  </button>
                  <button
                    onClick={() => setShowReuploadConfirm(false)}
                    disabled={deletingBrokenPods}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
                <p className="text-xs text-red-600 mt-2">
                  This will reset the load to IN_TRANSIT so the driver can re-upload from the Driver Portal.
                  {invoice && ' The invoice will also be removed.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Re-upload Result Banner */}
        {reuploadResult && (
          <div className={`px-6 py-3 border-b ${reuploadResult.success ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
            <p className={`text-sm font-medium ${reuploadResult.success ? 'text-emerald-700' : 'text-red-700'}`}>
              {reuploadResult.message}
            </p>
          </div>
        )}

        {/* Invoice Content */}
        <div className="flex-1 overflow-y-auto bg-gray-100 p-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : (
            <div ref={printRef} className="bg-white rounded-lg shadow-lg max-w-[700px] mx-auto">
              <div className="p-8 sm:p-10">
                {/* Modern Invoice Header with Gradient */}
                <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-8 rounded-t-2xl text-white -m-8 sm:-m-10 mb-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <h1 className="text-4xl font-bold mb-2">INVOICE</h1>
                    </div>
                    <div className="flex items-center gap-6">
                      {/* Bill To with Modern Card */}
                      <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 border-2 border-amber-200 shadow-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-9 h-9 bg-amber-500 rounded-lg flex items-center justify-center">
                            <span className="text-white font-bold text-base">
                              {customer?.company_name?.charAt(0) || load.dest_company?.charAt(0) || '?'}
                            </span>
                          </div>
                          <div>
                            <p className="text-xs text-amber-600 uppercase tracking-wider font-semibold">Bill To</p>
                            <h3 className="text-base font-bold text-slate-900">
                              {customer?.company_name || load.dest_company}
                            </h3>
                          </div>
                        </div>
                        <div className="space-y-1 text-sm text-slate-700">
                          {customer ? (
                            <>
                              <p>{customer.billing_address}</p>
                              <p>{customer.billing_city}, {customer.billing_state} {customer.billing_zip}</p>
                              <p className="font-medium text-amber-700">{customer.email}</p>
                              <p className="font-medium text-amber-700">{customer.phone}</p>
                            </>
                          ) : (
                            <p className="text-slate-500 italic">Customer details not available</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                      <div className="bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2 mb-2">
                        <p className="text-xs text-blue-100 mb-1">Invoice Number</p>
                        <p className="text-2xl font-bold">#{invoice.invoice_number}</p>
                      </div>
                      <p className="text-sm text-blue-200">
                        {new Date(invoice.created_at).toLocaleDateString('en-US', { 
                          month: 'long', 
                          day: 'numeric', 
                          year: 'numeric' 
                        })}
                      </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Company Info with Visual Card */}
                <div className="mb-6">
                  <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-5 border-2 border-slate-200 max-w-md">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                        <span className="text-white font-bold text-lg">
                          {companySettings.company_name.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">From</p>
                        <h3 className="text-lg font-bold text-slate-900">{companySettings.company_name}</h3>
                      </div>
                    </div>
                    <div className="space-y-1 text-sm text-slate-600">
                      <p>{companySettings.company_address}</p>
                      <p>{companySettings.company_city}, {companySettings.company_state} {companySettings.company_zip}</p>
                      <p className="font-medium text-blue-600">{companySettings.company_phone}</p>
                      <p className="font-medium text-blue-600">{companySettings.company_email}</p>
                    </div>
                  </div>
                </div>

                {/* Load Info Section */}
                <div className="bg-slate-50 rounded-lg p-4 mb-6 border border-slate-200">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Load Details</p>
                      <div className="space-y-1">
                        <p>
                          <span className="font-semibold text-slate-800">Load #:</span>{' '}
                          <span className="text-slate-600">{load.load_number}</span>
                        </p>
                        <p>
                          <span className="font-semibold text-slate-800">BOL/POD #:</span>{' '}
                          <span className="text-slate-600">{load.bol_number || 'N/A'}</span>
                        </p>
                        {load.trip_number && (
                          <p>
                            <span className="font-semibold text-slate-800">Trip #:</span>{' '}
                            <span className="text-slate-600">{load.trip_number}</span>
                          </p>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Transport Info</p>
                      <div className="space-y-1">
                        <p>
                          <span className="font-semibold text-slate-800">Driver:</span>{' '}
                          <span className="text-slate-600">{load.driver?.name || 'N/A'}</span>
                        </p>
                        {miles > 0 && (
                          <p>
                            <span className="font-semibold text-slate-800">Miles:</span>{' '}
                            <span className="text-slate-600">{miles.toLocaleString()}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Line Items Table */}
                <table className="w-full border-collapse mb-6">
                  <thead>
                    <tr>
                      <th className="bg-slate-100 px-3 py-2.5 text-left text-sm font-semibold text-slate-700 border border-slate-200">
                        Description
                      </th>
                      <th className="bg-slate-100 px-3 py-2.5 text-right text-sm font-semibold text-slate-700 border border-slate-200 w-32">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {showItemized ? (
                      <>
                        <tr>
                          <td className="px-3 py-3 text-sm text-slate-700 border border-slate-200">
                            {descriptionLine}
                          </td>
                          <td className="px-3 py-3 text-sm text-slate-700 border border-slate-200 text-right font-medium">
                            ${fmt(load.rate || 0)}
                          </td>
                        </tr>
                        {(load.extra_stop_fee || 0) > 0 && (
                          <tr>
                            <td className="px-3 py-3 text-sm text-slate-700 border border-slate-200">
                              Extra Stop Fee
                            </td>
                            <td className="px-3 py-3 text-sm text-slate-700 border border-slate-200 text-right font-medium">
                              ${fmt(load.extra_stop_fee || 0)}
                            </td>
                          </tr>
                        )}
                        {(load.lumper_fee || 0) > 0 && (
                          <tr>
                            <td className="px-3 py-3 text-sm text-slate-700 border border-slate-200">
                              Lumper Fee
                            </td>
                            <td className="px-3 py-3 text-sm text-slate-700 border border-slate-200 text-right font-medium">
                              ${fmt(load.lumper_fee || 0)}
                            </td>
                          </tr>
                        )}
                        <tr className="fuel-surcharge-row">
                          <td className="px-3 py-3 text-sm border border-slate-200 bg-amber-50">
                            <div className="flex items-center gap-2">
                              <Fuel className="w-4 h-4 text-amber-600 flex-shrink-0" style={{ display: 'inline-block' }} />
                              <span className="text-amber-800 font-medium">
                                Fuel Surcharge
                                {miles > 0 && (
                                  <span className="text-amber-600 font-normal ml-1">
                                    ({miles.toLocaleString()} mi × ${perMileRate.toFixed(4)}/mi)
                                  </span>
                                )}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-sm border border-slate-200 text-right font-semibold bg-amber-50 text-amber-800">
                            ${fmt(fuelSurchargeAmount)}
                          </td>
                        </tr>
                      </>
                    ) : (
                      <tr>
                        <td className="px-3 py-3 text-sm text-slate-700 border border-slate-200">
                          {descriptionLine}
                        </td>
                        <td className="px-3 py-3 text-sm text-slate-700 border border-slate-200 text-right font-medium">
                          ${fmt(invoice.amount)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* Amount Due - BIG and BOLD */}
                <div className="bg-gradient-to-r from-emerald-500 via-green-500 to-teal-500 rounded-2xl p-8 mb-6 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-emerald-100 text-sm font-semibold uppercase tracking-wider mb-1">
                        Total Amount Due
                      </p>
                      <p className="text-5xl font-black text-white drop-shadow-lg">
                        ${fmt(invoice.amount)}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="bg-white/20 backdrop-blur-sm rounded-lg px-4 py-3">
                        <p className="text-xs text-emerald-100 mb-1">Load Number</p>
                        <p className="text-2xl font-bold text-white">#{load.load_number}</p>
                      </div>
                      {load.bol_number && (
                        <div className="bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2 mt-2">
                          <p className="text-xs text-emerald-100 mb-1">BOL Number</p>
                          <p className="text-lg font-bold text-white">{load.bol_number}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Route Info with Icons and Visual Flow */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 mb-6 border-2 border-blue-200">
                  <h3 className="text-sm font-bold text-blue-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Delivery Route
                  </h3>
                  <div className="relative">
                    {/* Pickup */}
                    <div className="flex items-start gap-4 mb-4">
                      <div className="flex flex-col items-center">
                        <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center shadow-md">
                          <span className="text-white font-bold text-sm">P</span>
                        </div>
                        <div className="w-0.5 h-12 bg-blue-300"></div>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-green-700 font-semibold uppercase mb-1">Pickup</p>
                        <p className="font-bold text-slate-900">{pickupStops[0]?.company_name || load.origin_company}</p>
                        <p className="text-sm text-slate-600">
                          {pickupStops[0]?.city || load.origin_city}, {pickupStops[0]?.state || load.origin_state}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          {new Date(load.pickup_date).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric' 
                          })}
                        </p>
                      </div>
                    </div>

                    {/* Delivery */}
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center shadow-md">
                        <span className="text-white font-bold text-sm">D</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-red-700 font-semibold uppercase mb-1">Delivery</p>
                        <p className="font-bold text-slate-900">{deliveryStops[0]?.company_name || load.dest_company}</p>
                        <p className="text-sm text-slate-600">
                          {deliveryStops[0]?.city || load.dest_city}, {deliveryStops[0]?.state || load.dest_state}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          {new Date(load.delivery_date).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric' 
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* GPS-Verified Arrival & Departure Times */}
                <div className="border-2 border-blue-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-slate-800">
                      GPS-Verified Arrival & Departure Times
                    </h3>
                    <span className={`px-3 py-1 rounded text-[10px] font-bold tracking-wider uppercase ${
                      isAnyTimestampVerified
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-200 text-slate-500'
                    }`}>
                      {isAnyTimestampVerified ? 'GEOFENCE VERIFIED' : 'PENDING VERIFICATION'}
                    </span>
                  </div>

                  <div className="bg-blue-50 rounded px-3 py-2 mb-4">
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Times recorded automatically via GPS geofencing technology. No manual driver input - legally verifiable timestamps.
                    </p>
                  </div>

                  {/* Two-column layout for Shipper and Receiver */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Left column: Shipper / Pickup Location(s) */}
                    <div>
                      {pickupStops.length > 0 ? (
                        pickupStops.map((stop, idx) => {
                          const arrivedTs = getTimestamp('pickup', 'arrived', stop.id);
                          const departedTs = getTimestamp('pickup', 'departed', stop.id);
                          return (
                            <div key={stop.id} className="border border-slate-200 rounded-md p-3 mb-3">
                              <div className="flex items-center gap-2 mb-2">
                                <MapPin className="w-3.5 h-3.5 text-blue-600" />
                                <span className="text-xs font-bold text-blue-600 uppercase">
                                  Shipper / Pickup Location{pickupStops.length > 1 ? ` ${idx + 1}` : ''}
                                </span>
                              </div>
                              {stop.company_name && (
                                <p className="text-xs text-slate-500 mb-2 ml-5">
                                  {stop.company_name} - {stop.city}, {stop.state}
                                </p>
                              )}
                              <div className="flex gap-6 ml-5">
                                <div className="flex-1">
                                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Arrived (In)</p>
                                  {arrivedTs ? (
                                    <p className="text-xs text-slate-700 mt-0.5 font-medium">
                                      {formatTimestamp(arrivedTs)}
                                      {arrivedTs.verified && <ShieldCheck className="w-3 h-3 text-green-500 inline ml-1" />}
                                    </p>
                                  ) : (
                                    <p className="text-xs text-slate-400 italic mt-0.5">Pending GPS verification</p>
                                  )}
                                </div>
                                <div className="flex-1">
                                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Departed (Out)</p>
                                  {departedTs ? (
                                    <p className="text-xs text-slate-700 mt-0.5 font-medium">
                                      {formatTimestamp(departedTs)}
                                      {departedTs.verified && <ShieldCheck className="w-3 h-3 text-green-500 inline ml-1" />}
                                    </p>
                                  ) : (
                                    <p className="text-xs text-slate-400 italic mt-0.5">Pending GPS verification</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="border border-slate-200 rounded-md p-3 mb-3">
                          <div className="flex items-center gap-2 mb-2">
                            <MapPin className="w-3.5 h-3.5 text-blue-600" />
                            <span className="text-xs font-bold text-blue-600 uppercase">Shipper / Pickup Location</span>
                          </div>
                          <p className="text-xs text-slate-500 mb-2 ml-5">{load.origin_city}, {load.origin_state}</p>
                          <div className="flex gap-6 ml-5">
                            <div className="flex-1">
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Arrived (In)</p>
                              {(() => {
                                const ts = getTimestamp('pickup', 'arrived');
                                return ts ? (
                                  <p className="text-xs text-slate-700 mt-0.5 font-medium">
                                    {formatTimestamp(ts)}
                                    {ts.verified && <ShieldCheck className="w-3 h-3 text-green-500 inline ml-1" />}
                                  </p>
                                ) : (
                                  <p className="text-xs text-slate-400 italic mt-0.5">Pending GPS verification</p>
                                );
                              })()}
                            </div>
                            <div className="flex-1">
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Departed (Out)</p>
                              {(() => {
                                const ts = getTimestamp('pickup', 'departed');
                                return ts ? (
                                  <p className="text-xs text-slate-700 mt-0.5 font-medium">
                                    {formatTimestamp(ts)}
                                    {ts.verified && <ShieldCheck className="w-3 h-3 text-green-500 inline ml-1" />}
                                  </p>
                                ) : (
                                  <p className="text-xs text-slate-400 italic mt-0.5">Pending GPS verification</p>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right column: Receiver / Delivery Location(s) */}
                    <div>
                      {deliveryStops.length > 0 ? (
                        deliveryStops.map((stop, idx) => {
                          const arrivedTs = getTimestamp('delivery', 'arrived', stop.id);
                          const departedTs = getTimestamp('delivery', 'departed', stop.id);
                          return (
                            <div key={stop.id} className="border border-slate-200 rounded-md p-3 mb-3 last:mb-0">
                              <div className="flex items-center gap-2 mb-2">
                                <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="text-xs font-bold text-emerald-600 uppercase">
                                  Receiver / Delivery Location{deliveryStops.length > 1 ? ` ${idx + 1}` : ''}
                                </span>
                              </div>
                              {stop.company_name && (
                                <p className="text-xs text-slate-500 mb-2 ml-5">
                                  {stop.company_name} - {stop.city}, {stop.state}
                                </p>
                              )}
                              <div className="flex gap-6 ml-5">
                                <div className="flex-1">
                                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Arrived (In)</p>
                                  {arrivedTs ? (
                                    <p className="text-xs text-slate-700 mt-0.5 font-medium">
                                      {formatTimestamp(arrivedTs)}
                                      {arrivedTs.verified && <ShieldCheck className="w-3 h-3 text-green-500 inline ml-1" />}
                                    </p>
                                  ) : (
                                    <p className="text-xs text-slate-400 italic mt-0.5">Pending GPS verification</p>
                                  )}
                                </div>
                                <div className="flex-1">
                                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Departed (Out)</p>
                                  {departedTs ? (
                                    <p className="text-xs text-slate-700 mt-0.5 font-medium">
                                      {formatTimestamp(departedTs)}
                                      {departedTs.verified && <ShieldCheck className="w-3 h-3 text-green-500 inline ml-1" />}
                                    </p>
                                  ) : (
                                    <p className="text-xs text-slate-400 italic mt-0.5">Pending GPS verification</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="border border-slate-200 rounded-md p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-xs font-bold text-emerald-600 uppercase">Receiver / Delivery Location</span>
                          </div>
                          <p className="text-xs text-slate-500 mb-2 ml-5">
                            {load.dest_company && `${load.dest_company} - `}{load.dest_city}, {load.dest_state}
                          </p>
                          <div className="flex gap-6 ml-5">
                            <div className="flex-1">
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Arrived (In)</p>
                              {(() => {
                                const ts = getTimestamp('delivery', 'arrived');
                                return ts ? (
                                  <p className="text-xs text-slate-700 mt-0.5 font-medium">
                                    {formatTimestamp(ts)}
                                    {ts.verified && <ShieldCheck className="w-3 h-3 text-green-500 inline ml-1" />}
                                  </p>
                                ) : (
                                  <p className="text-xs text-slate-400 italic mt-0.5">Pending GPS verification</p>
                                );
                              })()}
                            </div>
                            <div className="flex-1">
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Departed (Out)</p>
                              {(() => {
                                const ts = getTimestamp('delivery', 'departed');
                                return ts ? (
                                  <p className="text-xs text-slate-700 mt-0.5 font-medium">
                                    {formatTimestamp(ts)}
                                    {ts.verified && <ShieldCheck className="w-3 h-3 text-green-500 inline ml-1" />}
                                  </p>
                                ) : (
                                  <p className="text-xs text-slate-400 italic mt-0.5">Pending GPS verification</p>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* POD Documents */}
                {documents.length > 0 && (
                  <div className="pod-section border-t border-slate-200 pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
                        Attached POD Documents
                      </h3>
                      {hasBrokenPods && (
                        <span className="no-print inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {brokenPodIds.size} file{brokenPodIds.size !== 1 ? 's' : ''} missing
                        </span>
                      )}
                    </div>
                    <div className="space-y-4">
                      {documents.map((doc) => {
                        const isBroken = brokenPodIds.has(doc.id);
                        return (
                          <div key={doc.id}>
                            {doc.file_type?.startsWith('image/') ? (
                              <div className={`border rounded-lg overflow-hidden ${isBroken ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}>
                                {isBroken ? (
                                  /* Broken image placeholder */
                                  <div className="no-print flex flex-col items-center justify-center py-12 px-6 bg-red-50">
                                    <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
                                      <ImageOff className="w-8 h-8 text-red-400" />
                                    </div>
                                    <p className="text-red-700 font-semibold text-sm mb-1">File Not Found in Storage</p>
                                    <p className="text-red-500 text-xs text-center max-w-md mb-3">
                                      This POD image was uploaded but the file is missing from storage. The database record exists but the actual file cannot be loaded.
                                    </p>
                                    <code className="text-[10px] text-red-400 bg-red-100 px-3 py-1 rounded font-mono break-all max-w-full">
                                      {doc.file_url.split('/').pop()}
                                    </code>
                                  </div>
                                ) : (
                                  <img
                                    src={doc.file_url}
                                    alt={doc.file_name}
                                    className="pod-image w-full object-contain max-h-[600px]"
                                    onError={() => handlePodImageError(doc.id)}
                                  />
                                )}
                                <div className={`px-3 py-2 text-xs flex items-center justify-between ${isBroken ? 'bg-red-100 text-red-600' : 'bg-slate-50 text-slate-500'}`}>
                                  <div className="flex items-center gap-2">
                                    {isBroken && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
                                    <span className={isBroken ? 'font-medium text-red-700' : ''}>{doc.file_name}</span>
                                    {isBroken && <span className="text-red-500 font-semibold">(MISSING)</span>}
                                  </div>
                                  {!isBroken && (
                                    <a
                                      href={doc.file_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                                    >
                                      <Download className="w-3 h-3" />
                                      Download
                                    </a>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <a
                                href={doc.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                              >
                                <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                  <span className="text-xs font-bold text-red-600">PDF</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-slate-700 truncate">{doc.file_name}</p>
                                  <p className="text-xs text-slate-400">Click to view</p>
                                </div>
                                <Download className="w-4 h-4 text-slate-400" />
                              </a>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Re-upload POD button at bottom of documents section */}
                    {hasBrokenPods && (
                      <div className="no-print mt-6 p-4 bg-red-50 border-2 border-red-200 border-dashed rounded-xl">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="font-semibold text-red-800 text-sm mb-1">
                              {allPodsBroken ? 'All POD files are missing' : `${brokenPodIds.size} of ${documents.length} POD files are missing`}
                            </p>
                            <p className="text-xs text-red-600 mb-3">
                              These files were uploaded before the storage fix was applied. Delete the broken records and have the driver re-upload from the Driver Portal.
                            </p>
                            <button
                              onClick={() => setShowReuploadConfirm(true)}
                              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                            >
                              <RotateCcw className="w-4 h-4" />
                              Re-upload POD Documents
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-white border-t border-slate-200 rounded-b-2xl flex gap-3">
          {hasBrokenPods ? (
            <button
              onClick={() => setShowReuploadConfirm(true)}
              className="flex-1 px-6 py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Re-upload POD ({brokenPodIds.size} broken)
            </button>
          ) : (
            <button
              onClick={handlePrint}
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <Printer className="w-4 h-4" />
              Print Invoice
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 text-slate-600 bg-white border border-slate-200 rounded-xl font-medium hover:bg-slate-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default InvoicePreviewModal;
