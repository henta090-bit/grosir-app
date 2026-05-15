import { createClient } from '@supabase/supabase-js'

// GANTI DENGAN URL & ANON KEY PROYEK SUPABASE KO HENRY
const supabaseUrl = 'https://dkqznbomnwtyfselsvwo.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrcXpuYm9tbnd0eWZzZWxzdndvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMTUzODksImV4cCI6MjA5MjU5MTM4OX0.AP2F0sFQegAyrJlW9QBKqbHVEBG1WFkeEbtzwQJVDJQ'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
