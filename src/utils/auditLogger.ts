import { supabase } from '@/lib/supabase';
import { Employee } from '@/types';
import { getFieldLabel, NOISE_FIELDS, SENSITIVE_FIELDS } from '@/utils/auditLabels';

export type AuditModule = 'SYSTEM' | 'AUTH' | 'HR' | 'FINANCE' | 'WAREHOUSE' | 'PRODUCTION';

export type AuditAction =
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'RESTORE'
  | 'APPROVE'
  | 'REJECT'
  | 'EXPORT'
  | 'IMPORT'
  | 'FAILED';

/** Một thay đổi của một trường dữ liệu: trước → sau. */
export interface AuditChange {
  field: string;
  label: string;
  before: any;
  after: any;
}

interface AuditLogParams {
  module: AuditModule | string;
  action: AuditAction | string;
  description: string;
  /** Tên bảng bị tác động (dùng để hiển thị + lọc). */
  targetTable?: string;
  /** Nhãn dễ đọc của bản ghi, VD: "PN-0012 – Thép hộp 40x80". */
  targetLabel?: string;
  recordId?: string;
  /** Danh sách thay đổi cũ → mới (chỉ dùng cho UPDATE). */
  changes?: AuditChange[];
  /** Toàn bộ dữ liệu bản ghi tại thời điểm thao tác. */
  snapshot?: any;
  /** Ghi nhận thao tác thất bại kèm thông báo lỗi. */
  errorMessage?: string;
  status?: 'SUCCESS' | 'FAILED';
  metadata?: any;
  /**
   * Cho phép ghi log khi chưa xác định được user (VD: đăng nhập sai mật khẩu).
   * Chuỗi truyền vào được dùng làm tên người thao tác.
   */
  actorFallback?: string;
}

export const getModuleFromTable = (table: string): AuditModule | string => {
  const map: Record<string, AuditModule> = {
    users: 'HR',
    attendance: 'HR',
    advances: 'HR',
    allowances: 'HR',
    salary_settings: 'HR',
    costs: 'FINANCE',
    cost_groups: 'FINANCE',
    expense_settlements: 'FINANCE',
    stock_in: 'WAREHOUSE',
    stock_out: 'WAREHOUSE',
    transfers: 'WAREHOUSE',
    warehouses: 'WAREHOUSE',
    materials: 'WAREHOUSE',
    material_groups: 'WAREHOUSE',
    lenh_san_xuat: 'PRODUCTION',
    san_pham_bom: 'PRODUCTION',
    construction_diaries: 'PRODUCTION',
  };
  return map[table] || 'SYSTEM';
};

// ---- Phiên làm việc: mọi log trong cùng 1 lần mở app dùng chung 1 session_id ----
const SESSION_KEY = 'cdx_audit_session';

const getSessionId = (): string => {
  try {
    let sid = sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return 'unknown-session';
  }
};

// ---- IP & Vị trí ----
let cachedIp: string | null = null;
let cachedLocation: string | null = null;
let ipPromise: Promise<{ ip: string; location: string }> | null = null;

const getIpAndLocation = async (): Promise<{ ip: string; location: string }> => {
  if (cachedIp && cachedLocation) {
    return { ip: cachedIp, location: cachedLocation };
  }
  // Gộp các lời gọi đồng thời vào chung một request
  if (ipPromise) return ipPromise;

  ipPromise = (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(
        'https://ip-api.com/json/?lang=vi&fields=status,country,regionName,city,isp,query',
        { signal: controller.signal },
      );
      clearTimeout(timer);
      const data = await res.json();
      if (data.status === 'success') {
        cachedIp = data.query || 'Unknown';
        cachedLocation = [data.city, data.regionName, data.country].filter(Boolean).join(', ');
        if (data.isp) cachedLocation += ` (${data.isp})`;
      } else {
        cachedIp = 'Unknown';
        cachedLocation = 'Unknown';
      }
    } catch {
      cachedIp = 'Unknown';
      cachedLocation = 'Unknown';
    }
    return { ip: cachedIp!, location: cachedLocation! };
  })();

  return ipPromise;
};

