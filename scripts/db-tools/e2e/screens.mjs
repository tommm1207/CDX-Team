// Approve from the StockOut and Transfer screens themselves (separate code paths). TEST DB only.
import { startBrowser, login, goMenu, db } from './lib.mjs';

const c = await db();
const dev = (await c.query("select id from users where code='admindev'")).rows[0].id;
await c.query("delete from stock_out where export_code like '%-E2E2-%'");
await c.query("delete from transfers where transfer_code like '%-E2E2-%'");

const AVAIL_SQL = `
  with mv as (
    select material_id m, warehouse_id w, quantity q from stock_in where status='Đã duyệt'
    union all select material_id, to_warehouse_id, quantity from transfers where status='Đã duyệt'
    union all select material_id, warehouse_id, -quantity from stock_out where status in ('Đã duyệt','Chờ duyệt')
    union all select material_id, from_warehouse_id, -quantity from transfers where status in ('Đã duyệt','Chờ duyệt')
  ) select m, w, sum(q)::float avail from mv group by m, w having sum(q) > 0 order by avail desc limit 1`;
const best = (await c.query(AVAIL_SQL)).rows[0];
const otherWh = (await c.query('select id from warehouses where id <> $1 limit 1', [best.w])).rows[0].id;

const status = async (table, codeCol, code) =>
  (await c.query(`select status from ${table} where ${codeCol}=$1`, [code])).rows[0]?.status;

// Click the on-screen copy of a code (pages also render an off-screen table for image export)
const clickOnScreen = async (page, text) => {
  const all = page.getByText(text);
  for (let i = 0; i < (await all.count()); i++) {
    const box = await all.nth(i).boundingBox();
    if (box && box.x >= 0 && box.y >= 0) return all.nth(i).click();
  }
  throw new Error('No on-screen element for ' + text);
};

const approveOnScreen = async (page, menu, code, qty) => {
  await goMenu(page, menu);
  // Lists show quantity, not code: open the row by its unique quantity, then verify the code
  const qtyText = Number(qty).toLocaleString('vi-VN');
  const row = page.locator('tr', { hasText: qtyText });
  let opened = false;
  for (let i = 0; i < (await row.count()); i++) {
    const box = await row.nth(i).boundingBox();
    if (box && box.x >= 0) {
      await row.nth(i).click();
      opened = true;
      break;
    }
  }
  if (!opened) throw new Error('Row not found for qty ' + qtyText);
  await page.waitForTimeout(1000);
  // StockOut detail shows the code; Transfer detail doesn't, so fall back to the quantity
  const shown = (await page.getByText(code).count()) + (await page.getByText(qtyText + ' Kg').count());
  if (shown < 2) throw new Error('Detail modal does not show ' + code);
  await page.getByRole('button', { name: 'Duyệt', exact: true }).click();
  await page.waitForTimeout(3000);
  // Reload (session stays in localStorage) so a still-open modal can't block the next step
  await page.reload();
  await page.waitForTimeout(2000);
};

const results = [];
const { browser, page, log } = await startBrowser();
try {
  await login(page, 'admindev');

  await c.query(
    `insert into stock_out(export_code,date,warehouse_id,material_id,quantity,status,employee_id)
     values('XK-E2E2-OVER', current_date, $1, $2, $3, 'Chờ duyệt', $4)`,
    [best.w, best.m, best.avail + 1, dev],
  );
  await approveOnScreen(page, 'Xuất kho', 'XK-E2E2-OVER', best.avail + 1);
  results.push({ test: 'Màn Xuất kho: xuất vượt tồn 1 đơn vị bị chặn', expect: 'Chờ duyệt', got: await status('stock_out', 'export_code', 'XK-E2E2-OVER') });
  await c.query("update stock_out set status='Đã xóa' where export_code='XK-E2E2-OVER'");

  await c.query(
    `insert into stock_out(export_code,date,warehouse_id,material_id,quantity,status,employee_id)
     values('XK-E2E2-EXACT', current_date, $1, $2, $3, 'Chờ duyệt', $4)`,
    [best.w, best.m, best.avail / 2, dev],
  );
  await approveOnScreen(page, 'Xuất kho', 'XK-E2E2-EXACT', best.avail / 2);
  results.push({ test: 'Màn Xuất kho: xuất trong tồn được duyệt', expect: 'Đã duyệt', got: await status('stock_out', 'export_code', 'XK-E2E2-EXACT') });

  await c.query(
    `insert into transfers(transfer_code,date,from_warehouse_id,to_warehouse_id,material_id,quantity,status,employee_id)
     values('LC-E2E2-EXACT', current_date, $1, $2, $3, $4, 'Chờ duyệt', $5)`,
    [best.w, otherWh, best.m, Math.floor(best.avail * 0.375), dev],
  );
  await approveOnScreen(page, 'Luân chuyển kho', 'LC-E2E2-EXACT', Math.floor(best.avail * 0.375));
  results.push({ test: 'Màn Luân chuyển: chuyển 75% tồn còn lại được duyệt (code cũ chặn)', expect: 'Đã duyệt', got: await status('transfers', 'transfer_code', 'LC-E2E2-EXACT') });
} catch (e) {
  results.push({ test: 'SCRIPT ERROR', got: e.message.slice(0, 200) });
} finally {
  console.table(results.map((r) => ({ ...r, pass: r.expect === r.got })));
  if (results.some((r) => ('pass' in r ? !r.pass : 'ok' in r ? !r.ok : 'expect' in r ? r.expect !== r.got : true))) process.exitCode = 1;
  console.log('Blocked prod requests:', log.blockedProd.length, '| page errors:', log.pageErrors);
  await browser.close();
  await c.end();
}
