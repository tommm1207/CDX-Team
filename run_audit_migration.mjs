import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, 'migrations', 'audit_logs_upgrade.sql');

if (!process.env.DATABASE_URL) {
  console.error('Thiếu DATABASE_URL trong file .env');
  process.exit(1);
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await client.connect();
  console.log('Đã kết nối database. Đang chạy migration...');
  try {
    await client.query(sql);
    console.log('✅ Nâng cấp audit_logs thành công.');
    console.log('   - Đã thêm các cột: user_code, user_role, status, target_table,');
    console.log('     target_label, changes, session_id');
    console.log('   - Đã khóa quyền đọc: chỉ role Develop qua hàm get_audit_logs()');
    console.log('   - Nhật ký không thể sửa/xóa (trigger immutable)');
  } catch (err) {
    console.error('❌ Lỗi khi chạy migration:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

run();
