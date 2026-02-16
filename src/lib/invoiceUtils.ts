import { supabase } from '@/lib/supabase';

/**
 * Generate the next sequential invoice number starting with GO7500.
 * Queries the database for the highest existing GO-prefixed invoice number
 * and increments by 1. If no GO invoices exist or the highest is below 7500,
 * starts at GO7500.
 */
export const generateNextInvoiceNumber = async (): Promise<string> => {
  const BASE_NUMBER = 7500;
  const PREFIX = 'GO';

  try {
    // Fetch all invoices with GO prefix to find the highest number
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('invoice_number')
      .like('invoice_number', 'GO%')
      .order('invoice_number', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error fetching invoices for numbering:', error);
      // Fallback: use GO7500 + timestamp fragment to avoid collisions
      return `${PREFIX}${BASE_NUMBER}`;
    }

    if (!invoices || invoices.length === 0) {
      return `${PREFIX}${BASE_NUMBER}`;
    }

    // Parse numeric portions and find the highest
    let highestNumber = 0;
    for (const inv of invoices) {
      const numStr = inv.invoice_number.replace(/^GO/, '');
      const num = parseInt(numStr, 10);
      if (!isNaN(num) && num > highestNumber) {
        highestNumber = num;
      }
    }

    // Start at BASE_NUMBER if all existing numbers are below it
    const nextNumber = Math.max(highestNumber + 1, BASE_NUMBER);
    return `${PREFIX}${nextNumber}`;
  } catch (err) {
    console.error('Error generating invoice number:', err);
    return `${PREFIX}${BASE_NUMBER}`;
  }
};
