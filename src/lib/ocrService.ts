/**
 * OCR Service for Rate Confirmation Scanning
 * 
 * This service integrates with Google Cloud Vision API to extract text from
 * rate confirmation documents and parse them into structured data.
 */

import { supabase } from './supabase';

const VISION_API_ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';

// Type definitions for parsed rate confirmation data
export interface ParsedRateConData {
  load_number?: string;
  pickup_date?: string;
  delivery_date?: string;
  pickup_company?: string;
  pickup_address?: string;
  pickup_city?: string;
  pickup_state?: string;
  pickup_zip?: string;
  delivery_company?: string;
  delivery_address?: string;
  delivery_city?: string;
  delivery_state?: string;
  delivery_zip?: string;
  rate?: number;
  weight?: string;
  cargo_description?: string;
  customer_name?: string;
  confidence_scores?: {
    [key: string]: number;
  };
}

export interface OcrTrainingData {
  load_id: string;
  original_text: string;
  extracted_data: ParsedRateConData;
  corrected_data: ParsedRateConData;
  file_url?: string;
  file_type?: string;
  confidence_scores?: { [key: string]: number };
}

/**
 * Convert a file to base64 string
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

/**
 * Extract text from an image using Google Cloud Vision API
 */
export async function extractTextFromImage(file: File): Promise<string> {
  const apiKey = import.meta.env.VITE_GOOGLE_CLOUD_VISION_API_KEY;
  
  if (!apiKey || apiKey === 'your_api_key_here') {
    throw new Error('Google Cloud Vision API key is not configured. Please add VITE_GOOGLE_CLOUD_VISION_API_KEY to your .env file.');
  }

  // Convert file to base64
  const base64 = await fileToBase64(file);
  
  // Call Vision API
  const response = await fetch(`${VISION_API_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        image: { content: base64.split(',')[1] },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
      }]
    })
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Vision API error: ${response.statusText}. ${JSON.stringify(errorData)}`);
  }
  
  const result = await response.json();
  
  if (result.responses?.[0]?.error) {
    throw new Error(`Vision API error: ${result.responses[0].error.message}`);
  }
  
  return result.responses[0]?.fullTextAnnotation?.text || '';
}

/**
 * Parse extracted text into structured rate confirmation data
 */
export async function parseRateConfirmation(text: string): Promise<ParsedRateConData> {
  const parsed: ParsedRateConData = {
    confidence_scores: {}
  };

  // Normalize text for parsing
  const normalizedText = text.replace(/\r\n/g, '\n');
  const lines = normalizedText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Get training patterns to improve accuracy
  const trainingPatterns = await getTrainingPatterns();

  // Parse load number
  const loadNumberPatterns = [
    /(?:load\s*#?|ref\s*#?|bol\s*#?|pro\s*#?)\s*:?\s*([A-Z0-9\-]+)/i,
    /^#?([A-Z0-9]{4,})/,
    /\b([A-Z]{2,}\d{4,})\b/,
  ];
  
  for (const pattern of loadNumberPatterns) {
    const match = text.match(pattern);
    if (match) {
      parsed.load_number = match[1];
      parsed.confidence_scores!.load_number = 0.8;
      break;
    }
  }

  // Parse dates
  const datePatterns = [
    /(?:pickup|pick[\s-]?up|origin).*?(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}).*?(?:pickup|pick[\s-]?up|origin)/i,
  ];
  
  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      parsed.pickup_date = normalizeDate(match[1]);
      parsed.confidence_scores!.pickup_date = 0.7;
      break;
    }
  }

  const deliveryDatePatterns = [
    /(?:delivery|deliver|destination).*?(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
    /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}).*?(?:delivery|deliver|destination)/i,
  ];
  
  for (const pattern of deliveryDatePatterns) {
    const match = text.match(pattern);
    if (match) {
      parsed.delivery_date = normalizeDate(match[1]);
      parsed.confidence_scores!.delivery_date = 0.7;
      break;
    }
  }

  // Parse addresses (City, State ZIP pattern)
  const addressPattern = /([A-Za-z\s]+),\s*([A-Z]{2})\s*(\d{5})/g;
  const addressMatches = [...text.matchAll(addressPattern)];
  
  if (addressMatches.length >= 1) {
    // First address is likely pickup
    parsed.pickup_city = addressMatches[0][1].trim();
    parsed.pickup_state = addressMatches[0][2];
    parsed.pickup_zip = addressMatches[0][3];
    parsed.confidence_scores!.pickup_location = 0.75;
  }
  
  if (addressMatches.length >= 2) {
    // Second address is likely delivery
    parsed.delivery_city = addressMatches[1][1].trim();
    parsed.delivery_state = addressMatches[1][2];
    parsed.delivery_zip = addressMatches[1][3];
    parsed.confidence_scores!.delivery_location = 0.75;
  }

  // Parse rate/amount
  const ratePatterns = [
    /(?:rate|pay|total|amount)\s*:?\s*\$?\s*([\d,]+\.?\d*)/i,
    /\$\s*([\d,]+\.?\d*)\s*(?:total|rate|pay)/i,
    /\$\s*([\d,]+\.?\d{2})\b/,
  ];
  
  for (const pattern of ratePatterns) {
    const match = text.match(pattern);
    if (match) {
      const rateStr = match[1].replace(/,/g, '');
      const rate = parseFloat(rateStr);
      if (rate > 100 && rate < 100000) { // Sanity check
        parsed.rate = rate;
        parsed.confidence_scores!.rate = 0.8;
        break;
      }
    }
  }

  // Parse weight
  const weightPatterns = [
    /(?:weight|wgt)\s*:?\s*([\d,]+)\s*(?:lbs?|pounds?)/i,
    /([\d,]+)\s*(?:lbs?|pounds?)/i,
  ];
  
  for (const pattern of weightPatterns) {
    const match = text.match(pattern);
    if (match) {
      parsed.weight = match[1].replace(/,/g, '');
      parsed.confidence_scores!.weight = 0.7;
      break;
    }
  }

  // Parse cargo/commodity description
  const cargoPatterns = [
    /(?:commodity|cargo|description)\s*:?\s*([A-Za-z\s,]+?)(?:\n|$)/i,
  ];
  
  for (const pattern of cargoPatterns) {
    const match = text.match(pattern);
    if (match) {
      parsed.cargo_description = match[1].trim();
      parsed.confidence_scores!.cargo_description = 0.6;
      break;
    }
  }

  // Try to identify customer name (usually in first few lines)
  if (lines.length > 0) {
    // Skip lines that look like headers or generic text
    const skipPatterns = /rate confirmation|bill of lading|load tender|pickup|delivery/i;
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i];
      if (line.length > 3 && line.length < 50 && !skipPatterns.test(line)) {
        parsed.customer_name = line;
        parsed.confidence_scores!.customer_name = 0.5;
        break;
      }
    }
  }

  // Apply training patterns if available
  applyTrainingPatterns(parsed, text, trainingPatterns);

  return parsed;
}

