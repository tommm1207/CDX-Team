import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const sql = `
  CREATE TABLE IF NOT EXISTS expense_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    settlement_code TEXT UNIQUE,
    title TEXT NOT NULL,
    employee_id UUID REFERENCES users(id),
    date DATE NOT NULL,
    previous_balance NUMERIC DEFAULT 0,
    total_advance NUMERIC DEFAULT 0,
    total_cost NUMERIC DEFAULT 0,
    final_balance NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'Chờ duyệt',
    reviewer_id UUID REFERENCES users(id),
    image_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  );
  ALTER TABLE costs ADD COLUMN IF NOT EXISTS settlement_id UUID REFERENCES expense_settlements(id);
  ALTER TABLE advances ADD COLUMN IF NOT EXISTS settlement_id UUID REFERENCES expense_settlements(id);
  `;
  
  // Actually, we can use the rpc method 'exec_sql' if it exists.
  // Wait, if it doesn't exist, we can't create tables from the client using Anon key.
  // The user uses Supabase dashboard to copy-paste.
  // Let's try rpc('exec_sql', { query: sql })
  const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql });
  if (error) {
    console.error('Error executing SQL:', error);
  } else {
    console.log('Successfully executed SQL');
  }
}

run();
