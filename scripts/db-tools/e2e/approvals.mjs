// Approvals: stock-out over available must be rejected; exact-available stock-out and
// transfer must be approved (transfer used to need 2x its quantity). Runs on TEST DB.
import { startBrowser, login, goMenu, db } from './lib.mjs';

const c = await db();
const dev = (await c.query("select id from users where code='admindev'")).rows[0].id;

// Clean leftovers from previous runs (test DB only)
await c.query("delete from stock_out where export_code like '%-E2E-%'");
await c.query("delete from transfers where transfer_code like '%-E2E-%'");
await c.query("delete from costs where content like '%-E2E-%'");
// Pick the material/warehouse pair with the most approved stock
const AVAIL_SQL = `
  with mv as (
    select material_id m, warehouse_id w, quantity q from stock_in where status='Đã duyệt'
    union all select material_id, to_warehouse_id, quantity from transfers where status='Đã duyệt'
    union all select material_id, warehouse_id, -quantity from stock_out where status in ('Đã duyệt','Chờ duyệt')
    union all select material_id, from_warehouse_id, -quantity from transfers where status in ('Đã duyệt','Chờ duyệt')
  ) select m, w, sum(q)::float avail from mv group by m, w`;
const best = (await c.query(`${AVAIL_SQL} order by avail desc limit 1`)).rows[0];
const otherWh = (await c.query('select id from warehouses where id <> $1 limit 1', [best.w])).rows[0].id;
console.log('pair available =', best.avail);

const status = async (table, codeCol, code) =>
  (await c.query(`select status from ${table} where ${codeCol}=$1`, [code])).rows[0]?.status;

const results = [];
const { browser, page, log } = await startBrowser();

const approveInPending = async (code) => {
  await goMenu(page, 'Phiếu duyệt');
  const row = page
    .locator('tr', { hasText: code })
    .filter({ has: page.locator('button[title="Duyệt phiếu"]') })
    .first();
  await row.locator('button[title="Duyệt phiếu"]').click();
  await page.getByRole('button', { name: '✓ Duyệt ngay' }).click();
  await page.waitForTimeout(2500);
  await goMenu(page, 'Chi phí'); // leave page so the next visit refetches
};

try {
  await login(page, 'admindev');

  // 1. Stock-out larger than available → must stay pending
  await c.query(
    `insert into stock_out(export_code,date,warehouse_id,material_id,quantity,status,employee_id)
     values('XK-E2E-OVER', current_date, $1, $2, $3, 'Chờ duyệt', $4)`,
    [best.w, best.m, best.avail + 5, dev],
  );
  await approveInPending('XK-E2E-OVER');
  results.push({ test: 'Phiếu duyệt: xuất vượt tồn bị chặn', expect: 'Chờ duyệt', got: await status('stock_out', 'export_code', 'XK-E2E-OVER') });
  await c.query("update stock_out set status='Đã xóa' where export_code='XK-E2E-OVER'");

  // 2. Transfer of exactly the available quantity → must be approved
  await c.query(
    `insert into transfers(transfer_code,date,from_warehouse_id,to_warehouse_id,material_id,quantity,status,employee_id)
     values('LC-E2E-EXACT', current_date, $1, $2, $3, $4, 'Chờ duyệt', $5)`,
    [best.w, otherWh, best.m, best.avail, dev],
  );
  await approveInPending('LC-E2E-EXACT');
  results.push({ test: 'Phiếu duyệt: chuyển kho đúng bằng tồn được duyệt', expect: 'Đã duyệt', got: await status('transfers', 'transfer_code', 'LC-E2E-EXACT') });

  // 3. Now that stock moved away, a stock-out from the source must be rejected in the StockOut screen too
  await c.query(
    `insert into stock_out(export_code,date,warehouse_id,material_id,quantity,status,employee_id)
     values('XK-E2E-SCREEN', current_date, $1, $2, 1, 'Chờ duyệt', $3)`,
    [best.w, best.m, dev],
  );
  await approveInPending('XK-E2E-SCREEN');
  results.push({ test: 'Phiếu duyệt: xuất khi kho đã hết bị chặn', expect: 'Chờ duyệt', got: await status('stock_out', 'export_code', 'XK-E2E-SCREEN') });

  // 4. Stock-out within stock at the destination warehouse → approved
  await c.query(
    `insert into stock_out(export_code,date,warehouse_id,material_id,quantity,status,employee_id)
     values('XK-E2E-OK', current_date, $1, $2, 1, 'Chờ duyệt', $3)`,
    [otherWh, best.m, dev],
  );
  await approveInPending('XK-E2E-OK');
  results.push({ test: 'Phiếu duyệt: xuất trong tồn được duyệt', expect: 'Đã duyệt', got: await status('stock_out', 'export_code', 'XK-E2E-OK') });
} catch (e) {
  results.push({ test: 'SCRIPT ERROR', got: e.message.slice(0, 200) });
} finally {
  console.table(results.map((r) => ({ ...r, pass: r.expect === r.got })));
  if (results.some((r) => ('pass' in r ? !r.pass : 'ok' in r ? !r.ok : 'expect' in r ? r.expect !== r.got : true))) process.exitCode = 1;
  console.log('Blocked prod requests:', log.blockedProd.length, '| page errors:', log.pageErrors);
  await browser.close();
  await c.end();
}
