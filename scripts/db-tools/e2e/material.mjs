// Material add/edit inside Nhóm vật tư (form restored). TEST DB only.
import { startBrowser, login, goMenu, db, SHOTS } from './lib.mjs';
const c = await db();
await c.query("delete from materials where name like 'E2E vat tu%'");
const g = (await c.query(`select g.id, g.name from material_groups g where g.status is distinct from 'Đã xóa'
  and exists (select 1 from materials m where m.group_id=g.id) order by g.created_at limit 1`)).rows[0];
const m = (await c.query('select id, name, specification from materials where group_id=$1 order by name limit 1', [g.id])).rows[0];
const results = [];
const check = (test, ok, got) => results.push({ test, pass: !!ok, got: JSON.stringify(got).slice(0, 110) });
const { browser, page, log } = await startBrowser();
const openGroup = async () => {
  await goMenu(page, 'Nhóm vật tư');
  const all = page.getByText(g.name, { exact: true });
  for (let i = 0; i < await all.count(); i++) { const b = await all.nth(i).boundingBox(); if (b && b.x >= 0 && b.y > 0) { await all.nth(i).click(); break; } }
  await page.waitForTimeout(1500);
};
try {
  await login(page, 'admindev');
  await openGroup();
  // Edit: change specification
  await page.locator('tr', { hasText: m.name }).filter({ has: page.locator('button.text-yellow-600') }).first().locator('button.text-yellow-600').click();
  await page.waitForTimeout(1200);
  await page.locator('label', { hasText: 'Quy cách' }).last().locator('xpath=following::input[1]').fill('E2E quy cach');
  await page.getByRole('button', { name: 'Lưu vật tư' }).click();
  await page.waitForTimeout(2000);
  const after = (await c.query('select specification, group_id from materials where id=$1', [m.id])).rows[0];
  check('Nhóm vật tư: sửa vật tư lưu được', after.specification === 'E2E quy cach' && after.group_id === g.id, after);
  await c.query('update materials set specification=$1 where id=$2', [m.specification, m.id]);
  // Add new material in the group
  await page.getByRole('button', { name: /Thêm dòng/ }).click();
  await page.waitForTimeout(1500);
  await page.locator('label', { hasText: 'Tên vật tư *' }).last().locator('xpath=following::input[1]').fill('E2E vat tu moi');
  await page.getByRole('button', { name: 'Lưu vật tư' }).click();
  await page.waitForTimeout(2000);
  const added = (await c.query("select code, group_id, warehouse_id from materials where name='E2E vat tu moi'")).rows;
  check('Nhóm vật tư: thêm vật tư mới', added.length === 1 && added[0].group_id === g.id && !!added[0].code, added);
} catch (e) {
  check('SCRIPT ERROR', false, e.message.slice(0, 160));
  await page.screenshot({ path: `${SHOTS}/material_error.png` });
} finally {
  await c.query("delete from materials where name like 'E2E vat tu%'");
  console.table(results);
  if (results.some((r) => ('pass' in r ? !r.pass : 'ok' in r ? !r.ok : 'expect' in r ? r.expect !== r.got : true))) process.exitCode = 1;
  console.log('Blocked prod requests:', log.blockedProd.length, '| page errors:', log.pageErrors);
  await browser.close(); await c.end();
}
