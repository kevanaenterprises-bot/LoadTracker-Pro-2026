import { createClient } from '@supabase/supabase-js';

// Driver Supabase — GPS positions and PODs
const DRIVER_SUPABASE_URL = 'https://qekevyqhwxqyypmhjobd.supabase.co';
const DRIVER_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFla2V2eXFod3hxeXlwbWhqb2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMTUwNDEsImV4cCI6MjA4NjU5MTA0MX0.YXbIJG5F1nSB9obbuLkhINPcPyznCc4VpZhWuP70_BE';

export const driverSupabase = createClient(DRIVER_SUPABASE_URL, DRIVER_SUPABASE_ANON_KEY);
