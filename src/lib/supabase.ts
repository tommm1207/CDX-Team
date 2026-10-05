import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    '[CDX] CRITICAL: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables.',
  );
}

// Prevent crash if URL is missing by providing a placeholder if invalid
export const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : createClient('https://placeholder.supabase.co', 'placeholder');

// ---------------------------------------------------------------------------
// Tự động ghi nhật ký cho mọi thao tác ghi dữ liệu.
//
// Nguyên tắc:
//  1. Chỉ ghi log SAU KHI câu lệnh chạy xong — thao tác lỗi được ghi là FAILED,
//     không còn ghi nhầm thành công như trước.
//  2. Với UPDATE/DELETE: đọc bản ghi cũ trước khi thực thi để so sánh cũ → mới.
//  3. Bảng audit_logs được loại trừ để tránh đệ quy vô hạn.
// ---------------------------------------------------------------------------

const originalFrom = supabase.from.bind(supabase);

/** Bảng không cần ghi log (tránh đệ quy / nhiễu). */
const SKIP_TABLES = new Set(['audit_logs']);

const getCurrentUser = (): any | null => {
  try {
    const userStr = localStorage.getItem('cdx_user');
    return userStr ? JSON.parse(userStr) : null;
  } catch {
    return null;
  }
};

interface MutationContext {
  table: string;
  action: string;
  payload?: any;
  /** Bản ghi trước khi thay đổi (UPDATE/DELETE). */
  before?: any[];
  /** Kết quả trả về từ Supabase (UPDATE/INSERT có .select()). */
  after?: any[];
  error?: any;
}

const writeLog = async (ctx: MutationContext) => {
  if (SKIP_TABLES.has(ctx.table)) return;
  try {
    const user = getCurrentUser();
    if (!user) return;

    const { logAudit, getModuleFromTable, diffRecords, guessRecordLabel } =
      await import('@/utils/auditLogger');
    const { getTableLabel, getActionLabel } = await import('@/utils/auditLabels');

    const tableLabel = getTableLabel(ctx.table);
    const beforeRow = ctx.before?.[0];
    const afterRow = ctx.after?.[0] ?? (Array.isArray(ctx.payload) ? ctx.payload[0] : ctx.payload);

    let action = ctx.action;
    let changes: any[] = [];

    if (action === 'UPDATE' && beforeRow) {
      const patch = Array.isArray(ctx.payload) ? ctx.payload[0] : ctx.payload;
      changes = diffRecords(beforeRow, patch || {});

      // Nhận diện các hành động đặc biệt dựa trên thay đổi trạng thái
      const statusChange = changes.find((c) => c.field === 'status');
      if (statusChange) {
        const after = String(statusChange.after || '').toLowerCase();
        if (after.includes('đã duyệt') || after.includes('approved')) action = 'APPROVE';
        else if (after.includes('từ chối') || after.includes('rejected')) action = 'REJECT';
      }
      const deletedChange = changes.find((c) => c.field === 'is_deleted');
      if (deletedChange) {
        action = deletedChange.after ? 'DELETE' : 'RESTORE';
      }
    }

    const targetLabel = guessRecordLabel(beforeRow) || guessRecordLabel(afterRow) || undefined;

    const recordId = beforeRow?.id || afterRow?.id || undefined;

    // Mô tả dạng người đọc được, VD:
    // "Chỉnh sửa Phiếu nhập kho «PN-0012»: Số lượng 10 → 15, Đơn giá 12.000 → 13.500"
    let description = `${getActionLabel(action)} ${tableLabel}`;
    if (targetLabel) description += ` «${targetLabel}»`;

    if (action !== 'CREATE' && changes.length > 0) {
      const summary = changes
        .slice(0, 4)
        .map((c) => `${c.label}: ${formatVal(c.before)} → ${formatVal(c.after)}`)
        .join(', ');
      description += `: ${summary}`;
      if (changes.length > 4) description += ` (+${changes.length - 4} thay đổi khác)`;
    }

    if (ctx.error) {
      description = `Lỗi khi ${getActionLabel(action).toLowerCase()} ${tableLabel}`;
      if (targetLabel) description += ` «${targetLabel}»`;
    }

    await logAudit(user, {
      module: getModuleFromTable(ctx.table),
      action,
      status: ctx.error ? 'FAILED' : 'SUCCESS',
      description,
      targetTable: ctx.table,
      targetLabel,
      recordId,
      changes: changes.length ? changes : undefined,
      snapshot: ctx.error ? undefined : afterRow || beforeRow,
      errorMessage: ctx.error ? ctx.error.message || String(ctx.error) : undefined,
      metadata: {
        before: beforeRow || undefined,
        row_count: ctx.after?.length ?? ctx.before?.length ?? undefined,
      },
    });
  } catch (e) {
    console.error('Failed to log mutation for table', ctx.table, e);
  }
};

