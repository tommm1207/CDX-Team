// Attendance: single-cell save (insert + update via upsert), notes kept by bulk save,
// absent forces OT = 0, never duplicates. TEST DB only.
import { startBrowser, login, goMenu, db, SHOTS } from './lib.mjs';

const c = await db();
const now = new Date();
const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const D = (d) => `${ym}-${String(d).padStart(2, '0')}`;

const emp = (
  await c.query(
    `select id, full_name from users where has_salary and status='Đang làm việc' and role <> 'Develop'
     order by code limit 1`,
  )
).rows[0];
// Reset days 1–3 for this employee, then seed day 2 with a note
for (const d of [1, 2, 3]) await c.query('delete from attendance where employee_id=$1 and date=$2', [emp.id, D(d)]);
await c.query(
  `insert into attendance(employee_id,date,status,hours_worked,overtime_hours,notes)
   values($1,$2,'present',8,2,'GHI-CHU-E2E')`,
  [emp.id, D(2)],
);
const rows = async (d) =>
  (await c.query('select status,hours_worked,overtime_hours,notes from attendance where employee_id=$1 and date=$2', [emp.id, D(d)])).rows;

const results = [];
const check = (test, ok, got) => results.push({ test, pass: !!ok, got: JSON.stringify(got).slice(0, 110) });

const { browser, page, log } = await startBrowser();
try {
  await login(page, 'admindev');
  await goMenu(page, 'Chấm công');
  await page.waitForTimeout(1500);

  const empRow = page.locator('tr', { hasText: emp.full_name }).filter({ has: page.locator('button.aspect-square') }).first();
  const cell = (d) => empRow.locator('button.aspect-square').nth(d - 1);

  // A. Empty day 1 → ½ công with a note (insert path)
  await cell(1).click();
  await page.getByRole('button', { name: /½ Công/ }).click();
  await page.getByPlaceholder('Ví dụ: Lắp cốt pha dầm sàn, xây tường...').fill('E2E-NOTE');
  await page.getByRole('button', { name: '✓ Lưu chấm công' }).click();
  await page.waitForTimeout(2500);
  let r = await rows(1);
  check('Ô trống → ½ công + ghi chú', r.length === 1 && r[0].status === 'half-day' && r[0].hours_worked == 4 && r[0].notes === 'E2E-NOTE', r);

  // B. Existing day 2 → Vắng (update path): one row, OT forced to 0
  await cell(2).click();
  await page.getByRole('button', { name: /^V\s*Vắng$|Vắng/ }).first().click();
  await page.getByRole('button', { name: '✓ Lưu chấm công' }).click();
  await page.waitForTimeout(2500);
  r = await rows(2);
  check('Ô có sẵn → Vắng, không trùng dòng, TC = 0', r.length === 1 && r[0].status === 'absent' && Number(r[0].overtime_hours) === 0, r);
  const noteBeforeBulk = r[0]?.notes;

  // C. Bulk: days 2–3 → present. Day 2 must keep its note (old code deleted the row)
  await page.locator('button[title="Chấm công hàng loạt"]').click();
  await page.waitForTimeout(800);
  const dates = page.locator('input[type="date"]');
  await dates.nth(0).fill(D(2));
  await dates.nth(1).fill(D(3));
  await page.locator('div.cursor-pointer', { hasText: emp.full_name }).first().click();
  await page.getByRole('button', { name: /Lưu chấm công \(/ }).click();
  await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await page.waitForTimeout(4000);
  const r2 = await rows(2);
  const r3 = await rows(3);
  check('Hàng loạt: ngày 2 thành 1 công, giữ ghi chú', r2.length === 1 && r2[0].status === 'present' && r2[0].notes === noteBeforeBulk, r2);
  check('Hàng loạt: ngày 3 được tạo mới', r3.length === 1 && r3[0].status === 'present' && r3[0].hours_worked == 8, r3);
  await page.screenshot({ path: `${SHOTS}/attendance_after.png` });
} catch (e) {
  check('SCRIPT ERROR', false, e.message.slice(0, 160));
  await page.screenshot({ path: `${SHOTS}/attendance_error.png` });
} finally {
  console.log('Employee:', emp.full_name, '| month', ym);
  console.table(results);
  if (results.some((r) => ('pass' in r ? !r.pass : 'ok' in r ? !r.ok : 'expect' in r ? r.expect !== r.got : true))) process.exitCode = 1;
  console.log('Blocked prod requests:', log.blockedProd.length, '| page errors:', log.pageErrors);
  await browser.close();
  await c.end();
}