// ---- Thông tin thiết bị từ User-Agent ----
const getDeviceInfo = (): string => {
  const ua = navigator.userAgent;

  let os = 'Unknown OS';
  if (/Windows NT 10/.test(ua)) os = 'Windows 10/11';
  else if (/Windows NT 6/.test(ua)) os = 'Windows 7/8';
  else if (/iPhone|iPad/.test(ua)) {
    const match = ua.match(/OS\s([0-9_]+)/);
    os = `iOS ${match?.[1]?.replace(/_/g, '.') || ''}`.trim();
  } else if (/Android/.test(ua)) {
    const match = ua.match(/Android\s([0-9.]+)/);
    os = `Android ${match?.[1] || ''}`.trim();
  } else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  let device = 'Máy tính';
  if (/iPhone/.test(ua)) device = 'iPhone';
  else if (/iPad/.test(ua)) device = 'iPad';
  else if (/Android/.test(ua) && /Mobile/.test(ua)) device = 'Điện thoại Android';
  else if (/Android/.test(ua)) device = 'Máy tính bảng Android';

  let browser = 'Unknown Browser';
  if (/Edg\//.test(ua)) browser = 'Microsoft Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';

  const screen =
    typeof window !== 'undefined' && window.screen
      ? ` • ${window.screen.width}x${window.screen.height}`
      : '';

  return `${device} • ${os} • ${browser}${screen}`;
};

// ---- So sánh cũ / mới ----

const normalize = (v: any): any => {
  if (v === undefined) return null;
  if (v === '') return null;
  return v;
};

const isSameValue = (a: any, b: any): boolean => {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  if (na === null || nb === null) return false;
  if (typeof na === 'object' || typeof nb === 'object') {
    try {
      return JSON.stringify(na) === JSON.stringify(nb);
    } catch {
      return false;
    }
  }
  // 10 và "10" coi là giống nhau
  if (!isNaN(Number(na)) && !isNaN(Number(nb))) return Number(na) === Number(nb);
  return false;
};

/**
 * So sánh bản ghi trước và sau, trả về danh sách trường thực sự thay đổi.
 * Bỏ qua cột kỹ thuật và che giá trị của cột nhạy cảm.
 */
export const diffRecords = (before: any, after: any): AuditChange[] => {
  if (!before || !after) return [];
  const changes: AuditChange[] = [];

  for (const key of Object.keys(after)) {
    if (NOISE_FIELDS.has(key)) continue;
    const oldVal = before[key];
    const newVal = after[key];
    if (isSameValue(oldVal, newVal)) continue;

    if (SENSITIVE_FIELDS.has(key)) {
      changes.push({ field: key, label: getFieldLabel(key), before: '••••••', after: '••••••' });
      continue;
    }

    changes.push({
      field: key,
      label: getFieldLabel(key),
      before: normalize(oldVal),
      after: normalize(newVal),
    });
  }

  return changes;
};

/** Loại bỏ giá trị nhạy cảm khỏi snapshot trước khi lưu vào log. */
const sanitize = (data: any): any => {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sanitize);
  const out: any = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = SENSITIVE_FIELDS.has(k) ? '••••••' : v;
  }
  return out;
};

/** Đoán nhãn dễ đọc của bản ghi từ chính dữ liệu của nó. */
export const guessRecordLabel = (data: any): string | undefined => {
  if (!data || typeof data !== 'object') return undefined;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return undefined;
  const candidates = ['slip_no', 'slip_code', 'code', 'name', 'full_name', 'title', 'description'];
  for (const key of candidates) {
    const v = row[key];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 80);
  }
  return undefined;
};

export const logAudit = async (user: Employee | null, params: AuditLogParams) => {
  // Cho phép ghi log không cần user khi có actorFallback (đăng nhập thất bại)
  if (!user && !params.actorFallback) return;

  try {
    const { ip, location } = await getIpAndLocation();
    const device = getDeviceInfo();

    const changes = params.changes?.length ? params.changes : null;

    const metadata = {
      ...(params.metadata || {}),
      ...(changes ? { changes } : {}),
      ...(params.snapshot ? { snapshot: sanitize(params.snapshot) } : {}),
      ...(params.errorMessage ? { error: params.errorMessage } : {}),
      user_agent: navigator.userAgent,
      page: typeof window !== 'undefined' ? window.location.hash || window.location.pathname : null,
    };

    const { error } = await supabase.from('audit_logs').insert([
      {
        user_id: user?.id || null,
        user_name: user?.full_name || user?.code || params.actorFallback || 'Unknown',
        user_code: user?.code || null,
        user_role: user?.role || null,
        module: params.module,
        action: params.action,
        status: params.status || (params.errorMessage ? 'FAILED' : 'SUCCESS'),
        description: params.description,
        target_table: params.targetTable || null,
        target_label: params.targetLabel || null,
        record_id: params.recordId || null,
        // Cột changes/metadata kiểu JSONB — truyền thẳng object,
        // stringify sẽ khiến Postgres lưu thành chuỗi JSON lồng.
        changes: changes || null,
        session_id: getSessionId(),
        metadata,
        ip_address: ip,
        location,
        device,
      },
    ]);

    if (error) {
      console.error('Failed to write audit log:', error);
    }
  } catch (err) {
    console.error('Audit log error:', err);
  }
};
