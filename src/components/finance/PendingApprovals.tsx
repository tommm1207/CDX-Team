import { CanvasLogo } from '@/components/shared';
import { exportTableImage } from '../../utils/reportExport';
import { useState, useEffect } from 'react';
import {
  ClipboardCheck,
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowLeftRight,
  Check,
  X,
  RefreshCw,
  AlertCircle,
  Wallet,
  ChevronRight,
  Trash2,
  Edit,
  ChevronDown,
  CheckCircle,
  Image as ImageIcon,
  Share2,
  Search,
  Filter,
} from 'lucide-react';
import { useRef } from 'react';

import { SaveImageButton } from '@/components/shared';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '@/lib/supabase';
import { Employee } from '@/types';
import { PageBreadcrumb } from '@/components/shared';
import { ToastType } from '@/components/shared';
import { formatDate, formatNumber, formatCurrency } from '@/utils/format';
import { Button } from '@/components/shared';
import { SortButton, SortOption } from '@/components/shared';
import { logAudit } from '@/utils/auditLogger';

interface ConfirmState {
  slip: any;
  action: 'approve' | 'reject';
}

const typeIcon = (type: string, size = 20) => {
  if (type === 'Nhập kho') return <ArrowDownCircle size={size} className="text-blue-500" />;
  if (type === 'Xuất kho') return <ArrowUpCircle size={size} className="text-red-500" />;
  if (type === 'Luân chuyển') return <ArrowLeftRight size={size} className="text-orange-500" />;
  return <Wallet size={size} className="text-primary" />;
};

const typeColor = (type: string) => {
  if (type === 'Nhập kho') return 'bg-blue-50 text-blue-600';
  if (type === 'Xuất kho') return 'bg-red-50 text-red-600';
  if (type === 'Luân chuyển') return 'bg-orange-50 text-orange-600';
  return 'bg-primary/10 text-primary';
};

