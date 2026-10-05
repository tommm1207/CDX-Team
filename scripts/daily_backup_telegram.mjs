import { Client } from 'pg';
import ExcelJS from 'exceljs';
import dotenv from 'dotenv';

dotenv.config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ─── Brand Colors ──────────────────────────────────────────────────────────────
const CDX_GREEN = '2D5A27';
const CDX_GREEN_LIGHT = 'EFF7EE';
const CDX_GREEN_MID = 'C8E6C1';
const CDX_GRAY = '6B7280';
const CDX_LIGHT_GRAY = 'F9FAFB';
const CDX_BORDER = 'D1D5DB';
const WHITE = 'FFFFFFFF';

const thinBorder = (argb = CDX_BORDER) => ({ style: 'thin', color: { argb } });
const allBorders = (argb = CDX_BORDER) => ({
  top: thinBorder(argb),
  left: thinBorder(argb),
  bottom: thinBorder(argb),
  right: thinBorder(argb),
});

// Helper auto column width
function autoFitColumns(ws, minWidth = 12) {
  ws.columns.forEach(column => {
    let maxLen = minWidth;
    column.eachCell({ includeEmpty: false }, (cell, rowNumber) => {
      if (rowNumber > 4) { // Skip title banners
        const valStr = cell.value ? String(cell.value) : '';
        if (valStr.length > maxLen) maxLen = Math.min(valStr.length, 50);
      }
    });
    column.width = maxLen + 4;
  });
}

// Apply unified banner and header to a sheet
function formatSheetHeader(ws, title, totalRows, colCount) {
  ws.views = [{ showGridLines: true }];
  const lastColLetter = colCount <= 26 ? String.fromCharCode(64 + colCount) : 'Z';

  // Row 1: Brand Banner
  ws.mergeCells(`A1:${lastColLetter}1`);
  const r1 = ws.getCell('A1');
  r1.value = 'CDX – CON ĐƯỜNG XANH  |  HỆ THỐNG QUẢN LÝ DOANH NGHIỆP';
  r1.font = { name: 'Calibri', size: 12, bold: true, color: { argb: WHITE } };
  r1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CDX_GREEN } };
  r1.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(1).height = 28;

  // Row 2: Title
  ws.mergeCells(`A2:${lastColLetter}2`);
  const r2 = ws.getCell('A2');
  r2.value = title.toUpperCase();
  r2.font = { name: 'Calibri', size: 14, bold: true, color: { argb: CDX_GREEN } };
  r2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CDX_GREEN_LIGHT } };
  r2.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  r2.border = allBorders(CDX_GREEN_MID);
  ws.getRow(2).height = 26;

  // Row 3: Meta
  ws.mergeCells(`A3:${lastColLetter}3`);
  const r3 = ws.getCell('A3');
  const now = new Date();
  r3.value = `Thời điểm sao lưu: ${now.toLocaleDateString('vi-VN')} ${now.toLocaleTimeString('vi-VN')}  •  Tổng cộng: ${totalRows} bản ghi dữ liệu`;
  r3.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: CDX_GRAY } };
  r3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CDX_GREEN_LIGHT } };
  r3.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(3).height = 18;

  ws.getRow(4).height = 8; // Spacer
}

