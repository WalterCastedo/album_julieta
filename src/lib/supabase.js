import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://lydkzkpdkrythvebmsag.supabase.co'
const supabaseKey = 'sb_publishable_lVtGeY65MJTzttpZVkGD0A_lXrH1suS'

export const supabase = createClient(supabaseUrl, supabaseKey)