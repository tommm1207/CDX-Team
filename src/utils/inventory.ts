import { supabase } from '@/lib/supabase';
import { generateSmartCode } from './codeGenerator';
import { toLocalISODate } from './format';

/**
 * Tổng nhập kho của 1 mặt hàng tại 1 kho trong khoảng [startDate, endDate].
 * Chỉ tính phiếu ĐÃ DUYỆT (nhập chính thức).
 */
export const tongNhap = async (
  materialId: string,
  warehouseId: string,
  startDate: string,
  endDate: string,
): Promise<number> => {
  const { data } = await supabase
    .from('stock_in')
    .select('quantity')
    .eq('material_id', materialId)
    .eq('warehouse_id', warehouseId)
    .eq('status', 'Đã duyệt')
    .gte('date', startDate)
    .lte('date', endDate);
  return (data || []).reduce((sum, item) => sum + Number(item.quantity), 0);
};

/**
 * Tổng xuất kho của 1 mặt hàng tại 1 kho trong khoảng [startDate, endDate].
 * Tính cả phiếu ĐÃ DUYỆT và CHỜ DUYỆT để khoá số lượng ngay khi phiếu được tạo,
 * tránh tình trạng nhiều phiếu xuất song song vượt tồn kho.
 *
 * @param excludeId  UUID của phiếu xuất cần loại trừ (dùng khi ĐANG SỬA phiếu đó)
 */
export const tongXuat = async (
  materialId: string,
  warehouseId: string,
  startDate: string,
  endDate: string,
  excludeId?: string,
): Promise<number> => {
  let query = supabase
    .from('stock_out')
    .select('id, quantity')
    .eq('material_id', materialId)
    .eq('warehouse_id', warehouseId)
    // Lock tồn kho ngay khi phiếu được tạo để tránh 2 phiếu xuất song song vượt tồn.
    // Khi phiếu bị 'Từ chối', status thay đổi và tự động không còn được tính nữa.
    .in('status', ['Đã duyệt', 'Chờ duyệt'])
    .gte('date', startDate)
    .lte('date', endDate);

  if (excludeId) {
    query = query.neq('id', excludeId);
  }

  const { data } = await query;
  return (data || []).reduce((sum, item) => sum + Number(item.quantity), 0);
};

/**
 * Tổng giảm trừ do chuyển kho đi (kho này là kho xuất/from) trong khoảng [startDate, endDate].
 * Tính cả ĐÃ DUYỆT và CHỜ DUYỆT để giữ chỗ tồn kho ngay khi tạo phiếu chuyển,
 * đồng bộ với cách tính tongXuat (tránh tình trạng tồn kho âm khi phiếu chuyển được duyệt).
 *
 * @param excludeId  UUID của phiếu chuyển cần loại trừ (dùng khi ĐANG SỬA/DUYỆT phiếu đó)
 */
export const giamTruChuyenDi = async (
  materialId: string,
  warehouseId: string,
  startDate: string,
  endDate: string,
  excludeId?: string,
): Promise<number> => {
  let query = supabase
    .from('transfers')
    .select('quantity')
    .eq('material_id', materialId)
    .eq('from_warehouse_id', warehouseId)
    .in('status', ['Đã duyệt', 'Chờ duyệt'])
    .gte('date', startDate)
    .lte('date', endDate);

  if (excludeId) {
    query = query.neq('id', excludeId);
  }

  const { data } = await query;
  return (data || []).reduce((sum, item) => sum + Number(item.quantity), 0);
};

/**
 * Tổng tăng thêm do chuyển kho đến (kho này là kho nhận/to) trong khoảng [startDate, endDate].
 * Chỉ tính phiếu ĐÃ DUYỆT.
 */
