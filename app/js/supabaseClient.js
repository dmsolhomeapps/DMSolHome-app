import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://kitkrkkiubdncfldtfpv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_GOsmgxfklhhKmEOyLU8Ovg_61r_QmSl';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
