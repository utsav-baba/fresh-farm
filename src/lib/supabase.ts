import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;

// Use placeholders if keys are missing to prevent immediate crash
// The app will show an error when it tries to fetch data instead of a white screen
export const supabase = createClient(
  supabaseUrl || 'https://placeholder-url.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase configuration is missing! Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment variables in Settings.');
}
