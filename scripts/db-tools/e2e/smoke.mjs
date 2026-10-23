// Smoke test: log in as Develop and open every changed screen; report crashes / errors.
import fs from 'fs';
import { startBrowser, login, goMenu, SHOTS } from './lib.mjs';

fs.mkdirSync(SHOTS, { recursive: true });
const { browser, page, log } = await startBrowser();
const results = [];
try {
  await login(page, 'admindev');
  const pages = [
    'Chi phí', 'Phiếu quyết toán', 'Phiếu duyệt', 'Nhập kho', 'Xuất kho', 'Luân chuyển kho',
    'Nhật ký thi công', 'Rã / Gộp vật tư', 'Chấm công', 'Tạm ứng & phụ cấp', 'Bảng lương',
    'Cài đặt lương', 'Nhóm vật tư', 'Hợp đồng', 'Thùng rác',
  ];
  for (const label of pages) {
    const before = log.pageErrors.length + log.consoleErrors.length;
    try {
      await goMenu(page, label);
      const crashed = await page.getByText(/Đã xảy ra lỗi|Something went wrong/i).count();
      const errs = log.pageErrors.length + log.consoleErrors.length - before;
      results.push({ page: label, ok: !crashed && !errs, crashed: !!crashed, newErrors: errs });
      await page.screenshot({ path: `${SHOTS}/${label.replace(/[^\p{L}\d]+/gu, '_')}.png` });
    } catch (e) {
      results.push({ page: label, ok: false, error: e.message.slice(0, 120) });
    }
  }
  // Trash sub-page added in this branch
  await page.getByText('Tạm ứng & phụ cấp đã xóa').click();
  await page.waitForTimeout(1500);
  results.push({
    page: 'Thùng rác → Tạm ứng & phụ cấp đã xóa',
    ok: (await page.getByText(/Thùng rác trống|Khôi phục/).count()) > 0,
  });
} finally {
  console.table(results);
  if (results.some((r) => ('pass' in r ? !r.pass : 'ok' in r ? !r.ok : 'expect' in r ? r.expect !== r.got : true))) process.exitCode = 1;
  console.log('Blocked prod requests:', log.blockedProd.length);
  console.log('Page errors:', log.pageErrors);
  console.log('Console errors:', [...new Set(log.consoleErrors)].slice(0, 15));
  await browser.close();
}
