import { createClient } from '@supabase/supabase-js'

// Primary Supabase Client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Secondary Supabase Client
const secSupabaseUrl = import.meta.env.VITE_SEC_SUPABASE_URL
const secSupabaseAnonKey = import.meta.env.VITE_SEC_SUPABASE_ANON_KEY
export const secSupabase = createClient(secSupabaseUrl, secSupabaseAnonKey)

// Third Supabase Client
const thirdSupabaseUrl = import.meta.env.VITE_third_SUPABASE_URL
const thirdSupabaseAnonKey = import.meta.env.VITE_third_SUPABASE_ANON_KEY
export const thirdSupabase = createClient(thirdSupabaseUrl, thirdSupabaseAnonKey)

// Signup Supabase Client (Non-persisting to prevent logout on signup)
export const signupSupabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    }
})