export const tangThemChuyenDen = async (
  materialId: string,
  warehouseId: string,
  startDate: string,
  endDate: string,
): Promise<number> => {
  const { data } = await supabase
    .from('transfers')
    .select('quantity')
    .eq('material_id', materialId)
    .eq('to_warehouse_id', warehouseId)
    .eq('status', 'Đã duyệt')
    .gte('date', startDate)
    .lte('date', endDate);
  return (data || []).reduce((sum, item) => sum + Number(item.quantity), 0);
};

/**
 * ============================================================
 * HÀM TÍNH TỒN KHO
 * ============================================================
 *
 * Tính tồn kho cuối kỳ của 1 mặt hàng tại 1 kho trong khoảng [startDate, endDate].
 *
 * Công thức:
 *   tồnKhoCuối = tổngNhập(matId, whId, ngày_a, ngày_b)
 *              - tổngXuất(matId, whId, ngày_a, ngày_b)       ← cả Đã duyệt + Chờ duyệt
 *              - giảmTrừChuyểnĐi(matId, whId, ngày_a, ngày_b)
 *              + tăngThêmChuyểnĐến(matId, whId, ngày_a, ngày_b)
 *
 * @param materialId   UUID của mặt hàng
 * @param warehouseId  UUID của kho
 * @param startDate    Ngày bắt đầu (YYYY-MM-DD)
 * @param endDate      Ngày kết thúc (YYYY-MM-DD)
 * @param excludeStockOutId  UUID phiếu xuất hoặc phiếu chuyển cần loại trừ khi tính
 *                           (dùng khi đang sửa/duyệt phiếu đó; UUID không trùng giữa các bảng)
 */
export const tonKho = async (
  materialId: string,
  warehouseId: string,
  startDate: string,
  endDate: string,
  excludeStockOutId?: string,
): Promise<number> => {
  if (!materialId || !warehouseId || !startDate || !endDate) return 0;

  try {
    const [nhap, xuat, chuyenDi, chuyenDen] = await Promise.all([
      tongNhap(materialId, warehouseId, startDate, endDate),
      tongXuat(materialId, warehouseId, startDate, endDate, excludeStockOutId),
      giamTruChuyenDi(materialId, warehouseId, startDate, endDate, excludeStockOutId),
      tangThemChuyenDen(materialId, warehouseId, startDate, endDate),
    ]);

    return nhap - xuat - chuyenDi + chuyenDen;
  } catch (err) {
    console.error('Error calculating tonKho:', err);
    return 0;
  }
};

/**
 * Tính tồn kho tích lũy từ đầu đến một ngày cụ thể.
 * Dùng để kiểm tra tồn trước khi lập/lưu phiếu xuất.
 *
 * @param materialId          UUID của mặt hàng
 * @param warehouseId         UUID của kho
 * @param date                Ngày kiểm tra (YYYY-MM-DD) — chỉ tính phiếu ≤ ngày này
 * @param excludeStockOutId   UUID phiếu xuất hoặc phiếu chuyển cần loại trừ (khi đang sửa phiếu đó)
 */
export const getAvailableStock = async (
  materialId: string,
  warehouseId: string,
  date: string,
  excludeStockOutId?: string,
): Promise<number> => {
  return tonKho(materialId, warehouseId, '2000-01-01', date, excludeStockOutId);
};

/**
 * Lấy chi tiết tồn kho để hiển thị thông báo rõ ràng:
 * - actual: Tồn thực tế đã duyệt
 * - pendingOut: Số lượng đang "giữ chỗ" trong các phiếu Chờ duyệt
 * - available: Số lượng thực sự có thể xuất (actual - pendingOut)
 */
