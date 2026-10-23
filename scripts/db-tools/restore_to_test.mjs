// Dựng DB TEST (không bao giờ ghi vào DB thật) từ một trong hai nguồn:
//   node scripts/db-tools/restore_to_test.mjs --from-prod [--reset]      sao chép thẳng DB thật → DB test
//                                                                       trong bộ nhớ, không ghi file ra máy
//   node scripts/db-tools/restore_to_test.mjs <file .json.gz từ Telegram> [--reset]
// --reset: xóa toàn bộ bảng/hàm trong schema public của DB test trước khi dựng lại.
// --env (mặc định .env.test) chứa DB test; --prod-env (mặc định .env) chứa DB thật để đọc.
import fs from 'fs';
import zlib from 'zlib';
import pg from 'pg';
import dotenv from 'dotenv';
import { dumpDatabase } from './dump.mjs';

const PROD_REF = 'whyulopkxtqlqrhbxdgt';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const fromProd = process.argv.includes('--from-prod');
const source = process.argv[2];
if (!fromProd && (!source || source.startsWith('--'))) {
  throw new Error('Cách dùng: restore_to_test.mjs --from-prod | <file .json.gz> [--reset]');
}
// Đọc riêng từng file .env, không trộn vào process.env để tránh nhầm DB
const readEnvUrl = (file) => dotenv.parse(fs.readFileSync(file)).DATABASE_URL || '';
const url = readEnvUrl(arg('--env', '.env.test'));
if (!url || url.includes(PROD_REF)) {
  throw new Error('An toàn: DATABASE_URL của DB test trống hoặc là DB thật — dừng.');
}

// Nguồn: đọc thẳng DB thật (chỉ đọc, giữ trong bộ nhớ) hoặc file .json.gz từ Telegram
let schema;
let data = {};
if (fromProd) {
  const prodUrl = readEnvUrl(arg('--prod-env', '.env'));
  if (!prodUrl.includes(PROD_REF)) throw new Error('--prod-env không trỏ tới DB thật');
  ({ schema, data } = await dumpDatabase(prodUrl));
} else {
  ({ schema, data } = JSON.parse(zlib.gunzipSync(fs.readFileSync(source)).toString('utf8')));
}

const q = (id) => '"' + id.replace(/"/g, '""') + '"';
const colType = (c) => (c.data_type === 'ARRAY' ? c.udt_name.slice(1) + '[]' : c.udt_name);
const tables = [...new Set(schema.columns.map((c) => c.table_name))].sort();
const roleList = (s) => String(s).replace(/^\{|\}$/g, '').split(',').filter(Boolean);

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const existing = (await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'`)).rows;
  if (existing.length && !process.argv.includes('--reset')) {
    throw new Error(`DB test đang có ${existing.length} bảng. Thêm --reset để xóa và dựng lại.`);
  }

  await client.query('BEGIN');

  if (existing.length) {
    // Giữ nguyên schema public (và quyền mặc định của Supabase), chỉ xóa bảng và hàm
    for (const { tablename } of existing) await client.query(`DROP TABLE public.${q(tablename)} CASCADE`);
    const fns = await client.query(
      `SELECT p.oid::regprocedure::text sig FROM pg_proc p
       WHERE p.pronamespace='public'::regnamespace AND p.prokind='f'`,
    );
    for (const { sig } of fns.rows) await client.query(`DROP FUNCTION ${sig} CASCADE`);
  }

  // 1. Hàm (trigger cần hàm có trước)
  for (const f of schema.functions) await client.query(f.def);

  // 2. Bảng + cột + giá trị mặc định (ràng buộc thêm sau khi nạp dữ liệu)
  for (const t of tables) {
    const cols = schema.columns
      .filter((c) => c.table_name === t)
      .sort((a, b) => a.ordinal_position - b.ordinal_position)
      .map(
        (c) =>
          `${q(c.column_name)} ${colType(c)}` +
          (c.column_default ? ` DEFAULT ${c.column_default}` : '') +
          (c.is_nullable === 'NO' ? ' NOT NULL' : ''),
      );
    await client.query(`CREATE TABLE public.${q(t)} (${cols.join(', ')})`);
  }

  // 3. Dữ liệu
  const counts = {};
  for (const t of tables) {
    const rows = data[t] || [];
    counts[t] = rows.length;
    if (!rows.length) continue;
    const meta = Object.fromEntries(
      schema.columns.filter((c) => c.table_name === t).map((c) => [c.column_name, c]),
    );
    const colNames = Object.keys(rows[0]);
    for (let i = 0; i < rows.length; i += 200) {
      const params = [];
      const values = rows.slice(i, i + 200).map((r) => {
        const ph = colNames.map((cn) => {
          let v = r[cn];
          if (v !== null && v !== undefined && meta[cn]?.udt_name === 'jsonb') v = JSON.stringify(v);
          params.push(v ?? null);
          return `$${params.length}`;
        });
        return `(${ph.join(', ')})`;
      });
      await client.query(
        `INSERT INTO public.${q(t)} (${colNames.map(q).join(', ')}) VALUES ${values.join(', ')}`,
        params,
      );
    }
  }

  // 4. Ràng buộc: PK / UNIQUE / CHECK trước, FOREIGN KEY sau
  const cons = schema.constraints.filter((c) => !c.tbl.includes('.'));
  const isFk = (c) => c.def.startsWith('FOREIGN KEY');
  for (const c of [...cons.filter((c) => !isFk(c)), ...cons.filter(isFk)]) {
    await client.query(`ALTER TABLE public.${q(c.tbl)} ADD CONSTRAINT ${q(c.conname)} ${c.def}`);
  }

  // 5. Index không do ràng buộc tạo ra
  const conNames = new Set(cons.map((c) => c.conname));
  for (const ix of schema.indexes) if (!conNames.has(ix.indexname)) await client.query(ix.indexdef);

  // 6. Trigger
  for (const tg of schema.triggers) await client.query(tg.def);

  // 7. RLS + policy giống hệt DB thật
  for (const r of schema.rls) {
    if (r.relrowsecurity) await client.query(`ALTER TABLE public.${q(r.relname)} ENABLE ROW LEVEL SECURITY`);
  }
  for (const p of schema.policies) {
    const roles = roleList(p.roles).map((r) => (r === 'public' ? 'public' : q(r)));
    let sql = `CREATE POLICY ${q(p.policyname)} ON public.${q(p.tablename)} AS ${p.permissive} FOR ${p.cmd} TO ${roles.join(', ')}`;
    if (p.qual) sql += ` USING (${p.qual})`;
    if (p.with_check) sql += ` WITH CHECK (${p.with_check})`;
    await client.query(sql);
  }

  await client.query('COMMIT');
  await client.query(`NOTIFY pgrst, 'reload schema'`);

  let mismatch = 0;
  for (const t of tables) {
    const n = Number((await client.query(`SELECT count(*) FROM public.${q(t)}`)).rows[0].count);
    if (n !== counts[t]) {
      mismatch++;
      console.log('LỆCH', t, n, '≠', counts[t]);
    }
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`Đã dựng ${tables.length} bảng, ${total} dòng, ${cons.length} ràng buộc, ` +
    `${schema.triggers.length} trigger, ${schema.policies.length} policy. Số bảng lệch: ${mismatch}`);
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Đã ROLLBACK — lỗi:', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
