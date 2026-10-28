import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''

export const supabaseConfigured = url.length > 0 && anonKey.length > 0

export type ProfileRole = 'admin' | 'member'

export interface Profile {
  id: string
  email: string
  display_name: string
  role: ProfileRole
  approved: boolean
}

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'sales-crm-auth',
      },
    })
  : null
