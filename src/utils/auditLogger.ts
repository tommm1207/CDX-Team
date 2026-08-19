import { supabase } from '@/lib/supabase';
import { Employee } from '@/types';

type AuditModule = 'SYSTEM' | 'AUTH' | 'HR' | 'FINANCE' | 'WAREHOUSE' | 'PRODUCTION';
type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'APPROVE'
  | 'REJECT'
  | 'EXPORT';

interface AuditLogParams {
  module: AuditModule | string;
  action: AuditAction | string;
  description: string;
  recordId?: string;
  metadata?: any;
}

// ---- IP & Location ----
let cachedIp: string | null = null;
let cachedLocation: string | null = null;

const getIpAndLocation = async (): Promise<{ ip: string; location: string }> => {
  if (cachedIp && cachedLocation) {
    return { ip: cachedIp, location: cachedLocation };
  }
  try {
    const res = await fetch(
      'https://ip-api.com/json/?lang=vi&fields=status,country,regionName,city,query',
    );
    const data = await res.json();
    if (data.status === 'success') {
      cachedIp = data.query || 'Unknown';
      cachedLocation = [data.city, data.regionName, data.country].filter(Boolean).join(', ');
    } else {
      cachedIp = 'Unknown';
      cachedLocation = 'Unknown';
    }
  } catch {
    cachedIp = 'Unknown';
    cachedLocation = 'Unknown';
  }
  return { ip: cachedIp!, location: cachedLocation! };
};

// ---- Device Info from User-Agent ----
const getDeviceInfo = (): string => {
  const ua = navigator.userAgent;

  // OS detection
  let os = 'Unknown OS';
  if (/Windows NT 10/.test(ua)) os = 'Windows 10/11';
  else if (/Windows NT 6/.test(ua)) os = 'Windows 7/8';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Android/.test(ua)) {
    const match = ua.match(/Android\s([0-9.]+)/);
    os = `Android ${match?.[1] || ''}`;
  } else if (/iPhone|iPad/.test(ua)) {
    const match = ua.match(/OS\s([0-9_]+)/);
    os = `iOS ${match?.[1]?.replace(/_/g, '.') || ''}`;
  } else if (/Linux/.test(ua)) os = 'Linux';

  // Device type
  let device = 'Máy tính';
  if (/iPhone/.test(ua)) device = 'iPhone';
  else if (/iPad/.test(ua)) device = 'iPad';
  else if (/Android/.test(ua) && /Mobile/.test(ua)) device = 'Điện thoại Android';
  else if (/Android/.test(ua)) device = 'Máy tính bảng Android';

  // Browser detection
  let browser = 'Unknown Browser';
  if (/Edg\//.test(ua)) browser = 'Microsoft Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';

  return `${device} • ${os} • ${browser}`;
};

export const logAudit = async (user: Employee | null, params: AuditLogParams) => {
  if (!user) return;

  try {
    const { ip, location } = await getIpAndLocation();
    const device = getDeviceInfo();

    const { error } = await supabase.from('audit_logs').insert([
      {
        user_id: null,
        user_name: user.full_name || user.code || 'Unknown',
        module: params.module,
        action: params.action,
        description: params.description,
        record_id: params.recordId || null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
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