export const getDetailedStock = async (
  materialId: string,
  warehouseId: string,
  date: string,
  excludeId?: string,
): Promise<{ actual: number; pendingOut: number; available: number }> => {
  try {
    let xuatDaDuyetQ = supabase
      .from('stock_out')
      .select('quantity')
      .eq('material_id', materialId)
      .eq('warehouse_id', warehouseId)
      .eq('status', 'Đã duyệt')
      .lte('date', date);
    if (excludeId) xuatDaDuyetQ = xuatDaDuyetQ.neq('id', excludeId);

    let xuatChoDuyetQ = supabase
      .from('stock_out')
      .select('quantity')
      .eq('material_id', materialId)
      .eq('warehouse_id', warehouseId)
      .eq('status', 'Chờ duyệt')
      .lte('date', date);
    if (excludeId) xuatChoDuyetQ = xuatChoDuyetQ.neq('id', excludeId);

    let chuyenDiDuyetQ = supabase
      .from('transfers')
      .select('quantity')
      .eq('material_id', materialId)
      .eq('from_warehouse_id', warehouseId)
      .eq('status', 'Đã duyệt')
      .lte('date', date);
    if (excludeId) chuyenDiDuyetQ = chuyenDiDuyetQ.neq('id', excludeId);

    let chuyenDiChoQ = supabase
      .from('transfers')
      .select('quantity')
      .eq('material_id', materialId)
      .eq('from_warehouse_id', warehouseId)
      .eq('status', 'Chờ duyệt')
      .lte('date', date);
    if (excludeId) chuyenDiChoQ = chuyenDiChoQ.neq('id', excludeId);

    const [nhap, xuatDaDuyet, xuatChoDuyet, chuyenDiDuyet, chuyenDiCho, chuyenDenDuyet] =
      await Promise.all([
        supabase
          .from('stock_in')
          .select('quantity')
          .eq('material_id', materialId)
          .eq('warehouse_id', warehouseId)
          .eq('status', 'Đã duyệt')
          .lte('date', date),
        xuatDaDuyetQ,
        xuatChoDuyetQ,
        chuyenDiDuyetQ,
        chuyenDiChoQ,
        supabase
          .from('transfers')
          .select('quantity')
          .eq('material_id', materialId)
          .eq('to_warehouse_id', warehouseId)
          .eq('status', 'Đã duyệt')
          .lte('date', date),
      ]);

    const sum = (data: any[] | null) => (data || []).reduce((s, i) => s + Number(i.quantity), 0);

    const actualIn = sum(nhap.data) + sum(chuyenDenDuyet.data);
    const actualOut = sum(xuatDaDuyet.data) + sum(chuyenDiDuyet.data);
    const pendingOutCount = sum(xuatChoDuyet.data) + sum(chuyenDiCho.data);

    const actual = actualIn - actualOut;
    const available = actual - pendingOutCount;

    return {
      actual,
      pendingOut: pendingOutCount,
      available,
    };
  } catch (err) {
    console.error('Error in getDetailedStock:', err);
    return { actual: 0, pendingOut: 0, available: 0 };
  }
};

/**
 * Lấy dữ liệu tồn kho tổng hợp cho tất cả mặt hàng,
 * Lấy bảng nhập/xuất/tồn kho trong một khoảng thời gian
 * (Dùng cho kiểm tra tồn kho — chỉ tính phiếu Đã duyệt)
 */
