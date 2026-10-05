import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

const PROTECTED_TABLES = [
  'attendance',
  'advances',
  'salary_settings',
  'users',
  'costs',
  'construction_diaries',
  'stock_in',
  'transfers'
];

async function installSafetyTriggers() {
  await client.connect();

  console.log('Installing bulk delete & truncate prevention triggers on all critical tables...');

  for (const table of PROTECTED_TABLES) {
    const sql = `
      -- 1. Trigger chặn TRUNCATE
      DROP TRIGGER IF EXISTS trg_block_truncate_${table} ON "${table}";
      CREATE TRIGGER trg_block_truncate_${table}
        BEFORE TRUNCATE ON "${table}"
        FOR EACH STATEMENT
        EXECUTE FUNCTION trg_prevent_attendance_truncate();

      -- 2. Hàm và Trigger chặn DELETE hàng loạt (> 5 dòng)
      CREATE OR REPLACE FUNCTION check_bulk_delete_${table}()
      RETURNS TRIGGER AS $$
      DECLARE
        deleted_count int;
      BEGIN
        IF current_setting('cdx.allow_bulk_delete', true) = 'true' THEN
          RETURN NULL;
        END IF;

        SELECT count(*) INTO deleted_count FROM deleted_rows;
        IF deleted_count > 5 THEN
          RAISE EXCEPTION 'CANH BAO AN TOAN: Chan xoa hang loat (% dong)! He thong cam xoa > 5 dong cung luc tren bang %.', deleted_count, '${table}';
        END IF;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_prevent_bulk_delete_${table} ON "${table}";
      CREATE TRIGGER trg_prevent_bulk_delete_${table}
        AFTER DELETE ON "${table}"
        REFERENCING OLD TABLE AS deleted_rows
        FOR EACH STATEMENT
        EXECUTE FUNCTION check_bulk_delete_${table}();
    `;

    await client.query(sql);
    console.log(`✅ Table "${table}": Bulk delete (>5 rows) and TRUNCATE are now BLOCKED at DB engine level.`);
  }

  await client.end();
  console.log('\n🛡️ ALL CRITICAL TABLES ARE NOW BULLETPROOF!');
}

installSafetyTriggers().catch(console.error);
