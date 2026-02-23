import React, { useState, useEffect, useRef } from 'react';
import { X, Printer, Loader2, AlertTriangle, RotateCcw, Trash2, ImageOff, FileDown, FileImage, Mail, Send, Eye, ArrowLeft, Paperclip, Plus, UserPlus } from 'lucide-react';


import { supabase } from '@/lib/supabase';
import { Load, Invoice, PODDocument, LoadStop, GeofenceTimestamp, CompanySettings, Customer } from '@/types/tms';
import { generateInvoicePdf, generateCombinedInvoicePdfBase64, downloadPdfBlob, convertPodsToPdf, convertImageToPdf, blobToBase64, loadImageToDataUrl, PodDocForPdf } from '@/lib/pdfUtils';



interface InvoicePreviewModalProps {
  isOpen: boolean;
  load: Load | null;
  invoice: Invoice | null;
  onClose: () => void;
  onPodReuploadRequested?: () => void;
  onEmailSent?: () => void;
}

const InvoicePreviewModal: React.FC<InvoicePreviewModalProps> = ({ isOpen, load, invoice, onClose, onPodReuploadRequested, onEmailSent }) => {

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
    company_phone: '214-878-1230',
    company_email: 'accounting@go4fc.com',
  });
  const [loading, setLoading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const invoicePageRef = useRef<HTMLDivElement>(null);

  const [brokenPodIds, setBrokenPodIds] = useState<Set<string>>(new Set());
  const [showReuploadConfirm, setShowReuploadConfirm] = useState(false);
  const [deletingBrokenPods, setDeletingBrokenPods] = useState(false);
  const [reuploadResult, setReuploadResult] = useState<{ success: boolean; message: string } | null>(null);

  // PDF generation state
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [pdfProgress, setPdfProgress] = useState('');
  const [podsConverting, setPodsConverting] = useState(false);
  const [singlePodConverting, setSinglePodConverting] = useState<string | null>(null);

  // Email state
  const [emailSending, setEmailSending] = useState(false);
  const [isAfsEmailing, setIsAfsEmailing] = useState(false);
  const [emailResult, setEmailResult] = useState<{ success: boolean; message: string } | null>(null);

  // Additional email recipients (CC)
  const [additionalEmails, setAdditionalEmails] = useState<string[]>([]);
  const [newEmailInput, setNewEmailInput] = useState('');
  const [emailInputError, setEmailInputError] = useState('');

  // View mode: 'invoice' = normal preview, 'email' = email preview
  const [viewMode, setViewMode] = useState<'invoice' | 'email'>('invoice');

  // Print state
  const [printPreparing, setPrintPreparing] = useState(false);

  // Derive primary email: prefer pod_email, fall back to general email
  const primaryEmail = (customer?.pod_email || customer?.email || '').trim();
  const isPodEmail = !!(customer?.pod_email && customer.pod_email.trim());

  useEffect(() => {
    if (isOpen && load && invoice) {
      setBrokenPodIds(new Set());
      setShowReuploadConfirm(false);
      setReuploadResult(null);
      setEmailResult(null);
      setEmailSending(false);
      setPdfProgress('');
      setViewMode('invoice');
      setPrintPreparing(false);
      setAdditionalEmails([]);
      setNewEmailInput('');
      setEmailInputError('');
      fetchData();
    }
  }, [isOpen, load, invoice]);


  // ═══ ADDITIONAL EMAIL HELPERS ═══
  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleAddEmail = () => {
    const email = newEmailInput.trim().toLowerCase();
    setEmailInputError('');
    if (!email) return;
    if (!isValidEmail(email)) {
      setEmailInputError('Please enter a valid email address');
      return;
    }
    if (additionalEmails.includes(email)) {
      setEmailInputError('This email is already added');
      return;
    }
    if (primaryEmail && email === primaryEmail.toLowerCase()) {
      setEmailInputError('This is already the primary recipient');
      return;
    }
    setAdditionalEmails(prev => [...prev, email]);
    setNewEmailInput('');
  };



  const handleRemoveEmail = (email: string) => {
    setAdditionalEmails(prev => prev.filter(e => e !== email));
  };

  const handleEmailInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddEmail();
    }
  };


  const fetchData = async () => {
    if (!load) return;
    setLoading(true);
    try {
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
        if (settingsMap.fuel_surcharge_rate) setFuelSurchargeRate(settingsMap.fuel_surcharge_rate);
      }
      if (load.customer_id) {
        const { data: customerData } = await supabase.from('customers').select('*').eq('id', load.customer_id).single();
        if (customerData) setCustomer(customerData);
      } else {
        setCustomer(null);
      }
      const { data: docs } = await supabase.from('pod_documents').select('*').eq('load_id', load.id);
      if (docs) setDocuments(docs);
      const { data: loadStops } = await supabase.from('load_stops').select('*').eq('load_id', load.id).order('stop_type').order('stop_sequence');
      if (loadStops) setStops(loadStops);
      const { data: geoData } = await supabase.from('geofence_timestamps').select('*').eq('load_id', load.id).order('timestamp', { ascending: true });
      if (geoData) setTimestamps(geoData);
    } catch (error) {
      console.error('Error fetching invoice data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePodImageError = (docId: string) => {
    setBrokenPodIds(prev => { const next = new Set(prev); next.add(docId); return next; });
  };

  const handleDeleteBrokenPods = async () => {
    if (!load) return;
    setDeletingBrokenPods(true);
    setReuploadResult(null);
    try {
      const brokenDocs = documents.filter(d => brokenPodIds.has(d.id));
      let deletedCount = 0;
      for (const doc of brokenDocs) {
        try {
          const urlParts = doc.file_url.split('/pod-documents/');
          if (urlParts.length > 1) {
            const storagePath = decodeURIComponent(urlParts[1]);
            await supabase.storage.from('pod-documents').remove([storagePath]);
          }
        } catch { }
        const { error } = await supabase.from('pod_documents').delete().eq('id', doc.id);
        if (!error) deletedCount++;
      }
      const remainingDocs = documents.filter(d => !brokenPodIds.has(d.id));
      if (remainingDocs.length === 0) {
        if (load.status === 'INVOICED' || load.status === 'DELIVERED') {
          if (invoice) await supabase.from('invoices').delete().eq('id', invoice.id);
          await supabase.from('loads').update({ status: 'IN_TRANSIT', delivered_at: null }).eq('id', load.id);
          setReuploadResult({ success: true, message: `${deletedCount} broken POD record(s) deleted. Load reset to IN_TRANSIT.` });
        } else {
          setReuploadResult({ success: true, message: `${deletedCount} broken POD record(s) deleted.` });
        }
      } else {
        setReuploadResult({ success: true, message: `${deletedCount} broken POD(s) deleted. ${remainingDocs.length} valid document(s) remain.` });
      }
      setDocuments(remainingDocs);
      setBrokenPodIds(new Set());
      setShowReuploadConfirm(false);
      if (onPodReuploadRequested) onPodReuploadRequested();
    } catch (err: any) {
      setReuploadResult({ success: false, message: `Error: ${err.message || 'Failed to delete'}` });
    } finally {
      setDeletingBrokenPods(false);
    }
  };

  const handleDeleteAllPods = async () => {
    if (!load) return;
    setDeletingBrokenPods(true);
    setReuploadResult(null);
    try {
      let deletedCount = 0;
      for (const doc of documents) {
        try {
          const urlParts = doc.file_url.split('/pod-documents/');
          if (urlParts.length > 1) {
            const storagePath = decodeURIComponent(urlParts[1]);
            await supabase.storage.from('pod-documents').remove([storagePath]);
          }
        } catch { }
        const { error } = await supabase.from('pod_documents').delete().eq('id', doc.id);
        if (!error) deletedCount++;
      }
      if (invoice) await supabase.from('invoices').delete().eq('id', invoice.id);
      await supabase.from('loads').update({ status: 'IN_TRANSIT', delivered_at: null }).eq('id', load.id);
      setReuploadResult({ success: true, message: `All ${deletedCount} POD(s) deleted. Load reset to IN_TRANSIT.` });
      setDocuments([]);
      setBrokenPodIds(new Set());
      setShowReuploadConfirm(false);
      if (onPodReuploadRequested) onPodReuploadRequested();
    } catch (err: any) {
      setReuploadResult({ success: false, message: `Error: ${err.message || 'Failed'}` });
    } finally {
      setDeletingBrokenPods(false);
    }
  };

  // ═══ PDF DOWNLOAD HANDLERS ═══

  const handleDownloadPdf = async () => {
    if (!invoicePageRef.current || !invoice || !load) return;
    setPdfGenerating(true);
    setPdfProgress('Preparing invoice...');
    try {
      const validDocs: PodDocForPdf[] = documents
        .filter(d => !brokenPodIds.has(d.id))
        .map(d => ({ id: d.id, file_name: d.file_name, file_url: d.file_url, file_type: d.file_type }));

      const blob = await generateInvoicePdf({
        invoiceElement: invoicePageRef.current,
        podDocuments: validDocs,
        invoiceNumber: invoice.invoice_number,
        loadNumber: load.load_number,
        companyName: companySettings.company_name,
        onProgress: (msg) => setPdfProgress(msg),
      });

      const filename = `Invoice_${invoice.invoice_number}_${load.load_number}.pdf`;
      downloadPdfBlob(blob, filename);
      setPdfProgress('Download complete!');
      setTimeout(() => setPdfProgress(''), 2000);
    } catch (err: any) {
      console.error('PDF generation failed:', err);
      setPdfProgress(`Error: ${err.message || 'PDF generation failed'}`);
      setTimeout(() => setPdfProgress(''), 4000);
    } finally {
      setPdfGenerating(false);
    }
  };

  const handleDownloadPodsPdf = async () => {
    if (!invoice || !load) return;
    setPodsConverting(true);
    setPdfProgress('Converting PODs to PDF...');
    try {
      const validDocs: PodDocForPdf[] = documents
        .filter(d => !brokenPodIds.has(d.id))
        .map(d => ({ id: d.id, file_name: d.file_name, file_url: d.file_url, file_type: d.file_type }));

      const blob = await convertPodsToPdf(
        validDocs,
        invoice.invoice_number,
        load.load_number,
        companySettings.company_name,
        (msg) => setPdfProgress(msg),
      );

      const filename = `PODs_${invoice.invoice_number}_${load.load_number}.pdf`;
      downloadPdfBlob(blob, filename);
      setPdfProgress('PODs PDF downloaded!');
      setTimeout(() => setPdfProgress(''), 2000);
    } catch (err: any) {
      console.error('POD PDF conversion failed:', err);
      setPdfProgress(`Error: ${err.message || 'Conversion failed'}`);
      setTimeout(() => setPdfProgress(''), 4000);
    } finally {
      setPodsConverting(false);
    }
  };

  const handleDownloadSinglePodPdf = async (doc: PODDocument) => {
    setSinglePodConverting(doc.id);
    try {
      const blob = await convertImageToPdf(
        doc.file_url,
        doc.file_name,
      );
      const baseName = doc.file_name.replace(/\.[^.]+$/, '');
      downloadPdfBlob(blob, `${baseName}.pdf`);
    } catch (err: any) {
      console.error('Single POD conversion failed:', err);
      alert(`Failed to convert ${doc.file_name} to PDF: ${err.message}`);
    } finally {
      setSinglePodConverting(null);
    }
  };

  // ═══ EMAIL WITH PDF HANDLER ═══
  // Generates a single combined PDF (invoice page + POD pages) and sends it as
  // ONE attachment per email, matching the customer's requirement.

  const handleSendEmailWithPdf = async () => {
    if (!primaryEmail) {
      setEmailResult({ success: false, message: 'No customer email found. Please add a POD email or general email to the customer record first.' });
      return;
    }
    if (!invoicePageRef.current || !invoice || !load) {
      setEmailResult({ success: false, message: 'Invoice preview not ready. Please try again.' });
      return;
    }

    setEmailSending(true);
    setEmailResult(null);
    setPdfProgress('Generating combined invoice + POD PDF...');

    try {
      // Step 1: Build the list of valid (non-broken) POD documents to embed
      const validDocs: PodDocForPdf[] = documents
        .filter(d => !brokenPodIds.has(d.id))
        .map(d => ({ id: d.id, file_name: d.file_name, file_url: d.file_url, file_type: d.file_type }));

      // Step 2: Generate ONE combined PDF — invoice on page 1, each POD on subsequent pages.
      // This ensures the customer receives exactly one attachment per email.
      const { base64, filename } = await generateCombinedInvoicePdfBase64({
        invoiceElement: invoicePageRef.current,
        podDocuments: validDocs,
        invoiceNumber: invoice.invoice_number,
        loadNumber: load.load_number,
        companyName: companySettings.company_name,
        onProgress: (msg) => setPdfProgress(msg),
      });

      setPdfProgress('Sending email...');

      // Step 3: Call edge function — pass the combined PDF and pods_combined: true so the
      // edge function attaches only this single file (no separate POD fetching).
      const { data, error } = await supabase.functions.invoke('send-invoice-email', {
        body: {
          load_id: load.id,
          invoice_pdf_base64: base64,
          invoice_pdf_filename: filename,
          pods_combined: true,
          additional_emails: additionalEmails.length > 0 ? additionalEmails : undefined,
        },
      });

      if (error) {
        // Try to extract detailed error from the edge function response
        let detailedError = 'Failed to send email';
        try {
          // Supabase wraps non-2xx responses in FunctionsHttpError
          // The actual response body is in error.context (a Response object)
          if (error.context && typeof error.context.json === 'function') {
            const errBody = await error.context.json();
            detailedError = errBody?.error || errBody?.message || error.message || detailedError;
          } else if (error.message) {
            detailedError = error.message;
          }
        } catch {
          detailedError = error.message || detailedError;
        }
        
        // Make the error more user-friendly
        if (detailedError.includes('Failed to send a request')) {
          detailedError = 'Could not reach the email server. Please try again in a moment.';
        }
        
        setEmailResult({ success: false, message: detailedError });
        setPdfProgress('');
      } else if (data?.success) {
        // ═══ CRITICAL: Update emailed_at in database so pipeline advances ═══
        // This moves the load from "Invoices To Be Emailed" → "Waiting On Payment"
        const now = new Date().toISOString();
        const emailedTo = data.emailed_to || primaryEmail;
        try {
          await supabase
            .from('invoices')
            .update({ emailed_at: now, emailed_to: emailedTo })
            .eq('load_id', load.id);
          console.log(`[Invoice Email] Updated emailed_at for load ${load.id} → ${emailedTo}`);
        } catch (dbErr) {
          console.warn('[Invoice Email] Failed to update emailed_at (non-critical):', dbErr);
        }

        // Build detailed success message
        let successMsg = data.message || `Invoice emailed to ${emailedTo}`;
        if (data.resend_id) {
          successMsg += ` [ID: ${data.resend_id.substring(0, 8)}...]`;
        }
        setEmailResult({ success: true, message: successMsg });
        setPdfProgress('Email sent successfully!');
        setTimeout(() => setPdfProgress(''), 3000);

        // Notify parent to refresh pipeline data
        if (onEmailSent) onEmailSent();
      } else {
        setEmailResult({ success: false, message: data?.error || 'Failed to send email — unknown error' });
        setPdfProgress('');
      }

    } catch (err: any) {

      console.error('Email with PDF failed:', err);
      setEmailResult({ success: false, message: err.message || 'Failed to generate PDF or send email' });
      setPdfProgress('');
    } finally {
      setEmailSending(false);
    }
  };

  // ═══ AFS ESUBMIT HANDLER ═══
  // Sends one combined PDF (invoice + POD only) to satisfy AFS eSubmit requirements:
  //   - Single unsecured PDF attachment named Invoice_<number>.pdf
  //   - Invoice pages first, POD documentation follows
  //   - No cover page; portrait layout
  // Enable globally via VITE_AFS_COMBINED_PDF=true env var, or click the AFS eSubmit button.
  const handleAfsEsubmit = async () => {
    if (!primaryEmail) {
      setEmailResult({ success: false, message: 'No customer email found. Please add a POD email or general email to the customer record first.' });
      return;
    }
    if (!invoicePageRef.current || !invoice || !load) {
      setEmailResult({ success: false, message: 'Invoice preview not ready. Please try again.' });
      return;
    }

    setIsAfsEmailing(true);
    setEmailResult(null);
    setPdfProgress('Generating AFS combined PDF (invoice + POD)...');

    try {
      const validDocs: PodDocForPdf[] = documents
        .filter(d => !brokenPodIds.has(d.id))
        .map(d => ({ id: d.id, file_name: d.file_name, file_url: d.file_url, file_type: d.file_type }));

      // Generate ONE combined PDF — invoice first, POD pages follow (AFS required order)
      const { base64 } = await generateCombinedInvoicePdfBase64({
        invoiceElement: invoicePageRef.current,
        podDocuments: validDocs,
        invoiceNumber: invoice.invoice_number,
        loadNumber: load.load_number,
        companyName: companySettings.company_name,
        onProgress: (msg) => setPdfProgress(msg),
      });

      // AFS naming convention: Invoice_<number>.pdf (no load-number suffix per AFS spec)
      const afsFilename = `Invoice_${invoice.invoice_number}.pdf`;

      setPdfProgress('Sending AFS eSubmit email...');

      // Pass afs_mode: true so the edge function uses the AFS-specific subject line
      const { data, error } = await supabase.functions.invoke('send-invoice-email', {
        body: {
          load_id: load.id,
          invoice_pdf_base64: base64,
          invoice_pdf_filename: afsFilename,
          pods_combined: true,
          afs_mode: true,
          additional_emails: additionalEmails.length > 0 ? additionalEmails : undefined,
        },
      });

      if (error) {
        let detailedError = 'Failed to send AFS eSubmit email';
        try {
          if (error.context && typeof error.context.json === 'function') {
            const errBody = await error.context.json();
            detailedError = errBody?.error || errBody?.message || error.message || detailedError;
          } else if (error.message) {
            detailedError = error.message;
          }
        } catch {
          detailedError = error.message || detailedError;
        }
        if (detailedError.includes('Failed to send a request')) {
          detailedError = 'Could not reach the email server. Please try again in a moment.';
        }
        setEmailResult({ success: false, message: detailedError });
        setPdfProgress('');
      } else if (data?.success) {
        const now = new Date().toISOString();
        const emailedTo = data.emailed_to || primaryEmail;
        try {
          await supabase
            .from('invoices')
            .update({ emailed_at: now, emailed_to: emailedTo })
            .eq('load_id', load.id);
        } catch (dbErr) {
          console.warn('[AFS eSubmit] Failed to update emailed_at (non-critical):', dbErr);
        }
        let successMsg = data.message || `AFS eSubmit sent to ${emailedTo}`;
        if (data.resend_id) {
          successMsg += ` [ID: ${data.resend_id.substring(0, 8)}...]`;
        }
        setEmailResult({ success: true, message: `✅ AFS eSubmit: ${successMsg}` });
        setPdfProgress('AFS eSubmit sent successfully!');
        setTimeout(() => setPdfProgress(''), 3000);
        if (onEmailSent) onEmailSent();
      } else {
        setEmailResult({ success: false, message: data?.error || 'Failed to send AFS eSubmit — unknown error' });
        setPdfProgress('');
      }
    } catch (err: any) {
      console.error('AFS eSubmit failed:', err);
      setEmailResult({ success: false, message: err.message || 'Failed to generate PDF or send AFS eSubmit email' });
      setPdfProgress('');
    } finally {
      setIsAfsEmailing(false);
    }
  };



  const getTimestamp = (stopType: string, eventType: string, stopId?: string): GeofenceTimestamp | undefined => {
    return timestamps.find(t => {
      if (stopId) return t.stop_id === stopId && t.event_type === eventType;
      return t.stop_type === stopType && t.event_type === eventType;
    });
  };

  const formatTimestamp = (ts: GeofenceTimestamp | undefined): string => {
    if (!ts) return '';
    return new Date(ts.timestamp).toLocaleString('en-US', {
      month: 'numeric', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  };

  const isAnyTimestampVerified = timestamps.some(t => t.verified);

  // ═══ PRINT HANDLER — pre-converts POD images to base64 data URLs ═══
  const handlePrint = async () => {
    const printContent = printRef.current;
    if (!printContent) return;

    setPrintPreparing(true);
    setPdfProgress('Preparing print preview...');

    try {
      // Step 1: Pre-load all POD images as base64 data URLs
      const validImageDocs = documents.filter(d => !brokenPodIds.has(d.id) && d.file_type?.startsWith('image/'));
      const dataUrlMap: Record<string, string> = {};

      for (let i = 0; i < validImageDocs.length; i++) {
        const doc = validImageDocs[i];
        setPdfProgress(`Loading POD image ${i + 1} of ${validImageDocs.length}...`);
        try {
          const dataUrl = await loadImageToDataUrl(doc.file_url);
          dataUrlMap[doc.file_url] = dataUrl;
        } catch (err) {
          console.warn(`Could not pre-load POD image: ${doc.file_name}`, err);
        }
      }

      setPdfProgress('Opening print dialog...');

      // Step 2: Clone content and replace image src with data URLs
      const clonedContent = printContent.cloneNode(true) as HTMLElement;
      clonedContent.querySelectorAll('.no-print').forEach(el => el.remove());
      clonedContent.querySelectorAll('.broken-pod').forEach(el => el.remove());

      // Replace all img src with pre-loaded data URLs
      const images = clonedContent.querySelectorAll('img');
      images.forEach((img) => {
        const originalSrc = img.getAttribute('src') || '';
        if (dataUrlMap[originalSrc]) {
          img.setAttribute('src', dataUrlMap[originalSrc]);
        }
      });

      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Invoice ${invoice?.invoice_number || ''}</title>
            <style>
              @page {
                size: letter;
                margin: 0;
              }
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                color: #1e293b;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              
              .invoice-page {
                width: 100%;
                min-height: 100vh;
                page-break-after: always;
                break-after: page;
                position: relative;
              }
              
              .header-bar {
                background: linear-gradient(135deg, #1e40af, #3b82f6) !important;
                padding: 18px 32px;
                text-align: center;
                color: white !important;
              }
              .header-bar h1 { font-size: 22px; font-weight: 800; letter-spacing: 1px; margin-bottom: 4px; color: white !important; }
              .header-bar p { font-size: 11px; opacity: 0.9; line-height: 1.5; color: white !important; }
              
              .invoice-body { padding: 20px 32px 16px; }
              
              .meta-row { display: flex; justify-content: space-between; margin-bottom: 16px; padding-bottom: 14px; border-bottom: 2px solid #e2e8f0; }
              .meta-left h2 { font-size: 18px; font-weight: 700; color: #1e40af; margin-bottom: 3px; }
              .meta-left .date { font-size: 12px; color: #64748b; }
              .meta-right { text-align: right; font-size: 12px; line-height: 1.7; }
              .meta-right .label { font-weight: 600; color: #334155; }
              .meta-right .value { color: #64748b; }
              
              .bill-to { background: #f0f4ff !important; border-left: 4px solid #3b82f6; padding: 10px 14px; margin-bottom: 14px; border-radius: 0 6px 6px 0; }
              
              .line-items { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
              .line-items th { background: #1e40af !important; color: white !important; padding: 8px 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
              .line-items th:last-child { text-align: right; }
              .line-items td { padding: 8px 12px; font-size: 12px; border-bottom: 1px solid #e2e8f0; }
              .line-items td:last-child { text-align: right; }
              
              .gps-section { border: 2px solid #93c5fd; border-radius: 8px; overflow: hidden; margin-bottom: 10px; }
              .gps-header { background: linear-gradient(135deg, #dbeafe, #eff6ff) !important; padding: 8px 14px; display: flex; justify-content: space-between; align-items: center; }
              .gps-header h3 { font-size: 11px; font-weight: 700; color: #1e40af; margin: 0; }
              .gps-badge { color: white !important; padding: 3px 10px; border-radius: 4px; font-size: 9px; font-weight: 700; }
              .gps-note { font-size: 9px; color: #64748b; padding: 6px 14px; background: #f8fafc !important; border-bottom: 1px solid #e2e8f0; }
              .gps-body { padding: 8px 14px; }
              
              .stop-box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; margin-bottom: 6px; }
              .stop-box:last-child { margin-bottom: 0; }
              
              .total-bar { background: linear-gradient(135deg, #1e40af, #3b82f6) !important; border-radius: 8px; padding: 10px 20px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
              
              .payment-terms { background: #f0fdf4 !important; border: 1px solid #bbf7d0; border-radius: 6px; padding: 10px 14px; font-size: 10px; color: #166534; line-height: 1.6; }
              
              .invoice-footer { text-align: center; padding: 10px 32px; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
              
              .pod-page-single {
                page-break-before: always;
                break-before: page;
                page-break-after: auto;
                break-after: auto;
                page-break-inside: avoid;
                break-inside: avoid;
                width: 8.5in;
                height: 11in;
                max-height: 11in;
                overflow: hidden;
                padding: 0.3in 0.4in;
                display: flex;
                flex-direction: column;
                box-sizing: border-box;
                position: relative;
              }
              .pod-page-single h3 { 
                font-size: 14px; font-weight: 700; color: #1e293b; 
                margin-bottom: 4px; flex-shrink: 0; 
              }
              .pod-page-single .pod-meta { 
                font-size: 10px; color: #64748b; 
                margin-bottom: 8px; flex-shrink: 0; 
              }
              .pod-image-container {
                flex: 1 1 auto;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                min-height: 0;
                max-height: calc(11in - 1.2in);
              }
              .pod-image-container img {
                max-width: 100%;
                max-height: 100%;
                width: auto;
                height: auto;
                object-fit: contain;
                border: 1px solid #e2e8f0;
                border-radius: 4px;
              }
              .pod-footer { 
                font-size: 9px; color: #94a3b8; text-align: center; 
                padding-top: 6px; flex-shrink: 0; 
                border-top: 1px solid #e2e8f0; margin-top: 6px; 
              }
              
              .no-print { display: none !important; }
              .broken-pod { display: none !important; }
              .pod-convert-btn { display: none !important; }
              
              img { max-width: 100%; height: auto; }
            </style>
          </head>
          <body>${clonedContent.innerHTML}</body>
        </html>
      `;

      const existingFrame = document.getElementById('invoice-print-frame');
      if (existingFrame) existingFrame.remove();

      const iframe = document.createElement('iframe');
      iframe.id = 'invoice-print-frame';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); }, 500);
        return;
      }

      iframeDoc.open();
      iframeDoc.write(htmlContent);
      iframeDoc.close();

      // Since images are now base64 data URLs, they should be immediately available
      // But still wait a moment for the browser to render
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => { iframe.remove(); }, 3000);
      }, 400);

    } catch (err: any) {
      console.error('Print preparation failed:', err);
      setPdfProgress(`Error preparing print: ${err.message}`);
      setTimeout(() => setPdfProgress(''), 4000);
    } finally {
      setPrintPreparing(false);
      setTimeout(() => setPdfProgress(''), 1500);
    }
  };


  if (!isOpen || !load || !invoice) return null;

  const pickupStops = stops.filter(s => s.stop_type === 'pickup');
  const deliveryStops = stops.filter(s => s.stop_type === 'delivery');

  const destCity = deliveryStops.length > 0
    ? `${deliveryStops[0].company_name || ''}, ${deliveryStops[0].city} ${deliveryStops[0].state}`
    : `${load.dest_company || ''}, ${load.dest_city} ${load.dest_state}`;
  const bolDisplay = load.bol_number || 'N/A';
  const descriptionLine = `Transportation Services - ${destCity.trim()} - BOL/POD: ${bolDisplay}`;

  const hasFuelSurcharge = customer?.has_fuel_surcharge === true;
  const baseCharges = (load.rate || 0) + (load.extra_stop_fee || 0) + (load.lumper_fee || 0);
  const fuelSurchargeAmount = hasFuelSurcharge ? Math.max(0, invoice.amount - baseCharges) : 0;
  const miles = load.total_miles || 0;
  const perMileRate = (hasFuelSurcharge && miles > 0 && fuelSurchargeAmount > 0) ? fuelSurchargeAmount / miles : 0;
  const showItemized = hasFuelSurcharge && fuelSurchargeAmount > 0;
  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const hasBrokenPods = brokenPodIds.size > 0;
  const allPodsBroken = documents.length > 0 && brokenPodIds.size === documents.length;
  const validDocs = documents.filter(d => !brokenPodIds.has(d.id));
  const hasValidImagePods = validDocs.some(d => d.file_type?.startsWith('image/'));

  const invoiceDate = new Date(invoice.created_at).toLocaleDateString('en-US', {
    month: 'numeric', day: 'numeric', year: 'numeric',
  });

  const isAnyActionRunning = pdfGenerating || podsConverting || emailSending || isAfsEmailing || printPreparing;

  const renderStopBlock = (stopType: 'pickup' | 'delivery', label: string, stopData: LoadStop | null, idx: number, total: number) => {
    const arrivedTs = stopData ? getTimestamp(stopType, 'arrived', stopData.id) : getTimestamp(stopType, 'arrived');
    const departedTs = stopData ? getTimestamp(stopType, 'departed', stopData.id) : getTimestamp(stopType, 'departed');
    const isPickup = stopType === 'pickup';
    const cityState = stopData
      ? `${stopData.company_name || ''} - ${stopData.city}, ${stopData.state}`
      : isPickup
        ? `${load.origin_city}, ${load.origin_state}`
        : `${load.dest_company ? load.dest_company + ' - ' : ''}${load.dest_city}, ${load.dest_state}`;

    return (
      <div key={stopData?.id || stopType} className="stop-box" style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 10px', marginBottom: '6px' }}>
        <div className={`stop-label ${stopType}`} style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px', color: isPickup ? '#1e40af' : '#059669' }}>
          <span className={`dot ${isPickup ? 'blue' : 'green'}`} style={{ width: '7px', height: '7px', borderRadius: '50%', background: isPickup ? '#3b82f6' : '#10b981', display: 'inline-block' }}></span>
          {label}{total > 1 ? ` ${idx + 1}` : ''}
        </div>
        <div className="stop-company" style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px', marginLeft: '13px' }}>{cityState}</div>
        <div className="time-grid" style={{ display: 'flex', gap: '16px', marginLeft: '13px' }}>
          <div className="time-col" style={{ flex: 1 }}>
            <div className="time-lbl" style={{ fontSize: '8px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Arrived (In)</div>
            {arrivedTs ? (
              <div className="time-val" style={{ fontSize: '10px', color: '#1e293b', fontWeight: 500, marginTop: '1px' }}>
                {formatTimestamp(arrivedTs)}{arrivedTs.verified ? ' \u2713' : ''}
              </div>
            ) : (
              <div className="time-pending" style={{ fontSize: '10px', color: '#94a3b8', fontStyle: 'italic', marginTop: '1px' }}>Pending</div>
            )}
          </div>
          <div className="time-col" style={{ flex: 1 }}>
            <div className="time-lbl" style={{ fontSize: '8px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Departed (Out)</div>
            {departedTs ? (
              <div className="time-val" style={{ fontSize: '10px', color: '#1e293b', fontWeight: 500, marginTop: '1px' }}>
                {formatTimestamp(departedTs)}{departedTs.verified ? ' \u2713' : ''}
              </div>
            ) : (
              <div className="time-pending" style={{ fontSize: '10px', color: '#94a3b8', fontStyle: 'italic', marginTop: '1px' }}>Pending</div>
            )}
          </div>
        </div>
      </div>
    );
  };


  // ═══ EMAIL PREVIEW CONTENT ═══
  const renderEmailPreview = () => {
    // Always-CC addresses (server-side, user can't remove these)
    const alwaysCc = ['kevin@go4fc.com', 'gofarmsbills@gmail.com'];
    // Combine always-CC with user-added CC, deduplicating
    const allCc = [...alwaysCc];
    additionalEmails.forEach(e => {
      if (!allCc.includes(e.toLowerCase())) allCc.push(e);
    });
    // Remove primary recipient from CC display if they happen to be in always-CC
    const displayCc = allCc.filter(cc => cc.toLowerCase() !== primaryEmail.toLowerCase());

    return (
      <div className="max-w-[700px] mx-auto">
        {/* Email envelope header */}
        <div className="bg-white rounded-t-lg border border-slate-200 px-5 py-4">
          <div className="space-y-2 text-sm">
            <div className="flex gap-2">
              <span className="font-semibold text-slate-500 w-16 flex-shrink-0">From:</span>
              <span className="text-slate-800">{companySettings.company_name} &lt;{companySettings.company_email}&gt;</span>
            </div>
            <div className="flex gap-2">
              <span className="font-semibold text-slate-500 w-16 flex-shrink-0">To:</span>
              <span className="text-slate-800">
                {primaryEmail ? (
                  <>{primaryEmail}{isPodEmail && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 bg-violet-100 text-violet-600 rounded font-medium">POD</span>}</>
                ) : (
                  <span className="text-red-500 italic">No email configured</span>
                )}
              </span>
            </div>
            {displayCc.length > 0 && (
              <div className="flex gap-2">
                <span className="font-semibold text-slate-500 w-16 flex-shrink-0">CC:</span>
                <div className="flex flex-wrap gap-1.5">
                  {displayCc.map((cc, i) => {
                    const isAlways = alwaysCc.includes(cc.toLowerCase());
                    return (
                      <span key={cc} className="text-slate-800">
                        {cc}
                        {isAlways && <span className="ml-1 text-[9px] px-1 py-0.5 bg-slate-100 text-slate-500 rounded font-medium">auto</span>}
                        {i < displayCc.length - 1 && <span className="text-slate-300 ml-0.5">,</span>}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <span className="font-semibold text-slate-500 w-16 flex-shrink-0">Subject:</span>
              <span className="text-slate-800 font-medium">Invoice {invoice.invoice_number} - {companySettings.company_name} (Load #{load.load_number})</span>
            </div>
            {/* Attachment display — always 1 combined PDF (invoice + POD pages merged client-side) */}
            <div className="space-y-1.5 pt-1 border-t border-slate-100 mt-2">
              <div className="flex gap-2 items-center">
                <Paperclip className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <span className="text-xs text-slate-600 font-medium">1 attachment:</span>
              </div>
              <div className="ml-5.5 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <FileDown className="w-3 h-3 text-blue-500 flex-shrink-0" />
                  <span>Invoice_{invoice.invoice_number}_{load.load_number}.pdf</span>
                  <span className="text-slate-300">|</span>
                  <span className="text-blue-600 font-medium">
                    Invoice{validDocs.length > 0 ? ` + ${validDocs.length} POD page${validDocs.length !== 1 ? 's' : ''}` : ''} (combined)
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 ml-5.5 italic">
                One combined PDF — invoice first, POD pages follow
              </p>
            </div>
          </div>
        </div>

        {/* AFS eSubmit info panel — shown when AFS eSubmit button is available */}
        <div className="bg-blue-50 border-x border-b border-blue-200 px-5 py-2.5">
          <p className="text-xs text-blue-700 font-semibold">AFS eSubmit available</p>
          <p className="text-xs text-blue-600 mt-0.5">
            Use <strong>AFS eSubmit</strong> to send <code>Invoice_{invoice.invoice_number}.pdf</code> — invoice first, POD follows, unsecured PDF (1 file, AFS compliant).
          </p>
        </div>


        {/* Additional Recipients Section */}
        <div className="bg-white border-x border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <UserPlus className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-700">Additional Recipients</span>
            <span className="text-xs text-slate-400">(optional — kevin@go4fc.com &amp; gofarmsbills@gmail.com always CC'd)</span>
          </div>

          {/* Added emails as removable tags */}
          {additionalEmails.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {additionalEmails.map(email => (
                <span key={email} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium border border-blue-200">
                  <Mail className="w-3 h-3" />
                  {email}
                  <button
                    onClick={() => handleRemoveEmail(email)}
                    className="ml-0.5 p-0.5 hover:bg-blue-200 rounded-full transition-colors"
                    title="Remove"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Input to add new email */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type="email"
                value={newEmailInput}
                onChange={(e) => { setNewEmailInput(e.target.value); setEmailInputError(''); }}
                onKeyDown={handleEmailInputKeyDown}
                placeholder="Enter email address to CC..."
                className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 transition-colors ${
                  emailInputError
                    ? 'border-red-300 focus:ring-red-200 bg-red-50'
                    : 'border-slate-200 focus:ring-blue-200 bg-white'
                }`}
              />
              {emailInputError && (
                <p className="absolute -bottom-5 left-0 text-xs text-red-500 font-medium">{emailInputError}</p>
              )}
            </div>
            <button
              onClick={handleAddEmail}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex-shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>
          {emailInputError && <div className="h-3" />}
        </div>

        {/* Email body — minimal, no cover sheet */}
        <div className="bg-slate-50 border-x border-b border-slate-200 rounded-b-lg overflow-hidden">
          <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', maxWidth: '600px', margin: '0 auto', padding: '32px 24px' }}>
            <p style={{ fontSize: '14px', color: '#1e293b', margin: 0, lineHeight: 1.6 }}>
              Please see attached invoice.
            </p>
            <p style={{ fontSize: '14px', color: '#1e293b', margin: '16px 0 0', lineHeight: 1.6 }}>
              Thank you,<br />
              <strong>{companySettings.company_name}</strong>
            </p>
          </div>
        </div>
      </div>
    );
  };




  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] overflow-hidden m-4 flex flex-col">
        {/* Toolbar */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-700 to-indigo-700 px-4 sm:px-6 py-3 flex items-center justify-between rounded-t-2xl z-10">
          <div className="flex items-center gap-3">
            {viewMode === 'email' && (
              <button
                onClick={() => setViewMode('invoice')}
                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors mr-1"
                title="Back to invoice"
              >
                <ArrowLeft className="w-4 h-4 text-white" />
              </button>
            )}
            <h2 className="text-base sm:text-lg font-bold text-white">
              {viewMode === 'email' ? 'Email Preview' : 'Invoice Preview'}
            </h2>
            {hasBrokenPods && viewMode === 'invoice' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-500/90 text-white rounded-full text-xs font-semibold animate-pulse">
                <AlertTriangle className="w-3.5 h-3.5" />
                {brokenPodIds.size} Broken
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {viewMode === 'invoice' ? (
              <>
                {hasBrokenPods && (
                  <button onClick={() => setShowReuploadConfirm(true)} className="flex items-center gap-1.5 px-3 py-2 bg-red-500/80 hover:bg-red-500 text-white rounded-lg text-xs sm:text-sm font-medium transition-colors">
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Re-upload</span>
                  </button>
                )}
                <button
                  onClick={handleDownloadPdf}
                  disabled={isAnyActionRunning}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/80 hover:bg-emerald-500 text-white rounded-lg text-xs sm:text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Download complete invoice + PODs as PDF"
                >
                  {pdfGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">Download PDF</span>
                </button>
                <button
                  onClick={handlePrint}
                  disabled={isAnyActionRunning}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs sm:text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {printPreparing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">Print</span>
                </button>
                <button
                  onClick={() => { setViewMode('email'); setEmailResult(null); }}
                  disabled={isAnyActionRunning}
                  className="flex items-center gap-1.5 px-3 py-2 bg-violet-500/80 hover:bg-violet-500 text-white rounded-lg text-xs sm:text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Email</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleSendEmailWithPdf}
                  disabled={isAnyActionRunning || !primaryEmail}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500/90 hover:bg-emerald-500 text-white rounded-lg text-xs sm:text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title={primaryEmail ? `Send to ${primaryEmail}${isPodEmail ? ' (POD email)' : ''}` : 'No customer email configured'}
                >
                  {emailSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{emailSending ? 'Sending...' : 'Send Email'}</span>
                </button>
                {/* AFS eSubmit button — sends Invoice_<number>.pdf (combined, AFS compliant) */}
                <button
                  onClick={handleAfsEsubmit}
                  disabled={isAnyActionRunning || !primaryEmail}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600/90 hover:bg-blue-600 text-white rounded-lg text-xs sm:text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title={primaryEmail ? `AFS eSubmit — sends Invoice_${invoice?.invoice_number}.pdf (invoice + POD, 1 file)` : 'No customer email configured'}
                  data-testid="button-send-afs-esubmit"
                >
                  {isAfsEmailing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{isAfsEmailing ? 'Sending AFS...' : 'AFS eSubmit'}</span>
                </button>
              </>
            )}
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
              <X className="w-5 h-5 text-white" />
            </button>
          </div>

        </div>

        {/* Email Result Banner */}
        {emailResult && (
          <div className={`px-6 py-3 border-b flex items-center justify-between ${emailResult.success ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-center gap-2">
              {emailResult.success ? (
                <Mail className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
              )}
              <p className={`text-sm font-medium ${emailResult.success ? 'text-emerald-700' : 'text-red-700'}`}>
                {emailResult.message}
              </p>
            </div>
            <button
              onClick={() => setEmailResult(null)}
              className={`text-xs font-medium px-2 py-1 rounded ${emailResult.success ? 'text-emerald-600 hover:bg-emerald-100' : 'text-red-600 hover:bg-red-100'}`}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* PDF / Email / Print Progress Bar */}
        {(pdfGenerating || podsConverting || emailSending || isAfsEmailing || printPreparing || pdfProgress) && (
          <div className={`px-6 py-2.5 border-b flex items-center gap-3 ${
            pdfProgress.startsWith('Error') ? 'bg-red-50 border-red-200' : 
            isAfsEmailing ? 'bg-blue-50 border-blue-200' :
            emailSending ? 'bg-violet-50 border-violet-200' : 
            printPreparing ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'
          }`}>
            {(pdfGenerating || podsConverting || emailSending || isAfsEmailing || printPreparing) && (
              <Loader2 className={`w-4 h-4 animate-spin flex-shrink-0 ${
                isAfsEmailing ? 'text-blue-600' : emailSending ? 'text-violet-600' : printPreparing ? 'text-amber-600' : 'text-blue-600'
              }`} />
            )}
            <p className={`text-sm font-medium ${
              pdfProgress.startsWith('Error') ? 'text-red-700' : 
              pdfProgress.includes('complete') || pdfProgress.includes('downloaded') || pdfProgress.includes('successfully') ? 'text-emerald-700' : 
              isAfsEmailing ? 'text-blue-700' :
              emailSending ? 'text-violet-700' : printPreparing ? 'text-amber-700' : 'text-blue-700'
            }`}>
              {pdfProgress}
            </p>
          </div>
        )}


        {/* Re-upload Confirmation Banner */}
        {showReuploadConfirm && (
          <div className="bg-red-50 border-b-2 border-red-200 px-6 py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-bold text-red-800 mb-1">Re-upload POD Documents</h3>
                <p className="text-sm text-red-700 mb-3">
                  {brokenPodIds.size} of {documents.length} POD file(s) are missing from storage.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={handleDeleteBrokenPods} disabled={deletingBrokenPods} className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors">
                    {deletingBrokenPods ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    Delete Broken Only ({brokenPodIds.size})
                  </button>
                  <button onClick={handleDeleteAllPods} disabled={deletingBrokenPods} className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors">
                    {deletingBrokenPods ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                    Delete All & Re-upload ({documents.length})
                  </button>
                  <button onClick={() => setShowReuploadConfirm(false)} disabled={deletingBrokenPods} className="inline-flex items-center gap-2 px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {reuploadResult && (
          <div className={`px-6 py-3 border-b ${reuploadResult.success ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
            <p className={`text-sm font-medium ${reuploadResult.success ? 'text-emerald-700' : 'text-red-700'}`}>{reuploadResult.message}</p>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto bg-gray-100 p-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : (
            <>
              {/* ═══ EMAIL PREVIEW VIEW ═══ */}
              {viewMode === 'email' && renderEmailPreview()}

              {/* ═══ INVOICE PREVIEW VIEW ═══ */}
              {/* Always rendered (hidden when email preview active) so invoicePageRef stays valid for PDF generation */}
              <div ref={printRef} className="max-w-[700px] mx-auto" style={viewMode === 'email' ? { position: 'absolute', left: '-9999px', top: '-9999px', opacity: 0, pointerEvents: 'none' } : undefined}>

              {/* ═══ PAGE 1: INVOICE ═══ */}
              <div
                ref={invoicePageRef}
                className="invoice-page bg-white rounded-lg shadow-lg overflow-hidden"
                style={{ pageBreakAfter: documents.length > 0 ? 'always' : 'auto' }}
              >
                {/* Color Header Bar */}
                <div className="header-bar" style={{ background: 'linear-gradient(135deg, #1e40af, #3b82f6)', padding: '18px 32px', textAlign: 'center', color: 'white' }}>
                  <h1 style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '1px', marginBottom: '4px' }}>
                    {companySettings.company_name}
                  </h1>
                  <p style={{ fontSize: '11px', opacity: 0.9, lineHeight: 1.5 }}>
                    {companySettings.company_address}, {companySettings.company_city}, {companySettings.company_state} {companySettings.company_zip}<br />
                    Phone: {companySettings.company_phone} &nbsp;|&nbsp; Email: {companySettings.company_email}
                  </p>
                </div>

                {/* Invoice Body */}
                <div className="invoice-body" style={{ padding: '20px 32px 16px' }}>
                  {/* Invoice Meta Row */}
                  <div className="meta-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', paddingBottom: '14px', borderBottom: '2px solid #e2e8f0' }}>
                    <div className="meta-left">
                      <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1e40af', marginBottom: '3px' }}>
                        Invoice {invoice.invoice_number}
                      </h2>
                      <p style={{ fontSize: '12px', color: '#64748b' }}>Date: {invoiceDate}</p>
                    </div>
                    <div className="meta-right" style={{ textAlign: 'right', fontSize: '12px', lineHeight: 1.7 }}>
                      <div><span style={{ fontWeight: 600, color: '#334155' }}>Load #:</span> <span style={{ color: '#64748b' }}>{load.load_number}</span></div>
                      <div><span style={{ fontWeight: 600, color: '#334155' }}>BOL/POD #:</span> <span style={{ color: '#64748b' }}>{bolDisplay}</span></div>
                      {load.trip_number && <div><span style={{ fontWeight: 600, color: '#334155' }}>Trip #:</span> <span style={{ color: '#64748b' }}>{load.trip_number}</span></div>}
                      <div><span style={{ fontWeight: 600, color: '#334155' }}>Driver:</span> <span style={{ color: '#64748b' }}>{load.driver?.name || 'N/A'}</span></div>
                      {miles > 0 && <div><span style={{ fontWeight: 600, color: '#334155' }}>Miles:</span> <span style={{ color: '#64748b' }}>{miles.toLocaleString()}</span></div>}
                    </div>
                  </div>

                  {/* Bill To */}
                  {customer && (
                    <div className="bill-to" style={{ background: '#f0f4ff', borderLeft: '4px solid #3b82f6', padding: '10px 14px', marginBottom: '14px', borderRadius: '0 6px 6px 0' }}>
                      <div style={{ fontSize: '9px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px' }}>Bill To</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>{customer.company_name}</div>
                      {customer.billing_address && <div style={{ fontSize: '11px', color: '#64748b' }}>{customer.billing_address}</div>}
                      {customer.billing_city && <div style={{ fontSize: '11px', color: '#64748b' }}>{customer.billing_city}, {customer.billing_state || ''} {customer.billing_zip || ''}</div>}
                      {customer.email && <div style={{ fontSize: '11px', color: '#64748b' }}>{customer.email}</div>}
                    </div>
                  )}

                  {/* Line Items Table */}
                  <table className="line-items" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
                    <thead>
                      <tr>
                        <th style={{ background: '#1e40af', color: 'white', padding: '8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Description</th>
                        <th style={{ background: '#1e40af', color: 'white', padding: '8px 12px', textAlign: 'right', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', width: '110px' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {showItemized ? (
                        <>
                          <tr>
                            <td style={{ padding: '8px 12px', fontSize: '12px', borderBottom: '1px solid #e2e8f0' }}>{descriptionLine}</td>
                            <td style={{ padding: '8px 12px', fontSize: '12px', borderBottom: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 600 }}>${fmt(load.rate || 0)}</td>
                          </tr>
                          {(load.extra_stop_fee || 0) > 0 && (
                            <tr>
                              <td style={{ padding: '8px 12px', fontSize: '12px', borderBottom: '1px solid #e2e8f0' }}>Extra Stop Fee</td>
                              <td style={{ padding: '8px 12px', fontSize: '12px', borderBottom: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 600 }}>${fmt(load.extra_stop_fee || 0)}</td>
                            </tr>
                          )}
                          {(load.lumper_fee || 0) > 0 && (
                            <tr>
                              <td style={{ padding: '8px 12px', fontSize: '12px', borderBottom: '1px solid #e2e8f0' }}>Lumper Fee</td>
                              <td style={{ padding: '8px 12px', fontSize: '12px', borderBottom: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 600 }}>${fmt(load.lumper_fee || 0)}</td>
                            </tr>
                          )}
                          <tr className="fuel-row">
                            <td style={{ padding: '8px 12px', fontSize: '12px', borderBottom: '1px solid #e2e8f0', background: '#fffbeb' }}>
                              <span style={{ fontWeight: 600, color: '#92400e' }}>Fuel Surcharge</span>
                              {miles > 0 && <span style={{ color: '#b45309', marginLeft: '6px', fontSize: '11px' }}>({miles.toLocaleString()} mi x ${perMileRate.toFixed(4)}/mi)</span>}
                            </td>
                            <td style={{ padding: '8px 12px', fontSize: '12px', borderBottom: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 600, background: '#fffbeb', color: '#92400e' }}>${fmt(fuelSurchargeAmount)}</td>
                          </tr>
                          <tr className="total-row">
                            <td style={{ padding: '8px 12px', fontSize: '13px', borderTop: '2px solid #1e40af', fontWeight: 700, background: '#f0f4ff' }}>Total</td>
                            <td style={{ padding: '8px 12px', fontSize: '15px', borderTop: '2px solid #1e40af', textAlign: 'right', fontWeight: 700, background: '#f0f4ff', color: '#1e40af' }}>${fmt(invoice.amount)}</td>
                          </tr>
                        </>
                      ) : (
                        <>
                          <tr>
                            <td style={{ padding: '8px 12px', fontSize: '12px', borderBottom: '1px solid #e2e8f0' }}>{descriptionLine}</td>
                            <td style={{ padding: '8px 12px', fontSize: '12px', borderBottom: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 600 }}>${fmt(invoice.amount)}</td>
                          </tr>
                          <tr className="total-row">
                            <td style={{ padding: '8px 12px', fontSize: '13px', borderTop: '2px solid #1e40af', fontWeight: 700, background: '#f0f4ff' }}>Total Due</td>
                            <td style={{ padding: '8px 12px', fontSize: '15px', borderTop: '2px solid #1e40af', textAlign: 'right', fontWeight: 700, background: '#f0f4ff', color: '#1e40af' }}>${fmt(invoice.amount)}</td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>

                  {/* Total Due Bar */}
                  <div className="total-bar" style={{ background: 'linear-gradient(135deg, #1e40af, #3b82f6)', borderRadius: '8px', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '13px', fontWeight: 600 }}>Total Amount Due</span>
                    <span style={{ color: 'white', fontSize: '22px', fontWeight: 800 }}>${fmt(invoice.amount)}</span>
                  </div>

                  {/* GPS-Verified Section */}
                  <div className="gps-section" style={{ border: '2px solid #93c5fd', borderRadius: '8px', overflow: 'hidden', marginBottom: '10px' }}>
                    <div className="gps-header" style={{ background: 'linear-gradient(135deg, #dbeafe, #eff6ff)', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ fontSize: '11px', fontWeight: 700, color: '#1e40af', margin: 0 }}>GPS-Verified Arrival & Departure Times</h3>
                      <span className={`gps-badge ${isAnyTimestampVerified ? '' : 'pending'}`} style={{ background: isAnyTimestampVerified ? '#1e40af' : '#94a3b8', color: 'white', padding: '3px 10px', borderRadius: '4px', fontSize: '9px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                        {isAnyTimestampVerified ? 'GEOFENCE VERIFIED' : 'PENDING VERIFICATION'}
                      </span>
                    </div>
                    <div className="gps-note" style={{ fontSize: '9px', color: '#64748b', padding: '6px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      Times recorded automatically via GPS geofencing technology. No manual driver input — legally verifiable timestamps.
                    </div>
                    <div className="gps-body" style={{ padding: '8px 14px' }}>
                      {pickupStops.length > 0
                        ? pickupStops.map((stop, idx) => renderStopBlock('pickup', 'Shipper / Pickup', stop, idx, pickupStops.length))
                        : renderStopBlock('pickup', 'Shipper / Pickup', null, 0, 1)
                      }
                      {deliveryStops.length > 0
                        ? deliveryStops.map((stop, idx) => renderStopBlock('delivery', 'Receiver / Delivery', stop, idx, deliveryStops.length))
                        : renderStopBlock('delivery', 'Receiver / Delivery', null, 0, 1)
                      }
                    </div>
                  </div>

                  {/* Payment Terms */}
                  <div className="payment-terms" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '10px 14px', fontSize: '10px', color: '#166534', lineHeight: 1.6 }}>
                    <strong style={{ color: '#14532d' }}>Payment Terms:</strong> Please remit payment within 30 days of invoice date. Make checks payable to: <strong>{companySettings.company_name}</strong>. Reference: Invoice {invoice.invoice_number}
                  </div>
                </div>

                {/* Footer */}
                <div className="invoice-footer" style={{ textAlign: 'center', padding: '10px 32px', fontSize: '9px', color: '#94a3b8', borderTop: '1px solid #e2e8f0' }}>
                  {companySettings.company_name} &bull; {companySettings.company_phone} &bull; {companySettings.company_email} &bull; Powered by LoadTracker PRO
                </div>
              </div>

              {/* ═══ PAGE 2+: EACH POD DOCUMENT ON ITS OWN PAGE ═══ */}
              {validDocs.map((doc, idx) => (
                <div
                  key={doc.id}
                  className="pod-page-single bg-white rounded-lg shadow-lg mt-6"
                  style={{
                    pageBreakBefore: 'always',
                    pageBreakInside: 'avoid',
                    pageBreakAfter: 'auto',
                    padding: '24px 32px',
                    height: '100vh',
                    maxHeight: '100vh',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    boxSizing: 'border-box',
                  }}
                >
                  {/* POD Page Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
                    <div>
                      <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                        POD Document {idx + 1} of {validDocs.length}
                      </h3>
                      <div className="pod-meta" style={{ fontSize: '10px', color: '#64748b', marginBottom: '10px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        <span>Invoice: <strong style={{ color: '#1e293b' }}>{invoice.invoice_number}</strong></span>
                        <span>Load: <strong style={{ color: '#1e293b' }}>{load.load_number}</strong></span>
                        <span>File: <strong style={{ color: '#1e293b' }}>{doc.file_name}</strong></span>
                      </div>
                    </div>
                    {/* Convert to PDF button (screen only) */}
                    {doc.file_type?.startsWith('image/') && (
                      <button
                        onClick={() => handleDownloadSinglePodPdf(doc)}
                        disabled={singlePodConverting === doc.id}
                        className="pod-convert-btn no-print flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 flex-shrink-0"
                        title="Convert this image to PDF"
                      >
                        {singlePodConverting === doc.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <FileImage className="w-3.5 h-3.5" />
                        )}
                        Save as PDF
                      </button>
                    )}
                  </div>

                  {/* Image Container */}
                  {doc.file_type?.startsWith('image/') ? (
                    <div
                      className="pod-image-container"
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        minHeight: 0,
                      }}
                    >
                      <img
                        src={doc.file_url}
                        alt={doc.file_name}
                        onError={() => handlePodImageError(doc.id)}
                        style={{
                          maxWidth: '100%',
                          maxHeight: '100%',
                          objectFit: 'contain',
                          border: '1px solid #e2e8f0',
                          borderRadius: '4px',
                        }}
                      />
                    </div>
                  ) : (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '20px', border: '1px solid #e2e8f0', borderRadius: '8px', textDecoration: 'none', color: '#1e293b' }}>
                        <div style={{ width: '48px', height: '48px', background: '#fee2e2', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: '14px', fontWeight: 700, color: '#dc2626' }}>PDF</span>
                        </div>
                        <div>
                          <p style={{ fontSize: '14px', fontWeight: 600 }}>{doc.file_name}</p>
                          <p style={{ fontSize: '11px', color: '#64748b' }}>Click to view document</p>
                        </div>
                      </a>
                    </div>
                  )}

                  {/* POD Page Footer */}
                  <div className="pod-footer" style={{ fontSize: '9px', color: '#94a3b8', textAlign: 'center', paddingTop: '8px', flexShrink: 0, borderTop: '1px solid #e2e8f0', marginTop: '8px' }}>
                    {companySettings.company_name} &bull; Invoice {invoice.invoice_number} &bull; POD {idx + 1} of {validDocs.length}
                  </div>
                </div>
              ))}

              {/* Broken PODs notice (screen only, not printed) */}
              {hasBrokenPods && (
                <div className="no-print mt-6 p-4 bg-red-50 border-2 border-red-200 border-dashed rounded-xl">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold text-red-800 text-sm mb-1">
                        {allPodsBroken ? 'All POD files are missing from storage' : `${brokenPodIds.size} of ${documents.length} POD file(s) are missing from storage`}
                      </p>
                      <p className="text-xs text-red-600 mb-3">
                        These broken files are excluded from print. Delete the broken records and have the driver re-upload from the Driver Portal.
                      </p>
                      <div className="space-y-2 mb-3">
                        {documents.filter(d => brokenPodIds.has(d.id)).map(doc => (
                          <div key={doc.id} className="flex items-center gap-2 text-xs text-red-600">
                            <ImageOff className="w-3.5 h-3.5" />
                            <span className="font-medium">{doc.file_name}</span>
                            <span className="text-red-400">-- file missing</span>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => setShowReuploadConfirm(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">
                        <RotateCcw className="w-4 h-4" />Re-upload POD Documents
                      </button>
                    </div>
                  </div>
                </div>
              )}

              </div>
            </>
          )}
        </div>


        {/* Footer — just Close */}
        <div className="px-4 sm:px-6 py-3 bg-white border-t border-slate-200 rounded-b-2xl flex justify-end">
          <button onClick={onClose} className="px-6 py-2.5 text-slate-600 bg-white border border-slate-200 rounded-xl font-medium hover:bg-slate-50 transition-colors text-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default InvoicePreviewModal;
