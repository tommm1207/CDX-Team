import React, { useState, useEffect } from 'react';
import {
  Settings2,
  X,
  Edit,
  Plus,
  Trash2,
  Search,
  Filter,
  Check,
  Image as ImageIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '@/lib/supabase';
import { Employee } from '@/types';
import { PageBreadcrumb } from '@/components/shared';
import { Button } from '@/components/shared';
import { NumericInput } from '@/components/shared';
import { ToastType } from '@/components/shared';
import { formatCurrency, toLocalISODate } from '@/utils/format';

const emptyForm = {
  daily_rate: 0,
  monthly_ot_coeff: '' as string | number,
  insurance_deduction: 0,
  valid_from: toLocalISODate(),
  valid_to: '',
};

export const SalarySettings = ({
  user,
  onBack,
  addToast,
}: {
  user: Employee;
  onBack?: () => void;
  addToast?: (message: string, type?: ToastType) => void;
}) => {
  const [employees, setEmployees] = useState<any[]>([]);
  const [allSettings, setAllSettings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<any>(null);
  const [empHistory, setEmpHistory] = useState<any[]>([]);
  const [addingNew, setAddingNew] = useState(false);
  const [newForm, setNewForm] = useState({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);
  const [dateError, setDateError] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setBy] = useState<'name' | 'code' | 'salary'>('code');
  const [sortOrder, setOrder] = useState<'asc' | 'desc'>('asc');
  const [showSortMenu, setShowSortMenu] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    let empQuery = supabase
      .from('users')
      .select('*')
      .neq('status', 'Nghỉ việc')
      .neq('status', 'Đã xóa')
      .eq('has_salary', true);
    if (user.role !== 'Develop') {
      empQuery = empQuery.neq('role', 'Develop');
    }
    const { data: empData } = await empQuery.order('code');
    const { data: setData } = await supabase
      .from('salary_settings')
      .select('*')
      .order('valid_from', { ascending: false });

    setEmployees(empData || []);
    setAllSettings(setData || []);
    setLoading(false);
    return setData || [];
  };

  useEffect(() => {
    const init = async () => {
      await fetchData();
    };
    init();
  }, []);

  // Get current active salary for an employee (most recent valid_from)
  const getCurrentSetting = (empId: string) => {
    return (
      allSettings
        .filter((s) => s.employee_id === empId)
        .sort(
          (a, b) => new Date(b.valid_from || 0).getTime() - new Date(a.valid_from || 0).getTime(),
        )[0] || null
    );
  };

  // `source` cho phép dùng dữ liệu vừa tải lại, tránh đọc allSettings cũ trong closure
  const getHistory = (empId: string, source: any[] = allSettings) => {
    return source
      .filter((s) => s.employee_id === empId)
      .sort(
        (a, b) => new Date(b.valid_from || 0).getTime() - new Date(a.valid_from || 0).getTime(),
      );
  };

  const handleOpenModal = (emp: any) => {
    setSelectedEmp(emp);
    setEmpHistory(getHistory(emp.id));
    setAddingNew(false);
    setNewForm({ ...emptyForm });
    setDateError('');
    setShowModal(true);
  };

  const validateDates = (from: string, to: string) => {
    if (to && from && to < from) {
      setDateError('Ngày kết thúc không được trước ngày bắt đầu!');
      return false;
    }
    setDateError('');
    return true;
  };

  const handleAddNew = async () => {
    if (!validateDates(newForm.valid_from, newForm.valid_to)) return;
    if (!newForm.daily_rate) {
      setDateError('Vui lòng nhập Lương/Ngày!');
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('salary_settings').insert({
      employee_id: selectedEmp.id,
      daily_rate: newForm.daily_rate,
      monthly_ot_coeff: parseFloat(String(newForm.monthly_ot_coeff)) || 1,
      insurance_deduction: newForm.insurance_deduction,
      valid_from: newForm.valid_from || null,
      valid_to: newForm.valid_to || null,
    });
    setSubmitting(false);
    if (error) {
      if (addToast) addToast('Lỗi: ' + error.message, 'error');
    } else {
      if (addToast) addToast('Đã thêm mức lương mới!', 'success');
      setAddingNew(false);
      setNewForm({ ...emptyForm });
      const fresh = await fetchData();
      setEmpHistory(getHistory(selectedEmp.id, fresh));
    }
  };

  const handleUpdateRecord = (record: any, changes: any) => {
    const updated = { ...record, ...changes };
    if (!validateDates(updated.valid_from, updated.valid_to)) return;
    // Convert empty date strings to null
    const sanitized: any = { ...changes };
    if (sanitized.valid_from === '') sanitized.valid_from = null;
    if (sanitized.valid_to === '') sanitized.valid_to = null;
    supabase
      .from('salary_settings')
      .update(sanitized)
      .eq('id', record.id)
      .then(({ error }) => {
        if (error) {
          if (addToast) addToast('Lỗi: ' + error.message, 'error');
        } else {
          if (addToast) addToast('Cập nhật thành công!', 'success');
          fetchData().then((fresh) => setEmpHistory(getHistory(selectedEmp.id, fresh)));
        }
      });
  };

  const handleDeleteRecord = (recordId: string) => {
    const history = getHistory(selectedEmp.id);
    if (history.length <= 1) {
      if (addToast) addToast('Không thể xóa mức lương duy nhất!', 'error');
      return;
    }
    supabase
      .from('salary_settings')
      .delete()
      .eq('id', recordId)
      .then(({ error }) => {
        if (error) {
          if (addToast) addToast('Lỗi: ' + error.message, 'error');
        } else {
          if (addToast) addToast('Đã xóa!', 'success');
          fetchData().then((fresh) => setEmpHistory(getHistory(selectedEmp.id, fresh)));
        }
      });
  };

  const filteredEmployees = employees
    .filter((emp) => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return emp.full_name?.toLowerCase().includes(term) || emp.code?.toLowerCase().includes(term);
    })
    .sort((a, b) => {
      let comp = 0;
      if (sortBy === 'name') {
        comp = (a.full_name || '').localeCompare(b.full_name || '');
      } else if (sortBy === 'code') {
        comp = (a.code || '').localeCompare(b.code || '');
      } else if (sortBy === 'salary') {
        const sA = getCurrentSetting(a.id)?.daily_rate || 0;
        const sB = getCurrentSetting(b.id)?.daily_rate || 0;
        comp = sA - sB;
      }
      return sortOrder === 'asc' ? comp : -comp;
    });

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24">
      <div className="flex items-center justify-between gap-2 mb-4">
        <PageBreadcrumb title="Cài đặt lương" onBack={onBack} />

        <div className="flex items-center gap-2 relative justify-end flex-1 flex-shrink-0">
          {/* Action Buttons - 4-Button Sync Layout */}
          <button
            disabled
            title="Báo cáo cài đặt (Sắp ra mắt)"
            className="w-11 h-11 flex items-center justify-center bg-gray-50 border border-gray-100 shadow-sm rounded-2xl text-gray-300 cursor-not-allowed opacity-50 transition-all"
          >
            <ImageIcon size={22} />
          </button>

          <button
            onClick={() => {
              if (addToast)
                addToast('Tính năng Xuất Excel cài đặt đang được phát triển...', 'info');
            }}
            title="Xuất Excel"
            className="w-11 h-11 flex items-center justify-center bg-white border border-gray-100 shadow-sm rounded-2xl text-green-600 hover:bg-gray-50 active:scale-90 transition-all font-black text-xs"
          >
            <div className="w-5 h-5 bg-[#1D6F42] rounded-md flex items-center justify-center text-white text-[10px]">
              X
            </div>
          </button>

          <div className="relative">
            <button
              onClick={() => setShowSortMenu(!showSortMenu)}
              title="Sắp xếp"
              className={`w-11 h-11 flex items-center justify-center border shadow-sm rounded-2xl active:scale-90 transition-all ${
                showSortMenu
                  ? 'bg-primary text-white border-primary shadow-primary/20'
                  : 'bg-white text-blue-600 border-gray-100'
              }`}
            >
              <Filter size={22} />
            </button>

            <AnimatePresence>
              {showSortMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-52 bg-white/80 backdrop-blur-xl border border-white/20 shadow-2xl rounded-2xl py-2 z-50 overflow-hidden"
                  >
                    {[
                      {
                        id: 'code-asc',
                        label: 'Mã nhân viên (Thấp → Cao)',
                        by: 'code',
                        order: 'asc',
                      },
                      {
                        id: 'code-desc',
                        label: 'Mã nhân viên (Cao → Thấp)',
                        by: 'code',
                        order: 'desc',
                      },
                      { id: 'name-asc', label: 'Tên nhân viên (A → Z)', by: 'name', order: 'asc' },
                      {
                        id: 'name-desc',
                        label: 'Tên nhân viên (Z → A)',
                        by: 'name',
                        order: 'desc',
                      },
                      {
                        id: 'salary-desc',
                        label: 'Mức lương: Cao → Thấp',
                        by: 'salary',
                        order: 'desc',
                      },
                      {
                        id: 'salary-asc',
                        label: 'Mức lương: Thấp → Cao',
                        by: 'salary',
                        order: 'asc',
                      },
                    ].map((opt) => {
                      const isActive = sortBy === opt.by && sortOrder === opt.order;
                      return (
                        <button
                          key={opt.id}
                          onClick={() => {
                            setBy(opt.by as any);
                            setOrder(opt.order as any);
                            setShowSortMenu(false);
                            if (addToast) addToast(`Sắp xếp: ${opt.label}`, 'info');
                          }}
                          className={`w-full px-4 py-2.5 text-left text-xs font-bold transition-colors flex items-center justify-between ${
                            isActive ? 'bg-primary text-white' : 'text-gray-600 hover:bg-primary/10'
                          }`}
                        >
                          {opt.label}
                          {isActive && <Check size={14} />}
                        </button>
                      );
                    })}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          <button
            onClick={() => setShowFilter(!showFilter)}
            title="Tìm kiếm"
            className={`w-11 h-11 flex items-center justify-center border shadow-sm rounded-2xl active:scale-90 transition-all ${
              showFilter || searchTerm
                ? 'bg-primary text-white border-primary shadow-primary/20'
                : 'bg-white text-gray-600 border-gray-100'
            }`}
          >
            <Search size={22} />
          </button>
        </div>
      </div>

      {/* Search Input Panel */}
      <AnimatePresence>
        {showFilter && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="z-10"
          >
            <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 mb-2">
              <div className="relative">
                <Search
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="text"
                  placeholder="Tìm theo tên hoặc mã nhân viên..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 rounded-lg text-gray-400"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden overflow-x-auto custom-scrollbar pb-2">
        <table className="w-full text-left border-collapse min-w-[700px] whitespace-nowrap">
          <thead>
            <tr className="bg-primary text-white">
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider">
                Nhân viên
              </th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-right">
                Lương/Ngày (Hiện tại)
              </th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-right">
                Hệ số OT tháng
              </th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-right">
                Khấu trừ BH
              </th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-center">
                Áp dụng từ
              </th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-center w-20">
                Sửa
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400 italic">
                  Đang tải...
                </td>
              </tr>
            ) : (
              filteredEmployees.map((emp) => {
                const cur = getCurrentSetting(emp.id);
                const histCount = getHistory(emp.id).length;
                return (
                  <tr
                    key={emp.id}
                    className="hover:bg-primary/5 transition-colors cursor-pointer"
                    onClick={() => handleOpenModal(emp)}
                  >
                    <td className="px-4 py-3">
                      <div className="text-xs font-bold text-gray-800">{emp.full_name}</div>
                      {histCount > 1 && (
                        <div className="text-[10px] text-primary/60 font-bold">
                          {histCount} mức lương
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-primary">
                      {cur ? (
                        formatCurrency(cur.daily_rate)
                      ) : (
                        <span className="text-gray-400 italic">Chưa cài</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-amber-600">
                      {cur ? `x${cur.monthly_ot_coeff}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-medium text-red-500">
                      {cur ? formatCurrency(cur.insurance_deduction) : '-'}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-gray-500">
                      {cur?.valid_from || '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenModal(emp);
                        }}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {showModal && selectedEmp && (
          <div
            className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-md"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              className="bg-white rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-primary p-5 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-xl">
                    <Settings2 size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] text-white/60 uppercase font-bold tracking-widest">
                      Lịch sử lương
                    </p>
                    <h3 className="font-black text-base">{selectedEmp.full_name}</h3>
                  </div>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 hover:bg-white/20 rounded-xl transition-all"
                >
                  <X size={22} />
                </button>
              </div>

              {/* Body - scrollable */}
              <div className="overflow-y-auto flex-1 p-5 space-y-4">
                {/* History table */}
                <div className="overflow-x-auto rounded-2xl border border-gray-100">
                  <table className="w-full text-left border-collapse min-w-[580px] text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500">
                        <th className="px-3 py-2 font-bold uppercase tracking-wider">Lương/Ngày</th>
                        <th className="px-3 py-2 font-bold uppercase tracking-wider text-center">
                          Hệ số OT
                        </th>
                        <th className="px-3 py-2 font-bold uppercase tracking-wider text-right">
                          Khấu trừ BH
                        </th>
                        <th className="px-3 py-2 font-bold uppercase tracking-wider text-center">
                          Từ ngày
                        </th>
                        <th className="px-3 py-2 font-bold uppercase tracking-wider text-center">
                          Đến ngày
                        </th>
                        <th className="px-3 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {empHistory.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-6 text-center text-gray-400 italic">
                            Chưa có dữ liệu lương
                          </td>
                        </tr>
                      ) : (
                        empHistory.map((rec, idx) => (
                          <React.Fragment key={rec.id}>
                            <HistoryRow
                              record={rec}
                              isLatest={idx === 0}
                              onUpdate={(changes) => handleUpdateRecord(rec, changes)}
                              onDelete={() => handleDeleteRecord(rec.id)}
                              canDelete={empHistory.length > 1}
                            />
                          </React.Fragment>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Error */}
                {dateError && <p className="text-xs text-red-500 font-bold px-1">{dateError}</p>}

                {/* Add new form */}
                {addingNew ? (
                  <div className="border border-primary/20 rounded-2xl p-4 bg-primary/5 space-y-4">
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest">
                      Mức lương mới
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <NumericInput
                        label="Lương/Ngày (8h) *"
                        value={newForm.daily_rate}
                        onChange={(val) => setNewForm({ ...newForm, daily_rate: val })}
                        required
                      />
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase">
                          Hệ số OT tháng
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={newForm.monthly_ot_coeff}
                          onChange={(e) =>
                            setNewForm({ ...newForm, monthly_ot_coeff: e.target.value })
                          }
                          placeholder="Ví dụ: 1.1"
                          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                    </div>
                    <NumericInput
                      label="Khấu trừ bảo hiểm"
                      value={newForm.insurance_deduction}
                      onChange={(val) => setNewForm({ ...newForm, insurance_deduction: val })}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase">
                          Áp dụng từ
                        </label>
                        <input
                          type="date"
                          value={newForm.valid_from}
                          onChange={(e) => {
                            const v = e.target.value;
                            setNewForm({ ...newForm, valid_from: v });
                            validateDates(v, newForm.valid_to);
                          }}
                          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase">
                          Đến ngày
                        </label>
                        <input
                          type="date"
                          value={newForm.valid_to}
                          min={newForm.valid_from}
                          onChange={(e) => {
                            const v = e.target.value;
                            setNewForm({ ...newForm, valid_to: v });
                            validateDates(newForm.valid_from, v);
                          }}
                          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        fullWidth
                        onClick={() => {
                          setAddingNew(false);
                          setDateError('');
                        }}
                      >
                        Hủy
                      </Button>
                      <Button
                        variant="primary"
                        fullWidth
                        isLoading={submitting}
                        onClick={handleAddNew}
                      >
                        Lưu mức lương này
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setAddingNew(true);
                      setNewForm({ ...emptyForm });
                      setDateError('');
                    }}
                    className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-primary/30 rounded-2xl text-primary font-black text-xs uppercase tracking-widest hover:bg-primary/5 transition-colors"
                  >
                    <Plus size={16} />
                    Thêm mức lương mới
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Inline editable history row
const HistoryRow = ({
  record,
  isLatest,
  onUpdate,
  onDelete,
  canDelete,
}: {
  record: any;
  isLatest: boolean;
  onUpdate: (changes: any) => void;
  onDelete: () => void;
  canDelete: boolean;
}) => {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    daily_rate: record.daily_rate,
    monthly_ot_coeff: record.monthly_ot_coeff as string | number,
    insurance_deduction: record.insurance_deduction,
    valid_from: record.valid_from || '',
    valid_to: record.valid_to || '',
  });

  const handleSave = () => {
    if (form.valid_to && form.valid_from && form.valid_to < form.valid_from) return;
    onUpdate({
      ...form,
      monthly_ot_coeff: parseFloat(String(form.monthly_ot_coeff)) || 1,
      valid_from: form.valid_from || null,
      valid_to: form.valid_to || null,
    });
    setEditing(false);
  };

  if (!editing) {
    return (
      <tr className={isLatest ? 'bg-primary/5' : ''}>
        <td className="px-3 py-2.5 font-bold text-primary">{formatCurrency(record.daily_rate)}</td>
        <td className="px-3 py-2.5 text-center font-bold text-amber-600">
          x{record.monthly_ot_coeff}
        </td>
        <td className="px-3 py-2.5 text-right text-red-500">
          {formatCurrency(record.insurance_deduction)}
        </td>
        <td className="px-3 py-2.5 text-center text-gray-500">{record.valid_from || '-'}</td>
        <td className="px-3 py-2.5 text-center text-gray-500">
          {record.valid_to || <span className="text-green-600 font-bold">Hiện tại</span>}
        </td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setEditing(true)}
              className="p-1 text-blue-500 hover:bg-blue-50 rounded-lg"
            >
              <Edit size={12} />
            </button>
            {canDelete && (
              <button onClick={onDelete} className="p-1 text-red-400 hover:bg-red-50 rounded-lg">
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="bg-amber-50">
      <td className="px-2 py-1.5">
        <NumericInput
          value={form.daily_rate}
          onChange={(v) => setForm({ ...form, daily_rate: v })}
          inputClassName="w-full px-2 py-1 rounded-lg border border-amber-300 text-xs outline-none"
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="number"
          step="0.01"
          value={form.monthly_ot_coeff}
          onChange={(e) => setForm({ ...form, monthly_ot_coeff: e.target.value })}
          placeholder="1.1"
          className="w-full px-2 py-1 rounded-lg border border-amber-300 text-xs outline-none text-center"
        />
      </td>
      <td className="px-2 py-1.5">
        <NumericInput
          value={form.insurance_deduction}
          onChange={(v) => setForm({ ...form, insurance_deduction: v })}
          inputClassName="w-full px-2 py-1 rounded-lg border border-amber-300 text-xs outline-none text-right"
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="date"
          value={form.valid_from}
          onChange={(e) => setForm({ ...form, valid_from: e.target.value })}
          className="w-full px-2 py-1 rounded-lg border border-amber-300 text-xs outline-none"
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="date"
          value={form.valid_to}
          min={form.valid_from}
          onChange={(e) => setForm({ ...form, valid_to: e.target.value })}
          className="w-full px-2 py-1 rounded-lg border border-amber-300 text-xs outline-none"
        />
      </td>
      <td className="px-2 py-1.5">
        <div className="flex flex-col gap-1">
          <button
            onClick={handleSave}
            className="px-2 py-0.5 bg-green-500 text-white rounded text-[10px] font-bold"
          >
            Lưu
          </button>
          <button
            onClick={() => setEditing(false)}
            className="px-2 py-0.5 bg-gray-200 text-gray-600 rounded text-[10px]"
          >
            Hủy
          </button>
        </div>
      </td>
    </tr>
  );
};
