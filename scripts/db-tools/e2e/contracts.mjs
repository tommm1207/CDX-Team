// Contracts: edit existing (updates same row), export .docx from form and list, soft delete,
// new contract inserts and re-export updates instead of duplicating. TEST DB only.
import fs from 'fs';
import { startBrowser, login, goMenu, db, SHOTS } from './lib.mjs';

const c = await db();
const all = async () => (await c.query('select id, contract_code, party_b_info, is_deleted, content from contracts order by created_at')).rows;
const before = await all();
const target = before.find((x) => !x.is_deleted);

const results = [];
const check = (test, ok, got) => results.push({ test, pass: !!ok, got: JSON.stringify(got).slice(0, 110) });

const { browser, page, log } = await startBrowser();
const card = () => page.locator('div.group', { hasText: target.contract_code }).first();
const cardButton = async (title) => {
  await card().hover();
  await page.waitForTimeout(500);
  await card().locator(`button[title="${title}"]`).click();
};
const expectDownload = async (action) => {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), action()]);
  const p = `${SHOTS}/${dl.suggestedFilename()}`;
  await dl.saveAs(p);
  return { name: dl.suggestedFilename(), size: fs.statSync(p).size };
};

try {
  await login(page, 'admindev');
  await goMenu(page, 'Hợp đồng');

  // 1. Edit existing contract → form prefilled; save via export updates the same row
  await cardButton('Sửa');
  await page.waitForTimeout(1000);
  const codeShown = await page.getByText(target.contract_code).count();
  check('Sửa: form mở đúng hợp đồng', codeShown > 0, target.contract_code);
  const nameInput = page.locator(`input[value="${target.party_b_info.companyName}"]`).first();
  const repInput = page.locator(`input[value="${target.party_b_info.representative}"]`).first();
  await repInput.fill('E2E Dai dien');
  const dl1 = await expectDownload(() => page.getByRole('button', { name: /Xuất file Word/ }).click());
  check('Sửa: xuất file Word từ form', dl1.size > 3000 && dl1.name.endsWith('.docx'), dl1);
  await page.waitForTimeout(1500);
  const after1 = await all();
  const t1 = after1.find((x) => x.id === target.id);
  check('Sửa: cập nhật đúng bản ghi, không tạo bản mới', after1.length === before.length && t1.party_b_info.representative === 'E2E Dai dien', { count: after1.length, rep: t1.party_b_info.representative });
  check('Sửa: lưu ngày hợp đồng vào content.date', !!t1.content?.date, t1.content?.date);

  // 2. Export from the list
  await page.locator('button', { has: page.locator('svg.lucide-arrow-left') }).first().click();
  await page.waitForTimeout(1500);
  const dl2 = await expectDownload(() => cardButton('Xuất file Word'));
  check('Danh sách: nút Xuất Word tải file', dl2.size > 3000, dl2);

  // 3. New steel-sheet contract: export twice → one row (insert then update)
  await page.getByRole('button', { name: /Thuê thép/i }).click();
  await page.waitForTimeout(1000);
  await expectDownload(() => page.getByRole('button', { name: /Xuất file Word/ }).click());
  await page.waitForTimeout(1000);
  await expectDownload(() => page.getByRole('button', { name: /Xuất file Word/ }).click());
  await page.waitForTimeout(1500);
  const after3 = await all();
  check('Tạo mới + xuất 2 lần: chỉ thêm 1 hợp đồng', after3.length === before.length + 1, after3.length - before.length);
  await page.locator('button', { has: page.locator('svg.lucide-arrow-left') }).first().click();
  await page.waitForTimeout(1500);

  // 4. Soft delete the original contract
  await cardButton('Xóa');
  await page.getByRole('button', { name: 'Xóa', exact: true }).last().click();
  await page.waitForTimeout(2000);
  const t4 = (await all()).find((x) => x.id === target.id);
  check('Xóa: xóa mềm (is_deleted = true, vẫn còn dữ liệu)', t4?.is_deleted === true, t4?.is_deleted);
  // Đếm thẻ hợp đồng (không đếm toast "Đã xóa hợp đồng …" cũng chứa mã)
  check('Xóa: biến mất khỏi danh sách', (await card().count()) === 0, null);
} catch (e) {
  check('SCRIPT ERROR', false, e.message.slice(0, 160));
  await page.screenshot({ path: `${SHOTS}/contracts_error.png` });
} finally {
  console.table(results);
  if (results.some((r) => ('pass' in r ? !r.pass : 'ok' in r ? !r.ok : 'expect' in r ? r.expect !== r.got : true))) process.exitCode = 1;
  console.log('Blocked prod requests:', log.blockedProd.length, '| page errors:', log.pageErrors);
  await browser.close();
  await c.end();
}