export const getInventoryData = async (
  warehouseId?: string,
  endDate?: string,
  startDate?: string,
) => {
  try {
    const effectiveStart = startDate || '2000-01-01';
    const effectiveEnd = endDate || toLocalISODate();

    let siQuery = supabase
      .from('stock_in')
      .select('material_id, warehouse_id, quantity, total_amount')
      .eq('status', 'Đã duyệt')
      .gte('date', effectiveStart)
      .lte('date', effectiveEnd);

    let soQuery = supabase
      .from('stock_out')
      .select('material_id, warehouse_id, quantity, total_amount')
      .eq('status', 'Đã duyệt')
      .gte('date', effectiveStart)
      .lte('date', effectiveEnd);

    const trQuery = supabase
      .from('transfers')
      .select('material_id, from_warehouse_id, to_warehouse_id, quantity')
      .eq('status', 'Đã duyệt')
      .gte('date', effectiveStart)
      .lte('date', effectiveEnd);

    if (warehouseId) {
      siQuery = siQuery.eq('warehouse_id', warehouseId);
      soQuery = soQuery.eq('warehouse_id', warehouseId);
      // Transfers: cần lấy cả 2 chiều từ/đến kho này — không filter ở đây, xử lý dưới
    }

    const [si, so, tr] = await Promise.all([siQuery, soQuery, trQuery]);

    const data: Record<
      string,
      { totalIn: number; totalOut: number; breakdown: Record<string, number> }
    > = {};

    const addStock = (matId: string, whId: string, qty: number, type: 'in' | 'out') => {
      if (!data[matId]) data[matId] = { totalIn: 0, totalOut: 0, breakdown: {} };
      if (!data[matId].breakdown[whId]) data[matId].breakdown[whId] = 0;

      if (type === 'in') {
        data[matId].totalIn += qty;
        data[matId].breakdown[whId] += qty;
      } else {
        data[matId].totalOut += qty;
        data[matId].breakdown[whId] -= qty;
      }
    };

    (si.data || []).forEach((item) =>
      addStock(item.material_id, item.warehouse_id, Number(item.quantity), 'in'),
    );
    (so.data || []).forEach((item) =>
      addStock(item.material_id, item.warehouse_id, Number(item.quantity), 'out'),
    );
    (tr.data || []).forEach((item) => {
      // Nếu lọc theo kho: chỉ tính chiều liên quan đến kho đó
      if (!warehouseId || item.from_warehouse_id === warehouseId) {
        addStock(item.material_id, item.from_warehouse_id, Number(item.quantity), 'out');
      }
      if (!warehouseId || item.to_warehouse_id === warehouseId) {
        addStock(item.material_id, item.to_warehouse_id, Number(item.quantity), 'in');
      }
    });

    return data;
  } catch (err) {
    console.error('Error fetching inventory data:', err);
    return {};
  }
};

// ============================================================
// BẢNG TỒN KHO — tương đương bảng Tonkho trong app cũ
// Trả về danh sách kết quả theo từng cặp (vật tư, kho)
// với: Tồn đầu kỳ + Nhập + Xuất + Chuyển vào - Chuyển đi = Tồn cuối kỳ
// ============================================================

export interface TonKhoRow {
  material_id: string;
  warehouse_id: string;
  tonDau: number; // Tồn trước ngày đầu kỳ
  tongNhap: number; // Tổng nhập trong kỳ (Đã duyệt)
  tongXuat: number; // Tổng xuất trong kỳ (Đã duyệt)
  chuyenDen: number; // Chuyển kho đến trong kỳ
  chuyenDi: number; // Chuyển kho đi trong kỳ
  tonCuoi: number; // tonDau + tongNhap - tongXuat + chuyenDen - chuyenDi
}

/**
 * Tính bảng tồn kho theo từng (material_id, warehouse_id).
 * Giống bảng Tonkho trong app cũ — tồn đầu kỳ + nhập/xuất/chuyển trong kỳ = tồn cuối kỳ.
 *
 * @param startDate   Ngày đầu kỳ (YYYY-MM-DD)
 * @param endDate     Ngày cuối kỳ (YYYY-MM-DD)
 * @param warehouseId Lọc theo kho (optional)
 */
