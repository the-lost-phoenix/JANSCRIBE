import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

// Client for browser components (uses env vars automatically)
export const createClient = () => createClientComponentClient()