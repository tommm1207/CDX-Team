import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  await client.connect();
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
  try {
    await client.query(sql);
    console.log("Successfully created tables.");
  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