export const getTonKhoTable = async (
  startDate: string,
  endDate: string,
  warehouseId?: string | string[],
): Promise<TonKhoRow[]> => {
  try {
    if (!startDate || !endDate) return [];

    const priorEnd = (() => {
      const d = new Date(startDate);
      if (isNaN(d.getTime())) return '1999-12-31'; // Safe fallback
      d.setDate(d.getDate() - 1);
      return toLocalISODate(d);
    })();
    const whIds = warehouseId ? (Array.isArray(warehouseId) ? warehouseId : [warehouseId]) : null;

    // Tạo query helper riêng cho transfers với filter status tùy chỉnh
    const buildTransferQuery = (
      dateOp: 'lte' | 'gte_lte',
      statusFilter: string[],
      start?: string,
      end?: string,
    ) => {
      let q = supabase
        .from('transfers')
        .select('material_id, from_warehouse_id, to_warehouse_id, quantity, status')
        .in('status', statusFilter);
      if (dateOp === 'lte') {
        q = q.lte('date', end!);
      } else {
        q = q.gte('date', start!).lte('date', end!);
      }
      if (whIds) {
        q = q.or(
          `from_warehouse_id.in.(${whIds.join(',')}),to_warehouse_id.in.(${whIds.join(',')})`,
        );
      }
      return q;
    };

    const buildQuery = (
      table: string,
      dateCol: string,
      dateOp: 'lte' | 'gte_lte',
      start?: string,
      end?: string,
    ) => {
      // stock_out: tính cả Chờ duyệt để giữ chỗ tồn kho (tránh xuất vượt tồn)
      // stock_in: chỉ tính Đã duyệt
      const statusFilter = table === 'stock_out' ? ['Đã duyệt', 'Chờ duyệt'] : ['Đã duyệt'];
      let q = supabase
        .from(table)
        .select('material_id, warehouse_id, quantity')
        .in('status', statusFilter);
      if (dateOp === 'lte') {
        q = q.lte(dateCol, end!);
      } else {
        q = q.gte(dateCol, start!).lte(dateCol, end!);
      }
      if (whIds) {
        q = q.in('warehouse_id', whIds);
      }
      return q;
    };

    // Fetch song song 8 queries
    // Transfers được tách thành 2 set: Đã duyệt (cho chuyenDen) và Đã duyệt+Chờ (cho chuyenDi)
    const [
      siPrior,
      siCurr,
      soPrior,
      soCurr,
      trPriorApproved,
      trPriorAll,
      trCurrApproved,
      trCurrAll,
    ] = await Promise.all([
      buildQuery('stock_in', 'date', 'lte', undefined, priorEnd),
      buildQuery('stock_in', 'date', 'gte_lte', startDate, endDate),
      buildQuery('stock_out', 'date', 'lte', undefined, priorEnd),
      buildQuery('stock_out', 'date', 'gte_lte', startDate, endDate),
      // Prior: chỉ Đã duyệt cho chuyenDen tồn đầu
      buildTransferQuery('lte', ['Đã duyệt'], undefined, priorEnd),
      // Prior: cả Chờ duyệt cho chuyenDi tồn đầu
      buildTransferQuery('lte', ['Đã duyệt', 'Chờ duyệt'], undefined, priorEnd),
      // Curr: chỉ Đã duyệt cho chuyenDen trong kỳ
      buildTransferQuery('gte_lte', ['Đã duyệt'], startDate, endDate),
      // Curr: cả Chờ duyệt cho chuyenDi trong kỳ
      buildTransferQuery('gte_lte', ['Đã duyệt', 'Chờ duyệt'], startDate, endDate),
    ]);

    const rows: Record<string, TonKhoRow> = {};

    const ensure = (matId: string, whId: string) => {
      const key = `${matId}__${whId}`;
      if (!rows[key])
        rows[key] = {
          material_id: matId,
          warehouse_id: whId,
          tonDau: 0,
          tongNhap: 0,
          tongXuat: 0,
          chuyenDen: 0,
          chuyenDi: 0,
          tonCuoi: 0,
        };
      return rows[key];
    };

    // Tồn đầu kỳ:
    // - Kho NGUỒN: trừ cả phiếu Đã duyệt + Chờ duyệt (giữ chỗ, khớp với logic cốt lõi)
    // - Kho ĐÍCH: chỉ cộng phiếu Đã duyệt (hàng chưa duyệt chưa thực sự về kho)
    ((siPrior.data as any[]) || []).forEach((r) => {
      ensure(r.material_id, r.warehouse_id).tonDau += Number(r.quantity);
    });
    ((soPrior.data as any[]) || []).forEach((r) => {
      ensure(r.material_id, r.warehouse_id).tonDau -= Number(r.quantity);
    });
    // ChuyenDi trước kỳ: tính cả Chờ duyệt để phản ánh giữ chỗ
    ((trPriorAll.data as any[]) || []).forEach((r) => {
      ensure(r.material_id, r.from_warehouse_id).tonDau -= Number(r.quantity);
    });
    // ChuyenDen trước kỳ: chỉ tính Đã duyệt
    ((trPriorApproved.data as any[]) || []).forEach((r) => {
      ensure(r.material_id, r.to_warehouse_id).tonDau += Number(r.quantity);
    });

    // Nhập/xuất trong kỳ
    ((siCurr.data as any[]) || []).forEach((r) => {
      ensure(r.material_id, r.warehouse_id).tongNhap += Number(r.quantity);
    });
    ((soCurr.data as any[]) || []).forEach((r) => {
      ensure(r.material_id, r.warehouse_id).tongXuat += Number(r.quantity);
    });

    // Chuyển kho trong kỳ:
    // - chuyenDi: tính cả Chờ duyệt (giữ chỗ, khớp với logic cốt lõi)
    // - chuyenDen: chỉ tính Đã duyệt (hàng chưa duyệt chưa thực sự về kho đích)
    ((trCurrAll.data as any[]) || []).forEach((r) => {
      ensure(r.material_id, r.from_warehouse_id).chuyenDi += Number(r.quantity);
    });
    ((trCurrApproved.data as any[]) || []).forEach((r) => {
      ensure(r.material_id, r.to_warehouse_id).chuyenDen += Number(r.quantity);
    });

    // Tính tồn cuối kỳ
    let result = Object.values(rows).map((row) => ({
      ...row,
      tonCuoi: row.tonDau + row.tongNhap - row.tongXuat + row.chuyenDen - row.chuyenDi,
    }));

    // Lọc theo kho nếu có (hỗ trợ cả string và string[])
    if (warehouseId) {
      const ids = Array.isArray(warehouseId) ? warehouseId : [warehouseId];
      result = result.filter((r) => ids.includes(r.warehouse_id));
    }

    // Bỏ qua rows hoàn toàn zero
    return result.filter(
      (r) =>
        r.tonDau !== 0 ||
        r.tonCuoi !== 0 ||
        r.tongNhap !== 0 ||
        r.tongXuat !== 0 ||
        r.chuyenDen !== 0 ||
        r.chuyenDi !== 0,
    );
  } catch (err) {
    console.error('Error computing getTonKhoTable:', err);
    return [];
  }
};

