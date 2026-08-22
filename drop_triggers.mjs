import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  await client.connect();
  const res = await client.query("SELECT trigger_name, event_object_table FROM information_schema.triggers WHERE trigger_name ILIKE '%audit%'");
  console.log(res.rows);
  
  for (let r of res.rows) {
    await client.query(`DROP TRIGGER IF EXISTS ${r.trigger_name} ON ${r.event_object_table}`);
    console.log(`Dropped ${r.trigger_name} on ${r.event_object_table}`);
  }
  
  await client.end();
}
run();
