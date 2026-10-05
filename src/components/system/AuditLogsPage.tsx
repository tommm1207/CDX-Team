import React, { useCallback, useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { PageBreadcrumb } from '@/components/shared';
import { Employee } from '@/types';
import { canViewAuditLogs } from '@/utils/auditAccess';
import { getActionLabel, getTableLabel } from '@/utils/auditLabels';
import {
  Shield,
  Clock,
  Activity,
  Search,
  RefreshCw,
  FileText,
  MapPin,
  Smartphone,
  Monitor,
  Tablet,
  Globe,
  ChevronDown,
  ChevronRight,
  Download,
  AlertTriangle,
  CheckCircle2,
  Fingerprint,
  X,
  ChevronLeft,
} from 'lucide-react';

interface AuditChange {
  field: string;
  label: string;
  before: any;
  after: any;
}

interface AuditLog {
  id: string;
  created_at: string;
  user_id: string | null;
  user_name: string;
  user_code: string | null;
  user_role: string | null;
  module: string;
  action: string;
  status: string;
  description: string;
  target_table: string | null;
  target_label: string | null;
  record_id: string | null;
  changes: AuditChange[] | null;
  session_id: string | null;
  metadata: any;
  ip_address: string;
  location: string;
  device: string;
  total_count: number;
}

const PAGE_SIZE = 50;

interface Props {
  user: Employee;
}

export const AuditLogsPage = ({ user }: Props) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [actors, setActors] = useState<{ user_name: string; log_count: number }[]>([]);

  // Bộ lọc
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Chặn ngay ở tầng giao diện, phòng trường hợp component bị gọi trực tiếp
  const allowed = canViewAuditLogs(user);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(0);
    }, 400);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const rpcParams = useCallback(
    (limit: number, offset: number) => ({
      p_actor_code: user.code || '',
      p_actor_pass: user.app_pass || '',
      p_search: debouncedSearch || null,
      p_module: moduleFilter || null,
      p_action: actionFilter || null,
      p_status: statusFilter || null,
      p_user_name: userFilter || null,
      p_from: fromDate ? new Date(fromDate + 'T00:00:00').toISOString() : null,
      p_to: toDate ? new Date(toDate + 'T23:59:59').toISOString() : null,
      p_limit: limit,
      p_offset: offset,
    }),
    [user, debouncedSearch, moduleFilter, actionFilter, statusFilter, userFilter, fromDate, toDate],
  );

  const fetchLogs = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setAccessError(null);
    try {
      const { data, error } = await supabase.rpc(
        'get_audit_logs',
        rpcParams(PAGE_SIZE, page * PAGE_SIZE),
      );
      if (error) throw error;

      const rows = (data || []) as AuditLog[];
      setLogs(rows);
      setTotal(rows.length > 0 ? Number(rows[0].total_count) : 0);
    } catch (err: any) {
      console.error('Error fetching logs:', err);
      setAccessError(err?.message || 'Không tải được nhật ký');
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [allowed, rpcParams, page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Danh sách người thao tác cho ô lọc
  useEffect(() => {
    if (!allowed) return;
    supabase
      .rpc('get_audit_actors', {
        p_actor_code: user.code || '',
        p_actor_pass: user.app_pass || '',
      })
      .then(({ data }) => setActors(data || []));
  }, [allowed, user]);

  const resetFilters = () => {
    setSearchTerm('');
    setModuleFilter('');
    setActionFilter('');
    setStatusFilter('');
    setUserFilter('');
    setFromDate('');
    setToDate('');
    setPage(0);
  };

  const hasFilters =
    !!searchTerm ||
    !!moduleFilter ||
    !!actionFilter ||
    !!statusFilter ||
    !!userFilter ||
    !!fromDate ||
    !!toDate;

  const exportExcel = async () => {
    try {
      // Xuất theo đúng bộ lọc hiện tại, tối đa 1000 dòng
      const { data, error } = await supabase.rpc('get_audit_logs', rpcParams(1000, 0));
      if (error) throw error;

      const rows = (data || []).map((l: AuditLog) => ({
        'Thời gian': new Date(l.created_at).toLocaleString('vi-VN'),
        'Người thao tác': l.user_name,
        'Mã NV': l.user_code || '',
        'Phân quyền': l.user_role || '',
        'Phân hệ': l.module,
        'Hành động': getActionLabel(l.action),
        'Kết quả': l.status === 'FAILED' ? 'Thất bại' : 'Thành công',
        'Đối tượng': l.target_table ? getTableLabel(l.target_table) : '',
        'Tên bản ghi': l.target_label || '',
        'Chi tiết': l.description,
        'Thay đổi': (l.changes || [])
          .map((c) => `${c.label}: ${fmt(c.before)} → ${fmt(c.after)}`)
          .join('; '),
        'Địa chỉ IP': l.ip_address || '',
        'Vị trí': l.location || '',
        'Thiết bị': l.device || '',
        'Mã phiên': l.session_id || '',
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Nhật ký');
      XLSX.writeFile(wb, `nhat-ky-he-thong-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err: any) {
      console.error('Export error:', err);
      alert('Không xuất được file: ' + (err?.message || 'lỗi không rõ'));
    }
  };

  const getActionColor = (action: string, status: string) => {
    if (status === 'FAILED') return 'bg-red-100 text-red-700 border border-red-300';
    switch (action) {
      case 'CREATE':
        return 'bg-green-100 text-green-700 border border-green-200';
      case 'UPDATE':
        return 'bg-blue-100 text-blue-700 border border-blue-200';
      case 'DELETE':
        return 'bg-red-100 text-red-700 border border-red-200';
      case 'RESTORE':
        return 'bg-amber-100 text-amber-700 border border-amber-200';
      case 'LOGIN':
        return 'bg-purple-100 text-purple-700 border border-purple-200';
      case 'LOGIN_FAILED':
        return 'bg-rose-100 text-rose-700 border border-rose-300';
      case 'LOGOUT':
        return 'bg-gray-100 text-gray-600 border border-gray-200';
      case 'APPROVE':
        return 'bg-teal-100 text-teal-700 border border-teal-200';
      case 'REJECT':
        return 'bg-orange-100 text-orange-700 border border-orange-200';
      case 'EXPORT':
        return 'bg-indigo-100 text-indigo-700 border border-indigo-200';
      default:
        return 'bg-gray-100 text-gray-700 border border-gray-200';
    }
  };

  const getModuleEmoji = (module: string) => {
    switch (module) {
      case 'AUTH':
        return '🔐';
      case 'HR':
        return '👥';
      case 'FINANCE':
        return '💰';
      case 'WAREHOUSE':
        return '📦';
      case 'PRODUCTION':
        return '🏭';
      default:
        return '⚙️';
    }
  };

  const getDeviceIcon = (device: string) => {
    if (!device) return <Monitor size={13} className="text-gray-400" />;
    const d = device.toLowerCase();
    if (d.includes('iphone') || (d.includes('android') && d.includes('điện thoại')))
      return <Smartphone size={13} className="text-blue-500" />;
    if (d.includes('ipad') || d.includes('tablet'))
      return <Tablet size={13} className="text-purple-500" />;
    return <Monitor size={13} className="text-gray-500" />;
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (!allowed) {
    return (
      <div className="p-12 flex flex-col items-center justify-center text-center gap-3 bg-white rounded-3xl border border-red-100">
        <div className="p-5 bg-red-50 rounded-full">
          <Shield size={40} className="text-red-400" />
        </div>
        <h2 className="text-xl font-black text-gray-800">Không có quyền truy cập</h2>
        <p className="text-sm text-gray-500 max-w-md">
          Nhật ký hệ thống chỉ dành cho tài khoản Develop. Tài khoản của bạn (
          <span className="font-semibold">{user.role}</span>) không được phép xem.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <PageBreadcrumb
            items={[
              { label: 'Hệ thống' },
              { label: 'Nhật ký hoạt động', icon: <Shield size={14} /> },
            ]}
          />
          <h1 className="text-2xl font-black text-primary tracking-tight mt-1">
            Nhật ký hoạt động
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Theo dõi đầy đủ: ai làm gì, sửa cái gì, lúc mấy giờ, ở đâu, dùng thiết bị gì
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 font-medium">
            {total.toLocaleString('vi-VN')} bản ghi
          </span>
          <button
            onClick={exportExcel}
            className="flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 hover:bg-gray-50 border border-gray-200 rounded-xl transition-all shadow-sm font-semibold"
          >
            <Download size={18} />
            <span className="hidden sm:inline">Xuất Excel</span>
          </button>
          <button
            onClick={fetchLogs}
            className="flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 hover:bg-gray-50 border border-gray-200 rounded-xl transition-all shadow-sm font-semibold"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Làm mới</span>
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        {/* Bộ lọc */}
        <div className="space-y-3 mb-6">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                size={18}
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm theo tên, mô tả, bản ghi, IP, địa điểm, thiết bị..."
                className="w-full pl-11 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm font-medium"
              />
            </div>
            <select
              value={moduleFilter}
              onChange={(e) => {
                setModuleFilter(e.target.value);
                setPage(0);
              }}
              className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm font-medium min-w-[170px]"
            >
              <option value="">Tất cả phân hệ</option>
              <option value="AUTH">🔐 Xác thực</option>
              <option value="HR">👥 Nhân sự</option>
              <option value="FINANCE">💰 Tài chính</option>
              <option value="WAREHOUSE">📦 Kho</option>
              <option value="PRODUCTION">🏭 Sản xuất</option>
              <option value="SYSTEM">⚙️ Hệ thống</option>
            </select>
          </div>

          <div className="flex flex-col md:flex-row gap-3">
            <select
              value={userFilter}
              onChange={(e) => {
                setUserFilter(e.target.value);
                setPage(0);
              }}
              className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm font-medium flex-1"
            >
              <option value="">Tất cả người dùng</option>
              {actors.map((a) => (
                <option key={a.user_name} value={a.user_name}>
                  {a.user_name} ({a.log_count})
                </option>
              ))}
            </select>

            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(0);
              }}
              className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm font-medium flex-1"
            >
              <option value="">Tất cả hành động</option>
              <option value="CREATE">Thêm mới</option>
              <option value="UPDATE">Chỉnh sửa</option>
              <option value="DELETE">Xóa</option>
              <option value="RESTORE">Khôi phục</option>
              <option value="APPROVE">Duyệt</option>
              <option value="REJECT">Từ chối</option>
              <option value="LOGIN">Đăng nhập</option>
              <option value="LOGIN_FAILED">Đăng nhập thất bại</option>
              <option value="LOGOUT">Đăng xuất</option>
              <option value="EXPORT">Xuất dữ liệu</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(0);
              }}
              className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm font-medium min-w-[140px]"
            >
              <option value="">Mọi kết quả</option>
              <option value="SUCCESS">Thành công</option>
              <option value="FAILED">Thất bại</option>
            </select>

            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(0);
              }}
              className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm font-medium"
            />
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(0);
              }}
              className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm font-medium"
            />

            {hasFilters && (
              <button
                onClick={resetFilters}
                className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all whitespace-nowrap"
              >
                <X size={16} /> Xóa lọc
              </button>
            )}
          </div>
        </div>

        {accessError && (
          <div className="mb-4 flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-xl">
            <AlertTriangle size={18} className="text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-bold text-red-700">Không tải được nhật ký</p>
              <p className="text-xs text-red-600 mt-0.5">{accessError}</p>
            </div>
          </div>
        )}

        {/* Bảng */}
        <div className="overflow-x-auto rounded-2xl border border-gray-100">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100">
                <th className="py-4 px-3 w-8"></th>
                <th className="py-4 px-5 text-xs font-black text-gray-500 uppercase tracking-widest whitespace-nowrap">
                  Thời gian
                </th>
                <th className="py-4 px-5 text-xs font-black text-gray-500 uppercase tracking-widest whitespace-nowrap">
                  Người thao tác
                </th>
                <th className="py-4 px-5 text-xs font-black text-gray-500 uppercase tracking-widest whitespace-nowrap">
                  Địa điểm & Thiết bị
                </th>
                <th className="py-4 px-5 text-xs font-black text-gray-500 uppercase tracking-widest whitespace-nowrap">
                  Phân hệ
                </th>
                <th className="py-4 px-5 text-xs font-black text-gray-500 uppercase tracking-widest whitespace-nowrap">
                  Hành động
                </th>
                <th className="py-4 px-5 text-xs font-black text-gray-500 uppercase tracking-widest min-w-[300px]">
                  Chi tiết
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-gray-400">
                    <RefreshCw className="animate-spin mx-auto mb-3 text-primary" size={24} />
                    <p>Đang tải nhật ký...</p>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-gray-400">
                    <FileText className="mx-auto mb-3 text-gray-300" size={40} />
                    <p className="font-semibold">Không tìm thấy nhật ký nào</p>
                    <p className="text-xs mt-1">
                      {hasFilters
                        ? 'Thử bỏ bớt điều kiện lọc'
                        : 'Thực hiện một thao tác bất kỳ trong app để ghi log đầu tiên'}
                    </p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const isOpen = expandedId === log.id;
                  const changes = log.changes || [];
                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        className={`hover:bg-primary/5 transition-colors cursor-pointer ${
                          log.status === 'FAILED' ? 'bg-red-50/40' : ''
                        }`}
                        onClick={() => setExpandedId(isOpen ? null : log.id)}
                      >
                        <td className="py-3 px-3 align-top pt-5 text-gray-400">
                          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </td>

                        {/* Thời gian */}
                        <td className="py-3 px-5 text-sm text-gray-600 font-medium whitespace-nowrap align-top pt-4">
                          <div className="flex items-center gap-1.5">
                            <Clock size={13} className="text-gray-400 shrink-0" />
                            <div className="flex flex-col">
                              <span className="font-bold text-gray-700">
                                {new Intl.DateTimeFormat('vi-VN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                }).format(new Date(log.created_at))}
                              </span>
                              <span className="text-[10px] text-gray-400">
                                {new Intl.DateTimeFormat('vi-VN', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                }).format(new Date(log.created_at))}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Người thao tác */}
                        <td className="py-3 px-5 align-top pt-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 font-bold text-sm">
                              {log.user_name?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-bold text-gray-800 text-sm">
                                {log.user_name}
                              </span>
                              <span className="text-[10px] text-gray-400">
                                {log.user_code ? `${log.user_code} • ` : ''}
                                {log.user_role || '—'}
                              </span>
                              <span className="text-[10px] text-gray-400 font-mono">
                                {log.ip_address || '—'}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Địa điểm & Thiết bị */}
                        <td className="py-3 px-5 align-top pt-4">
                          <div className="flex flex-col gap-1 min-w-[180px]">
                            {log.location && log.location !== 'Unknown' ? (
                              <div className="flex items-start gap-1.5">
                                <MapPin size={12} className="text-red-400 mt-0.5 shrink-0" />
                                <span className="text-xs text-gray-600 font-medium leading-tight">
                                  {log.location}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <Globe size={12} className="text-gray-300" />
                                <span className="text-xs text-gray-300">Không xác định</span>
                              </div>
                            )}
                            {log.device && log.device !== 'Unknown' ? (
                              <div className="flex items-start gap-1.5">
                                {getDeviceIcon(log.device)}
                                <span className="text-[10px] text-gray-500 leading-tight">
                                  {log.device}
                                </span>
                              </div>
                            ) : null}
                          </div>
                        </td>

                        {/* Phân hệ */}
                        <td className="py-3 px-5 align-top pt-4 whitespace-nowrap">
                          <span className="text-sm font-bold text-gray-600">
                            {getModuleEmoji(log.module)} {log.module}
                          </span>
                        </td>

                        {/* Hành động */}
                        <td className="py-3 px-5 align-top pt-4 whitespace-nowrap">
                          <div className="flex flex-col items-start gap-1">
                            <span
                              className={`px-2.5 py-1 text-xs font-bold rounded-lg ${getActionColor(
                                log.action,
                                log.status,
                              )}`}
                            >
                              {getActionLabel(log.action)}
                            </span>
                            {log.status === 'FAILED' ? (
                              <span className="flex items-center gap-1 text-[10px] font-bold text-red-600">
                                <AlertTriangle size={10} /> Thất bại
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-[10px] text-green-600">
                                <CheckCircle2 size={10} /> Thành công
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Chi tiết */}
                        <td className="py-3 px-5 align-top pt-4">
                          <p className="text-sm text-gray-700 leading-relaxed">{log.description}</p>
                          {changes.length > 0 && (
                            <span className="inline-block mt-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                              {changes.length} thay đổi — bấm để xem
                            </span>
                          )}
                        </td>
                      </tr>

                      {/* Hàng mở rộng: chi tiết thay đổi */}
                      {isOpen && (
                        <tr className="bg-gray-50/60">
                          <td colSpan={7} className="px-8 py-5">
                            <div className="space-y-4">
                              {changes.length > 0 && (
                                <div>
                                  <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-2">
                                    Nội dung thay đổi
                                  </p>
                                  <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="bg-gray-50 border-b border-gray-200">
                                          <th className="py-2 px-4 text-left text-xs font-bold text-gray-500">
                                            Trường
                                          </th>
                                          <th className="py-2 px-4 text-left text-xs font-bold text-gray-500">
                                            Giá trị cũ
                                          </th>
                                          <th className="py-2 px-4 text-left text-xs font-bold text-gray-500">
                                            Giá trị mới
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100">
                                        {changes.map((c, i) => (
                                          <tr key={`${c.field}-${i}`}>
                                            <td className="py-2 px-4 font-semibold text-gray-700">
                                              {c.label}
                                            </td>
                                            <td className="py-2 px-4">
                                              <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded line-through decoration-red-300">
                                                {fmt(c.before)}
                                              </span>
                                            </td>
                                            <td className="py-2 px-4">
                                              <span className="text-green-700 bg-green-50 px-2 py-0.5 rounded font-medium">
                                                {fmt(c.after)}
                                              </span>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {log.metadata?.error && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                                  <p className="text-xs font-black text-red-600 uppercase tracking-widest mb-1">
                                    Thông báo lỗi
                                  </p>
                                  <p className="text-sm text-red-700 font-mono">
                                    {log.metadata.error}
                                  </p>
                                </div>
                              )}

                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                <InfoCell label="Đối tượng">
                                  {log.target_table ? getTableLabel(log.target_table) : '—'}
                                </InfoCell>
                                <InfoCell label="Tên bản ghi">{log.target_label || '—'}</InfoCell>
                                <InfoCell label="Mã bản ghi">
                                  <span className="font-mono">{log.record_id || '—'}</span>
                                </InfoCell>
                                <InfoCell label="Mã phiên">
                                  <span className="font-mono flex items-center gap-1">
                                    <Fingerprint size={11} className="text-gray-400" />
                                    {log.session_id ? log.session_id.slice(0, 13) : '—'}
                                  </span>
                                </InfoCell>
                              </div>

                              {log.metadata?.snapshot && (
                                <details className="group">
                                  <summary className="cursor-pointer text-xs font-bold text-gray-500 hover:text-primary flex items-center gap-1">
                                    <Activity size={12} /> Dữ liệu đầy đủ của bản ghi
                                  </summary>
                                  <pre className="mt-2 p-3 bg-gray-900 text-gray-100 rounded-xl text-[11px] overflow-x-auto max-h-72">
                                    {JSON.stringify(log.metadata.snapshot, null, 2)}
                                  </pre>
                                </details>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Phân trang */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-gray-400">
              Trang {page + 1} / {totalPages} — {total.toLocaleString('vi-VN')} bản ghi
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="flex items-center gap-1 px-3 py-2 text-sm font-semibold border border-gray-200 rounded-xl disabled:opacity-40 hover:bg-gray-50 transition-all"
              >
                <ChevronLeft size={16} /> Trước
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="flex items-center gap-1 px-3 py-2 text-sm font-semibold border border-gray-200 rounded-xl disabled:opacity-40 hover:bg-gray-50 transition-all"
              >
                Sau <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const InfoCell = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="bg-white border border-gray-200 rounded-xl px-3 py-2">
    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
    <p className="text-gray-700 font-medium mt-0.5 break-all">{children}</p>
  </div>
);

const fmt = (v: any): string => {
  if (v === null || v === undefined || v === '') return '(trống)';
  if (typeof v === 'boolean') return v ? 'Có' : 'Không';
  if (typeof v === 'number') return v.toLocaleString('vi-VN');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};
