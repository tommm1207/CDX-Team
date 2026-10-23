// Shared helpers for E2E runs against the TEST database only.
// Chạy từ thư mục gốc repo khi app đang chạy: npx vite --mode test --port 5199 --strictPort
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import pg from 'pg';
import dotenv from 'dotenv';

export { chromium };
export const { Client } = pg;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
dotenv.config({ path: path.join(ROOT, '.env.test'), quiet: true });

export const APP = 'http://localhost:5199/';
export const PROD_REF = 'whyulopkxtqlqrhbxdgt';
export const SHOTS = path.join(os.tmpdir(), 'cdx-e2e-shots');
fs.mkdirSync(SHOTS, { recursive: true });

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes(PROD_REF)) {
  throw new Error('E2E chỉ chạy trên DB test (.env.test)');
}

export const db = async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  return c;
};

export const startBrowser = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const log = { blockedProd: [], consoleErrors: [], pageErrors: [] };
  // Hard safety net: never let the app talk to the production project
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.includes(PROD_REF)) {
      log.blockedProd.push(u);
      return route.abort();
    }
    if (u.includes('ip-api.com')) return route.abort();
    return route.continue();
  });
  page.on('console', (m) => {
    if (m.type() === 'error') log.consoleErrors.push(m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => log.pageErrors.push(String(e.message).slice(0, 300)));
  page.on('dialog', (d) => d.accept());
  return { browser, page, log };
};

export const login = async (page, code) => {
  const c = await db();
  const { rows } = await c.query('select app_pass from users where code = $1', [code]);
  await c.end();
  await page.goto(APP);
  await page.getByPlaceholder('Nhập mã nhân viên...').fill(code);
  await page.getByPlaceholder('Nhập mật khẩu...').fill(rows[0].app_pass);
  await page.getByRole('button', { name: /ĐĂNG NHẬP NGAY/ }).click();
  await page.getByText('HỆ THỐNG QUẢN TRỊ NGUỒN LỰC THI CÔNG').first().waitFor();
  await page.waitForTimeout(1500);
};

export const goMenu = async (page, label) => {
  await page.locator('button', { hasText: label }).first().click();
  await page.waitForTimeout(1800);
};
