import { createClient } from '@supabase/supabase-js';


// Initialize database client
const supabaseUrl = 'https://qekevyqhwxqyypmhjobd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFla2V2eXFod3hxeXlwbWhqb2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMTUwNDEsImV4cCI6MjA4NjU5MTA0MX0.YXbIJG5F1nSB9obbuLkhINPcPyznCc4VpZhWuP70_BE';
const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: {
    params: {
      eventsPerSecond: 2,
    },
  },
  global: {
    headers: {},
  },
});


export { supabase, supabaseUrl, supabaseKey };
