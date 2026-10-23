// Chạy toàn bộ E2E lần lượt trên DB test. Nên dựng lại DB test sạch trước:
//   node scripts/db-tools/restore_to_test.mjs <bản sao lưu mới nhất> --reset
//   npx vite --mode test --port 5199 --strictPort   (cửa sổ khác)
//   node scripts/db-tools/e2e/run_all.mjs
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const suites = ['smoke', 'approvals', 'screens', 'attendance', 'splitmerge', 'settlement', 'contracts', 'misc', 'material', 'diary'];
let failed = 0;
for (const s of suites) {
  console.log(`\n=== ${s} ===`);
  const r = spawnSync(process.execPath, [path.join(dir, `${s}.mjs`)], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  process.stdout.write(out);
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n❌ ${failed} nhóm có bài trượt` : '\n✅ Tất cả nhóm đều đạt');
process.exitCode = failed ? 1 : 0;
