// Supabase has been removed. This file is kept as a stub so imports don't break
// during incremental migration. All auth and data access now goes through the
// Express API server backed by Railway PostgreSQL.

// Stub that satisfies any remaining imports that reference `supabase.auth` or
// `supabase.storage` before they are fully migrated.
export const supabase = {
  auth: {
    signInWithPassword: async () => ({ data: null, error: new Error('Supabase auth removed') }),
    signUp: async () => ({ data: null, error: new Error('Supabase auth removed') }),
    resetPasswordForEmail: async () => ({ data: null, error: new Error('Supabase auth removed') }),
  },
  storage: {
    from: () => ({
      upload: async () => ({ data: null, error: new Error('Storage not available') }),
      download: async () => ({ data: null, error: new Error('Storage not available') }),
      getPublicUrl: () => ({ data: { publicUrl: '' } }),
    }),
  },
  functions: {
    invoke: async () => ({ data: null, error: new Error('Edge functions not available') }),
  },
  channel: () => ({
    on: () => ({ subscribe: () => {} }),
    subscribe: () => {},
  }),
  removeChannel: () => {},
  from: (_table: string) => ({
    select: () => Promise.resolve({ data: [], error: null }),
    insert: () => Promise.resolve({ data: null, error: null }),
    update: () => Promise.resolve({ data: null, error: null }),
    delete: () => Promise.resolve({ data: null, error: null }),
    eq: function() { return this; },
    single: () => Promise.resolve({ data: null, error: null }),
  }),
};

export const isSupabaseConfigured = () => false;
