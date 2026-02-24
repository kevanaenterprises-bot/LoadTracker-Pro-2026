
import React, { useState, useRef, useCallback } from 'react';
import { X, Upload, FileText, Loader2, Camera, Eye, EyeOff, CheckCircle2, AlertTriangle, Copy, ChevronDown, ChevronUp, Zap, ChevronLeft, ChevronRight, FileImage, Brain, Sparkles, BookOpen, TrendingUp, Save, Mail, Building2, Truck, MapPin, Clock, Hash, DollarSign, Package } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { pdfToImages, type PdfPageImage } from '@/lib/pdfToImages';

interface ScanRateConModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFieldsExtracted: (fields: ExtractedFields) => void;
}

export interface ExtractedFields {
  // Broker / Customer
  broker_name: string;
  broker_address: string;
  broker_city: string;
  broker_state: string;
  broker_zip: string;
  broker_email: string;

  // Shipper (Pickup)
  shipper_name: string;
  shipper_address: string;
  shipper_city: string;
  shipper_state: string;
  shipper_zip: string;

  // Receiver (Delivery)
  receiver_name: string;
  receiver_address: string;
  receiver_city: string;
  receiver_state: string;
  receiver_zip: string;

  // Schedule
  pickup_date: string;
  pickup_time: string;
  delivery_date: string;
  delivery_time: string;

  // Reference Numbers
  pickup_number: string;
  delivery_number: string;
  load_number: string;
  rate_con_number: string;

  // Financial
  rate: string;

  // Extras
  weight: string;
  cargo_description: string;

  // Raw
  raw_text: string;
}

interface LearningMetadata {
  matched_customer: string | null;
  applied_patterns: string[];
  pattern_count: number;
  correction_count: number;
}

const EMPTY_FIELDS: ExtractedFields = {
  broker_name: '', broker_address: '', broker_city: '', broker_state: '', broker_zip: '', broker_email: '',
  shipper_name: '', shipper_address: '', shipper_city: '', shipper_state: '', shipper_zip: '',
  receiver_name: '', receiver_address: '', receiver_city: '', receiver_state: '', receiver_zip: '',
  pickup_date: '', pickup_time: '', delivery_date: '', delivery_time: '',
  pickup_number: '', delivery_number: '',
  load_number: '', rate_con_number: '',
  rate: '', weight: '', cargo_description: '',
  raw_text: '',
};

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
];

function mergeFields(a: ExtractedFields, b: ExtractedFields): ExtractedFields {
  const merged = { ...EMPTY_FIELDS };
  const keys = Object.keys(EMPTY_FIELDS) as (keyof ExtractedFields)[];
  for (const key of keys) {
    if (key === 'raw_text') {
      merged.raw_text = [a.raw_text, b.raw_text].filter(Boolean).join('\n\n--- PAGE BREAK ---\n\n');
    } else {
      merged[key] = (a[key] && a[key].trim()) ? a[key] : b[key];
    }
  }
  return merged;
}

function mergeLearning(a: LearningMetadata | null, b: LearningMetadata | null): LearningMetadata {
  if (!a && !b) return { matched_customer: null, applied_patterns: [], pattern_count: 0, correction_count: 0 };
  if (!a) return b!;
  if (!b) return a;
  return {
    matched_customer: a.matched_customer || b.matched_customer,
    applied_patterns: [...new Set([...a.applied_patterns, ...b.applied_patterns])],
    pattern_count: Math.max(a.pattern_count, b.pattern_count),
    correction_count: Math.max(a.correction_count, b.correction_count),
  };
}

const FIELD_LABELS: Record<string, string> = {
  broker_name: 'Broker Company',
  broker_address: 'Broker Address',
  broker_city: 'Broker City',
  broker_state: 'Broker State',
  broker_zip: 'Broker ZIP',
  broker_email: 'POD Email',
  shipper_name: 'Shipper Name',
  shipper_address: 'Shipper Address',
  shipper_city: 'Shipper City',
  shipper_state: 'Shipper State',
  shipper_zip: 'Shipper ZIP',
  receiver_name: 'Receiver Name',
  receiver_address: 'Receiver Address',
  receiver_city: 'Receiver City',
  receiver_state: 'Receiver State',
  receiver_zip: 'Receiver ZIP',
  pickup_date: 'Pickup Date',
  pickup_time: 'Pickup Time',
  delivery_date: 'Delivery Date',
  delivery_time: 'Delivery Time',
  pickup_number: 'Pickup Conf #',
  delivery_number: 'Delivery Conf #',
  load_number: 'Load Number',
  rate_con_number: 'Rate Con Number',
  rate: 'Rate',
  weight: 'Weight',
  cargo_description: 'Cargo Description',
};

