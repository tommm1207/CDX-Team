import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: users } = await supabase.from('users').select('id, code, full_name').eq('role', 'Admin');
  console.log('Admins:', users);
  if (users) {
    for (const u of users) {
      await supabase.from('users').update({ app_pass: '123456' }).eq('id', u.id);
      console.log('Reset password for', u.code);
    }
  }
}
run();