const formatVal = (v: any): string => {
  if (v === null || v === undefined) return '(trống)';
  if (typeof v === 'boolean') return v ? 'Có' : 'Không';
  if (typeof v === 'number') return v.toLocaleString('vi-VN');
  const s = String(v);
  return s.length > 40 ? s.slice(0, 40) + '…' : s;
};

/**
 * Bọc một PostgrestBuilder để chạy callback sau khi query hoàn tất,
 * mà không làm mất tính "thenable" hay các method chaining của nó.
 */
const attachAfterExecute = (builder: any, onDone: (result: any) => void) => {
  const originalThen = builder.then.bind(builder);
  builder.then = (onFulfilled: any, onRejected: any) =>
    originalThen((result: any) => {
      try {
        onDone(result);
      } catch (e) {
        console.error('Audit hook error:', e);
      }
      return onFulfilled ? onFulfilled(result) : result;
    }, onRejected);
  return builder;
};

supabase.from = (table: string): any => {
  const queryBuilder = originalFrom(table);

  if (SKIP_TABLES.has(table)) return queryBuilder;

  const origInsert = queryBuilder.insert.bind(queryBuilder);
  const origUpdate = queryBuilder.update.bind(queryBuilder);
  const origDelete = queryBuilder.delete.bind(queryBuilder);
  const origUpsert = queryBuilder.upsert.bind(queryBuilder);

  queryBuilder.insert = (values: any, options?: any) => {
    const builder = origInsert(values, options);
    return attachAfterExecute(builder, (result) => {
      writeLog({
        table,
        action: 'CREATE',
        payload: values,
        after: result?.data
          ? Array.isArray(result.data)
            ? result.data
            : [result.data]
          : undefined,
        error: result?.error,
      });
    });
  };

  queryBuilder.update = (values: any, options?: any) => {
    const builder = origUpdate(values, options);
    // Đọc bản ghi cũ bằng CÙNG bộ lọc mà lời gọi update sẽ dùng,
    // nhờ đó so sánh được cũ → mới.
    return withBeforeSnapshot(builder, table, (before, result) =>
      writeLog({ table, action: 'UPDATE', payload: values, before, error: result?.error }),
    );
  };

  queryBuilder.delete = (options?: any) => {
    const builder = origDelete(options);
    return withBeforeSnapshot(builder, table, (before, result) =>
      writeLog({ table, action: 'DELETE', before, error: result?.error }),
    );
  };

  queryBuilder.upsert = (values: any, options?: any) => {
    const builder = origUpsert(values, options);
    return attachAfterExecute(builder, (result) => {
      writeLog({
        table,
        action: 'UPDATE',
        payload: values,
        after: result?.data
          ? Array.isArray(result.data)
            ? result.data
            : [result.data]
          : undefined,
        error: result?.error,
      });
    });
  };

  return queryBuilder;
};

/**
 * Chụp lại bản ghi TRƯỚC khi lệnh chạy, rồi mới thực thi lệnh gốc.
 *
 * Thứ tự này bắt buộc với DELETE: nếu đọc song song, câu xóa thường
 * hoàn tất trước và bản chụp trả về rỗng — log sẽ không biết đã xóa cái gì.
 */
const withBeforeSnapshot = (
  builder: any,
  table: string,
  onDone: (before: any[] | undefined, result: any) => void,
) => {
  const origThen = builder.then.bind(builder);
  builder.then = (onFulfilled: any, onRejected: any) => {
    // Bọc trong Promise mới: đọc bản cũ xong hẳn rồi mới kích hoạt builder gốc.
    const run = fetchBefore(table, builder).then(
      (before) =>
        new Promise((resolve, reject) => {
          origThen((result: any) => {
            try {
              onDone(before, result);
            } catch (e) {
              console.error('Audit hook error:', e);
            }
            resolve(result);
          }, reject);
        }),
    );
    return run.then(onFulfilled, onRejected);
  };
  return builder;
};

/**
 * Lấy bản ghi trước khi sửa/xóa, tái sử dụng đúng bộ lọc (eq/in/...) của builder gốc.
 * Chạy best-effort: nếu không lấy được thì log vẫn ghi, chỉ thiếu phần so sánh.
 */
const fetchBefore = async (table: string, builder: any): Promise<any[] | undefined> => {
  try {
    const url: URL | undefined = builder?.url;
    if (!url) return undefined;

    const selectQuery = originalFrom(table).select('*');

    // Sao chép mọi tham số lọc từ builder gốc sang câu select
    url.searchParams.forEach((value: string, key: string) => {
      if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(key)) return;
      (selectQuery as any).url.searchParams.append(key, value);
    });

    // Giới hạn để không kéo về quá nhiều dữ liệu khi update hàng loạt
    const { data } = await (selectQuery as any).limit(20);
    return data || undefined;
  } catch {
    return undefined;
  }
};