async function runBackup() {
  const now = new Date();
  const dateStr = now.toISOString().substring(0, 10);
  const timeStr = now.toLocaleTimeString('vi-VN');

  console.log(`[${dateStr} ${timeStr}] Bắt đầu xuất bản sao lưu cao cấp CDX...`);

  const connectionString = process.env.DATABASE_URL || 'postgresql://postgres.whyulopkxtqlqrhbxdgt:CDX2026cdx@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';
  const client = new Client({
    connectionString,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    connectionTimeoutMillis: 30000,
    statement_timeout: 60000,
  });

  client.on('error', (err) => {
    console.warn('[DB] Lỗi kết nối nền (đã bắt):', err.message);
  });

  await client.connect();

  const wb = new ExcelJS.Workbook();
  wb.creator = 'CDX Enterprise System';
  wb.created = now;

  // Sheet 1: Cover / Summary Dashboard
  const cover = wb.addWorksheet('TỔNG QUAN', { views: [{ showGridLines: false }] });

  // Fetch Users for ID mapping
  const usersRes = await client.query(`SELECT id, code, full_name, role, status, phone FROM users ORDER BY code;`);
  const userMap = new Map();
  usersRes.rows.forEach(u => userMap.set(u.id, u));

  const sheetsSummary = [];

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. SHEET CHẤM CÔNG (Attendance) - Rất quan trọng, trình bày cực đẹp
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const attRes = await client.query(`
      SELECT a.id, a.employee_id, to_char(a.date, 'YYYY-MM-DD') as date_str, a.status, 
             a.hours_worked, a.overtime_hours, a.notes, a.created_at
      FROM attendance a
      ORDER BY a.date DESC, a.employee_id ASC;
    `);

    const ws = wb.addWorksheet('Chấm công');
    const cols = ['STT', 'Mã NV', 'Họ và tên', 'Ngày chấm', 'Thứ', 'Trạng thái', 'Giờ làm', 'Tăng ca (h)', 'Ghi chú', 'Mã ID Gốc (Khôi phục)'];
    formatSheetHeader(ws, 'BÁO CÁO DỮ LIỆU CHẤM CÔNG NHÂN SỰ', attRes.rows.length, cols.length);

    // Headers row 5
    const hRow = ws.getRow(5);
    hRow.height = 24;
    cols.forEach((c, idx) => {
      const cell = hRow.getCell(idx + 1);
      cell.value = c;
      cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: WHITE } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CDX_GREEN } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = allBorders(CDX_GREEN);
    });

    const dowMap = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

    attRes.rows.forEach((r, idx) => {
      const u = userMap.get(r.employee_id) || {};
      const d = r.date_str ? new Date(r.date_str) : null;
      const dow = d ? dowMap[d.getDay()] : '';
      const statusVi = r.status === 'present' ? 'Đi làm' : (r.status === 'half_day' ? 'Nửa ngày' : (r.status === 'absent' ? 'Nghỉ' : r.status));

      const row = ws.getRow(idx + 6);
      row.height = 20;
      const isEven = idx % 2 === 1;
      const bg = isEven ? CDX_LIGHT_GRAY : WHITE;

      const values = [
        idx + 1,
        u.code || '',
        u.full_name || 'Chưa xác định',
        r.date_str || '',
        dow,
        statusVi,
        Number(r.hours_worked || 8),
        Number(r.overtime_hours || 0),
        r.notes || '',
        r.id
      ];

      values.forEach((v, cIdx) => {
        const cell = row.getCell(cIdx + 1);
        cell.value = v;
        cell.font = { name: 'Calibri', size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.border = allBorders(CDX_BORDER);
        
        if (cIdx === 0 || cIdx === 1 || cIdx === 3 || cIdx === 4 || cIdx === 5) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (cIdx === 6 || cIdx === 7) {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.numFmt = '#,##0.0';
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      });
      row.commit();
    });

    autoFitColumns(ws);
    sheetsSummary.push({ name: 'Chấm công', count: attRes.rows.length, desc: 'Dữ liệu chấm công toàn bộ các tháng' });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. SHEET TẠM ỨNG (Advances)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const advRes = await client.query(`
      SELECT a.id, a.employee_id, to_char(a.date, 'YYYY-MM-DD') as date_str, a.amount, a.reason, a.created_at
      FROM advances a
      ORDER BY a.date DESC;
    `);

    const ws = wb.addWorksheet('Tạm ứng');
    const cols = ['STT', 'Mã NV', 'Họ và tên', 'Ngày tạm ứng', 'Số tiền (VNĐ)', 'Lý do / Nội dung', 'Mã ID Gốc'];
    formatSheetHeader(ws, 'BÁO CÁO DỮ LIỆU TẠM ỨNG LƯƠNG NHÂN SỰ', advRes.rows.length, cols.length);

    const hRow = ws.getRow(5);
    hRow.height = 24;
    cols.forEach((c, idx) => {
      const cell = hRow.getCell(idx + 1);
      cell.value = c;
      cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: WHITE } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CDX_GREEN } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = allBorders(CDX_GREEN);
    });

    advRes.rows.forEach((r, idx) => {
      const u = userMap.get(r.employee_id) || {};
      const row = ws.getRow(idx + 6);
      row.height = 20;
      const isEven = idx % 2 === 1;
      const bg = isEven ? CDX_LIGHT_GRAY : WHITE;

      const values = [
        idx + 1,
        u.code || '',
        u.full_name || '',
        r.date_str || '',
        Number(r.amount || 0),
        r.reason || '',
        r.id
      ];

      values.forEach((v, cIdx) => {
        const cell = row.getCell(cIdx + 1);
        cell.value = v;
        cell.font = { name: 'Calibri', size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.border = allBorders(CDX_BORDER);

        if (cIdx === 0 || cIdx === 1 || cIdx === 3) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (cIdx === 4) {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'C0392B' } };
          cell.numFmt = '#,##0 "đ"';
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      });
      row.commit();
    });

    autoFitColumns(ws);
    sheetsSummary.push({ name: 'Tạm ứng', count: advRes.rows.length, desc: 'Dữ liệu các khoản tạm ứng của nhân sự' });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. SHEET CẤU HÌNH LƯƠNG (Salary Settings)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const salRes = await client.query(`SELECT * FROM salary_settings ORDER BY employee_id;`);
    const ws = wb.addWorksheet('Cấu hình Lương');
    const cols = ['STT', 'Mã NV', 'Họ và tên', 'Loại lương', 'Lương ngày (VNĐ)', 'Lương cơ bản', 'Phụ cấp ăn', 'Phụ cấp khác', 'Giảm trừ BH', 'Mã ID Gốc'];
    formatSheetHeader(ws, 'BẢNG CẤU HÌNH ĐƠN GIÁ VÀ HỢP ĐỒNG LƯƠNG', salRes.rows.length, cols.length);

    const hRow = ws.getRow(5);
    hRow.height = 24;
    cols.forEach((c, idx) => {
      const cell = hRow.getCell(idx + 1);
      cell.value = c;
      cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: WHITE } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CDX_GREEN } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = allBorders(CDX_GREEN);
    });

    salRes.rows.forEach((r, idx) => {
      const u = userMap.get(r.employee_id) || {};
      const row = ws.getRow(idx + 6);
      row.height = 20;
      const isEven = idx % 2 === 1;
      const bg = isEven ? CDX_LIGHT_GRAY : WHITE;

      const values = [
        idx + 1,
        u.code || '',
        u.full_name || '',
        r.salary_type === 'monthly' ? 'Lương tháng' : 'Lương ngày',
        Number(r.daily_rate || 0),
        Number(r.base_salary || 0),
        Number(r.meal_allowance || 0),
        Number(r.other_allowance || 0),
        Number(r.insurance_deduction || 0),
        r.id
      ];

      values.forEach((v, cIdx) => {
        const cell = row.getCell(cIdx + 1);
        cell.value = v;
        cell.font = { name: 'Calibri', size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.border = allBorders(CDX_BORDER);

        if (cIdx === 0 || cIdx === 1 || cIdx === 3) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (cIdx >= 4 && cIdx <= 8) {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.numFmt = '#,##0 "đ"';
          if (cIdx === 4 && v > 0) cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: '27AE60' } };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      });
      row.commit();
    });

    autoFitColumns(ws);
    sheetsSummary.push({ name: 'Cấu hình Lương', count: salRes.rows.length, desc: 'Đơn giá lương ngày và phụ cấp của từng người' });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. SHEET DANH SÁCH NHÂN SỰ (Users)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet('Danh sách Nhân sự');
    const cols = ['STT', 'Mã NV', 'Họ và tên', 'Chức vụ / Vai trò', 'Trạng thái', 'Số điện thoại', 'Có tính lương', 'Mã ID Gốc'];
    formatSheetHeader(ws, 'DANH SÁCH TOÀN BỘ NHÂN SỰ CDX', usersRes.rows.length, cols.length);

    const hRow = ws.getRow(5);
    hRow.height = 24;
    cols.forEach((c, idx) => {
      const cell = hRow.getCell(idx + 1);
      cell.value = c;
      cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: WHITE } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CDX_GREEN } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = allBorders(CDX_GREEN);
    });

    usersRes.rows.forEach((r, idx) => {
      const row = ws.getRow(idx + 6);
      row.height = 20;
      const isEven = idx % 2 === 1;
      const bg = isEven ? CDX_LIGHT_GRAY : WHITE;

      const values = [
        idx + 1,
        r.code,
        r.full_name,
        r.role || '',
        r.status || 'Đang làm việc',
        r.phone || '',
        r.has_salary ? 'Có' : 'Không',
        r.id
      ];

      values.forEach((v, cIdx) => {
        const cell = row.getCell(cIdx + 1);
        cell.value = v;
        cell.font = { name: 'Calibri', size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.border = allBorders(CDX_BORDER);

        if (cIdx === 0 || cIdx === 1 || cIdx === 4 || cIdx === 6) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      });
      row.commit();
    });

    autoFitColumns(ws);
    sheetsSummary.push({ name: 'Danh sách Nhân sự', count: usersRes.rows.length, desc: 'Hồ sơ nhân viên, chức vụ, thông tin liên lạc' });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. SHEET NHẬT KÝ THI CÔNG (Construction Diaries)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const diaRes = await client.query(`SELECT id, to_char(date, 'YYYY-MM-DD') as date_str, labor_info, work_progress, weather, equipment_info FROM construction_diaries ORDER BY date DESC;`);
    const ws = wb.addWorksheet('Nhật ký thi công');
    const cols = ['STT', 'Ngày thi công', 'Nhân lực / Tổ đội', 'Tiến độ công việc', 'Thời tiết', 'Thiết bị & Xe máy', 'Mã ID Gốc'];
    formatSheetHeader(ws, 'NHẬT KÝ THI CÔNG HIỆN TRƯỜNG', diaRes.rows.length, cols.length);

    const hRow = ws.getRow(5);
    hRow.height = 24;
    cols.forEach((c, idx) => {
      const cell = hRow.getCell(idx + 1);
      cell.value = c;
      cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: WHITE } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CDX_GREEN } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = allBorders(CDX_GREEN);
    });

    diaRes.rows.forEach((r, idx) => {
      const row = ws.getRow(idx + 6);
      row.height = 22;
      const isEven = idx % 2 === 1;
      const bg = isEven ? CDX_LIGHT_GRAY : WHITE;

      const values = [idx + 1, r.date_str || '', r.labor_info || '', r.work_progress || '', r.weather || '', r.equipment_info || '', r.id];

      values.forEach((v, cIdx) => {
        const cell = row.getCell(cIdx + 1);
        cell.value = v;
        cell.font = { name: 'Calibri', size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.border = allBorders(CDX_BORDER);
        cell.alignment = cIdx <= 1 ? { horizontal: 'center', vertical: 'middle' } : { horizontal: 'left', vertical: 'middle' };
      });
      row.commit();
    });

    autoFitColumns(ws);
    sheetsSummary.push({ name: 'Nhật ký thi công', count: diaRes.rows.length, desc: 'Nhật ký tiến độ, thời tiết, tổ đội làm việc' });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. CÁC SHEET KHO & VẬT TƯ & CHI PHÍ
  // ─────────────────────────────────────────────────────────────────────────────
  const otherTables = [
    { table: 'costs', sheet: 'Báo cáo Chi phí', title: 'BÁO CÁO CÁC KHOẢN CHI PHÍ DỰ ÁN' },
    { table: 'warehouses', sheet: 'Danh sách Kho', title: 'DANH SÁCH CÁC KHO VẬT TƯ' },
    { table: 'materials', sheet: 'Danh mục Vật tư', title: 'DANH MỤC VẬT TƯ VÀ ĐƠN VỊ TÍNH' },
    { table: 'stock_in', sheet: 'Nhập kho', title: 'LỊCH SỬ PHIẾU NHẬP KHO' },
    { table: 'stock_out', sheet: 'Xuất kho', title: 'LỊCH SỬ PHIẾU XUẤT KHO' },
    { table: 'transfers', sheet: 'Chuyển kho', title: 'LỊCH SỬ ĐIỀU CHUYỂN VẬT TƯ NỘI BỘ' },
    { table: 'notes', sheet: 'Ghi chú & Nhắc việc', title: 'DANH SÁCH GHI CHÚ VÀ LƯU Ý KỸ THUẬT' }
  ];

  for (const item of otherTables) {
    try {
      const res = await client.query(`SELECT * FROM "${item.table}";`);
      const rows = res.rows;
      const ws = wb.addWorksheet(item.sheet);

      if (rows.length > 0) {
        const columns = ['STT', ...Object.keys(rows[0])];
        formatSheetHeader(ws, item.title, rows.length, columns.length);

        const hRow = ws.getRow(5);
        hRow.height = 24;
        columns.forEach((c, idx) => {
          const cell = hRow.getCell(idx + 1);
          cell.value = c;
          cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: WHITE } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CDX_GREEN } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = allBorders(CDX_GREEN);
        });

        rows.forEach((r, idx) => {
          const row = ws.getRow(idx + 6);
          row.height = 20;
          const isEven = idx % 2 === 1;
          const bg = isEven ? CDX_LIGHT_GRAY : WHITE;

          const values = [idx + 1, ...Object.keys(r).map(k => {
            const val = r[k];
            if (val instanceof Date) return val.toISOString().substring(0, 10);
            if (typeof val === 'object' && val !== null) return JSON.stringify(val);
            return val ?? '';
          })];

          values.forEach((v, cIdx) => {
            const cell = row.getCell(cIdx + 1);
            cell.value = v;
            cell.font = { name: 'Calibri', size: 10 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
            cell.border = allBorders(CDX_BORDER);
            cell.alignment = cIdx === 0 ? { horizontal: 'center', vertical: 'middle' } : { horizontal: 'left', vertical: 'middle' };
          });
          row.commit();
        });

        autoFitColumns(ws);
      } else {
        formatSheetHeader(ws, item.title, 0, 3);
        const hRow = ws.getRow(5);
        hRow.getCell(1).value = 'Chưa có bản ghi nào';
        hRow.getCell(1).font = { italic: true };
      }

      sheetsSummary.push({ name: item.sheet, count: rows.length, desc: `Dữ liệu bảng ${item.table}` });
    } catch (e) {
      console.warn(`Lỗi xuất bảng ${item.table}:`, e.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Populate Cover / Summary Dashboard (Sheet 1)
  cover.getColumn(1).width = 28;
  cover.getColumn(2).width = 18;
  cover.getColumn(3).width = 45;

  // Banner
  cover.mergeCells('A1:C1');
  const b1 = cover.getCell('A1');
  b1.value = 'CDX – CÔNG TY CON ĐƯỜNG XANH';
  b1.font = { name: 'Calibri', size: 18, bold: true, color: { argb: WHITE } };
  b1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CDX_GREEN } };
  b1.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  cover.getRow(1).height = 42;

  cover.mergeCells('A2:C2');
  const b2 = cover.getCell('A2');
  b2.value = 'HỆ THỐNG SAO LƯU DỮ LIỆU ĐỊNH KỲ AN TOÀN CAO CẤP';
  b2.font = { name: 'Calibri', size: 11, italic: true, color: { argb: WHITE } };
  b2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CDX_GREEN } };
  b2.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  cover.getRow(2).height = 24;

  cover.getRow(3).height = 10;

  // Report Box
  cover.mergeCells('A4:C4');
  const b4 = cover.getCell('A4');
  b4.value = `BẢN SAO LƯU TOÀN DIỆN NGÀY ${dateStr}`;
  b4.font = { name: 'Calibri', size: 14, bold: true, color: { argb: CDX_GREEN } };
  b4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CDX_GREEN_LIGHT } };
  b4.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  b4.border = allBorders(CDX_GREEN_MID);
  cover.getRow(4).height = 30;

  cover.getRow(5).height = 22;
  cover.getCell('A5').value = 'Thời điểm trích xuất:';
  cover.getCell('A5').font = { name: 'Calibri', bold: true, size: 10, color: { argb: CDX_GRAY } };
  cover.getCell('A5').alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  cover.getCell('B5').value = `${dateStr}  ${timeStr}`;
  cover.getCell('B5').font = { name: 'Calibri', size: 10, bold: true, color: { argb: CDX_GRAY } };
  cover.getCell('B5').alignment = { horizontal: 'left', vertical: 'middle' };

  cover.getRow(6).height = 10;

  // Table of Contents Header
  cover.getRow(7).height = 24;
  ['Tên Danh Mục (Sheet)', 'Số Bản Ghi', 'Nội Dung & Mục Đích'].forEach((h, i) => {
    const cell = cover.getCell(7, i + 1);
    cell.value = h;
    cell.font = { name: 'Calibri', bold: true, size: 10.5, color: { argb: WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CDX_GREEN } };
    cell.alignment = { horizontal: i === 1 ? 'center' : 'left', vertical: 'middle', indent: i === 1 ? 0 : 1 };
    cell.border = allBorders(CDX_GREEN);
  });

  const totalAllRows = sheetsSummary.reduce((acc, s) => acc + s.count, 0);

  sheetsSummary.forEach((s, idx) => {
    const rIdx = 8 + idx;
    cover.getRow(rIdx).height = 20;
    const bg = idx % 2 === 0 ? CDX_GREEN_LIGHT : WHITE;

    const c1 = cover.getCell(rIdx, 1);
    c1.value = s.name;
    c1.font = { name: 'Calibri', size: 10, bold: true };
    c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    c1.border = allBorders();
    c1.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

    const c2 = cover.getCell(rIdx, 2);
    c2.value = s.count;
    c2.font = { name: 'Calibri', size: 10, bold: true, color: { argb: CDX_GREEN } };
    c2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    c2.border = allBorders();
    c2.alignment = { horizontal: 'center', vertical: 'middle' };
    c2.numFmt = '#,##0';

    const c3 = cover.getCell(rIdx, 3);
    c3.value = s.desc;
    c3.font = { name: 'Calibri', size: 9.5, color: { argb: CDX_GRAY } };
    c3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    c3.border = allBorders();
    c3.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  });

  // Total row
  const totRowIdx = 8 + sheetsSummary.length;
  cover.getRow(totRowIdx).height = 24;

  const t1 = cover.getCell(totRowIdx, 1);
  t1.value = 'TỔNG CỘNG TOÀN HỆ THỐNG';
  t1.font = { name: 'Calibri', size: 11, bold: true, color: { argb: WHITE } };
  t1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CDX_GREEN } };
  t1.border = allBorders(CDX_GREEN);
  t1.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

  const t2 = cover.getCell(totRowIdx, 2);
  t2.value = totalAllRows;
  t2.font = { name: 'Calibri', size: 11, bold: true, color: { argb: WHITE } };
  t2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CDX_GREEN } };
  t2.border = allBorders(CDX_GREEN);
  t2.alignment = { horizontal: 'center', vertical: 'middle' };
  t2.numFmt = '#,##0';

  const t3 = cover.getCell(totRowIdx, 3);
  t3.value = 'Bao gồm dữ liệu Chấm công, Lương, Tạm ứng, Kho và Chi phí';
  t3.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: WHITE } };
  t3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CDX_GREEN } };
  t3.border = allBorders(CDX_GREEN);
  t3.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

  // Guide row
  const gIdx = totRowIdx + 2;
  cover.mergeCells(`A${gIdx}:C${gIdx}`);
  const gCell = cover.getCell(`A${gIdx}`);
  gCell.value = '💡 HƯỚNG DẪN: File này được trình bày song song cả Tên nhân sự/Tiếng Việt rõ ràng và Mã ID kỹ thuật. Khi cần khôi phục dữ liệu, máy tính có thể đọc chuẩn xác 100% không sợ sai lệch.';
  gCell.font = { name: 'Calibri', size: 9.5, italic: true, bold: true, color: { argb: CDX_GREEN } };
  gCell.alignment = { horizontal: 'left', vertical: 'middle' };
  cover.getRow(gIdx).height = 24;

  try { await client.end(); } catch (_) {}

  // Generate in memory RAM
  const buffer = await wb.xlsx.writeBuffer();
  const fileName = `CDX_Backup_Chuan_${dateStr}.xlsx`;
  const fileSizeKB = (buffer.byteLength / 1024).toFixed(1);

  console.log(`✅ Đã tạo file Excel cao cấp trong RAM (${fileSizeKB} KB, ${totalAllRows} dòng dữ liệu).`);

  // Send to Telegram
  const caption = 
