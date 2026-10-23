// Expense settlements: create (used to crash), edit (update/insert/delete lines by id),
// delete with > 5 lines (DB guard blocks bulk deletes). TEST DB only.
import { startBrowser, login, goMenu, db, SHOTS } from './lib.mjs';

const TITLE = 'QT-E2E Kiem thu quyet toan';
const c = await db();
// cleanup previous runs
const old = (await c.query('select id from expense_settlements where title=$1', [TITLE])).rows;
for (const o of old) {
  for (const t of ['costs', 'advances']) {
    for (const r of (await c.query(`select id from ${t} where settlement_id=$1`, [o.id])).rows)
      await c.query(`delete from ${t} where id=$1`, [r.id]);
  }
  await c.query('delete from expense_settlements where id=$1', [o.id]);
}

const settlement = async () => (await c.query('select * from expense_settlements where title=$1', [TITLE])).rows[0];
const lines = async (t, id) =>
  (await c.query(`select * from ${t} where settlement_id=$1 order by created_at`, [id])).rows;

const results = [];
const check = (test, ok, got) => results.push({ test, pass: !!ok, got: JSON.stringify(got).slice(0, 110) });

const { browser, page, log } = await startBrowser();
const costContent = () => page.getByPlaceholder(/Nội dung chi \(VD/);
const costAmount = () =>
  page.locator('input[placeholder="Số tiền"]').filter({ has: page.locator('xpath=.') });

try {
  await login(page, 'admindev');
  await goMenu(page, 'Phiếu quyết toán');

  // 1. Create with 2 cost lines + 1 advance
  await page.getByRole('button', { name: 'Tạo phiếu mới' }).click();
  await page.waitForTimeout(800);
  await page.getByPlaceholder(/Ví dụ: Chi phí LV - CĐ/).fill(TITLE);
  await costContent().nth(0).fill('E2E chi 1');
  // amount inputs: costs first, then advances
  await page.locator('input[placeholder="Số tiền"]').nth(0).fill('100000');
  await page.getByRole('button', { name: /Thêm khoản chi/ }).click();
  await costContent().nth(1).fill('E2E chi 2');
  await page.locator('input[placeholder="Số tiền"]').nth(1).fill('200000');
  await page.locator('input[placeholder="Số tiền"]').nth(2).fill('50000');
  await page.getByRole('button', { name: 'Lưu và tạo phiếu quyết toán' }).click();
  await page.waitForTimeout(3500);

  const s = await settlement();
  const cs = s ? await lines('costs', s.id) : [];
  const as = s ? await lines('advances', s.id) : [];
  check('Tạo phiếu quyết toán lưu được', !!s && s.settlement_code?.startsWith('QT-'), s && { code: s.settlement_code, total: s.total_cost });
  check('Tạo: 2 khoản chi, mã CP không trùng', cs.length === 2 && new Set(cs.map((x) => x.cost_code)).size === 2, cs.map((x) => [x.content, x.total_amount, x.cost_code]));
  check('Tạo: 1 khoản tạm ứng', as.length === 1 && Number(as[0].amount) === 50000, as.map((x) => x.amount));
  if (!s) throw new Error('settlement not created');
  const chi2Id = cs.find((x) => x.content === 'E2E chi 2')?.id;

  // 2. Edit: remove line 1, change line 2, add 5 lines → 6 lines total
  await page.reload();
  await page.waitForTimeout(2000);
  await goMenu(page, 'Phiếu quyết toán');
  await page.getByText(TITLE).first().click();
  await page.waitForTimeout(1200);
  await page.locator('button[title="Chỉnh sửa phiếu"]').click();
  await page.waitForTimeout(1000);
  await costContent().nth(0).locator('xpath=ancestor::div[.//button][1]//button').last().click();
  await page.waitForTimeout(300);
  await page.locator('input[placeholder="Số tiền"]').nth(0).fill('250000');
  for (let i = 3; i <= 7; i++) {
    await page.getByRole('button', { name: /Thêm khoản chi/ }).click();
    const n = (await costContent().count()) - 1;
    await costContent().nth(n).fill(`E2E chi ${i}`);
    await page.locator('input[placeholder="Số tiền"]').nth(n).fill(String(i * 1000));
  }
  await page.getByRole('button', { name: 'Cập nhật phiếu quyết toán' }).click();
  await page.waitForTimeout(4000);
  const cs2 = await lines('costs', s.id);
  check('Sửa: dòng bị bỏ đã xóa, còn 6 dòng', cs2.length === 6 && !cs2.some((x) => x.content === 'E2E chi 1'), cs2.map((x) => x.content));
  const chi2 = cs2.find((x) => x.content === 'E2E chi 2');
  check('Sửa: dòng cũ được cập nhật tại chỗ (giữ id)', chi2?.id === chi2Id && Number(chi2.total_amount) === 250000, chi2);
  check('Sửa: tạm ứng không bị nhân đôi', (await lines('advances', s.id)).length === 1, (await lines('advances', s.id)).length);

  // 3. Delete settlement with 6 cost lines (bulk delete > 5 is blocked by DB trigger)
  await page.reload();
  await page.waitForTimeout(2000);
  await goMenu(page, 'Phiếu quyết toán');
  await page.getByText(TITLE).first().click();
  await page.waitForTimeout(1200);
  await page.locator('button[title="Xoá phiếu này"]').click();
  await page.getByRole('button', { name: 'Xoá vĩnh viễn' }).click();
  await page.waitForTimeout(4000);
  check('Xóa phiếu có 6 dòng chi: xóa sạch', !(await settlement()) && (await lines('costs', s.id)).length === 0 && (await lines('advances', s.id)).length === 0, { exists: !!(await settlement()) });
} catch (e) {
  check('SCRIPT ERROR', false, e.message.slice(0, 160));
  await page.screenshot({ path: `${SHOTS}/settlement_error.png` });
} finally {
  console.table(results);
  if (results.some((r) => ('pass' in r ? !r.pass : 'ok' in r ? !r.ok : 'expect' in r ? r.expect !== r.got : true))) process.exitCode = 1;
  console.log('Blocked prod requests:', log.blockedProd.length, '| page errors:', log.pageErrors);
  await browser.close();
  await c.end();
}
