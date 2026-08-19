import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PageBreadcrumb } from '@/components/shared';
import {
  Shield,
  Clock,
  User,
  Activity,
  Search,
  RefreshCw,
  FileText,
  MapPin,
  Smartphone,
  Monitor,
  Tablet,
  Globe,
} from 'lucide-react';

interface AuditLog {
  id: string;
  created_at: string;
  user_name: string;
  module: string;
  action: string;
  description: string;
  ip_address: string;
  location: string;
  device: string;
}

export const AuditLogsPage = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (moduleFilter) {
        query = query.eq('module', moduleFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [moduleFilter]);

  const filteredLogs = logs.filter(
    (log) =>
      log.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.device?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const getActionColor = (action: string) => {
    switch (action) {
      case 'CREATE':
        return 'bg-green-100 text-green-700 border border-green-200';
      case 'UPDATE':
        return 'bg-blue-100 text-blue-700 border border-blue-200';
      case 'DELETE':
        return 'bg-red-100 text-red-700 border border-red-200';
      case 'LOGIN':
        return 'bg-purple-100 text-purple-700 border border-purple-200';
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
            Theo dõi đầy đủ: ai làm gì, lúc mấy giờ, ở đâu, dùng thiết bị gì
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 font-medium">{filteredLogs.length} bản ghi</span>
          <button
            onClick={fetchLogs}
            className="flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 hover:bg-gray-50 border border-gray-200 rounded-xl transition-all shadow-sm font-semibold"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo tên, mô tả, địa điểm, thiết bị..."
              className="w-full pl-11 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm font-medium"
            />
          </div>
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm font-medium min-w-[200px]"
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

        {/* Table */}
        <div className="overflow-x-auto rounded-2xl border border-gray-100">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100">
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
                <th className="py-4 px-5 text-xs font-black text-gray-500 uppercase tracking-widest min-w-[280px]">
                  Chi tiết
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-gray-400">
                    <RefreshCw className="animate-spin mx-auto mb-3 text-primary" size={24} />
                    <p>Đang tải nhật ký...</p>
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-gray-400">
                    <FileText className="mx-auto mb-3 text-gray-300" size={40} />
                    <p className="font-semibold">Không tìm thấy nhật ký nào</p>
                    <p className="text-xs mt-1">
                      Thực hiện một thao tác bất kỳ trong app để ghi log đầu tiên
                    </p>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-primary/5 transition-colors cursor-pointer"
                    onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  >
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
                          <span className="font-bold text-gray-800 text-sm">{log.user_name}</span>
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
                      <span
                        className={`px-2.5 py-1 text-xs font-bold rounded-lg ${getActionColor(log.action)}`}
                      >
                        {log.action}
                      </span>
                    </td>

                    {/* Chi tiết */}
                    <td className="py-3 px-5 align-top pt-4">
                      <p className="text-sm text-gray-700 leading-relaxed">{log.description}</p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filteredLogs.length > 0 && (
          <p className="text-center text-xs text-gray-400 mt-4">
            Hiển thị {filteredLogs.length} nhật ký gần nhất
          </p>
        )}
      </div>
    </div>
  );
};
