// Đọc toàn bộ schema public (dữ liệu + cấu trúc) thành một object JSON. CHỈ ĐỌC.
// Dùng chung cho backup_full.mjs (lưu ra thư mục) và daily_backup_telegram.mjs (gửi .json.gz).
import pg from 'pg';

// Giữ nguyên chuỗi gốc của Postgres cho date/timestamp: tránh lệch ngày theo múi giờ máy
// và mất micro-giây khi đổi sang Date của JavaScript. Chỉ áp dụng cho client của dump.
const RAW_OIDS = new Set([1082, 1114, 1184]); // date, timestamp, timestamptz
const rawDateTypes = {
  getTypeParser: (oid, format) =>
    RAW_OIDS.has(oid) ? (v) => v : pg.types.getTypeParser(oid, format),
};

const SCHEMA_QUERIES = {
  columns: `SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default, ordinal_position
            FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position`,
  constraints: `SELECT conrelid::regclass::text tbl, conname, pg_get_constraintdef(oid) def
                FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY 1,2`,
  indexes: `SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY 1,2`,
  policies: `SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname`,
  rls: `SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r'`,
  triggers: `SELECT tgrelid::regclass::text tbl, tgname, pg_get_triggerdef(oid) def
             FROM pg_trigger WHERE NOT tgisinternal AND tgrelid::regclass::text NOT LIKE '%.%' ORDER BY 1,2`,
  functions: `SELECT p.proname, pg_get_functiondef(p.oid) def FROM pg_proc p
              WHERE p.pronamespace='public'::regnamespace AND p.prokind='f' ORDER BY 1`,
};

/** @returns {Promise<{manifest: object, schema: object, data: Record<string, any[]>}>} */
export async function dumpDatabase(connectionString) {
  const client = new pg.Client({ connectionString, types: rawDateTypes });
  await client.connect();
  try {
    // Một snapshot nhất quán cho mọi bảng
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');

    const { rows: tables } = await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,
    );
    const data = {};
    const manifest = { created_at: new Date().toISOString(), tables: {} };
    for (const { tablename } of tables) {
      const { rows } = await client.query(`SELECT * FROM public."${tablename}"`);
      data[tablename] = rows;
      manifest.tables[tablename] = rows.length;
    }

    const schema = {};
    for (const [key, sql] of Object.entries(SCHEMA_QUERIES)) {
      schema[key] = (await client.query(sql)).rows;
    }

    await client.query('ROLLBACK');
    return { manifest, schema, data };
  } finally {
    await client.end();
  }
}
