import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// Client for server components (needs cookies function)
export const createClient = () => {
    return createServerComponentClient({ cookies })
}