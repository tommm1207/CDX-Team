// Advances soft delete + restore, cost edit keeps creator, salary history refresh. TEST DB only.
import { startBrowser, login, goMenu, db, SHOTS } from './lib.mjs';

const c = await db();
const dev = (await c.query("select id from users where code='admindev'")).rows[0].id;
const results = [];
const check = (test, ok, got) => results.push({ test, pass: !!ok, got: JSON.stringify(got).slice(0, 110) });
const { browser, page, log } = await startBrowser();

const clickVisible = async (loc) => {
  for (let i = 0; i < (await loc.count()); i++) {
    const b = await loc.nth(i).boundingBox();
    if (b && b.x >= 0 && b.y >= 0) return loc.nth(i).click();
  }
  throw new Error('nothing visible to click');
};
const fresh = async (menu) => {
  await page.reload();
  await page.waitForTimeout(1800);
  await goMenu(page, menu);
};
const step = async (name, fn) => {
  try {
    await fn();
  } catch (e) {
    check(`${name}: SCRIPT ERROR`, false, e.message.slice(0, 150));
    await page.screenshot({ path: `${SHOTS}/misc_${name.replace(/\W+/g, '_')}.png` });
  }
};

await login(page, 'admindev');

await step('Tạm ứng', async () => {
  const adv = (
    await c.query(
      `select a.id, a.amount, u.full_name from advances a join users u on u.id=a.employee_id
       where a.status='Chờ duyệt' and u.has_salary and u.status='Đang làm việc' order by a.date desc limit 1`,
    )
  ).rows[0];
  await goMenu(page, 'Tạm ứng & phụ cấp');
  const amountText = Number(adv.amount).toLocaleString('vi-VN');
  const row = page.locator('tr', { hasText: adv.full_name }).filter({ hasText: amountText }).filter({ has: page.locator('button[title="Xóa"]') });
  await row.first().locator('button[title="Xóa"]').click();
  await page.getByRole('button', { name: /Chuyển vào Thùng rác/ }).click();
  await page.waitForTimeout(2000);
  const st = (await c.query('select status from advances where id=$1', [adv.id])).rows[0]?.status;
  check('Tạm ứng: xóa → Đã xóa (không xóa cứng)', st === 'Đã xóa', st);

  // Same filter the payroll uses must now exclude it
  const { rows } = await c.query(
    `select count(*) from advances where id=$1 and (status is null or status <> 'Đã xóa')`, [adv.id]);
  check('Tạm ứng: bảng lương không còn tính khoản đã xóa', rows[0].count === '0', rows[0].count);

  await fresh('Thùng rác');
  await page.getByText('Tạm ứng & phụ cấp đã xóa').click();
  await page.waitForTimeout(1500);
  const trashRow = page.locator('div', { hasText: adv.full_name }).filter({ has: page.getByRole('button', { name: /Khôi phục/ }) }).last();
  await trashRow.getByRole('button', { name: /Khôi phục/ }).click();
  await page.getByRole('button', { name: 'Khôi phục', exact: true }).last().click();
  await page.waitForTimeout(2000);
  const st2 = (await c.query('select status from advances where id=$1', [adv.id])).rows[0]?.status;
  check('Tạm ứng: khôi phục từ Thùng rác', st2 === 'Chờ duyệt', st2);
});

// Nhật ký và Vật tư: xem diary.mjs, material.mjs

await step('Chi phí', async () => {
  const cost = (
    await c.query(
      `select id, content, employee_id from costs where employee_id <> $1 and status <> 'Đã xóa'
       and settlement_id is null and content is not null order by date desc limit 1`,
      [dev],
    )
  ).rows[0];
  await fresh('Chi phí');
  await clickVisible(page.getByText(cost.content, { exact: true }));
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Sửa', exact: true }).last().click();
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Cập nhật', exact: true }).last().click();
  await page.waitForTimeout(2500);
  const after = (await c.query('select employee_id, notes from costs where id=$1', [cost.id])).rows[0];
  check('Chi phí: sửa giữ nguyên người lập', after.employee_id === cost.employee_id && /SỬA lúc/.test(after.notes || ''), { kept: after.employee_id === cost.employee_id, notes: after.notes?.slice(0, 30) });
});

await step('Cài đặt lương', async () => {
  const emp = (await c.query(
    `select u.id, u.full_name from users u where has_salary and status='Đang làm việc' and role <> 'Develop'
     and exists (select 1 from salary_settings s where s.employee_id=u.id) order by code limit 1`)).rows[0];
  await c.query("delete from salary_settings where employee_id=$1 and daily_rate=777777", [emp.id]);
  await fresh('Cài đặt lương');
  await clickVisible(page.getByText(emp.full_name, { exact: true }));
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: /Thêm mức lương mới/ }).click();
  await page.getByText('Lương/Ngày (8h) *').locator('xpath=following::input[1]').fill('777777');
  await page.getByText('Lương/Ngày (8h) *').locator('xpath=following::input[@type="date"][1]').fill('2030-01-01');
  await page.getByRole('button', { name: /Lưu mức lương này/ }).click();
  await page.waitForTimeout(2500);
  const inDb = (await c.query('select count(*) from salary_settings where employee_id=$1 and daily_rate=777777', [emp.id])).rows[0].count;
  const shown = await page.locator('input[value="777.777"], :text("777.777")').count();
  check('Cài đặt lương: thêm mức mới hiện ngay trong lịch sử', inDb === '1' && shown > 0, { inDb, shown });
  await c.query("delete from salary_settings where employee_id=$1 and daily_rate=777777", [emp.id]);
});

console.table(results);
if (results.some((r) => ('pass' in r ? !r.pass : 'ok' in r ? !r.ok : 'expect' in r ? r.expect !== r.got : true))) process.exitCode = 1;
console.log('Blocked prod requests:', log.blockedProd.length, '| page errors:', log.pageErrors);
await browser.close();
await c.end();