const ScanRateConModal: React.FC<ScanRateConModalProps> = ({ isOpen, onClose, onFieldsExtracted }) => {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<ExtractedFields>(EMPTY_FIELDS);
  const [hasResults, setHasResults] = useState(false);
  const [showRawText, setShowRawText] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [dragActive, setDragActive] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // PDF state
  const [pdfPages, setPdfPages] = useState<PdfPageImage[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [scanProgress, setScanProgress] = useState('');
  const [isPdf, setIsPdf] = useState(false);

  // Learning state
  const [originalFields, setOriginalFields] = useState<ExtractedFields>(EMPTY_FIELDS);
  const [learningMeta, setLearningMeta] = useState<LearningMetadata | null>(null);
  const [savingPatterns, setSavingPatterns] = useState(false);
  const [patternsSaved, setPatternsSaved] = useState(false);
  const [showLearningDetails, setShowLearningDetails] = useState(false);

  const resetState = () => {
    setScanning(false); setError(''); setFields(EMPTY_FIELDS); setHasResults(false);
    setShowRawText(false); setPreviewUrl(''); setDragActive(false); setCharCount(0);
    setPdfPages([]); setCurrentPageIndex(0); setScanProgress(''); setIsPdf(false);
    setOriginalFields(EMPTY_FIELDS); setLearningMeta(null); setSavingPatterns(false);
    setPatternsSaved(false); setShowLearningDetails(false);
  };

  const handleClose = () => { resetState(); onClose(); };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const scanSingleImage = async (imageDataUrl: string, mimeType: string) => {
    const { data, error: fnError } = await supabase.functions.invoke('scan-rate-con', {
      body: { image_base64: imageDataUrl, mime_type: mimeType },
    });
    if (fnError) throw new Error(fnError.message || 'Failed to scan rate confirmation');
    if (data?.error) throw new Error(data.error);
    if (!data?.fields) throw new Error('No fields extracted from the image');
    return {
      fields: data.fields as ExtractedFields,
      charCount: data.char_count || 0,
      learning: data.learning as LearningMetadata | null,
    };
  };

  const processPdf = async (file: File) => {
    setIsPdf(true); setScanning(true);
    setScanProgress('Converting PDF pages to images...');
    try {
      const pages = await pdfToImages(file, {
        scale: 2.5, maxPages: 10,
        onProgress: (current, total) => setScanProgress(`Rendering page ${current} of ${total}...`),
      });
      if (!pages.length) throw new Error('PDF has no pages');
      setPdfPages(pages); setPreviewUrl(pages[0].dataUrl); setCurrentPageIndex(0);

      let mergedFields: ExtractedFields = { ...EMPTY_FIELDS };
      let totalCharCount = 0;
      let mergedLearning: LearningMetadata | null = null;

      for (let i = 0; i < pages.length; i++) {
        setScanProgress(pages.length === 1 ? 'Scanning with Google Vision OCR...' : `Scanning page ${i + 1} of ${pages.length} with Google Vision OCR...`);
        try {
          const result = await scanSingleImage(pages[i].dataUrl, 'image/png');
          mergedFields = mergeFields(mergedFields, result.fields);
          totalCharCount += result.charCount;
          mergedLearning = mergeLearning(mergedLearning, result.learning);
        } catch (pageErr: any) {
          console.warn(`OCR failed for page ${i + 1}:`, pageErr.message);
          if (pages.length === 1) throw pageErr;
        }
      }

      setFields(mergedFields); setOriginalFields({ ...mergedFields });
      setCharCount(totalCharCount); setLearningMeta(mergedLearning); setHasResults(true);
    } catch (err: any) {
      console.error('PDF scan error:', err);
      setError(err.message || 'Failed to scan PDF.');
    } finally { setScanning(false); setScanProgress(''); }
  };

  const processImage = async (file: File) => {
    setIsPdf(false); setScanning(true);
    try {
      const base64Data = await fileToBase64(file);
      setPreviewUrl(base64Data);
      setScanProgress('Scanning with Google Vision OCR...');
      const result = await scanSingleImage(base64Data, file.type);
      setFields(result.fields); setOriginalFields({ ...result.fields });
      setCharCount(result.charCount); setLearningMeta(result.learning || null); setHasResults(true);
    } catch (err: any) {
      console.error('Scan error:', err);
      setError(err.message || 'Failed to scan rate confirmation.');
    } finally { setScanning(false); setScanProgress(''); }
  };

  const processFile = async (file: File) => {
    setError(''); setHasResults(false); setPdfPages([]); setLearningMeta(null); setPatternsSaved(false);
    const validImageTypes = ['image/jpeg','image/jpg','image/png','image/webp','image/tiff','image/bmp','image/gif'];
    const isPdfFile = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdfFile && !validImageTypes.includes(file.type)) {
      setError(`Unsupported file type: ${file.type || 'unknown'}. Upload a PDF or image.`);
      return;
    }
    const maxSize = isPdfFile ? 20 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) { setError(`File too large. Max ${isPdfFile ? '20MB' : '10MB'}.`); return; }
    if (isPdfFile) await processPdf(file); else await processImage(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    if (e.target) e.target.value = '';
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, []);

  const handleUseFields = async () => {
    const brokerName = fields.broker_name?.trim();
    const correctedFieldNames: string[] = [];
    const fieldKeys = Object.keys(EMPTY_FIELDS).filter(k => k !== 'raw_text') as (keyof ExtractedFields)[];
    for (const key of fieldKeys) {
      const orig = (originalFields[key] || '').trim();
      const current = (fields[key] || '').trim();
      if (current && current !== orig) correctedFieldNames.push(key);
    }

    if (brokerName && correctedFieldNames.length > 0) {
      setSavingPatterns(true);
      try {
        const { error: saveErr } = await supabase.functions.invoke('save-ocr-patterns', {
          body: { customer_name: brokerName, raw_text: fields.raw_text, original_fields: originalFields, corrected_fields: fields },
        });
        if (saveErr) console.warn('Failed to save OCR patterns:', saveErr);
        else setPatternsSaved(true);
      } catch (err) { console.warn('Error saving OCR patterns:', err); }
      setSavingPatterns(false);
    }

    onFieldsExtracted(fields);
    handleClose();
  };

  const updateField = (key: keyof ExtractedFields, value: string) => {
    setFields(prev => ({ ...prev, [key]: value }));
  };

  const copyRawText = () => { navigator.clipboard.writeText(fields.raw_text).catch(() => {}); };

  const filledCount = Object.entries(fields).filter(([k]) => k !== 'raw_text').filter(([, v]) => v && v.trim().length > 0).length;
  const totalFieldCount = Object.keys(EMPTY_FIELDS).filter(k => k !== 'raw_text').length;

  const correctionCount = Object.keys(EMPTY_FIELDS).filter(k => k !== 'raw_text').filter(k => {
    const orig = (originalFields[k as keyof ExtractedFields] || '').trim();
    const current = (fields[k as keyof ExtractedFields] || '').trim();
    return current && current !== orig;
  }).length;

  const goToPage = (index: number) => {
    if (index >= 0 && index < pdfPages.length) { setCurrentPageIndex(index); setPreviewUrl(pdfPages[index].dataUrl); }
  };

  const getFieldIndicator = (fieldName: string): { className: string; tooltip: string; icon: 'ocr' | 'learned' | 'corrected' | 'empty' } => {
    const currentValue = (fields[fieldName as keyof ExtractedFields] || '').trim();
    const originalValue = (originalFields[fieldName as keyof ExtractedFields] || '').trim();
    if (!currentValue) return { className: 'border-slate-200', tooltip: 'Not detected', icon: 'empty' };
    if (currentValue !== originalValue) return { className: 'border-amber-400 bg-amber-50/50 ring-1 ring-amber-200', tooltip: 'Manually corrected', icon: 'corrected' };
    if (learningMeta?.applied_patterns?.includes(fieldName)) return { className: 'border-violet-400 bg-violet-50/50 ring-1 ring-violet-200', tooltip: `Improved by learned pattern`, icon: 'learned' };
    return { className: 'border-emerald-300 bg-emerald-50/50', tooltip: 'Auto-detected by OCR', icon: 'ocr' };
  };

  const FieldBadge: React.FC<{ fieldName: string }> = ({ fieldName }) => {
    const indicator = getFieldIndicator(fieldName);
    if (indicator.icon === 'empty') return null;
    if (indicator.icon === 'learned') return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded text-[10px] font-medium" title={indicator.tooltip}>
        <Brain className="w-3 h-3" /> Learned
      </span>
    );
    if (indicator.icon === 'corrected') return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-medium" title={indicator.tooltip}>
        <TrendingUp className="w-3 h-3" /> Corrected
      </span>
    );
    return null;
  };

  /** Reusable text input */
  const FieldInput: React.FC<{ field: keyof ExtractedFields; placeholder?: string; type?: string }> = ({ field, placeholder, type }) => (
    <input
      type={type || 'text'}
      value={fields[field]}
      onChange={(e) => updateField(field, e.target.value)}
      className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-all ${getFieldIndicator(field).className}`}
      placeholder={placeholder || 'Not detected'}
    />
  );

  /** Reusable state select */
  const StateSelect: React.FC<{ field: keyof ExtractedFields; ringColor?: string }> = ({ field, ringColor }) => (
    <select
      value={fields[field]}
      onChange={(e) => updateField(field, e.target.value)}
      className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 ${ringColor || 'focus:ring-violet-500'} focus:border-violet-500 transition-all ${getFieldIndicator(field).className}`}
    >
      <option value="">--</option>
      {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[94vh] overflow-hidden m-4 flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-violet-600 to-purple-700 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg"><Camera className="w-5 h-5 text-white" /></div>
            <div>
              <h2 className="text-lg font-bold text-white">Scan Rate Confirmation</h2>
              <p className="text-xs text-violet-200">Upload a rate con to auto-extract broker, shipper, receiver, schedule & pay details</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {learningMeta?.matched_customer && (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-white/15 rounded-lg border border-white/20">
                <Brain className="w-4 h-4 text-violet-200" />
                <span className="text-xs text-white font-medium">AI-enhanced for <span className="text-violet-200">{learningMeta.matched_customer}</span></span>
              </div>
            )}
            <button onClick={handleClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors"><X className="w-5 h-5 text-white" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl mb-6">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">Scan Error</p>
                <p className="text-sm text-red-600 mt-0.5">{error}</p>
              </div>
              <button onClick={() => setError('')} className="p-1 hover:bg-red-100 rounded"><X className="w-4 h-4 text-red-400" /></button>
            </div>
          )}

          {/* Upload Area */}
          {!hasResults && !scanning && (
            <div
              onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${dragActive ? 'border-violet-500 bg-violet-50' : 'border-slate-300 hover:border-violet-400 hover:bg-violet-50/50'}`}
            >
              <input ref={fileInputRef} type="file" accept="image/*,.pdf,application/pdf" onChange={handleFileSelect} className="hidden" />
              <div className="flex flex-col items-center gap-4">
                <div className={`p-4 rounded-2xl ${dragActive ? 'bg-violet-100' : 'bg-slate-100'}`}>
                  <Upload className={`w-10 h-10 ${dragActive ? 'text-violet-600' : 'text-slate-400'}`} />
                </div>
                <div>
                  <p className="text-lg font-semibold text-slate-700">{dragActive ? 'Drop your rate con here' : 'Upload Rate Confirmation'}</p>
                  <p className="text-sm text-slate-500 mt-1">Drag & drop a file, or click to browse</p>
                  <div className="flex items-center justify-center gap-3 mt-3">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-700 rounded-full text-xs font-medium"><FileText className="w-3.5 h-3.5" />PDF</span>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium"><FileImage className="w-3.5 h-3.5" />JPG</span>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium"><FileImage className="w-3.5 h-3.5" />PNG</span>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-medium"><FileImage className="w-3.5 h-3.5" />WebP / TIFF</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">PDF up to 20MB (10 pages max) &middot; Images up to 10MB</p>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <div className="h-px bg-slate-200 w-16"></div><span className="text-xs text-slate-400">or</span><div className="h-px bg-slate-200 w-16"></div>
                </div>
                <button type="button" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }} className="px-6 py-2.5 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 transition-colors">Browse Files</button>
              </div>
            </div>
          )}

          {/* Scanning */}
          {scanning && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="relative">
                <div className="w-20 h-20 border-4 border-violet-200 rounded-full"></div>
                <div className="absolute inset-0 w-20 h-20 border-4 border-violet-600 rounded-full border-t-transparent animate-spin"></div>
                <Zap className="absolute inset-0 m-auto w-8 h-8 text-violet-600" />
              </div>
              <p className="text-lg font-semibold text-slate-700 mt-6">{isPdf ? 'Processing PDF...' : 'Scanning Rate Confirmation...'}</p>
              <p className="text-sm text-slate-500 mt-1">{scanProgress || 'Google Vision is extracting text from your document'}</p>
              {isPdf && pdfPages.length > 0 && (
                <div className="mt-6 flex items-center gap-2 overflow-x-auto max-w-full px-4">
                  {pdfPages.map((page) => (
                    <div key={page.pageNumber} className="flex-shrink-0 border-2 border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm" style={{ width: 80 }}>
                      <img src={page.dataUrl} alt={`Page ${page.pageNumber}`} className="w-full h-auto object-contain" style={{ maxHeight: 110 }} />
                      <div className="text-center text-[10px] text-slate-500 py-0.5 bg-slate-50 border-t border-slate-100">Pg {page.pageNumber}</div>
                    </div>
                  ))}
                </div>
              )}
              {!isPdf && previewUrl && (
                <div className="mt-6 max-w-xs">
                  <img src={previewUrl} alt="Rate con preview" className="rounded-xl shadow-lg border border-slate-200 max-h-48 object-contain mx-auto" />
                </div>
              )}
            </div>
          )}

          {/* Results */}
          {hasResults && (
            <div className="space-y-5">
              {/* Success Banner */}
              <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-emerald-800">
                    Scan Complete — {charCount.toLocaleString()} characters extracted
                    {isPdf && pdfPages.length > 1 && ` from ${pdfPages.length} pages`}
                  </p>
                  <p className="text-xs text-emerald-600 mt-0.5">{filledCount} of {totalFieldCount} fields auto-detected. Review and edit below.</p>
                </div>
                <button onClick={() => { setHasResults(false); setPreviewUrl(''); setFields(EMPTY_FIELDS); setOriginalFields(EMPTY_FIELDS); setPdfPages([]); setCurrentPageIndex(0); setIsPdf(false); setLearningMeta(null); setPatternsSaved(false); }} className="px-3 py-1.5 text-sm bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors">Scan Another</button>
              </div>

              {/* Learning Banner */}
              {learningMeta?.matched_customer && (
                <div className="border border-violet-200 rounded-xl overflow-hidden">
                  <button onClick={() => setShowLearningDetails(!showLearningDetails)} className="w-full flex items-center gap-3 p-4 bg-gradient-to-r from-violet-50 to-purple-50 hover:from-violet-100 hover:to-purple-100 transition-colors">
                    <div className="p-2 bg-violet-100 rounded-lg"><Brain className="w-5 h-5 text-violet-600" /></div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-semibold text-violet-800">AI Learning Active — Recognized "{learningMeta.matched_customer}"</p>
                      <p className="text-xs text-violet-600 mt-0.5">
                        {learningMeta.applied_patterns.length > 0
                          ? `${learningMeta.applied_patterns.length} field${learningMeta.applied_patterns.length > 1 ? 's' : ''} improved using ${learningMeta.correction_count} previous correction${learningMeta.correction_count > 1 ? 's' : ''}`
                          : `${learningMeta.pattern_count} learned pattern${learningMeta.pattern_count > 1 ? 's' : ''} available`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {learningMeta.applied_patterns.length > 0 && <span className="px-2 py-1 bg-violet-200 text-violet-800 rounded-full text-xs font-bold">{learningMeta.applied_patterns.length} improved</span>}
                      {showLearningDetails ? <ChevronUp className="w-4 h-4 text-violet-400" /> : <ChevronDown className="w-4 h-4 text-violet-400" />}
                    </div>
                  </button>
                  {showLearningDetails && (
                    <div className="p-4 bg-white border-t border-violet-100">
                      <div className="grid grid-cols-3 gap-3">
                        <div className="p-3 bg-violet-50 rounded-lg"><p className="text-xs text-violet-500 font-medium">Customer</p><p className="text-sm font-semibold text-violet-800 mt-0.5">{learningMeta.matched_customer}</p></div>
                        <div className="p-3 bg-violet-50 rounded-lg"><p className="text-xs text-violet-500 font-medium">Stored Patterns</p><p className="text-sm font-semibold text-violet-800 mt-0.5">{learningMeta.pattern_count} fields</p></div>
                        <div className="p-3 bg-violet-50 rounded-lg"><p className="text-xs text-violet-500 font-medium">Total Corrections</p><p className="text-sm font-semibold text-violet-800 mt-0.5">{learningMeta.correction_count}</p></div>
                      </div>
                      {learningMeta.applied_patterns.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs text-violet-600 font-medium mb-2">Fields improved by learned patterns:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {learningMeta.applied_patterns.map(field => (
                              <span key={field} className="inline-flex items-center gap-1 px-2 py-1 bg-violet-100 text-violet-700 rounded-md text-xs font-medium"><Sparkles className="w-3 h-3" />{FIELD_LABELS[field] || field}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Correction tracking */}
              {correctionCount > 0 && (
                <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <BookOpen className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <p className="text-xs text-amber-700">
                    <span className="font-semibold">{correctionCount} field{correctionCount > 1 ? 's' : ''} corrected.</span>
                    {fields.broker_name?.trim()
                      ? ` Patterns will be saved for "${fields.broker_name.trim()}" to improve future scans.`
                      : ' Enter a broker name to save corrections as learned patterns.'}
                  </p>
                </div>
              )}

              {/* Field legend */}
              <div className="flex flex-wrap items-center gap-3 text-[11px]">
                <span className="text-slate-500 font-medium">Field colors:</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded border-2 border-emerald-400 bg-emerald-50"></span><span className="text-slate-600">OCR detected</span></span>
                <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded border-2 border-violet-400 bg-violet-50"></span><span className="text-slate-600">Learned pattern</span></span>
                <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded border-2 border-amber-400 bg-amber-50"></span><span className="text-slate-600">Manually corrected</span></span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column - Preview + Raw Text */}
                <div className="space-y-4">
                  {previewUrl && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700 mb-2">
                        {isPdf ? 'PDF Preview' : 'Uploaded Image'}
                        {isPdf && pdfPages.length > 1 && <span className="ml-2 text-xs font-normal text-slate-500">Page {currentPageIndex + 1} of {pdfPages.length}</span>}
                      </h3>
                      <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                        <img src={previewUrl} alt={isPdf ? `PDF page ${currentPageIndex + 1}` : 'Rate con'} className="w-full object-contain max-h-[400px]" />
                      </div>
                      {isPdf && pdfPages.length > 1 && (
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => goToPage(currentPageIndex - 1)} disabled={currentPageIndex === 0} className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"><ChevronLeft className="w-4 h-4 text-slate-600" /></button>
                            <span className="text-sm text-slate-600 font-medium min-w-[80px] text-center">Page {currentPageIndex + 1} of {pdfPages.length}</span>
                            <button onClick={() => goToPage(currentPageIndex + 1)} disabled={currentPageIndex === pdfPages.length - 1} className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"><ChevronRight className="w-4 h-4 text-slate-600" /></button>
                          </div>
                          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 px-1">
                            {pdfPages.map((page, idx) => (
                              <button key={page.pageNumber} onClick={() => goToPage(idx)} className={`flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${idx === currentPageIndex ? 'border-violet-500 shadow-md ring-1 ring-violet-300' : 'border-slate-200 hover:border-slate-300'}`} style={{ width: 56 }}>
                                <img src={page.dataUrl} alt={`Page ${page.pageNumber}`} className="w-full h-auto object-contain" style={{ maxHeight: 72 }} />
                                <div className={`text-center text-[9px] py-0.5 border-t ${idx === currentPageIndex ? 'bg-violet-50 text-violet-700 border-violet-200 font-semibold' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>{page.pageNumber}</div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Raw Text */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <button onClick={() => setShowRawText(!showRawText)} className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors">
                      <div className="flex items-center gap-2">
                        {showRawText ? <EyeOff className="w-4 h-4 text-slate-500" /> : <Eye className="w-4 h-4 text-slate-500" />}
                        <span className="text-sm font-medium text-slate-700">{showRawText ? 'Hide' : 'Show'} Raw OCR Text</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={(e) => { e.stopPropagation(); copyRawText(); }} className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors" title="Copy raw text"><Copy className="w-3.5 h-3.5 text-slate-500" /></button>
                        {showRawText ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </div>
                    </button>
                    {showRawText && (
                      <div className="p-4 bg-white max-h-64 overflow-y-auto">
                        <pre className="text-xs text-slate-600 whitespace-pre-wrap font-mono leading-relaxed">{fields.raw_text}</pre>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column - Extracted Fields Template */}
                <div className="space-y-5">

                  {/* ===== REFERENCE NUMBERS ===== */}
                  <div className="border border-indigo-200 rounded-xl p-4 bg-indigo-50/30">
                    <h4 className="text-sm font-bold text-indigo-700 mb-3 flex items-center gap-2">
                      <Hash className="w-4 h-4" /> Reference Numbers
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-slate-600">Load Number</label>
                          <FieldBadge fieldName="load_number" />
                        </div>
                        <FieldInput field="load_number" placeholder="Load / BOL #" />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-slate-600">Rate Con Number</label>
                          <FieldBadge fieldName="rate_con_number" />
                        </div>
                        <FieldInput field="rate_con_number" placeholder="Rate Con / Confirmation #" />
                      </div>
                    </div>
                  </div>

                  {/* ===== BROKER / CUSTOMER ===== */}
                  <div className="border border-purple-200 rounded-xl p-4 bg-purple-50/30">
                    <h4 className="text-sm font-bold text-purple-700 mb-3 flex items-center gap-2">
                      <Building2 className="w-4 h-4" /> Broker / Customer
                    </h4>
                    <div className="space-y-2.5">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-slate-600">Company Name</label>
                          <FieldBadge fieldName="broker_name" />
                        </div>
                        <FieldInput field="broker_name" placeholder="Broker company name" />
                        {!fields.broker_name?.trim() && correctionCount > 0 && (
                          <p className="text-[11px] text-amber-600 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Enter broker name to save corrections as learned patterns</p>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-slate-600">Address</label>
                          <FieldBadge fieldName="broker_address" />
                        </div>
                        <FieldInput field="broker_address" placeholder="Street address" />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">City</label>
                          <FieldInput field="broker_city" placeholder="City" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">State</label>
                          <StateSelect field="broker_state" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">ZIP</label>
                          <FieldInput field="broker_zip" placeholder="ZIP" />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-slate-600 flex items-center gap-1"><Mail className="w-3 h-3 text-purple-500" />POD / Billing Email</label>
                          <FieldBadge fieldName="broker_email" />
                        </div>
                        <FieldInput field="broker_email" placeholder="email@broker.com" type="email" />
                      </div>
                    </div>
                  </div>

                  {/* ===== SHIPPER (PICKUP) ===== */}
                  <div className="border border-blue-200 rounded-xl p-4 bg-blue-50/30">
                    <h4 className="text-sm font-bold text-blue-700 mb-3 flex items-center gap-2">
                      <Truck className="w-4 h-4" /> Shipper — Pickup
                    </h4>
                    <div className="space-y-2.5">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-slate-600">Company Name</label>
                          <FieldBadge fieldName="shipper_name" />
                        </div>
                        <FieldInput field="shipper_name" placeholder="Shipper company" />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-slate-600">Address</label>
                          <FieldBadge fieldName="shipper_address" />
                        </div>
                        <FieldInput field="shipper_address" placeholder="Street address" />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">City</label>
                          <FieldInput field="shipper_city" placeholder="City" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">State</label>
                          <StateSelect field="shipper_state" ringColor="focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">ZIP</label>
                          <FieldInput field="shipper_zip" placeholder="ZIP" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-xs font-medium text-slate-600 flex items-center gap-1"><Clock className="w-3 h-3 text-blue-500" />Pickup Date</label>
                            <FieldBadge fieldName="pickup_date" />
                          </div>
                          <FieldInput field="pickup_date" type="date" />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-xs font-medium text-slate-600 flex items-center gap-1"><Clock className="w-3 h-3 text-blue-500" />Pickup Time</label>
                            <FieldBadge fieldName="pickup_time" />
                          </div>
                          <FieldInput field="pickup_time" type="time" />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-slate-600">Pickup Confirmation #</label>
                          <FieldBadge fieldName="pickup_number" />
                        </div>
                        <FieldInput field="pickup_number" placeholder="PU confirmation number" />
                      </div>
                    </div>
                  </div>

                  {/* ===== RECEIVER (DELIVERY) ===== */}
                  <div className="border border-emerald-200 rounded-xl p-4 bg-emerald-50/30">
                    <h4 className="text-sm font-bold text-emerald-700 mb-3 flex items-center gap-2">
                      <MapPin className="w-4 h-4" /> Receiver — Delivery
                    </h4>
                    <div className="space-y-2.5">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-slate-600">Company Name</label>
                          <FieldBadge fieldName="receiver_name" />
                        </div>
                        <FieldInput field="receiver_name" placeholder="Receiver company" />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-slate-600">Address</label>
                          <FieldBadge fieldName="receiver_address" />
                        </div>
                        <FieldInput field="receiver_address" placeholder="Street address" />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">City</label>
                          <FieldInput field="receiver_city" placeholder="City" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">State</label>
                          <StateSelect field="receiver_state" ringColor="focus:ring-emerald-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">ZIP</label>
                          <FieldInput field="receiver_zip" placeholder="ZIP" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-xs font-medium text-slate-600 flex items-center gap-1"><Clock className="w-3 h-3 text-emerald-500" />Delivery Date</label>
                            <FieldBadge fieldName="delivery_date" />
                          </div>
                          <FieldInput field="delivery_date" type="date" />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-xs font-medium text-slate-600 flex items-center gap-1"><Clock className="w-3 h-3 text-emerald-500" />Delivery Time</label>
                            <FieldBadge fieldName="delivery_time" />
                          </div>
                          <FieldInput field="delivery_time" type="time" />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-slate-600">Delivery Confirmation #</label>
                          <FieldBadge fieldName="delivery_number" />
                        </div>
                        <FieldInput field="delivery_number" placeholder="Delivery / Appt confirmation #" />
                      </div>
                    </div>
                  </div>

                  {/* ===== RATE & EXTRAS ===== */}
                  <div className="border border-amber-200 rounded-xl p-4 bg-amber-50/30">
                    <h4 className="text-sm font-bold text-amber-700 mb-3 flex items-center gap-2">
                      <DollarSign className="w-4 h-4" /> Rate & Cargo
                    </h4>
                    <div className="space-y-2.5">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-slate-600">Rate / Total Pay ($)</label>
                          <FieldBadge fieldName="rate" />
                        </div>
                        <FieldInput field="rate" placeholder="0.00" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-xs font-medium text-slate-600">Weight (lbs)</label>
                            <FieldBadge fieldName="weight" />
                          </div>
                          <FieldInput field="weight" placeholder="Weight" />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-xs font-medium text-slate-600">Cargo Description</label>
                            <FieldBadge fieldName="cargo_description" />
                          </div>
                          <FieldInput field="cargo_description" placeholder="Commodity" />
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {hasResults && (
          <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-500">
                <span className="font-medium text-emerald-600">{filledCount} fields</span> auto-detected
                {learningMeta?.applied_patterns && learningMeta.applied_patterns.length > 0 && (
                  <span className="ml-1 text-violet-600 font-medium">({learningMeta.applied_patterns.length} AI-improved)</span>
                )}
                {correctionCount > 0 && <span className="ml-1 text-amber-600 font-medium">&middot; {correctionCount} corrected</span>}
                {isPdf && pdfPages.length > 1 && <span className="ml-1 text-violet-600">({pdfPages.length}-page PDF)</span>}
              </p>
              {correctionCount > 0 && fields.broker_name?.trim() && (
                <p className="text-[10px] text-violet-500 mt-0.5 flex items-center gap-1"><Save className="w-3 h-3" />Corrections will be learned for "{fields.broker_name.trim()}"</p>
              )}
            </div>
            <div className="flex gap-3 flex-shrink-0">
              <button onClick={handleClose} className="px-5 py-2.5 text-slate-600 bg-slate-100 rounded-xl font-medium hover:bg-slate-200 transition-colors">Cancel</button>
              <button onClick={handleUseFields} disabled={savingPatterns} className="px-6 py-2.5 text-white bg-violet-600 rounded-xl font-medium hover:bg-violet-700 transition-colors flex items-center gap-2 disabled:opacity-70">
                {savingPatterns ? (<><Loader2 className="w-4 h-4 animate-spin" />Saving Patterns...</>) : (<><FileText className="w-4 h-4" />Use These Fields</>)}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScanRateConModal;
