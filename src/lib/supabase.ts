import { createClient } from '@supabase/supabase-js';

// Admin app Supabase (legacy, used for OCR only)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder-key'
);

export const isSupabaseConfigured = () => !!(supabaseUrl && supabaseKey);

// Driver Supabase — the project the driver app writes GPS positions and PODs to
const DRIVER_SUPABASE_URL = 'https://qekevyqhwxqyypmhjobd.supabase.co';
const DRIVER_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFla2V2eXFod3hxeXlwbWhqb2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMTUwNDEsImV4cCI6MjA4NjU5MTA0MX0.YXbIJG5F1nSB9obbuLkhINPcPyznCc4VpZhWuP70_BE';

export const driverSupabase = createClient(DRIVER_SUPABASE_URL, DRIVER_SUPABASE_ANON_KEY);
