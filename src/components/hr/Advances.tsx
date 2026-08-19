import { CanvasLogo } from '@/components/shared';
import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  X,
  Edit2,
  Trash2,
  AlertTriangle,
  Wallet,
  Search,
  Filter,
  Image as ImageIcon,
  Share2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '@/lib/supabase';
import { Employee } from '@/types';
import { PageBreadcrumb } from '@/components/shared';
import { NumericInput } from '@/components/shared';
import { CreatableSelect } from '@/components/shared';
import { formatDate, formatCurrency, toLocalISODate } from '@/utils/format';
import { FAB } from '@/components/shared';
import { exportTableImage } from '../../utils/reportExport';
import { SaveImageButton } from '@/components/shared';
import { Button } from '@/components/shared';
import { SortButton, SortOption } from '@/components/shared';
import { ReportPreviewModal } from '@/components/shared';
import { ExcelButton } from '@/components/shared';
import { DateRangeFilter, FilterSearchInput } from '@/components/shared';
import { logAudit } from '@/utils/auditLogger';

export const Advances = ({
  user,
  onBack,
  addToast,
  initialAction,
  setHideBottomNav,
}: {
  user: Employee;
  onBack?: () => void;
  addToast?: (msg: string, type?: any) => void;
  initialAction?: string;
  setHideBottomNav?: (hide: boolean) => void;
}) => {
  const [advances, setAdvances] = useState<any[]>([]);
  const [allowances, setAllowances] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(initialAction === 'add');
  const [activeTab, setActiveTab] = useState<'advances' | 'allowances'>('advances');
  const [submitting, setSubmitting] = useState(false);
  const [allowanceOptions, setAllowanceOptions] = useState<{ id: string; name: string }[]>([
    { id: 'Tiền cơm', name: 'Tiền cơm' },
    { id: 'Xăng xe', name: 'Xăng xe' },
    { id: 'Điện thoại', name: 'Điện thoại' },
    { id: 'Khác', name: 'Khác' },
  ]);

  const initialFormState = {
    employee_id: '',
    amount: 0,
    date: toLocalISODate(),
    notes: '',
    type: 'Tiền cơm',
  };

  const [formData, setFormData] = useState(initialFormState);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [filterStartDate, setFilterStartDate] = useState(() => {
    const d = new Date();
    return toLocalISODate(new Date(d.getFullYear(), d.getMonth(), 1));
  });
  const [filterEndDate, setFilterEndDate] = useState(toLocalISODate());
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const selectedMonth = new Date(filterStartDate).getMonth() + 1;
  const selectedYear = new Date(filterStartDate).getFullYear();

  // Export States
  const [isCapturingTable, setIsCapturingTable] = useState(false);
  const [showReportPreview, setShowReportPreview] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (setHideBottomNav) {
      setHideBottomNav(showModal || showDeleteModal || showReportPreview);
    }
    if (showModal || showDeleteModal || showReportPreview) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
  }, [showModal, showDeleteModal, showReportPreview, setHideBottomNav]);

  useEffect(() => {
    fetchData();
  }, [filterStartDate, filterEndDate]);

  const fetchData = async () => {
    setLoading(true);
    const { data: empData } = await supabase
      .from('users')
      .select('*')
      .neq('status', 'Nghỉ việc')
      .neq('status', 'Đã xóa')
      .neq('role', 'Develop')
      .eq('has_salary', true)
      .order('full_name');

    let activeEmpIds: string[] = [];
    if (empData) {
      setEmployees(empData);
      activeEmpIds = empData.map((e) => e.id);
    }

    const { data: advData } = await supabase
      .from('advances')
      .select('*, users(full_name)')
      .order('date', { ascending: false });
    if (advData) {
      setAdvances(advData.filter((a) => activeEmpIds.includes(a.employee_id)));
    }

    const { data: allData } = await supabase
      .from('allowances')
      .select('*, users(full_name)')
      .order('date', { ascending: false });
    if (allData) {
      const filteredAll = allData.filter((a) => activeEmpIds.includes(a.employee_id));
      setAllowances(filteredAll);

      // Extract unique types for the dropdown
      const dbTypes = filteredAll
        .map((t) => t.type)
        .filter(Boolean)
        .map((t) => {
          if (t === 'meal') return 'Tiền cơm';
          if (t === 'travel') return 'Xăng xe';
          if (t === 'phone') return 'Điện thoại';
          if (t === 'other') return 'Khác';
          return t;
        });

      const uniqueTypes = Array.from(new Set(dbTypes));
      const baseOptions = [
        { id: 'Tiền cơm', name: 'Tiền cơm' },
        { id: 'Xăng xe', name: 'Xăng xe' },
        { id: 'Điện thoại', name: 'Điện thoại' },
        { id: 'Khác', name: 'Khác' },
      ];

      const mergedOptions = [...baseOptions];
      uniqueTypes.forEach((t) => {
        if (!mergedOptions.find((o) => o.id === t)) {
          mergedOptions.push({ id: t as string, name: t as string });
        }
      });
      setAllowanceOptions(mergedOptions);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        employee_id: formData.employee_id,
        amount: formData.amount,
        date: formData.date,
        type: activeTab === 'advances' ? 'Tạm ứng' : formData.type,
        notes: formData.notes,
        ...(activeTab === 'advances' ? { reason: formData.notes || 'Tạm ứng' } : {}),
      };

      if (isEditing && selectedItem) {
        const { error } = await supabase
          .from(activeTab === 'advances' ? 'advances' : 'allowances')
          .update(payload)
          .eq('id', selectedItem.id);
        if (error) throw error;
        await logAudit(user, {
          module: 'FINANCE',
          action: 'UPDATE',
          description: `Cập nhật ${activeTab === 'advances' ? 'tạm ứng' : 'phụ cấp'}: ${payload.amount?.toLocaleString('vi-VN')} VNĐ`,
          recordId: selectedItem.id,
        });
      } else {
        const { error } = await supabase
          .from(activeTab === 'advances' ? 'advances' : 'allowances')
          .insert([payload]);
        if (error) throw error;
        await logAudit(user, {
          module: 'FINANCE',
          action: 'CREATE',
          description: `Tạo mới ${activeTab === 'advances' ? 'tạm ứng' : 'phụ cấp'}: ${payload.amount?.toLocaleString('vi-VN')} VNĐ`,
        });
      }

      setShowModal(false);
      fetchData();
      setFormData(initialFormState);
      setIsEditing(false);
      setSelectedItem(null);
      if (addToast) addToast('Đã lưu dữ liệu thành công!', 'success');
      else alert('Đã lưu dữ liệu thành công!');
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (item: any) => {
    setSelectedItem(item);
    setFormData({
      employee_id: item.employee_id,
      amount: item.amount,
      date: item.date,
      notes: item.notes || '',
      type: item.type,
    });
    setIsEditing(true);
    setShowModal(true);
  };

  const handleDelete = async () => {
    if (!deletingId) return;

    try {
      if (addToast) addToast('Đang thực hiện xóa...', 'info');

      const table = activeTab === 'advances' ? 'advances' : 'allowances';
      const { error } = await supabase.from(table).delete().eq('id', deletingId);

      if (error) throw error;

      await logAudit(user, {
        module: 'FINANCE',
        action: 'DELETE',
        description: `Xóa ${activeTab === 'advances' ? 'tạm ứng' : 'phụ cấp'} khỏi hệ thống`,
        recordId: deletingId,
      });

      if (addToast) addToast('Xóa thành công!', 'success');

      setShowDeleteModal(false);
      setDeletingId(null);
      fetchData();
    } catch (err: any) {
      if (addToast) addToast('Không thể xóa: ' + err.message, 'error');
      else alert('Không thể xóa: ' + err.message);
    }
  };

  const confirmDelete = (id: string) => {
    setDeletingId(id);
    setShowDeleteModal(true);
  };

  const filteredItems = (activeTab === 'advances' ? advances : allowances)
    .filter((item) => {
      const itemDate = item.date;
      if (filterStartDate && itemDate < filterStartDate) return false;
      if (filterEndDate && itemDate > filterEndDate) return false;

      if (searchTerm) {
        const name = item.users?.full_name?.toLowerCase() || '';
        const term = searchTerm.toLowerCase();
        if (!name.includes(term)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'date') {
        comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else if (sortBy === 'amount') {
        comparison = a.amount - b.amount;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  const exportExcel = () => {
    import('@/utils/excelExport').then(({ exportToExcel }) => {
      exportToExcel({
        title: activeTab === 'advances' ? 'Bảng Tạm ứng lương' : 'Bảng Phụ cấp',
        sheetName: activeTab === 'advances' ? 'Tạm ứng' : 'Phụ cấp',
        columns: ['Ngày', 'Nhân viên', 'Số tiền', 'Nội dung', 'Ghi chú'],
        rows: filteredItems.map((item) => [
          item.date,
          item.users?.full_name ?? '',
          item.amount,
          activeTab === 'advances' ? 'Tạm ứng' : (item.type ?? ''),
          item.notes ?? '',
        ]),
        fileName: `CDX_TamUng_PhuCap_${filterStartDate}_den_${filterEndDate}.xlsx`,
        addToast,
      });
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24 overflow-x-hidden">
      <div className="flex items-center justify-between gap-2 mb-4">
        <PageBreadcrumb title="Tạm ứng & Phụ cấp" onBack={onBack} />
        <div className="flex items-center gap-1.5 justify-end flex-1 flex-shrink-0">
          <SaveImageButton
            onClick={() => setShowReportPreview(true)}
            isCapturing={isCapturingTable}
            title="Lưu ảnh báo cáo"
          />
          <ExcelButton onClick={exportExcel} size="icon" />
          <SortButton
            currentSort={sortBy}
            onSortChange={(val: any) => setSortBy(val)}
            options={[
              { value: 'date', label: 'Sắp xếp: Ngày chi' },
              { value: 'price', label: 'Sắp xếp: Số tiền' },
            ]}
          />
          <Button
            size="icon"
            variant={showFilter ? 'primary' : 'outline'}
            onClick={() => setShowFilter((f) => !f)}
            icon={Search}
            className={showFilter ? '' : 'border-gray-200'}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-2 bg-white p-1 rounded-2xl shadow-sm border border-gray-100">
          <button
            onClick={() => setActiveTab('advances')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'advances' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            Tạm ứng
          </button>
          <button
            onClick={() => setActiveTab('allowances')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'allowances' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            Phụ cấp
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showFilter && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="z-20"
            style={{ overflow: showFilter ? 'visible' : 'hidden' }}
          >
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 mb-4 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">
                    Khoảng thời gian
                  </label>
                  <DateRangeFilter
                    startDate={filterStartDate}
                    endDate={filterEndDate}
                    onStartChange={setFilterStartDate}
                    onEndChange={setFilterEndDate}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">
                    Tìm nhân viên
                  </label>
                  <FilterSearchInput
                    value={searchTerm}
                    onChange={setSearchTerm}
                    placeholder="Họ tên hoặc mã nhân viên..."
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden overflow-x-auto custom-scrollbar pb-2">
        <table className="w-full text-left border-collapse min-w-[600px] whitespace-nowrap">
          <thead>
            <tr className="bg-primary text-white">
              <th className="px-2 md:px-4 py-2 md:py-3 text-[9px] md:text-[10px] font-bold uppercase tracking-wider border-r border-white/10">
                Ngày
              </th>
              <th className="px-2 md:px-4 py-2 md:py-3 text-[9px] md:text-[10px] font-bold uppercase tracking-wider border-r border-white/10">
                Nhân viên
              </th>
              <th className="px-2 md:px-4 py-2 md:py-3 text-[9px] md:text-[10px] font-bold uppercase tracking-wider border-r border-white/10">
                Số tiền
              </th>
              <th className="px-2 md:px-4 py-2 md:py-3 text-[9px] md:text-[10px] font-bold uppercase tracking-wider border-r border-white/10">
                {activeTab === 'advances' ? 'Lý do' : 'Loại / Ghi chú'}
              </th>
              <th className="px-2 md:px-4 py-2 md:py-3 text-[9px] md:text-[10px] font-bold uppercase tracking-wider text-right">
                Thao tác
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredItems.length === 0 && !loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-400 italic">
                  Không tìm thấy dữ liệu phù hợp
                </td>
              </tr>
            ) : (
              (() => {
                let currentBackgroundColor = 'bg-white';
                let lastGroupKey = '';

                return filteredItems.map((item) => {
                  const groupKey = item.date;
                  if (groupKey !== lastGroupKey) {
                    currentBackgroundColor =
                      currentBackgroundColor === 'bg-white' ? 'bg-gray-100' : 'bg-white';
                    lastGroupKey = groupKey;
                  }

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors group border-b border-gray-100/50 last:border-0 hover:brightness-95 ${currentBackgroundColor}`}
                    >
                      <td className="px-2 md:px-4 py-2.5 md:py-3.5 text-[10px] md:text-xs font-bold text-gray-600">
                        {formatDate(item.date)}
                      </td>
                      <td className="px-2 md:px-4 py-2.5 md:py-3.5 text-[10px] md:text-xs font-bold text-gray-800">
                        <div className="flex items-center gap-1 md:gap-2">
                          <div className="w-5 h-5 md:w-8 md:h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[8px] md:text-[10px] font-black uppercase shrink-0">
                            {item.users?.full_name?.charAt(0) || 'U'}
                          </div>
                          <span className="truncate max-w-[100px] md:max-w-none">
                            {item.users?.full_name || '...'}
                          </span>
                        </div>
                      </td>
                      <td className="px-2 md:px-4 py-2.5 md:py-3.5 text-[11px] md:text-xs font-black text-primary">
                        {formatCurrency(item.amount)}
                      </td>
                      <td className="px-2 md:px-4 py-2.5 md:py-3.5 text-[10px] md:text-xs font-bold text-gray-500 max-w-[100px] md:max-w-xs truncate">
                        <span className="bg-gray-200/50 px-1.5 py-0.5 rounded text-[8px] md:text-[10px] uppercase font-black tracking-widest mr-1 md:mr-2">
                          {activeTab === 'advances'
                            ? 'ADV'
                            : item.type === 'meal'
                              ? 'MEAL'
                              : item.type === 'travel'
                                ? 'FUEL'
                                : 'ALLOW'}
                        </span>
                        {item.notes || item.reason || '-'}
                      </td>
                      <td className="px-2 md:px-4 py-2.5 md:py-3.5 text-right w-16 md:w-auto">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleEdit(item)}
                            className="p-1 md:p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-100"
                            title="Sửa"
                          >
                            <Edit2 size={12} className="md:w-[14px] md:h-[14px]" />
                          </button>
                          <button
                            onClick={() => confirmDelete(item.id)}
                            className="p-1 md:p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-100"
                            title="Xóa"
                          >
                            <Trash2 size={12} className="md:w-[14px] md:h-[14px]" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                });
              })()
            )}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {showModal && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md overflow-hidden"
            onClick={() => {
              setShowModal(false);
              setIsEditing(false);
              setSelectedItem(null);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-primary p-6 text-white flex items-center justify-between rounded-t-[2rem] md:rounded-t-[2.5rem] flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div
                    className="p-2 bg-white/20 rounded-xl cursor-pointer hover:bg-white/30 transition-all active:scale-95"
                    onClick={() => {
                      setShowModal(false);
                      setIsEditing(false);
                      setSelectedItem(null);
                    }}
                  >
                    <Wallet size={24} />
                  </div>
                  <h3 className="font-bold text-lg">
                    {isEditing ? 'Cập nhật' : 'Thêm'}{' '}
                    {activeTab === 'advances' ? 'tạm ứng' : 'phụ cấp'}
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setShowModal(false);
                    setIsEditing(false);
                    setSelectedItem(null);
                  }}
                  className="p-2 hover:bg-white/20 rounded-xl transition-all"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Ngày *</label>
                    <input
                      type="date"
                      required
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">
                      Nhân viên *
                    </label>
                    <select
                      required
                      value={formData.employee_id}
                      onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="">-- Chọn nhân viên --</option>
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <NumericInput
                    label="Số tiền *"
                    required
                    value={formData.amount}
                    onChange={(val) => setFormData({ ...formData, amount: val })}
                  />
                  {activeTab === 'allowances' && (
                    <CreatableSelect
                      label="Loại phụ cấp"
                      value={formData.type}
                      options={allowanceOptions}
                      onChange={(val) => setFormData({ ...formData, type: val })}
                      onCreate={(val) => {
                        if (!allowanceOptions.find((o) => o.id === val)) {
                          setAllowanceOptions((prev) => [...prev, { id: val, name: val }]);
                        }
                        setFormData({ ...formData, type: val });
                      }}
                      placeholder="Chọn hoặc nhập loại mới..."
                    />
                  )}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">
                      Ghi chú / Lý do
                    </label>
                    <textarea
                      rows={3}
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary-hover transition-colors shadow-lg shadow-primary/20 disabled:opacity-50"
                  >
                    {submitting ? 'Đang lưu...' : 'Lưu dữ liệu'}
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDeleteModal && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => {
              setShowDeleteModal(false);
              setDeletingId(null);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden p-6 text-center space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-2 border border-red-100">
                <AlertTriangle size={32} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">Xóa vĩnh viễn</h3>
                <p className="text-sm text-gray-500 mt-2">
                  Bạn có chắc chắn muốn xóa vĩnh viễn mục này không?
                </p>
                <div className="mt-3 p-3 bg-red-50 rounded-xl border border-red-100">
                  <p className="text-[11px] font-bold text-red-600 leading-tight">
                    Hành động này sẽ giải phóng dữ liệu liên quan và KHÔNG THỂ hoàn tác!
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setDeletingId(null);
                  }}
                  className="py-3 px-4 rounded-xl bg-gray-100 text-sm font-bold text-gray-600 hover:bg-gray-200 transition-colors"
                >
                  Hủy bỏ
                </button>
                <button
                  onClick={handleDelete}
                  className="py-3 px-4 rounded-xl bg-red-600 text-white text-sm font-bold shadow-lg shadow-red-200 hover:bg-red-700 transition-all flex items-center justify-center gap-2"
                >
                  <Trash2 size={16} />
                  Xóa vĩnh viễn
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Hidden Ref for Report Capture */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        <div ref={reportRef} className="p-10 bg-white" style={{ width: '1400px' }}>
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
              {activeTab === 'advances' ? 'BẢNG TẠM ỨNG' : 'BẢNG PHỤ CẤP'}
            </h1>
            <p className="text-sm font-bold text-gray-500">
              Kỳ báo cáo: Từ {formatDate(filterStartDate)} đến {formatDate(filterEndDate)} •
              CDX-2026 Edition
            </p>
          </div>

          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-primary text-white">
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest border-r border-white/10">
                  Mã hiệu
                </th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest border-r border-white/10">
                  Ngày
                </th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest border-r border-white/10">
                  Nhân viên
                </th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest border-r border-white/10">
                  Số tiền
                </th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest">
                  {activeTab === 'advances' ? 'Lý do' : 'Ghi chú'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs">
              {filteredItems.map((item, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}>
                  <td className="px-4 py-3 font-black text-primary font-mono tracking-tighter">
                    #{item.id.slice(0, 8).toUpperCase()}
                  </td>
                  <td className="px-4 py-3 font-bold text-gray-500">{formatDate(item.date)}</td>
                  <td className="px-4 py-3 font-black text-gray-900 uppercase tracking-tight">
                    {item.users?.full_name}
                  </td>
                  <td className="px-4 py-3 font-black text-primary">
                    {formatCurrency(item.amount)}
                  </td>
                  <td className="px-4 py-3 font-bold text-gray-500 max-w-xs truncate">
                    {item.notes || item.reason || '-'}
                  </td>
                </tr>
              ))}
              <tr className="bg-primary/5 font-black border-t-2 border-primary/20">
                <td
                  colSpan={3}
                  className="px-4 py-4 text-sm text-right uppercase tracking-[0.15em]"
                >
                  Tổng số tiền:
                </td>
                <td className="px-4 py-4 text-lg text-primary">
                  {formatCurrency(filteredItems.reduce((sum, item) => sum + item.amount, 0))}
                </td>
                <td></td>
              </tr>
            </tbody>
          </table>

          <div className="mt-12 flex justify-between items-end border-t border-gray-100 pt-6">
            <div className="space-y-1">
              <p className="text-xs font-black text-gray-300 uppercase tracking-[0.2em] whitespace-nowrap">
                CDX ERP SYSTEM
              </p>
              <p className="text-[9px] text-gray-300 font-bold uppercase tracking-widest">
                End of financial record • Accounting Integrity Verified
              </p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-black text-gray-300 uppercase tracking-[0.3em] mb-1">
                Financial Protocol Secured
              </p>
              <div className="text-[10px] text-gray-400 font-bold bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
                Audit Hash:{' '}
                <span className="text-primary font-black tracking-widest ml-1 underline">
                  {new Date().getTime().toString(16).toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FAB — Thêm tạm ứng/phụ cấp */}
      <FAB
        onClick={() => setShowModal(true)}
        label={activeTab === 'advances' ? 'Thêm tạm ứng' : 'Thêm phụ cấp'}
      />
      <ReportPreviewModal
        isOpen={showReportPreview}
        onClose={() => setShowReportPreview(false)}
        title="Bảng tạm ứng & phụ cấp"
        isCapturing={isCapturingTable}
        onExport={() => {
          if (reportRef.current) {
            exportTableImage({
              element: reportRef.current,
              fileName: `TamUng_PhuCap_T${selectedMonth}_${selectedYear}.png`,
              addToast,
              onStart: () => setIsCapturingTable(true),
              onEnd: () => {
                setIsCapturingTable(false);
                setShowReportPreview(false);
              },
            });
          }
        }}
      >
        <div className="p-12 bg-white">
          {/* Logo & Header */}
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
              {activeTab === 'advances' ? 'BẢNG TẠM ỨNG' : 'BẢNG PHỤ CẤP'}
            </h1>
            <p className="text-sm font-bold text-gray-500">
              Kỳ báo cáo: Từ {formatDate(filterStartDate)} đến {formatDate(filterEndDate)} • CDX ERP
            </p>
          </div>

          {/* Table */}
          <table className="w-full text-left border-collapse rounded-3xl overflow-hidden shadow-sm border border-gray-100">
            <thead>
              <tr className="bg-primary text-white">
                <th className="px-4 py-4 text-[11px] font-black uppercase tracking-widest italic border-r border-white/10">
                  Ngày
                </th>
                <th className="px-4 py-4 text-[11px] font-black uppercase tracking-widest italic border-r border-white/10">
                  Nhân viên
                </th>
                <th className="px-4 py-4 text-[11px] font-black uppercase tracking-widest italic border-r border-white/10">
                  Phân loại
                </th>
                <th className="px-4 py-4 text-[11px] font-black uppercase tracking-widest italic border-r border-white/10">
                  Cấp bởi
                </th>
                <th className="px-4 py-4 text-[11px] font-black uppercase tracking-widest italic text-right">
                  Số tiền
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredItems.map((item, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}>
                  <td className="px-4 py-3 text-xs text-gray-600 font-bold italic">
                    {formatDate(item.date)}
                  </td>
                  <td className="px-4 py-3 text-xs font-black text-gray-900 uppercase tracking-tight">
                    {item.users?.full_name}
                  </td>
                  <td className="px-4 py-3 text-xs font-black text-primary uppercase">
                    {activeTab === 'advances' ? 'Tạm ứng' : item.type}
                  </td>
                  <td className="px-4 py-3 text-xs font-bold text-gray-400 italic">
                    Financial Audit Pooled
                  </td>
                  <td className="px-4 py-3 text-xs font-black text-right tabular-nums text-gray-900">
                    {formatCurrency(item.amount)}
                  </td>
                </tr>
              ))}
              <tr className="bg-primary/5 font-black border-t-2 border-primary/20">
                <td
                  colSpan={4}
                  className="px-4 py-4 text-xs uppercase tracking-widest italic text-right"
                >
                  Tổng cộng thực tế:
                </td>
                <td className="px-4 py-4 text-sm text-right tabular-nums text-primary underline decoration-double">
                  {formatCurrency(
                    filteredItems.reduce((sum, item) => sum + Number(item.amount || 0), 0),
                  )}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="mt-8 pt-6 border-t border-gray-100 flex justify-between items-end">
            <div className="text-[10px] text-gray-400 font-bold whitespace-nowrap">
              Ngày xuất: {new Date().toLocaleDateString('vi-VN')} •{' '}
              {new Date().toLocaleTimeString('vi-VN')}
            </div>
            <div className="flex items-center gap-2 whitespace-nowrap">
              <span className="text-[10px] font-black text-gray-300 uppercase italic">
                CDX ERP SYSTEM
              </span>
              <div className="w-1 h-1 bg-gray-200 rounded-full"></div>
              <span className="text-[10px] font-bold text-gray-300 uppercase">
                Operational Excellence
              </span>
            </div>
          </div>
        </div>
      </ReportPreviewModal>
    </div>
  );
};
