import { createClient } from '@supabase/supabase-js';


// Initialize database client
const supabaseUrl = 'https://tlksfrowyjprvjerydrp.databasepad.com';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImZlMDM0ZDk3LWI2ZjctNGMzYy1hNjk5LWNlZDVlMDY1NjQxMCJ9.eyJwcm9qZWN0SWQiOiJ0bGtzZnJvd3lqcHJ2amVyeWRycCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzcwMjQxMjY3LCJleHAiOjIwODU2MDEyNjcsImlzcyI6ImZhbW91cy5kYXRhYmFzZXBhZCIsImF1ZCI6ImZhbW91cy5jbGllbnRzIn0.yONwNzlthOzRbUbS6YaOJpx3YAO94QiSLCaue3NqjXo';
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
