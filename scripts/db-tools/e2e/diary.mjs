// Construction diary edit used to fail (joined object in update payload). TEST DB only.
import { startBrowser, login, goMenu, db, SHOTS } from './lib.mjs';
const c = await db();
const d = (await c.query(`select id, work_progress, updated_at, status from construction_diaries
  where status is distinct from 'Đã xóa' and length(work_progress) between 8 and 40 order by date desc limit 1`)).rows[0];
const results = [];
const check = (test, ok, got) => results.push({ test, pass: !!ok, got: JSON.stringify(got).slice(0, 120) });
const { browser, page, log } = await startBrowser();
try {
  await login(page, 'admindev');
  await goMenu(page, 'Nhật ký thi công');
  const all = page.getByText(d.work_progress, { exact: true });
  for (let i = 0; i < await all.count(); i++) { const b = await all.nth(i).boundingBox(); if (b && b.x >= 0 && b.y > 0) { await all.nth(i).click(); break; } }
  await page.waitForTimeout(1000);
  await page.locator('button[title="Sửa nhật ký"]').click();
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Cập nhật bản ghi' }).click();
  await page.waitForTimeout(2500);
  const after = (await c.query('select updated_at, status, work_progress from construction_diaries where id=$1', [d.id])).rows[0];
  const err = await page.getByText(/Lỗi:/).count();
  check('Nhật ký: sửa và lưu được', String(after.updated_at) !== String(d.updated_at) && err === 0, { before: d.updated_at, after: after.updated_at, err });
  check('Nhật ký: giữ nguyên nội dung và trạng thái (Admin)', after.work_progress === d.work_progress && after.status === d.status, { status: after.status });
} catch (e) {
  check('SCRIPT ERROR', false, e.message.slice(0, 160));
  await page.screenshot({ path: `${SHOTS}/diary_error.png` });
} finally {
  console.table(results);
  if (results.some((r) => ('pass' in r ? !r.pass : 'ok' in r ? !r.ok : 'expect' in r ? r.expect !== r.got : true))) process.exitCode = 1;
  console.log('Blocked prod requests:', log.blockedProd.length, '| page errors:', log.pageErrors);
  await browser.close(); await c.end();
}
