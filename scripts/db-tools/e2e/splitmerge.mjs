// Rã/Gộp: approve a legacy 'cho_duyet' slip, soft-delete another, see legacy 'da_xoa' in trash,
// restore from trash. TEST DB only.
import { startBrowser, login, goMenu, db, SHOTS } from './lib.mjs';

const APPROVE = 'XA20260628-2604';
const DELETE = 'XA20260628-6555';
const LEGACY_DELETED = 'XA20260621-3849';

const c = await db();
const header = async (code) =>
  (await c.query('select id, status from xasa_gop_phieu where ma_phieu=$1', [code])).rows[0];
const stockStatuses = async (code) =>
  (
    await c.query(
      `select status from stock_in where import_code like $1
       union all select status from stock_out where export_code like $1`,
      [code + '%'],
    )
  ).rows.map((r) => r.status);
const details = async (id) =>
  Number((await c.query('select count(*) from xasa_gop_chi_tiet where phieu_id=$1', [id])).rows[0].count);

const results = [];
const check = (test, ok, got) => results.push({ test, pass: !!ok, got: JSON.stringify(got).slice(0, 100) });

const openCard = async (page, code) => {
  const suffix = code.split('-')[1];
  await page.locator('div.cursor-pointer', { hasText: suffix }).first().click();
  await page.waitForTimeout(800);
};

const { browser, page, log } = await startBrowser();
try {
  console.log('before:', (await header(APPROVE)).status, (await header(DELETE)).status);
  await login(page, 'admindev');

  // 1. Approve legacy pending slip (buttons used to be hidden)
  await goMenu(page, 'Rã / Gộp vật tư');
  await openCard(page, APPROVE);
  await page.getByRole('button', { name: 'Duyệt', exact: true }).click();
  await page.waitForTimeout(2500);
  check('Duyệt phiếu Rã cũ (cho_duyet)', (await header(APPROVE)).status === 'Đã duyệt', await header(APPROVE));

  // 2. Delete → soft delete header + linked stock slips, keep detail lines
  await page.reload();
  await page.waitForTimeout(2000);
  await goMenu(page, 'Rã / Gộp vật tư');
  const h = await header(DELETE);
  const detailCount = await details(h.id);
  await openCard(page, DELETE);
  await page.getByRole('button', { name: 'Xóa', exact: true }).click();
  await page.waitForTimeout(2500);
  const st = await stockStatuses(DELETE);
  check('Xóa: phiếu gốc → Đã xóa', (await header(DELETE)).status === 'Đã xóa', await header(DELETE));
  check('Xóa: phiếu kho liên quan → Đã xóa (không xóa cứng)', st.length > 0 && st.every((s) => s === 'Đã xóa'), st);
  check('Xóa: giữ nguyên chi tiết phiếu', (await details(h.id)) === detailCount && detailCount > 0, { before: detailCount, after: await details(h.id) });

  // 3. Trash shows legacy 'da_xoa' and the new one; restore the new one
  await page.reload();
  await page.waitForTimeout(2000);
  await goMenu(page, 'Thùng rác');
  await page.getByText('Dữ liệu sản xuất đã xóa').click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Rã\/Gộp/ }).click();
  await page.waitForTimeout(1500);
  const visible = async (text) => {
    const all = page.getByText(text);
    for (let i = 0; i < (await all.count()); i++) {
      const b = await all.nth(i).boundingBox();
      if (b && b.x >= 0) return true;
    }
    return false;
  };
  check('Thùng rác hiện phiếu cũ trạng thái da_xoa', await visible(LEGACY_DELETED), LEGACY_DELETED);
  check('Thùng rác hiện phiếu vừa xóa', await visible(DELETE), DELETE);
  await page.screenshot({ path: `${SHOTS}/trash_splitmerge.png` });

  const row = page.locator('tr', { hasText: DELETE }).filter({ has: page.locator('button') }).first();
  await row.locator('button.bg-green-50').click();
  await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await page.waitForTimeout(2500);
  const st2 = await stockStatuses(DELETE);
  check('Khôi phục: phiếu gốc → Chờ duyệt', (await header(DELETE)).status === 'Chờ duyệt', await header(DELETE));
  check('Khôi phục: phiếu kho → Chờ duyệt', st2.length > 0 && st2.every((s) => s === 'Chờ duyệt'), st2);
} catch (e) {
  check('SCRIPT ERROR', false, e.message.slice(0, 160));
  await page.screenshot({ path: `${SHOTS}/splitmerge_error.png` });
} finally {
  console.table(results);
  if (results.some((r) => ('pass' in r ? !r.pass : 'ok' in r ? !r.ok : 'expect' in r ? r.expect !== r.got : true))) process.exitCode = 1;
  console.log('Blocked prod requests:', log.blockedProd.length, '| page errors:', log.pageErrors);
  await browser.close();
  await c.end();
}