/**
 * Tự động sinh mã vật tư tiếp theo dựa trên nhóm vat.
 * Định dạng: [MãNhóm]-[Số thứ tự 3 chữ số] (VD: VAT001-001)
 */
export const generateNextMaterialCode = async (groupId: string): Promise<string> => {
  try {
    if (!groupId) return '';
    const { data: groupData } = await supabase
      .from('material_groups')
      .select('code')
      .eq('id', groupId)
      .single();
    if (!groupData || !groupData.code) return '';
    const groupPrefix = groupData.code; // e.g. VAT001

    const { data } = await supabase
      .from('materials')
      .select('code')
      .eq('group_id', groupId)
      .like('code', `${groupPrefix}-%`);

    const codes = data?.map((m) => m.code) || [];
    return generateSmartCode(codes, `${groupPrefix}-`, 3);
  } catch (err) {
    console.error('Error generating material code:', err);
    return '';
  }
};

/**
 * Tự động sinh mã nhóm vật tư tiếp theo.
 * Định dạng: VAT[Số thứ tự 3 chữ số] (VD: VAT001, VAT002)
 */
export const generateNextGroupCode = async (): Promise<string> => {
  try {
    const { data } = await supabase.from('material_groups').select('code').like('code', 'VAT%');

    const codes = data?.map((g) => g.code) || [];
    return generateSmartCode(codes, 'VAT', 3);
  } catch (err) {
    console.error('Error generating group code:', err);
    return 'VAT001';
  }
};

