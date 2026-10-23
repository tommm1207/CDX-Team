// Sao lưu đầy đủ DB ra thư mục local. CHỈ ĐỌC, không thay đổi DB.
//   node scripts/db-tools/backup_full.mjs [--env .env] [--out D:/CDX/CDX-backups]
// Kết quả: <out>/full_<thời gian>/{manifest.json, schema.json, data/<bảng>.json}
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { dumpDatabase } from './dump.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
};

dotenv.config({ path: arg('--env', '.env'), quiet: true });
const url = process.env.DATABASE_URL;
if (!url) throw new Error('Thiếu DATABASE_URL');

const outRoot = arg('--out', '../CDX-backups');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = path.resolve(outRoot, `full_${stamp}`);
fs.mkdirSync(path.join(outDir, 'data'), { recursive: true });

const { manifest, schema, data } = await dumpDatabase(url);
for (const [table, rows] of Object.entries(data)) {
  fs.writeFileSync(path.join(outDir, 'data', `${table}.json`), JSON.stringify(rows, null, 1));
}
fs.writeFileSync(path.join(outDir, 'schema.json'), JSON.stringify(schema, null, 1));
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));

const total = Object.values(manifest.tables).reduce((a, b) => a + b, 0);
console.log(`Đã sao lưu ${Object.keys(manifest.tables).length} bảng, ${total} dòng → ${outDir}`);
