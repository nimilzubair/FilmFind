import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  (typeof __SUPABASE_URL__ !== 'undefined' ? __SUPABASE_URL__ : '') ||
  import.meta.env.VITE_SUPABASE_URL ||
  ''

const supabaseAnonKey =
  (typeof __SUPABASE_ANON_KEY__ !== 'undefined' ? __SUPABASE_ANON_KEY__ : '') ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  ''

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          // We exchange verification codes manually in App.jsx.
          // Disabling auto-detection avoids duplicate auth requests and lock races.
          detectSessionInUrl: false,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null
