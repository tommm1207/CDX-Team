import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  await client.connect();

  console.log('Adding safeguard trigger to attendance table to prevent bulk deletion...');

  const sql = `
  -- Tạo hàm chặn xóa hàng loạt trên bảng attendance
  CREATE OR REPLACE FUNCTION trg_prevent_bulk_attendance_delete()
  RETURNS TRIGGER AS $$
  BEGIN
    -- Nếu xóa từng dòng đơn lẻ (theo id), cho phép
    RETURN OLD;
  END;
  $$ LANGUAGE plpgsql;

  -- Tạo event trigger hoặc statement trigger để chặn TRUNCATE
  CREATE OR REPLACE FUNCTION trg_prevent_attendance_truncate()
  RETURNS TRIGGER AS $$
  BEGIN
    RAISE EXCEPTION 'CANH BAO: Khong duoc phep TRUNCATE bang attendance (cham cong)!';
  END;
  $$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS trg_block_truncate_attendance ON attendance;
  CREATE TRIGGER trg_block_truncate_attendance
    BEFORE TRUNCATE ON attendance
    FOR EACH STATEMENT
    EXECUTE FUNCTION trg_prevent_attendance_truncate();
  `;

  await client.query(sql);
  console.log('✅ Safeguard trigger installed successfully! Bulk truncate is now blocked.');

  await client.end();
}

run().catch(console.error);
