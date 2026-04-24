import { supabase } from '@/lib/supabase';

export const generateNextInvoiceNumber = async (): Promise<string> => {
  // Load prefix and starting number from settings table
  const { data: settings } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', ['invoice_prefix', 'invoice_start_number']);

  const prefix = settings?.find(s => s.key === 'invoice_prefix')?.value?.trim() || 'GO';
  const startNumber = parseInt(settings?.find(s => s.key === 'invoice_start_number')?.value || '7500', 10);

  try {
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('invoice_number')
      .like('invoice_number', `${prefix}%`)
      .order('invoice_number', { ascending: false })
      .limit(100);

    if (error || !invoices || invoices.length === 0) {
      return `${prefix}${startNumber}`;
    }

    let highestNumber = 0;
    for (const inv of invoices) {
      const numStr = inv.invoice_number.replace(new RegExp(`^${prefix}`), '');
      const num = parseInt(numStr, 10);
      if (!isNaN(num) && num > highestNumber) highestNumber = num;
    }

    const nextNumber = Math.max(highestNumber + 1, startNumber);
    return `${prefix}${nextNumber}`;
  } catch {
    return `${prefix}${startNumber}`;
  }
};