/**
 * Normalize date string to YYYY-MM-DD format
 */
function normalizeDate(dateStr: string): string {
  // Try to parse common date formats
  const parts = dateStr.split(/[-\/]/);
  
  if (parts.length === 3) {
    let month = parts[0];
    let day = parts[1];
    let year = parts[2];
    
    // If year is 2-digit, convert to 4-digit
    if (year.length === 2) {
      year = '20' + year;
    }
    
    // Pad month and day with zeros if needed
    month = month.padStart(2, '0');
    day = day.padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  }
  
  return dateStr; // Return as-is if can't parse
}

export interface TrainingPattern {
  extracted_data: ParsedRateConData;
  corrected_data: ParsedRateConData;
}

/**
 * Apply learned patterns from training data
 */
function applyTrainingPatterns(
  parsed: ParsedRateConData,
  text: string,
  patterns: TrainingPattern[]
): void {
  // This is a placeholder for future ML/pattern matching improvements
  // For now, we'll keep it simple, but this is where we'd apply
  // patterns learned from user corrections
  
  // Example: If training data shows certain customer names frequently
  // appear in specific positions or with certain keywords nearby,
  // we could improve extraction accuracy
}

/**
 * Get historical training patterns to improve parsing
 */
export async function getTrainingPatterns(): Promise<TrainingPattern[]> {
  try {
    // Fetch recent training data to identify patterns
    const { data, error } = await supabase
      .from('ocr_training_data')
      .select('extracted_data, corrected_data')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.warn('Error fetching training patterns:', error);
      return [];
    }

    return (data || []) as TrainingPattern[];
  } catch (error) {
    console.warn('Error fetching training patterns:', error);
    return [];
  }
}

/**
 * Save OCR training data for future improvements
 */
export async function saveOcrTrainingData(data: OcrTrainingData): Promise<void> {
  try {
    const { error } = await supabase
      .from('ocr_training_data')
      .insert({
        load_id: data.load_id,
        original_text: data.original_text,
        extracted_data: data.extracted_data,
        corrected_data: data.corrected_data,
        file_url: data.file_url,
        file_type: data.file_type,
        confidence_scores: data.confidence_scores,
      });

    if (error) {
      console.error('Error saving OCR training data:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error saving OCR training data:', error);
    throw error;
  }
}