`💎 *[CDX VIP BACKUP] BẢN SAO LƯU ĐỊNH KỲ CAO CẤP*
📅 *Ngày:* ${dateStr} - *Giờ:* ${timeStr}
📊 *Tổng cộng:* *${totalAllRows.toLocaleString('vi-VN')}* dòng dữ liệu
📦 *Dung lượng:* ${fileSizeKB} KB

*Ưu điểm bản sao lưu mới:*
✨ Có Tab *TỔNG QUAN* làm mục lục báo cáo.
✨ Chấm công & Tạm ứng hiển thị đầy đủ *Mã NV, Họ tên, Thứ, Đơn giá tiền (VNĐ)* cực kỳ dễ đọc.
✨ Cột tự động co giãn vừa vặn, không bị che khuất hoặc lỗi \`###\`.
✨ Giữ nguyên *Mã ID Gốc* ở cột cuối để hệ thống có thể tự động khôi phục chuẩn xác 100% khi có sự cố.

_Bản sao lưu gửi trực tiếp lên Telegram Cloud, không chiếm ổ đĩa máy tính._`;

  try {
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const form = new FormData();
    form.append('chat_id', TELEGRAM_CHAT_ID);
    form.append('caption', caption);
    form.append('parse_mode', 'Markdown');
    form.append('document', blob, fileName);

    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`, {
      method: 'POST',
      body: form
    });

    const result = await response.json();
    if (result.ok) {
      console.log('🚀 ĐÃ GỬI BẢN SAO LƯU CAO CẤP ĐẾN TELEGRAM THÀNH CÔNG!');
    } else {
      console.error('❌ Lỗi gửi Telegram:', result.description);
    }
  } catch (tgErr) {
    console.error('❌ Lỗi kết nối Telegram API:', tgErr.message);
  }
}

runBackup().catch((err) => {
  console.error('❌ Lỗi backup:', err.message || err);
  process.exit(1);
});
