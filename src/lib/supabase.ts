import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://qjdfkcvnppjwbxkzcchf.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqZGZrY3ZucHBqd2J4a3pjY2hmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0OTk4NDMsImV4cCI6MjA5ODA3NTg0M30.mNar2GtIcoS2t-Nbg5ZUpYja-6ezTitXsvHLvp_WO94'

export const supabaseConfigured = true

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