/**
 * Kiểm tra xem một kho có đang hoạt động hay không.
 * Loại bỏ các kho có trạng thái liên quan đến "đã xóa" hoặc "thùng rác".
 */
export const isActiveWarehouse = (warehouse: any): boolean => {
  if (!warehouse) return false;
  if (!warehouse.status) return true;

  // Normalize string to NFC to avoid differences in Vietnamese character representation
  const s = warehouse.status.toString().trim().toLowerCase().normalize('NFC');

  // More aggressive check for any variant of "deleted" or "trash"
  const isDeleted =
    s === 'đã xóa'.normalize('NFC') ||
    s === 'da xoa' ||
    s === 'deleted' ||
    s.includes('xóa'.normalize('NFC')) ||
    s.includes('thùng rác'.normalize('NFC')) ||
    s.includes('thung rac') ||
    s.includes('trash');

  return !isDeleted;
};

/**
 * Kiểm tra xem một thay đổi số lượng (diff) vào ngày (fromDate)
 * có làm tồn kho bị âm vào bất kỳ thời điểm nào sau đó hay không.
 *
 * @param materialId   ID vật tư
 * @param warehouseId  ID kho
 * @param fromDate     Ngày bắt đầu thay đổi (YYYY-MM-DD)
 * @param diff         Số lượng thay đổi (dương là tăng thêm, âm là giảm đi)
 * @returns            { valid: boolean, failedDate?: string, currentStock?: number }
 */
export const validateFutureImpact = async (
  materialId: string,
  warehouseId: string,
  fromDate: string,
  diff: number,
  excludeId?: string,
): Promise<{ valid: boolean; failedDate?: string; currentStock?: number }> => {
  if (diff >= 0) return { valid: true }; // Tăng thêm thì không lo âm (giả sử trước đó ko âm)

  try {
    // 1. Tìm tất cả các ngày có giao dịch từ fromDate trở đi
    const [si, so, tr] = await Promise.all([
      supabase
        .from('stock_in')
        .select('date')
        .eq('material_id', materialId)
        .eq('warehouse_id', warehouseId)
        .eq('status', 'Đã duyệt')
        .gte('date', fromDate),
      (() => {
        let q = supabase
          .from('stock_out')
          .select('date')
          .eq('material_id', materialId)
          .eq('warehouse_id', warehouseId)
          .in('status', ['Đã duyệt', 'Chờ duyệt'])
          .gte('date', fromDate);
        if (excludeId) q = q.neq('id', excludeId);
        return q;
      })(),
      supabase
        .from('transfers')
        .select('date')
        .eq('material_id', materialId)
        .or(`from_warehouse_id.eq.${warehouseId},to_warehouse_id.eq.${warehouseId}`)
        .eq('status', 'Đã duyệt')
        .gte('date', fromDate),
    ]);

    const dates = new Set<string>();
    dates.add(fromDate);
    (si.data || []).forEach((d) => dates.add(d.date));
    (so.data || []).forEach((d) => dates.add(d.date));
    (tr.data || []).forEach((d) => dates.add(d.date));

    // Sắp xếp ngày tăng dần
    const sortedDates = Array.from(dates).sort();

    // 2. Chạy kiểm tra tồn kho tại mỗi mốc ngày
    for (const date of sortedDates) {
      const stock = await getAvailableStock(materialId, warehouseId, date, excludeId);
      if (stock + diff < 0) {
        return {
          valid: false,
          failedDate: date,
          currentStock: stock,
        };
      }
    }

    return { valid: true };
  } catch (err) {
    console.error('Error in validateFutureImpact:', err);
    return { valid: false };
  }
};