export const PendingApprovals = ({
  user,
  onBack,
  onNavigate,
  onRefreshCount,
  addToast,
  initialCount = 0,
}: {
  user: Employee;
  onBack: () => void;
  onNavigate: (page: string, params?: any) => void;
  onRefreshCount: () => void;
  addToast?: (message: string, type?: ToastType) => void;
  initialCount?: number;
}) => {
  const [slips, setSlips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedSlip, setSelectedSlip] = useState<any | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [isCapturingTable, setIsCapturingTable] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  const reportRef = useRef<HTMLDivElement>(null);

  const displayCount = slips.length;

  useEffect(() => {
    fetchPendingSlips();
  }, []);

  const handleSaveTableImage = () => {
    const reportElem = reportRef.current;
    if (reportElem) {
      exportTableImage({
        element: reportElem,
        fileName: 'Bao_Cao.png',
        addToast,
        onStart: () => setIsCapturingTable(true),
        onEnd: () => setIsCapturingTable(false),
      });
    }
  };

  const fetchPendingSlips = async (silent = false) => {
    if (!silent) setLoading(true);
    setErrorMsg(null);
    try {
      const [si, so, tr, co] = await Promise.all([
        supabase
          .from('stock_in')
          .select('*, warehouses(name), materials(name, unit), users!employee_id(full_name)')
          .eq('status', 'Chờ duyệt'),
        supabase
          .from('stock_out')
          .select('*, warehouses(name), materials(name, unit), users!employee_id(full_name)')
          .eq('status', 'Chờ duyệt'),
        supabase
          .from('transfers')
          .select(
            '*, from_wh:warehouses!from_warehouse_id(name), to_wh:warehouses!to_warehouse_id(name), materials(name), users!employee_id(full_name)',
          )
          .eq('status', 'Chờ duyệt'),
        supabase
          .from('costs')
          .select('*, warehouses(name), materials(name), users!employee_id(full_name)')
          .eq('status', 'Chờ duyệt'),
      ]);

      const allPending = [
        ...(si.data || []).map((s) => ({ ...s, type: 'Nhập kho', table: 'stock_in' })),
        ...(so.data || []).map((s) => ({ ...s, type: 'Xuất kho', table: 'stock_out' })),
        ...(tr.data || []).map((s) => ({ ...s, type: 'Luân chuyển', table: 'transfers' })),
        ...(co.data || []).map((s) => ({ ...s, type: 'Chi phí', table: 'costs' })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setSlips(allPending);
      onRefreshCount();
    } catch (err: any) {
      const msg = 'Lỗi tải danh sách: ' + err.message;
      setErrorMsg(msg);
      if (addToast) addToast(msg, 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const isChildSlip = (slip: any) => {
    return slip.table === 'stock_out' && (slip.export_code || '').startsWith('SX-');
  };

  const executeAction = async () => {
    if (!confirm) return;
    const { slip, action } = confirm;
    if (isChildSlip(slip)) {
      addToast?.(
        'Không thể duyệt trực tiếp phiếu NVL. Hãy duyệt tại phiếu Nhập cọc tương ứng.',
        'error',
      );
      setConfirm(null);
      return;
    }
    setConfirm(null);
    setActionLoading(slip.id);
    setErrorMsg(null);
    try {
      const newStatus = action === 'approve' ? 'Đã duyệt' : 'Từ chối';
      const { error } = await supabase
        .from(slip.table)
        .update({ status: newStatus })
        .eq('id', slip.id);

      if (error) throw error;

      await logAudit(user, {
        module: 'FINANCE',
        action: action === 'approve' ? 'APPROVE' : 'REJECT',
        description: `${action === 'approve' ? 'Duyệt' : 'Từ chối'} phiếu ${slip.type || ''}: ${slip.import_code || slip.export_code || slip.cost_code || slip.id}`,
        recordId: slip.id,
      });

      // Dùyệt liên đới: khi duyệt phiếu nhập SX-, tự động duyệt phiếu xuất NVL liên quan
      if (
        action === 'approve' &&
        slip.table === 'stock_in' &&
        slip.import_code?.startsWith('SX-')
      ) {
        await supabase
          .from('stock_out')
          .update({ status: 'Đã duyệt' })
          .ilike('export_code', `${slip.import_code}-%`)
          .eq('status', 'Chờ duyệt');
      }

      // Optimistic update
      setSlips((prev) => prev.filter((s) => !(s.id === slip.id && s.table === slip.table)));
      setSelectedSlip(null);
      onRefreshCount();
      if (addToast)
        addToast(`${action === 'approve' ? 'Duyệt' : 'Từ chối'} phiếu thành công!`, 'success');

      fetchPendingSlips(true);
    } catch (err: any) {
      const msg = `Lỗi khi ${action === 'approve' ? 'duyệt' : 'từ chối'} phiếu: ${err.message}`;
      setErrorMsg(msg);
      if (addToast) addToast(msg, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const deleteSlip = async () => {
    if (!selectedSlip) return;
    setDeleteLoading(true);
    try {
      const { error } = await supabase
        .from(selectedSlip.table)
        .update({ status: 'Đã xóa' })
        .eq('id', selectedSlip.id);
      if (error) throw error;
      await logAudit(user, {
        module: 'FINANCE',
        action: 'DELETE',
        description: `Chuyển phiếu vào thùng rác: ${selectedSlip.import_code || selectedSlip.export_code || selectedSlip.cost_code || selectedSlip.id}`,
        recordId: selectedSlip.id,
      });
      setSlips((prev) =>
        prev.filter((s) => !(s.id === selectedSlip.id && s.table === selectedSlip.table)),
      );
      setSelectedSlip(null);
      onRefreshCount();
      if (addToast) addToast('Đã chuyển phiếu vào thùng rác', 'success');
      fetchPendingSlips(true);
    } catch (err: any) {
      if (addToast) addToast('Lỗi xóa phiếu: ' + err.message, 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  const slipCode = (item: any) =>
    item.import_code ||
    item.export_code ||
    item.transfer_code ||
    item.cost_code ||
    '#' + item.id.slice(0, 8);

  const isAdmin = user.role === 'Admin' || user.role === 'Develop';

  return (
    <div className="p-4 md:p-6 space-y-4 pb-24">
      <div className="flex items-center justify-between gap-2 mb-4">
        <PageBreadcrumb title="Phê duyệt phiếu" onBack={onBack} />
        <div className="flex items-center gap-2">
          <SortButton
            currentSort={sortBy}
            onSortChange={(val) => setSortBy(val)}
            options={[
              { value: 'newest', label: 'Tương tác mới nhất' },
              { value: 'date', label: 'Ngày chứng từ' },
              { value: 'code', label: 'Mã chứng từ' },
            ]}
          />
          <Button
            size="icon"
            variant={showFilter ? 'primary' : 'outline'}
            onClick={() => setShowFilter(!showFilter)}
            icon={Search}
          />
          <Button
            variant="outline"
            size="icon"
            icon={RefreshCw}
            onClick={() => fetchPendingSlips()}
            className="border-gray-200 text-gray-400"
          />
        </div>
      </div>

      {/* Error display */}
      {errorMsg && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
          <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Có lỗi xảy ra</p>
            <p className="mt-1 text-xs">{errorMsg}</p>
          </div>
          <button
            onClick={() => setErrorMsg(null)}
            className="ml-auto text-red-400 hover:text-red-600"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Confirm popup */}
      {confirm && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm h-[100dvh] w-full"
          onClick={() => setConfirm(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto ${confirm.action === 'approve' ? 'bg-green-100' : 'bg-red-100'}`}
            >
              {confirm.action === 'approve' ? (
                <Check className="text-green-600" size={24} />
              ) : (
                <X className="text-red-600" size={24} />
              )}
            </div>
            <div className="text-center">
              <p className="font-bold text-gray-800 text-lg">
                {confirm.action === 'approve' ? 'Duyệt phiếu?' : 'Từ chối phiếu?'}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                <span className="font-medium">{confirm.slip.type}</span>
                {' — '}
                {confirm.slip.materials?.name || confirm.slip.content}
              </p>
              {confirm.slip.quantity && (
                <p className="text-sm font-mono mt-1 text-gray-600">
                  SL: {formatNumber(confirm.slip.quantity)}{' '}
                  {confirm.slip.materials?.unit || confirm.slip.unit || ''}
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" fullWidth onClick={() => setConfirm(null)}>
                Hủy
              </Button>
              <Button
                fullWidth
                onClick={executeAction}
                variant={confirm.action === 'approve' ? 'success' : 'danger'}
                className={
                  confirm.action === 'approve'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                }
              >
                {confirm.action === 'approve' ? '✓ Duyệt ngay' : '✕ Từ chối'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden Report Template (A4 Landscape) */}
      <div className="fixed -left-[4000px] -top-[4000px] no-print">
        <div
          ref={reportRef}
          className="bg-white p-12 w-[1400px] min-h-[794px] font-sans text-gray-900 border"
          style={{ width: '1400px' }}
        >
          {/* Premium Branding Header */}
          <div className="flex items-center gap-6 mb-10">
            <CanvasLogo size={96} className="w-24 h-24 rounded-3xl object-contain shadow-sm" />
            <div className="space-y-1">
              <h2 className="text-3xl font-black text-gray-800 tracking-tighter uppercase leading-none">
                CÔNG TY CON ĐƯỜNG XANH
              </h2>
              <p className="text-sm font-bold text-gray-400 uppercase tracking-[0.3em] mt-2">
                Hệ thống Quản trị Nguồn lực thi công
              </p>
            </div>
          </div>

          <div className="mb-6">
            <h1 className="text-3xl font-black text-[#2D5A27] tracking-tighter mb-1 uppercase">
              DANH SÁCH CHỜ DUYỆT
            </h1>
            <p className="text-sm font-bold text-gray-500 uppercase">
              Management Audit Pool • Total: {slips.length} Slips
            </p>
          </div>
          {/* Old Header Hidden */}
          <div
            className="flex justify-between items-start mb-10 pb-6 border-b-2 border-primary/20"
            style={{ display: 'none' }}
          >
            <div className="flex items-center gap-6">
              <div className="bg-primary/5 p-4 rounded-3xl border border-primary/10">
                <CanvasLogo size={96} className="w-24 h-24 rounded-3xl object-contain shadow-sm" />
              </div>
              <div className="space-y-1">
                <h1 className="text-3xl font-black text-primary tracking-tighter uppercase">
                  CDX ERP SYSTEM
                </h1>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.3em]">
                  Smart Construction Management • 2026 Edition
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-amber-100">
                    Management Audit Pool
                  </span>
                  <span className="w-1.5 h-1.5 bg-gray-200 rounded-full" />
                  <span className="text-[10px] text-gray-500 font-bold italic tracking-wide">
                    Ref ID: PENDING_POOL_{new Date().getTime().toString(36).toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-3xl font-black text-gray-900 uppercase tracking-tighter mb-1">
                Danh Sách Phiếu Chờ Duyệt
              </h2>
              <p className="text-xs text-gray-500 font-bold italic">
                Thời gian xuất: {new Date().toLocaleString('vi-VN')}
              </p>
              <div className="mt-4 flex flex-col items-end gap-1">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest font-mono">
                  STATUS: HIGH_PRIORITY
                </p>
                <div className="h-0.5 w-12 bg-primary/20 rounded-full" />
              </div>
            </div>
          </div>

          {/* Statistics Info */}
          <div className="grid grid-cols-4 gap-6 mb-8 bg-gray-50/50 p-6 rounded-3xl border border-gray-100">
            <div className="space-y-1 border-r border-gray-100">
              <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">
                Tổng lượt duyệt
              </p>
              <p className="text-2xl font-black text-gray-900">
                {slips.length} <span className="text-xs font-bold text-gray-400">phiếu</span>
              </p>
            </div>
            <div className="space-y-1 border-r border-gray-100 px-4">
              <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">
                Nhập kho
              </p>
              <p className="text-2xl font-black text-blue-600">
                {slips.filter((s) => s.type === 'Nhập kho').length}
              </p>
            </div>
            <div className="space-y-1 border-r border-gray-100 px-4">
              <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">
                Xuất kho
              </p>
              <p className="text-2xl font-black text-red-600">
                {slips.filter((s) => s.type === 'Xuất kho').length}
              </p>
            </div>
            <div className="space-y-1 px-4">
              <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">
                Chi phí/Khác
              </p>
              <p className="text-2xl font-black text-emerald-600">
                {slips.filter((s) => s.type === 'Chi phí').length}
              </p>
            </div>
          </div>

          {/* Table */}
          <table className="w-full text-left border-collapse rounded-3xl overflow-hidden shadow-sm border border-gray-100">
            <thead>
              <tr className="bg-gray-800 text-white">
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest italic border-r border-white/10">
                  Loại phiếu
                </th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest italic border-r border-white/10">
                  Người tạo / Ngày
                </th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest italic border-r border-white/10">
                  Mã phiếu / Nội dung
                </th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest italic border-r border-white/10">
                  Đơn vị / Kho
                </th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest italic text-right">
                  Số lượng / Thành tiền
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs">
              {slips.map((item, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}>
                  <td className="px-4 py-3">
                    <div
                      className={`inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter italic ${item.type === 'Nhập kho' ? 'bg-blue-50 text-blue-600' : item.type === 'Xuất kho' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}
                    >
                      {item.type}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-black text-gray-900 uppercase tracking-tight">
                      {item.users?.full_name}
                    </p>
                    <p className="text-[10px] text-gray-400 italic mt-0.5">
                      {formatDate(item.date)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-black text-primary font-mono tracking-tighter uppercase underline mb-0.5">
                      #{slipCode(item)}
                    </p>
                    <p className="text-[10px] text-gray-600 font-bold truncate max-w-[200px] italic">
                      {item.materials?.name || item.content}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tight">
                      {item.type === 'Luân chuyển'
                        ? `${item.from_wh?.name} → ${item.to_wh?.name}`
                        : item.warehouses?.name || '—'}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {item.quantity > 0 && (
                      <p className="font-black text-gray-900 tracking-tighter tabular-nums px-2 py-1 bg-gray-100/50 inline-block rounded-lg mb-1 italic">
                        {formatNumber(item.quantity)} {item.materials?.unit || item.unit || ''}
                      </p>
                    )}
                    {item.total_amount > 0 && (
                      <p
                        className={`text-[11px] font-black tracking-widest ${item.type === 'Chi phí' ? 'text-red-600 underline decoration-double' : 'text-gray-400 italic'}`}
                      >
                        {formatCurrency(item.total_amount)}
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Footer Branding */}
          <div className="mt-12 flex justify-between items-end border-t border-gray-100 pt-6">
            <div className="space-y-1">
              <p className="text-xs font-black text-gray-300 uppercase tracking-[0.2em] italic whitespace-nowrap">
                CDX ERP SYSTEM
              </p>
              <p className="text-[9px] text-gray-300 font-bold uppercase tracking-widest">
                End of pending pool report • Secure Operational Oversight
              </p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-black text-gray-300 uppercase tracking-[0.3em] mb-1">
                Audit Trail Verified
              </p>
              <div className="text-[10px] text-gray-400 font-bold bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
                Oversight Integrity:{' '}
                <span className="text-amber-500 font-black tracking-widest italic ml-1 underline">
                  SECURED_VAULT
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedSlip && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm h-[100dvh] w-full"
            onClick={() => setSelectedSlip(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90dvh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div
                className={`p-5 rounded-t-3xl flex items-center justify-between ${typeColor(selectedSlip.type)}`}
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedSlip(null)}
                    className="p-2 rounded-xl hover:bg-black/10 transition-colors cursor-pointer"
                  >
                    {typeIcon(selectedSlip.type, 24)}
                  </button>
                  <div>
                    <p className="font-bold text-base">{selectedSlip.type}</p>
                    <p className="text-[11px] font-mono opacity-75">{slipCode(selectedSlip)}</p>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {selectedSlip.notes?.includes('[SỬA') && (
                  <div className="px-3 py-2 bg-yellow-50 border border-yellow-100 rounded-xl text-xs text-yellow-700 font-medium">
                    ⚠️ Phiếu đã được chỉnh sửa
                  </div>
                )}

                <div className="space-y-0 divide-y divide-gray-50">
                  {/* Người tạo */}
                  <Row label="Người tạo" value={selectedSlip.users?.full_name || '—'} />
                  {/* Ngày */}
                  <Row label="Ngày" value={formatDate(selectedSlip.date)} />
                  {/* Vật tư / Nội dung */}
                  {selectedSlip.type === 'Chi phí' ? (
                    <>
                      <Row label="Loại chi phí" value={selectedSlip.cost_type || '—'} />
                      <Row label="Nội dung" value={selectedSlip.content || '—'} />
                      <Row label="Kho" value={selectedSlip.warehouses?.name || '—'} />
                    </>
                  ) : selectedSlip.type === 'Luân chuyển' ? (
                    <>
                      <Row label="Vật tư" value={selectedSlip.materials?.name || '—'} />
                      <Row label="Kho đi" value={selectedSlip.from_wh?.name || '—'} />
                      <Row label="Kho đến" value={selectedSlip.to_wh?.name || '—'} />
                    </>
                  ) : (
                    <>
                      <Row label="Vật tư" value={selectedSlip.materials?.name || '—'} />
                      <Row label="Kho" value={selectedSlip.warehouses?.name || '—'} />
                    </>
                  )}
                  {/* Số lượng */}
                  {selectedSlip.quantity > 0 && (
                    <Row
                      label="Số lượng"
                      value={`${formatNumber(selectedSlip.quantity)} ${selectedSlip.materials?.unit || selectedSlip.unit || ''}`}
                      bold
                    />
                  )}
                  {/* Đơn giá */}
                  {selectedSlip.unit_price > 0 && (
                    <Row label="Đơn giá" value={formatCurrency(selectedSlip.unit_price)} />
                  )}
                  {/* Thành tiền */}
                  {selectedSlip.total_amount > 0 && (
                    <Row
                      label="Thành tiền"
                      value={formatCurrency(selectedSlip.total_amount)}
                      bold
                      highlight
                    />
                  )}
                  {/* Ghi chú */}
                  {selectedSlip.notes && (
                    <div className="py-3">
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Ghi chú</p>
                      <p className="text-xs text-gray-600 leading-relaxed">{selectedSlip.notes}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer actions */}
              <div className="p-4 border-t border-gray-100 rounded-b-3xl bg-gray-50 flex flex-col gap-3 w-full mt-auto">
                {isAdmin && (
                  <div className="grid grid-cols-2 gap-3 w-full">
                    {isChildSlip(selectedSlip) ? (
                      <div className="col-span-2 p-3 bg-amber-50 border border-amber-100 rounded-xl text-[10px] text-amber-700 font-bold text-center leading-tight">
                        ⚠️ Phiếu này được tạo từ Lệnh sản xuất.
                        <br />
                        Bạn cần duyệt qua Phiếu nhập cọc tổng (Mã{' '}
                        {selectedSlip.export_code.split('-').slice(0, 3).join('-')}).
                      </div>
                    ) : (
                      <>
                        <Button
                          fullWidth
                          variant="danger"
                          icon={X}
                          onClick={() => setConfirm({ slip: selectedSlip, action: 'reject' })}
                          isLoading={actionLoading === selectedSlip.id}
                          className="h-full"
                        >
                          Từ chối
                        </Button>
                        <Button
                          fullWidth
                          variant="success"
                          icon={Check}
                          onClick={() => setConfirm({ slip: selectedSlip, action: 'approve' })}
                          isLoading={actionLoading === selectedSlip.id}
                          className="h-full"
                        >
                          Duyệt
                        </Button>
                      </>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 w-full">
                  <Button
                    fullWidth
                    variant="outline"
                    icon={Trash2}
                    onClick={deleteSlip}
                    isLoading={deleteLoading}
                    className="h-full text-red-600 border-red-200 bg-white hover:bg-red-50"
                  >
                    Thùng rác
                  </Button>
                  <Button
                    fullWidth
                    variant="outline"
                    icon={Edit}
                    onClick={() => {
                      if (addToast)
                        addToast(`Chuyển đến trang ${selectedSlip.type} để sửa phiếu.`, 'info');
                      setSelectedSlip(null);
                      if (selectedSlip.table === 'stock_in') onNavigate?.('stock-in');
                      else if (selectedSlip.table === 'stock_out') onNavigate?.('stock-out');
                      else if (selectedSlip.table === 'transfers') onNavigate?.('transfer');
                      else if (selectedSlip.table === 'costs') onNavigate?.('costs');
                    }}
                    className="h-full text-gray-700 border-gray-200 bg-white hover:bg-gray-50"
                  >
                    Sửa
                  </Button>
                </div>

                <Button
                  fullWidth
                  variant="outline"
                  icon={ChevronDown}
                  onClick={() => setSelectedSlip(null)}
                  className="text-gray-600 border-gray-200 bg-white hover:bg-gray-50"
                >
                  Đóng
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[760px] whitespace-nowrap">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Loại phiếu
                </th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Người tạo / Ngày
                </th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Nội dung / Kho
                </th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400 text-right">
                  Số lượng / Tiền
                </th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400 text-center">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-400 italic">
                    Đang tải danh sách...
                  </td>
                </tr>
              ) : slips.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-400 italic">
                    ✅ Không có phiếu nào cần duyệt
                  </td>
                </tr>
              ) : (
                slips
                  .filter((s) => {
                    if (!searchTerm) return true;
                    const search = searchTerm.toLowerCase();
                    const sCode = slipCode(s).toLowerCase();
                    const sContent = (s.materials?.name || s.content || '').toLowerCase();
                    const sCreator = (s.users?.full_name || '').toLowerCase();
                    return (
                      sCode.includes(search) ||
                      sContent.includes(search) ||
                      sCreator.includes(search)
                    );
                  })
                  .sort((a, b) => {
                    if (sortBy === 'newest')
                      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                    if (sortBy === 'date')
                      return new Date(b.date).getTime() - new Date(a.date).getTime();
                    if (sortBy === 'code') return slipCode(a).localeCompare(slipCode(b));
                    return 0;
                  })
                  .map((item) => (
                    <tr
                      key={`${item.table}-${item.id}`}
                      onClick={() => setSelectedSlip(item)}
                      className={`hover:bg-primary/5 cursor-pointer transition-colors ${actionLoading === item.id ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {typeIcon(item.type, 16)}
                          <span className="text-xs font-bold text-gray-800">{item.type}</span>
                          {item.notes?.includes('[SỬA') && (
                            <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 text-[10px] font-bold rounded">
                              Đã sửa
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-gray-400 uppercase mt-0.5 block">
                          #{slipCode(item)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-medium text-gray-700">
                          {item.users?.full_name || '—'}
                        </div>
                        <div className="text-[10px] text-gray-400">{formatDate(item.date)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-bold text-gray-800">
                          {item.type === 'Chi phí'
                            ? item.content
                            : item.materials?.name || item.content || '—'}
                        </div>
                        <div className="flex flex-col items-start gap-1 mt-0.5">
                          {item.type === 'Chi phí' && item.cost_type && (
                            <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-bold">
                              {item.cost_type}
                            </span>
                          )}
                          {item.type !== 'Chi phí' && (
                            <span className="text-[10px] text-gray-500 italic">
                              {item.type === 'Luân chuyển'
                                ? `${item.from_wh?.name} → ${item.to_wh?.name}`
                                : item.warehouses?.name || ''}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {item.type !== 'Chi phí' && item.quantity ? (
                          <div className="text-xs font-bold text-gray-900">
                            {formatNumber(item.quantity)} {item.materials?.unit || item.unit || ''}
                          </div>
                        ) : null}
                        {item.total_amount > 0 && (
                          <div
                            className={`mt-0.5 font-medium ${item.type === 'Chi phí' ? 'text-xs font-bold text-red-600' : 'text-[10px] text-gray-400'}`}
                          >
                            {item.type === 'Chi phí'
                              ? formatCurrency(item.total_amount)
                              : formatCurrency(item.total_amount)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          {isAdmin && !isChildSlip(item) && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirm({ slip: item, action: 'approve' });
                                }}
                                disabled={actionLoading === item.id}
                                className="p-2 bg-green-50 text-green-600 rounded-xl hover:bg-green-600 hover:text-white transition-all shadow-sm disabled:opacity-50"
                                title="Duyệt phiếu"
                              >
                                {actionLoading === item.id ? (
                                  <RefreshCw size={16} className="animate-spin" />
                                ) : (
                                  <Check size={16} />
                                )}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirm({ slip: item, action: 'reject' });
                                }}
                                disabled={actionLoading === item.id}
                                className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-sm disabled:opacity-50"
                                title="Từ chối"
                              >
                                <X size={16} />
                              </button>
                            </>
                          )}
                          {isChildSlip(item) && (
                            <div className="text-[9px] text-amber-600 font-bold bg-amber-50 px-2 py-1 rounded-lg border border-amber-100 italic whitespace-normal max-w-[120px] text-center leading-tight">
                              Cần duyệt lệnh SX chính
                            </div>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSlip(item);
                            }}
                            className="p-2 bg-gray-50 text-gray-500 rounded-xl hover:bg-gray-200 transition-all shadow-sm"
                            title="Xem chi tiết"
                          >
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
        {displayCount > 0 && (
          <div className="px-4 py-3 bg-amber-50 border-t border-amber-100 flex items-center gap-2">
            <AlertCircle size={14} className="text-amber-500" />
            <span className="text-xs text-amber-700 font-medium">
              {displayCount} phiếu đang chờ duyệt
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

// Helper row component for detail modal
const Row = ({
  label,
  value,
  bold,
  highlight,
}: {
  label: string;
  value: string;
  bold?: boolean;
  highlight?: boolean;
}) => (
  <div className="flex justify-between items-center py-3 gap-4">
    <span className="text-[10px] font-bold text-gray-400 uppercase shrink-0">{label}</span>
    <span
      className={`text-right text-sm ${bold ? 'font-bold' : 'font-medium'} ${highlight ? 'text-red-600' : 'text-gray-800'}`}
    >
      {value}
    </span>
  </div>
);
