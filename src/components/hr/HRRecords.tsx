import React, { useState, useEffect, FormEvent, useRef, useCallback } from 'react';

import {
  Users,
  Plus,
  Search,
  Edit,
  Trash2,
  X,
  Eye,
  UserPlus,
  AlertCircle,
  CheckCircle,
  Lock,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '@/lib/supabase';
import { Employee } from '@/types';
import { PageBreadcrumb } from '@/components/shared';
import { ToastType } from '@/components/shared';
import { Button } from '@/components/shared';
import { SortButton, SortOption } from '@/components/shared';
import { PageToolbar, FilterPanel, FilterSearchInput } from '@/components/shared';
import { ReportImagePreviewModal } from '@/components/shared';
import { checkUsage } from '@/utils/dataIntegrity';
import { generateSmartCode } from '@/utils/codeGenerator';
import { CreatableSelect } from '@/components/shared';
import { toLocalISODate } from '@/utils/format';
import { logAudit } from '@/utils/auditLogger';

export const HRRecords = ({
  user,
  onBack,
  addToast,
}: {
  user: Employee;
  onBack?: () => void;
  addToast?: (message: string, type?: ToastType) => void;
}) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>(
    (localStorage.getItem(`sort_pref_hr_${user.id}`) as SortOption) || 'date',
  );
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [nextCode, setNextCode] = useState('');
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    generateNextEmployeeCode().then(setNextCode);
  }, [employees]);

  useEffect(() => {
    localStorage.setItem(`sort_pref_hr_${user.id}`, sortBy);
  }, [sortBy]);

  const initialFormState = {
    id: '',
    code: '',
    full_name: '',
    email: '',
    phone: '',
    id_card: '',
    dob: '',
    join_date: toLocalISODate(),
    tax_id: '',
    app_pass: '',
    department: '',
    position: '',
    has_salary: false,
    role: 'User' as 'User' | 'Admin' | 'Develop',
    data_view_permission: '',
    resign_date: '',
    initial_budget: 0,
    status: 'Đang làm việc',
  };

  const [formData, setFormData] = useState(initialFormState);

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    setLoading(true);
    let query = supabase.from('users').select('*').neq('status', 'Đã xóa');

    if (user.role !== 'Develop') {
      query = query.neq('role', 'Develop');
    }

    const { data, error } = await query.order('code');
    if (data) setEmployees(data);
    setLoading(false);
  };

  const generateNextEmployeeCode = async () => {
    try {
      // 1. Fetch all codes to get a good candidate via smart logic
      const { data } = await supabase.from('users').select('code');
      const codes = data?.map((d) => d.code).filter(Boolean) || [];

      let candidate = generateSmartCode(codes as string[], 'CDX', 3);

      // 2. Double check existence in DB to be 100% sure (handles race conditions or RLS gaps)
      let isUnique = false;
      let attempts = 0;
      while (!isUnique && attempts < 5) {
        const { data: existing } = await supabase
          .from('users')
          .select('id')
          .eq('code', candidate)
          .maybeSingle();

        if (!existing) {
          isUnique = true;
        } else {
          // If conflict, add to list and try next
          codes.push(candidate);
          candidate = generateSmartCode(codes as string[], 'CDX', 3);
          attempts++;
        }
      }

      // 3. Last resort if still stuck: add random suffix
      if (!isUnique) {
        candidate = `CDX${Math.floor(1000 + Math.random() * 9000)}`;
      }

      return candidate;
    } catch (err) {
      console.error('Error generating code:', err);
      return 'CDX' + Math.floor(1000 + Math.random() * 9000);
    }
  };

  const handleEdit = async (emp: Employee) => {
    if (emp.role === 'Develop' && user.role !== 'Develop') {
      if (addToast) addToast('Bạn không có quyền chỉnh sửa tài khoản Develop', 'error');
      else alert('Bạn không có quyền chỉnh sửa tài khoản Develop');
      return;
    }

    setFormData({
      ...emp,
      code: emp.code || '',
      dob: emp.dob || '',
      resign_date: emp.resign_date || '',
      email: emp.email || '',
      phone: emp.phone || '',
      id_card: emp.id_card || '',
      tax_id: emp.tax_id || '',
      department: emp.department || '',
      position: emp.position || '',
      data_view_permission: emp.data_view_permission || '',
    });
    setIsEditing(true);
    setShowModal(true);
  };

  const [usageInfo, setUsageInfo] = useState<{
    inUse: boolean;
    tables: string[];
    details?: any[];
  }>({ inUse: false, tables: [] });

  const handleDeleteClick = async (id: string) => {
    setItemToDelete(id);
    const usage = await checkUsage('employee', id);
    setUsageInfo(usage);
    setShowDeleteModal(true);
  };

  const handlePurgeRelated = async () => {
    if (!itemToDelete || user.role !== 'Develop' || !usageInfo.details) return;

    if (
      !window.confirm(
        'Bạn có chắc chắn muốn XÓA VĨNH VIỄN toàn bộ các dữ liệu rác liên quan này? Hành động này không thể hoàn tác.',
      )
    )
      return;

    setSubmitting(true);
    try {
      for (const detail of usageInfo.details) {
        if (detail.softDeletedCount > 0) {
          const { error } = await supabase
            .from(detail.table)
            .delete()
            .eq('employee_id', itemToDelete)
            .eq('status', 'Đã xóa');

          if (error && (detail.table === 'stock_in' || detail.table === 'stock_out')) {
            // Some tables might use different field names for relations, though usually it's employee_id or created_by
            // For now assuming employee_id as standard for many tables
          }
          if (error) throw error;
        }
      }

      if (addToast) addToast('Đã dọn dẹp các dữ liệu rác liên quan!', 'success');
      const usage = await checkUsage('employee', itemToDelete);
      setUsageInfo(usage);
    } catch (err: any) {
      if (addToast) addToast('Lỗi khi dọn dẹp: ' + err.message, 'error');
    } finally {
      setSubmitting(true);
      setTimeout(() => setSubmitting(false), 500);
    }
  };

  const handlePermanentDelete = async () => {
    if (!itemToDelete || user.role !== 'Develop') return;

    if (
      !window.confirm(
        'CẢNH BÁO: Hành động này sẽ xóa VĨNH VIỄN nhân sự này khỏi cơ sở dữ liệu. Bạn có chắc chắn muốn tiếp tục?',
      )
    ) {
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('users').delete().eq('id', itemToDelete);

      if (error) {
        let msg = error.message;
        if (msg.includes('foreign key constraint')) {
          msg = `Không thể xóa vĩnh viễn vì vẫn còn dữ liệu liên kết vật lý trong DB. Vui lòng dọn dẹp sạch các mục liên quan trước.`;
        }
        throw new Error(msg);
      }

      const deletedEmployee = employees.find((e) => e.id === itemToDelete);
      await logAudit(user, {
        module: 'HR',
        action: 'DELETE',
        description: `Xóa vĩnh viễn nhân sự: ${deletedEmployee?.full_name || itemToDelete}`,
        recordId: itemToDelete,
      });

      if (addToast) addToast('Đã xóa vĩnh viễn nhân sự khỏi hệ thống', 'success');
      fetchEmployees();
      setShowDeleteModal(false);
    } catch (err: any) {
      if (addToast) addToast('Lỗi xóa vĩnh viễn: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;

    const target = employees.find((e) => e.id === itemToDelete);
    if (target?.role === 'Develop' && user.role !== 'Develop') {
      if (addToast) addToast('Bạn không có quyền xóa tài khoản Develop', 'error');
      else alert('Bạn không có quyền xóa tài khoản Develop');
      return;
    }

    // Always allow moving to Trash (soft delete) regardless of usageInfo.inUse

    try {
      const { error } = await supabase
        .from('users')
        .update({ status: 'Đã xóa' })
        .eq('id', itemToDelete);
      if (error) throw error;

      await logAudit(user, {
        module: 'HR',
        action: 'DELETE',
        description: `Chuyển nhân sự vào thùng rác: ${target?.full_name || itemToDelete}`,
        recordId: itemToDelete,
      });

      fetchEmployees();
      if (addToast) addToast('Đã chuyển nhân sự vào thùng rác', 'success');
      setShowDeleteModal(false);
      setItemToDelete(null);
    } catch (err: any) {
      if (addToast) addToast('Lỗi khi xóa nhân sự: ' + err.message, 'error');
      else alert('Lỗi khi xóa nhân sự: ' + err.message);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { id, ...rest } = formData;
      const dataToSubmit = {
        ...rest,
        dob: formData.dob || null,
        join_date: formData.join_date || null,
        resign_date: formData.resign_date || null,
        email: formData.email || null,
        phone: formData.phone || null,
        id_card: formData.id_card || null,
        tax_id: formData.tax_id || null,
        department: formData.department || null,
        position: formData.position || null,
        data_view_permission: formData.data_view_permission || null,
      };

      // Auto-generate code if missing, even for existing employees (retroactive fix)
      if (!dataToSubmit.code) {
        dataToSubmit.code = await generateNextEmployeeCode();
      }

      if (isEditing) {
        const { error } = await supabase.from('users').update(dataToSubmit).eq('id', id);
        if (error) throw error;
        await logAudit(user, {
          module: 'HR',
          action: 'UPDATE',
          description: `Cập nhật hồ sơ nhân sự: ${dataToSubmit.full_name} (${dataToSubmit.code})`,
          recordId: id,
        });
      } else {
        const { error } = await supabase.from('users').insert([dataToSubmit]);
        if (error) throw error;
        await logAudit(user, {
          module: 'HR',
          action: 'CREATE',
          description: `Tạo mới nhân sự: ${dataToSubmit.full_name} (${dataToSubmit.code})`,
        });
      }

      setShowModal(false);
      fetchEmployees();
      setFormData(initialFormState);
      setIsEditing(false);
      if (addToast)
        addToast(
          isEditing ? 'Cập nhật nhân sự thành công!' : 'Thêm mới nhân sự thành công!',
          'success',
        );
    } catch (err: any) {
      if (addToast) addToast('Lỗi khi lưu nhân sự: ' + err.message, 'error');
      else alert('Lỗi khi lưu nhân sự: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredEmployees = employees
    .filter((emp) => {
      const matchesSearch =
        emp.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (emp.code && emp.code.toLowerCase().includes(searchTerm.toLowerCase()));

      if (user.role !== 'Develop' && emp.role === 'Develop') {
        return false;
      }
      return matchesSearch;
    })
    .sort((a, b) => {
      if (sortBy === 'newest')
        return new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime();
      if (sortBy === 'date')
        return new Date(b.join_date || '').getTime() - new Date(a.join_date || '').getTime();
      return (a.code || '').localeCompare(b.code || '');
    });

  const departments = Array.from(new Set(employees.map((e) => e.department).filter(Boolean))).map(
    (d) => ({ id: String(d!), name: String(d!) }),
  );
  const positions = Array.from(new Set(employees.map((e) => e.position).filter(Boolean))).map(
    (p) => ({ id: String(p!), name: String(p!) }),
  );

  const handleExportExcel = useCallback(() => {
    import('@/utils/excelExport').then(({ exportToExcel }) => {
      exportToExcel({
        title: 'Danh sách Nhân sự',
        sheetName: 'Nhân sự',
        columns: [
          'Mã NV',
          'Họ tên',
          'Email',
          'Điện thoại',
          'Bộ phận',
          'Chức vụ',
          'Ngày vào làm',
          'Trạng thái',
          'Phân quyền',
        ],
        rows: filteredEmployees.map((emp) => [
          emp.code || emp.id.slice(0, 8),
          emp.full_name,
          emp.email ?? '',
          emp.phone ?? '',
          emp.department ?? '',
          emp.position ?? '',
          emp.join_date ?? '',
          emp.status,
          emp.role,
        ]),
        fileName: `CDX_HoSoNhanSu_${toLocalISODate()}.xlsx`,
        addToast,
      });
    });
  }, [filteredEmployees, addToast]);

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24 max-w-full overflow-x-hidden">
      <div className="flex items-center justify-between gap-2 mb-4">
        <PageBreadcrumb title="Hồ sơ nhân sự" onBack={onBack} />
        <PageToolbar
          tableRef={tableRef}
          captureOptions={{ reportTitle: 'HỔ SƠ NHÂN SỰ', subtitle: undefined }}
          onImageCaptured={setPreviewImageUrl}
          onExportExcel={handleExportExcel}
          sortOptions={[
            { value: 'code', label: 'Mã hiệu' },
            { value: 'newest', label: 'Mới nhất' },
            { value: 'date', label: 'Ngày vào làm' },
          ]}
          currentSort={sortBy}
          onSortChange={(v) => {
            setSortBy(v as SortOption);
            localStorage.setItem(`sort_pref_hr_${user.id}`, v);
          }}
          showFilter={showFilter}
          onFilterToggle={() => setShowFilter((f) => !f)}
          extraButtons={
            user.role !== 'User' ? (
              <Button
                size="icon"
                variant="primary"
                onClick={() => {
                  setIsEditing(false);
                  setFormData({ ...initialFormState, code: nextCode });
                  setShowModal(true);
                }}
                title="Thêm nhân sự"
              >
                <Plus size={16} />
              </Button>
            ) : undefined
          }
        />
      </div>

      <FilterPanel show={showFilter} onReset={() => setSearchTerm('')}>
        <FilterSearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Tìm theo tên, mã NV..."
        />
      </FilterPanel>

      <div
        ref={tableRef}
        className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 space-y-4"
      >
        <div className="overflow-x-auto custom-scrollbar pb-2 overflow-y-auto max-h-[70vh]">
          <table className="w-full text-left border-separate border-spacing-0">
            <thead>
              <tr className="bg-primary text-white text-[11px] uppercase tracking-wider whitespace-nowrap sticky top-0 z-[20]">
                <th className="p-3 sticky top-0 bg-primary first:rounded-tl-lg">Họ và tên</th>
                <th className="p-3 sticky top-0 bg-primary">Email</th>
                <th className="p-3 sticky top-0 bg-primary">Số điện thoại</th>
                <th className="p-3 sticky top-0 bg-primary">Ngày vào làm</th>
                {user.role === 'Develop' && (
                  <th className="p-3 sticky top-0 bg-primary">Mật khẩu ứng dụng</th>
                )}
                <th className="p-3 sticky top-0 bg-primary">Bộ phận</th>
                <th className="p-3 sticky top-0 bg-primary">Chức vụ</th>
                <th className="p-3 sticky top-0 bg-primary">Phân quyền</th>
                <th className="p-3 sticky top-0 bg-primary">Trạng thái</th>
                <th className="p-3 last:rounded-tr-lg sticky top-0 bg-primary">Thao tác</th>
              </tr>
            </thead>
            <tbody className="text-xs text-gray-600">
              {loading ? (
                <tr>
                  <td colSpan={user.role === 'Develop' ? 11 : 10} className="p-12 text-center">
                    <div className="flex flex-col items-center justify-center text-gray-400">
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2"></div>
                      <p className="text-sm">Đang tải dữ liệu nhân sự...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={user.role === 'Develop' ? 11 : 10} className="p-8 text-center">
                    Không tìm thấy nhân sự nào
                  </td>
                </tr>
              ) : (
                (() => {
                  const grouped: Record<string, Employee[]> = {};
                  filteredEmployees.forEach((emp) => {
                    let groupKey = emp.department || 'Chưa phân bộ phận';
                    if (emp.role === 'Admin' || emp.role === 'Develop') {
                      groupKey = 'Ban Điều Hành (Admin/Dev)';
                    }
                    if (!grouped[groupKey]) grouped[groupKey] = [];
                    grouped[groupKey].push(emp);
                  });

                  return Object.entries(grouped)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([dept, deptEmployees]) => (
                      <React.Fragment key={dept}>
                        <tr className="bg-gray-50 sticky top-[40px] z-[15]">
                          <td
                            colSpan={user.role === 'Develop' ? 11 : 10}
                            className="p-2 border-y border-gray-100 sticky top-[40px] left-0 bg-gray-50 z-[16] shadow-[1px_0_0_0_rgba(0,0,0,0.05)]"
                          >
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest px-2">
                              {dept}
                            </span>
                          </td>
                        </tr>
                        {deptEmployees
                          .sort((a, b) => (a.code || '').localeCompare(b.code || ''))
                          .map((emp) => (
                            <tr
                              key={emp.id}
                              onClick={() => handleEdit(emp)}
                              className="border-b border-gray-50 hover:bg-primary/5 transition-colors cursor-pointer group"
                            >
                              <td className="p-3 sticky left-0 bg-white group-hover:bg-gray-50 z-10 border-b border-gray-50 shadow-[1px_0_0_0_rgba(0,0,0,0.05)]">
                                <div className="font-bold text-gray-800">{emp.full_name}</div>
                                <div className="text-[9px] font-medium text-gray-400 mt-0.5 tracking-wider">
                                  {emp.code || '-'}
                                </div>
                              </td>
                              <td className="p-3">{emp.email || '-'}</td>
                              <td className="p-3">{emp.phone || '-'}</td>
                              <td className="p-3">{emp.join_date || '-'}</td>
                              {user.role === 'Develop' && (
                                <td className="p-3 font-mono text-blue-600">
                                  <div className="flex items-center gap-2 group/pass relative">
                                    <span className="opacity-0 group-hover/pass:opacity-100 transition-opacity absolute bg-white px-2 py-1 rounded shadow-sm border border-gray-100 z-[999] pointer-events-none -mt-8 ml-4 whitespace-nowrap">
                                      {emp.app_pass}
                                    </span>
                                    <span>••••••••</span>
                                    <Eye className="w-4 h-4 text-gray-400 group-hover/pass:text-blue-500 cursor-pointer" />
                                  </div>
                                </td>
                              )}
                              <td className="p-3">{emp.department || '-'}</td>
                              <td className="p-3">{emp.position || '-'}</td>
                              <td className="p-3">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    emp.role === 'Develop'
                                      ? 'bg-purple-100 text-purple-600'
                                      : emp.role === 'Admin'
                                        ? 'bg-blue-100 text-blue-600'
                                        : 'bg-gray-100 text-gray-600'
                                  }`}
                                >
                                  {emp.role}
                                </span>
                              </td>
                              <td className="p-3">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    emp.status === 'Đang làm việc' || emp.status === 'Hoạt động'
                                      ? 'bg-green-100 text-green-600'
                                      : 'bg-red-100 text-red-600'
                                  }`}
                                >
                                  {emp.status}
                                </span>
                              </td>
                              <td className="p-3" onClick={(e) => e.stopPropagation()}>
                                <div className="flex gap-2">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="text-blue-600 hover:bg-blue-50"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEdit(emp);
                                    }}
                                    icon={Edit}
                                    iconSize={14}
                                  />
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="text-red-600 hover:bg-red-50"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteClick(emp.id);
                                    }}
                                    icon={Trash2}
                                    iconSize={14}
                                  />
                                </div>
                              </td>
                            </tr>
                          ))}
                      </React.Fragment>
                    ));
                })()
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {showDeleteModal && (
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md overflow-hidden"
            onClick={() => setShowDeleteModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-2xl p-8 max-w-sm w-full text-center relative z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-100">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">Xác nhận xóa?</h3>
              <div className="text-sm text-gray-500 mb-6 space-y-3 text-left bg-gray-50 p-4 rounded-xl border border-gray-100">
                <p>
                  Nhân sự:{' '}
                  <strong>
                    {employees.find((e) => e.id === itemToDelete)?.full_name || itemToDelete}
                  </strong>
                </p>

                {usageInfo.details && usageInfo.details.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-red-600 font-bold flex items-center gap-2 text-[11px] uppercase tracking-wider">
                      <AlertCircle size={14} /> Dữ liệu liên quan:
                    </p>
                    <div className="space-y-2">
                      {usageInfo.details.map((detail, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-[11px] bg-white p-2 rounded-xl border border-gray-100 shadow-sm"
                        >
                          <span className="font-medium text-gray-700">{detail.label}</span>
                          <div className="flex gap-2">
                            {detail.count > 0 && (
                              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-md font-bold">
                                {detail.count} Active
                              </span>
                            )}
                            {detail.softDeletedCount > 0 && (
                              <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-md font-bold">
                                {detail.softDeletedCount} Trash
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {user.role === 'Develop' &&
                      usageInfo.details.some((d) => d.softDeletedCount > 0) && (
                        <Button
                          variant="outline"
                          size="sm"
                          fullWidth
                          onClick={handlePurgeRelated}
                          isLoading={submitting}
                          className="mt-2 text-[10px] py-1 border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100"
                          icon={Trash2}
                        >
                          DỌN DẸP RÁC LIÊN QUAN (ADMIN)
                        </Button>
                      )}

                    {usageInfo.inUse && (
                      <p className="text-[10px] text-red-500 italic mt-1 leading-tight">
                        * Phải xóa các phiếu/dữ liệu 'Active' trước khi có thể xóa nhân sự này.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-green-600 font-bold flex items-center gap-2 justify-center py-2">
                    <CheckCircle size={18} /> Sẵn sàng để xóa
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <Button fullWidth variant="outline" onClick={() => setShowDeleteModal(false)}>
                    Hủy bỏ
                  </Button>
                  <Button fullWidth variant="danger" onClick={confirmDelete}>
                    Thùng rác
                  </Button>
                </div>
                {/* XÓA VĨNH VIỄN removed from main list - use Trash module instead */}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showModal && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-md overflow-hidden"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[1.5rem] md:rounded-[2.5rem] shadow-2xl w-full max-w-4xl relative z-10 flex flex-col overflow-hidden max-h-[96vh] md:max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-primary p-4 sm:p-6 flex items-center justify-between text-white rounded-t-[1.5rem] md:rounded-t-[2.5rem] flex-shrink-0 transition-colors">
                <div className="flex items-center gap-3">
                  <div
                    className="p-2 bg-white/20 rounded-xl cursor-pointer hover:bg-white/30 transition-all"
                    onClick={() => setShowModal(false)}
                  >
                    <UserPlus size={20} className="sm:w-6 sm:h-6" />
                  </div>
                  <h3 className="font-bold text-base sm:text-lg truncate">
                    {isEditing ? 'Cập Nhật Nhân Sự' : 'Thêm Mới Nhân Sự'}
                  </h3>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 hover:bg-white/20 rounded-xl transition-all"
                >
                  <X size={20} className="sm:w-6 sm:h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
                <form id="hr-employee-form" onSubmit={handleSubmit} className="p-4 sm:p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                      <div className="flex items-center gap-2 mb-1.5 ml-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          Mã nhân viên
                        </label>
                        <span className="text-[10px] font-bold text-primary bg-primary/5 px-2 py-0.5 rounded-full border border-primary/10">
                          {formData.code || nextCode || '...'}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Họ và tên
                      </label>
                      <input
                        required
                        type="text"
                        value={formData.full_name}
                        onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Email</label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Số điện thoại
                      </label>
                      <input
                        type="text"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        CMND / CCCD
                      </label>
                      <input
                        type="text"
                        value={formData.id_card}
                        onChange={(e) => setFormData({ ...formData, id_card: e.target.value })}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Ngày sinh
                      </label>
                      <input
                        type="date"
                        value={formData.dob}
                        onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Ngày vào làm
                      </label>
                      <input
                        type="date"
                        value={formData.join_date}
                        onChange={(e) => setFormData({ ...formData, join_date: e.target.value })}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Mã số thuế
                      </label>
                      <input
                        type="text"
                        value={formData.tax_id}
                        onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    {user.role === 'Develop' ? (
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase">
                          Mật khẩu ứng dụng
                        </label>
                        <input
                          required
                          type="text"
                          value={formData.app_pass}
                          onChange={(e) => setFormData({ ...formData, app_pass: e.target.value })}
                          className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                    ) : (
                      isEditing &&
                      ['Admin'].includes(user.role) && (
                        <div className="space-y-1 flex flex-col justify-end">
                          <label className="text-[10px] font-bold text-gray-400 uppercase opacity-0 hidden md:block">
                            Reset Pass
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setFormData({ ...formData, app_pass: '123456' });
                              if (addToast)
                                addToast(
                                  'Đã đặt lại mật khẩu về 123456. Vui lòng bấm Lưu Cập Nhật!',
                                  'info',
                                );
                            }}
                            className="w-full px-4 py-2 bg-amber-100 text-amber-700 rounded-xl font-bold hover:bg-amber-200 transition-colors text-sm h-[38px] flex items-center justify-center gap-2"
                          >
                            <Lock size={16} /> Reset MK về 123456
                          </button>
                        </div>
                      )
                    )}
                    <div className="space-y-1 relative z-[60]">
                      <CreatableSelect
                        label="Bộ phận"
                        value={formData.department}
                        options={departments}
                        onChange={(val) => setFormData({ ...formData, department: val })}
                        onCreate={(val) => setFormData({ ...formData, department: val })}
                        placeholder="Chọn hoặc nhập bộ phận mới..."
                      />
                    </div>
                    <div className="space-y-1 relative z-[50]">
                      <CreatableSelect
                        label="Chức vụ"
                        value={formData.position}
                        options={positions}
                        onChange={(val) => setFormData({ ...formData, position: val })}
                        onCreate={(val) => setFormData({ ...formData, position: val })}
                        placeholder="Chọn hoặc nhập chức vụ mới..."
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Có tính lương
                      </label>
                      <select
                        value={formData.has_salary ? 'true' : 'false'}
                        onChange={(e) =>
                          setFormData({ ...formData, has_salary: e.target.value === 'true' })
                        }
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="false">Không</option>
                        <option value="true">Có</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Phân quyền
                      </label>
                      <select
                        value={formData.role}
                        onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="User">User</option>
                        <option value="Admin">Admin</option>
                        {user.role === 'Develop' && <option value="Develop">Develop</option>}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Quyền xem dữ liệu
                      </label>
                      <input
                        type="text"
                        placeholder="VD: kho-a,kho-b (chức năng đang phát triển)"
                        value={formData.data_view_permission}
                        onChange={(e) =>
                          setFormData({ ...formData, data_view_permission: e.target.value })
                        }
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                      />
                      <p className="text-[10px] text-gray-400 italic mt-1">
                        * Tính năng phân quyền theo kho đang được phát triển
                      </p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Ngày nghỉ việc
                      </label>
                      <input
                        type="date"
                        value={formData.resign_date}
                        onChange={(e) => setFormData({ ...formData, resign_date: e.target.value })}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Ngân sách đầu kỳ
                      </label>
                      <input
                        type="number"
                        value={formData.initial_budget}
                        onChange={(e) =>
                          setFormData({ ...formData, initial_budget: parseFloat(e.target.value) })
                        }
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Trạng thái
                      </label>
                      <select
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="Đang làm việc">Đang làm việc</option>
                        <option value="Nghỉ việc">Nghỉ việc</option>
                      </select>
                    </div>
                  </div>
                </form>
              </div>

              <div className="p-4 sm:p-6 bg-gray-50 flex justify-end gap-3 flex-shrink-0 border-t border-gray-100 rounded-b-[1.5rem] md:rounded-b-[2.5rem]">
                <Button variant="ghost" onClick={() => setShowModal(false)}>
                  Hủy bỏ
                </Button>
                <Button
                  type="submit"
                  form="hr-employee-form"
                  disabled={submitting}
                  variant="primary"
                  isLoading={submitting}
                  className="min-w-[120px]"
                >
                  Lưu dữ liệu
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global FAB */}
      {user.role !== 'User' && (
        <button
          onClick={() => {
            setIsEditing(false);
            setFormData(initialFormState);
            setShowModal(true);
          }}
          className="fixed bottom-20 md:bottom-10 right-4 md:right-10 w-14 h-14 bg-primary text-white rounded-full shadow-xl shadow-primary/30 flex items-center justify-center hover:bg-primary/90 hover:scale-105 active:scale-95 transition-all z-[90]"
          title="Thêm nhân sự mới"
        >
          <Plus size={24} strokeWidth={3} />
        </button>
      )}

      {previewImageUrl && (
        <ReportImagePreviewModal
          imageDataUrl={previewImageUrl}
          fileName={`CDX_HoSoNhanSu_${toLocalISODate()}.png`}
          onClose={() => setPreviewImageUrl(null)}
        />
      )}
    </div>
  );
};
