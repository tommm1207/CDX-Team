import { CanvasLogo } from '@/components/shared';
import { exportTableImage } from '../../utils/reportExport';
import { useState, useEffect } from 'react';
import {
  FileText,
  Plus,
  Search,
  X,
  Save,
  Edit,
  Trash2,
  AlertCircle,
  CheckCircle,
  Image as LucideImageIcon,
  Share2,
} from 'lucide-react';
import { useRef } from 'react';

import { ImageCapture } from '@/components/shared';
import { SaveImageButton } from '@/components/shared';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '@/lib/supabase';
import { Employee, Note } from '@/types';
import { PageBreadcrumb } from '@/components/shared';
import { isActiveWarehouse } from '@/utils/inventory';
import { ToastType } from '@/components/shared';
import { FAB } from '@/components/shared';
import { Button } from '@/components/shared';
import { ConfirmModal } from '@/components/shared';
import { checkUsage } from '@/utils/dataIntegrity';
import { ExcelButton } from '@/components/shared';
import { toLocalISODate } from '@/utils/format';

export const WEATHER_OPTIONS = [
  { value: 'sunny', label: '☀️ Nắng nóng gay gắt' },
  { value: 'sudden-rain', label: '⛈️ Mưa rào đột ngột' },
  { value: 'cloudy', label: '☁️ Trời âm u, oi bức' },
  { value: 'long-rain', label: '🌧️ Mưa dầm kéo dài' },
  { value: 'strong-wind', label: '💨 Gió giật mạnh trong cơn dông' },
  { value: 'thunderstorm', label: '🌩️ Sấm chớp dữ dội' },
  { value: 'flood', label: '🌊 Ngập lụt cục bộ' },
  { value: 'cool', label: '🌬️ Trời se lạnh vào sáng sớm' },
  { value: 'smog', label: '🌫️ Sương mù quang hóa' },
  { value: 'pleasant', label: '🌤️ Trời trong xanh, nắng dịu' },
];

export const Notes = ({
  user,
  onBack,
  addToast,
  initialAction,
  setHideBottomNav,
}: {
  user: Employee;
  onBack: () => void;
  addToast?: (msg: string, type?: ToastType) => void;
  initialAction?: string;
  setHideBottomNav?: (hide: boolean) => void;
}) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddNew, setShowAddNew] = useState(false);
  const [showQuickNote, setShowQuickNote] = useState(initialAction === 'add');

  useEffect(() => {
    if (setHideBottomNav) {
      setHideBottomNav(showAddNew || showQuickNote);
    }
  }, [showAddNew, showQuickNote, setHideBottomNav]);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [showFilter, setShowFilter] = useState(false);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [usageInfo, setUsageInfo] = useState<any>({ inUse: false, details: [] });
  const [submitting, setSubmitting] = useState(false);
  const [isCapturingTable, setIsCapturingTable] = useState(false);

  const reportRef = useRef<HTMLDivElement>(null);

  const [filters, setFilters] = useState({
    fromDate: '',
    toDate: '',
    employee: '',
    warehouse: '',
    search: '',
  });

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    date: toLocalISODate(),
    weather: '',
    related_object: '',
    object_code: '',
    note_code: '',
    location: '',
    related_personnel: [] as string[],
    image_urls: [] as string[],
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data: notesData } = await supabase
      .from('notes')
      .select('*, users(full_name)')
      .or('status.is.null,status.neq.Đã xóa')
      .order('created_at', { ascending: false });
    if (notesData) setNotes(notesData);

    let empQuery = supabase.from('users').select('*').neq('status', 'Nghỉ việc');
    if (user.role !== 'Develop') {
      empQuery = empQuery.neq('role', 'Develop');
    }
    const { data: empData } = await empQuery.order('full_name');
    if (empData) setEmployees(empData);

    const { data: whData } = await supabase
      .from('warehouses')
      .select('*')
      .or('status.is.null,status.neq.Đã xóa')
      .order('name');
    if (whData) {
      setWarehouses(whData.filter(isActiveWarehouse));
    }
    setLoading(false);
  };

  const handleSaveTableImage = () => {
    if (reportRef.current) {
      exportTableImage({
        element: reportRef.current,
        fileName: 'Bao_Cao_Nhat_Ky_Cong_Trinh.png',
        addToast,
        onStart: () => setIsCapturingTable(true),
        onEnd: () => setIsCapturingTable(false),
      });
    }
  };

  const handleExportExcel = () => {
    import('@/utils/excelExport').then(({ exportToExcel }) => {
      exportToExcel({
        title: 'Note & Nhật ký',
        sheetName: 'Note',
        columns: ['Tiêu đề', 'Nội dung', 'Phân loại', 'Ngày tạo'],
        rows: filteredNotes.map((it) => [
          it.title,
          it.content ?? '',
          it.category ?? '',
          it.created_at ?? '',
        ]),
        fileName: `CDX_GhiChu_${toLocalISODate()}.xlsx`,
        addToast,
      });
    });
  };

  const handleSave = async () => {
    setSubmitting(true);
    try {
      const computedRelatedObject =
        formData.related_personnel.length > 0
          ? employees
              .filter((e) => formData.related_personnel.includes(e.id))
              .map((e) => e.full_name)
              .join(', ')
          : 'Tất cả nhân viên';

      const payload = {
        title: formData.title,
        content: formData.content,
        date: formData.date,
        weather: formData.weather,
        related_object: computedRelatedObject,
        object_code: formData.object_code,
        note_code: formData.note_code,
        location: formData.location,
        related_personnel: formData.related_personnel,
        image_urls: formData.image_urls,
        created_by: user.id,
      };

      if (editingId) {
        const { error } = await supabase.from('notes').update(payload).eq('id', editingId);
        if (error) throw error;
        if (addToast) addToast('Cập nhật note thành công!', 'success');
      } else {
        const { error } = await supabase.from('notes').insert([payload]);
        if (error) throw error;
        if (addToast) addToast('Lưu note thành công!', 'success');
      }

      setShowQuickNote(false);
      setShowAddNew(false);
      setEditingId(null);
      setFormData({
        title: '',
        content: '',
        date: toLocalISODate(),
        weather: '',
        related_object: '',
        object_code: '',
        note_code: '',
        location: '',
        related_personnel: [],
        image_urls: [],
      });
      setFilters({
        fromDate: '',
        toDate: '',
        employee: '',
        warehouse: '',
        search: '',
      });
      fetchData();
    } catch (error: any) {
      if (addToast) addToast('Lỗi: ' + error.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (note: any) => {
    setFormData({
      title: note.title || '',
      content: note.content || '',
      date: note.date || toLocalISODate(),
      weather: note.weather || '',
      related_object: note.related_object || '',
      object_code: note.object_code || '',
      note_code: note.note_code || '',
      location: note.location || '',
      related_personnel: note.related_personnel || [],
      image_urls: note.image_urls || [],
    });
    setEditingId(note.id);
    setShowAddNew(true);
  };

  const handleDeleteClick = async (id: string) => {
    setItemToDelete(id);
    setShowDeleteModal(true);
    try {
      const usage = await checkUsage('employee', id);
      setUsageInfo(usage);
    } catch (err) {
      console.error(err);
    }
  };

  const executeDelete = async () => {
    if (!itemToDelete) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('notes')
        .update({ status: 'Đã xóa' })
        .eq('id', itemToDelete);
      if (error) throw error;
      if (addToast) addToast('Đã chuyển note vào thùng rác', 'success');
      setShowDeleteModal(false);
      fetchData();
    } catch (error: any) {
      if (addToast) addToast('Lỗi khi xóa: ' + error.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePermanentDelete = async () => {
    if (!itemToDelete || user.role !== 'Develop') return;
    if (!window.confirm('CẢNH BÁO: Hành động này sẽ xóa VĨNH VIỄN note này. Bạn có chắc chắn?'))
      return;

    setSubmitting(true);
    try {
      const { error } = await supabase.from('notes').delete().eq('id', itemToDelete);
      if (error) throw error;
      if (addToast) addToast('Đã xóa vĩnh viễn note', 'success');
      fetchData();
      setShowDeleteModal(false);
    } catch (err: any) {
      if (addToast) addToast('Lỗi xóa vĩnh viễn: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const executeDeleteAll = async () => {
    try {
      const idsToDelete = filteredNotes.map((n) => n.id);
      if (idsToDelete.length === 0) {
        if (addToast) addToast('Không có dữ liệu để xóa', 'info');
        setShowDeleteAllConfirm(false);
        return;
      }

      const { error } = await supabase
        .from('notes')
        .update({ status: 'Đã xóa' })
        .in('id', idsToDelete);
      if (error) throw error;

      if (addToast) addToast(`Đã chuyển ${idsToDelete.length} note vào thùng rác`, 'success');
      setShowDeleteAllConfirm(false);
      fetchData();
    } catch (error: any) {
      if (addToast) addToast('Lỗi khi xóa: ' + error.message, 'error');
    }
  };

  const filteredNotes = notes.filter((n) => {
    if (filters.fromDate && n.date < filters.fromDate) return false;
    if (filters.toDate && n.date > filters.toDate) return false;
    if (filters.employee && n.created_by !== filters.employee) return false;

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const titleMatch = (n.title || '').toLowerCase().includes(searchLower);
      const contentMatch = (n.content || '').toLowerCase().includes(searchLower);
      if (!(titleMatch || contentMatch)) return false;
    }
    return true;
  });

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24">
      <div className="flex items-center justify-between gap-2 mb-4">
        <PageBreadcrumb title="Note" onBack={onBack} />
        <div className="flex items-center gap-1.5 justify-end flex-1 flex-shrink-0">
          <SaveImageButton
            onClick={handleSaveTableImage}
            isCapturing={isCapturingTable}
            title="Lưu ảnh báo cáo note"
          />
          <ExcelButton onClick={handleExportExcel} size="icon" />

          <Button
            size="icon"
            variant="danger"
            icon={Trash2}
            onClick={() => setShowDeleteAllConfirm(true)}
            title="Xóa tất cả danh sách hiện tại"
          />
          <Button
            size="icon"
            variant={showFilter ? 'primary' : 'outline'}
            onClick={() => setShowFilter((f) => !f)}
            icon={Search}
          />
        </div>
      </div>

      <AnimatePresence>
        {showFilter && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: showFilter ? 'visible' : 'hidden' }}
          >
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Từ ngày</label>
                  <input
                    type="date"
                    value={filters.fromDate}
                    onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary/20 outline-none mt-1"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Đến ngày</label>
                  <input
                    type="date"
                    value={filters.toDate}
                    onChange={(e) => setFilters({ ...filters, toDate: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary/20 outline-none mt-1"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Nhân sự</label>
                  <select
                    value={filters.employee}
                    onChange={(e) => setFilters({ ...filters, employee: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary/20 outline-none mt-1"
                  >
                    <option value="">-- Tất cả --</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.full_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Kho</label>
                  <select
                    value={filters.warehouse}
                    onChange={(e) => setFilters({ ...filters, warehouse: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary/20 outline-none mt-1"
                  >
                    <option value="">-- Tất cả kho --</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">
                    Tìm kiếm nhanh
                  </label>
                  <div className="relative mt-1">
                    <Search
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                      size={16}
                    />
                    <input
                      type="text"
                      placeholder="Gõ để tìm..."
                      value={filters.search}
                      onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                      className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-50 flex items-center justify-between bg-primary/5">
          <h3 className="text-sm font-bold text-primary flex items-center gap-2 uppercase tracking-wider">
            <FileText size={18} /> Note tháng {new Date().getMonth() + 1}/{new Date().getFullYear()}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase">
                  Tiêu đề / Nội dung
                </th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase">
                  Đối tượng liên quan
                </th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase">
                  Thời tiết
                </th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase">
                  Ngày tạo
                </th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase">
                  Vị trí / Tọa độ
                </th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase text-center">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400 italic">
                    Đang tải dữ liệu...
                  </td>
                </tr>
              ) : filteredNotes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400 italic">
                    Không có note nào
                  </td>
                </tr>
              ) : (
                filteredNotes.map((note) => (
                  <tr
                    key={note.id}
                    className="hover:bg-gray-50/50 transition-colors cursor-pointer group"
                    onClick={() => handleEdit(note)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-sm font-black text-gray-900 leading-tight">
                          {note.title || 'Không có tiêu đề'}
                        </span>
                        <span className="text-xs text-gray-500 truncate max-w-[300px]">
                          {note.content}
                        </span>
                        {note.image_urls && note.image_urls.length > 0 && (
                          <div className="flex flex-col gap-1 mt-2">
                            <div className="flex items-center gap-1">
                              <LucideImageIcon size={10} className="text-primary" />
                              <span className="text-[9px] font-bold text-primary uppercase italic">
                                {note.image_urls.length} ảnh
                              </span>
                            </div>
                            <div className="flex gap-1 overflow-hidden">
                              {note.image_urls.slice(0, 3).map((url, i) => (
                                <img
                                  key={i}
                                  src={url}
                                  alt="preview"
                                  className="w-8 h-8 rounded-lg object-cover border border-gray-100"
                                />
                              ))}
                              {note.image_urls.length > 3 && (
                                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-[8px] font-bold text-gray-400">
                                  +{note.image_urls.length - 3}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {note.related_object || 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {WEATHER_OPTIONS.find((w) => w.value === note.weather)?.label || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(note.date).toLocaleDateString('vi-VN')}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                      {note.location || 'N/A'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-blue-600 hover:bg-blue-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(note);
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
                            handleDeleteClick(note.id);
                          }}
                          icon={Trash2}
                          iconSize={14}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {showDeleteModal && (
          <div
            className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md overflow-hidden"
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
              <div className="text-sm text-gray-500 mb-6 text-left bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-2">
                <p>
                  Note:{' '}
                  <strong className="text-primary truncate">
                    {notes.find((n) => n.id === itemToDelete)?.title || 'Không tiêu đề'}
                  </strong>
                </p>
                {usageInfo.inUse ? (
                  <p className="text-[10px] text-red-500 font-bold flex items-center gap-1 uppercase tracking-tighter">
                    <AlertCircle size={12} /> Có dữ liệu liên quan - Cân nhắc kỹ
                  </p>
                ) : (
                  <p className="text-[10px] text-green-600 font-bold flex items-center gap-1 uppercase tracking-widest">
                    <CheckCircle size={12} /> Sẵn sàng để xóa
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <Button fullWidth variant="outline" onClick={() => setShowDeleteModal(false)}>
                    Hủy bỏ
                  </Button>
                  <Button fullWidth variant="danger" onClick={executeDelete} isLoading={submitting}>
                    Thùng rác
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showQuickNote && (
          <div
            className="fixed inset-0 z-[150] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-md overflow-hidden no-print"
            onClick={() => setShowQuickNote(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 30 }}
              className="bg-white rounded-[1.5rem] md:rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden relative z-10 flex flex-col max-h-[96dvh] md:max-h-[90dvh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 text-white flex items-center justify-between bg-amber-500 rounded-t-[2rem] md:rounded-t-[2.5rem]">
                <div className="flex items-center gap-3">
                  <div
                    className="p-2 bg-white/20 rounded-xl cursor-pointer hover:bg-white/30 transition-all active:scale-95"
                    onClick={() => setShowQuickNote(false)}
                  >
                    <FileText size={20} />
                  </div>
                  <h3 className="text-lg font-bold uppercase tracking-wide">Note nhanh</h3>
                </div>
                <button
                  onClick={() => setShowQuickNote(false)}
                  className="p-2 hover:bg-white/20 rounded-xl transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4 overflow-y-auto overflow-x-hidden flex-1 custom-scrollbar">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Tiêu đề</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary/20 outline-none mt-1"
                    placeholder="VD: Note công việc sáng..."
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Nội dung</label>
                  <textarea
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary/20 outline-none mt-1 min-h-[100px]"
                    placeholder="Nhập nội dung note..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Ngày</label>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary/20 outline-none mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase">
                      Thời tiết
                    </label>
                    <select
                      value={formData.weather}
                      onChange={(e) => setFormData({ ...formData, weather: e.target.value })}
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary/20 outline-none mt-1"
                    >
                      <option value="">-- Chọn --</option>
                      {WEATHER_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">
                    Nhân sự liên quan{' '}
                    <span className="text-gray-400 font-normal italic">- Chọn nhiều</span>
                  </label>
                  <div className="mt-1 border border-gray-200 rounded-xl max-h-40 overflow-y-auto bg-white/50">
                    {employees.map((emp) => (
                      <label
                        key={emp.id}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-0 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={formData.related_personnel.includes(emp.id)}
                          onChange={(e) => {
                            const newPersonnel = e.target.checked
                              ? [...formData.related_personnel, emp.id]
                              : formData.related_personnel.filter((id) => id !== emp.id);
                            setFormData({ ...formData, related_personnel: newPersonnel });
                          }}
                          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary flex-shrink-0"
                        />
                        <span className="text-sm text-gray-700 font-medium truncate">
                          {emp.full_name}{' '}
                          <span className="text-gray-400 text-xs font-normal">({emp.code})</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="p-6 bg-gray-50 flex gap-3">
                <button
                  onClick={handleSave}
                  className="flex-1 py-3 bg-amber-500 text-white rounded-xl font-bold text-sm hover:bg-amber-600 transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
                >
                  <Save size={18} /> Lưu note
                </button>
                <button
                  onClick={() => setShowQuickNote(false)}
                  className="px-6 py-3 bg-gray-400 text-white rounded-xl font-bold text-sm hover:bg-gray-500 transition-all"
                >
                  Hủy
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddNew && (
          <div
            className="fixed inset-0 z-[150] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-md overflow-hidden no-print"
            onClick={() => setShowAddNew(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 30 }}
              className="bg-white rounded-[1.5rem] md:rounded-[2.5rem] shadow-2xl w-full max-w-4xl max-h-[96dvh] md:max-h-[90vh] overflow-hidden relative z-10 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 sm:p-6 text-white flex items-center justify-between bg-primary rounded-t-[1.5rem] md:rounded-t-[2.5rem] flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div
                    className="p-2 bg-white/20 rounded-xl cursor-pointer hover:bg-white/30 transition-all active:scale-95"
                    onClick={() => {
                      setShowAddNew(false);
                      setEditingId(null);
                    }}
                  >
                    <FileText size={20} className="sm:w-6 sm:h-6" />
                  </div>
                  <h3 className="font-bold text-base sm:text-lg">
                    {editingId ? 'Chỉnh sửa note' : 'Thêm note mới'}
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setShowAddNew(false);
                    setEditingId(null);
                  }}
                  className="p-2 hover:bg-white/20 rounded-xl transition-all"
                >
                  <X size={20} className="sm:w-6 sm:h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2 space-y-2 mb-2 hidden">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                      Mã tham chiếu (Note)
                    </label>
                    <div className="bg-primary/5 px-5 py-3.5 rounded-2xl border border-primary/10 text-sm font-black text-primary uppercase shadow-inner italic">
                      {editingId
                        ? `NT-${toLocalISODate(
                            new Date(notes.find((n) => n.id === editingId)?.date),
                          )
                            .slice(2)
                            .replace(/-/g, '')}-${editingId.slice(0, 3).toUpperCase()}`
                        : `NT-${toLocalISODate().slice(2).replace(/-/g, '')}-001`}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Tiêu đề
                      </label>
                      <input
                        type="text"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary/20 outline-none mt-1"
                        placeholder="VD: Note công việc sáng..."
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Nhân sự liên quan{' '}
                        <span className="text-gray-400 font-normal italic">- Chọn nhiều</span>
                      </label>
                      <div className="mt-1 border border-gray-200 rounded-xl max-h-48 overflow-y-auto bg-white/50">
                        {employees.map((emp) => (
                          <label
                            key={emp.id}
                            className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0 cursor-pointer transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={formData.related_personnel.includes(emp.id)}
                              onChange={(e) => {
                                const newPersonnel = e.target.checked
                                  ? [...formData.related_personnel, emp.id]
                                  : formData.related_personnel.filter((id) => id !== emp.id);
                                setFormData({ ...formData, related_personnel: newPersonnel });
                              }}
                              className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary flex-shrink-0"
                            />
                            <span className="text-sm text-gray-700 font-medium truncate">
                              {emp.full_name}{' '}
                              <span className="text-gray-400 text-xs font-normal">
                                ({emp.code})
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Ngày tạo
                      </label>
                      <input
                        type="date"
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary/20 outline-none mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Nội dung
                      </label>
                      <textarea
                        value={formData.content}
                        onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary/20 outline-none mt-1 min-h-[80px]"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Thời tiết
                      </label>
                      <select
                        value={formData.weather}
                        onChange={(e) => setFormData({ ...formData, weather: e.target.value })}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary/20 outline-none mt-1"
                      >
                        <option value="">-- Chọn --</option>
                        {WEATHER_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Vị trí / Tọa độ
                      </label>
                      <input
                        type="text"
                        value={formData.location}
                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary/20 outline-none mt-1"
                        placeholder="0.000000, 0.000000"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Người tạo
                      </label>
                      <input
                        type="text"
                        value={user.full_name}
                        disabled
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm bg-gray-50 mt-1"
                      />
                    </div>

                    <ImageCapture
                      label="Hình ảnh đính kèm"
                      existingImages={formData.image_urls}
                      onUpload={(urls) => setFormData({ ...formData, image_urls: urls })}
                      maxImages={10}
                    />
                  </div>
                </div>
              </div>

              <div className="p-6 bg-gray-50 flex justify-end gap-3 flex-shrink-0">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowAddNew(false);
                    setEditingId(null);
                  }}
                >
                  Hủy bỏ
                </Button>
                <Button variant="primary" onClick={handleSave} icon={Save}>
                  {editingId ? 'Cập nhật dữ liệu' : 'Lưu dữ liệu'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmModal
        show={showDeleteAllConfirm}
        title="Xác nhận xóa danh sách"
        message={`Bạn có chắc chắn muốn chuyển tất cả ${filteredNotes.length} note hiện tại vào thùng rác không?`}
        onConfirm={executeDeleteAll}
        onCancel={() => setShowDeleteAllConfirm(false)}
      />

      <FAB
        onClick={() => {
          setFormData({
            title: '',
            content: '',
            date: toLocalISODate(),
            weather: '',
            related_object: '',
            object_code: '',
            note_code: '',
            location: '',
            related_personnel: [],
            image_urls: [],
          });
          setEditingId(null);
          setShowAddNew(true);
        }}
        label="Thêm note"
      />

      {/* Hidden Report Template (A4 Landscape) */}
      <div className="fixed -left-[4000px] -top-[4000px] no-print">
        <div
          ref={reportRef}
          className="bg-white p-12 w-[1123px] min-h-[794px] font-sans text-gray-900 border"
          style={{ width: '1123px' }}
        >
          {/* Company Header */}
          <div className="flex justify-between items-start mb-10 pb-6 border-b-2 border-primary/20">
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
                  <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-amber-100 italic">
                    Central Logs & Field Notes
                  </span>
                  <span className="w-1.5 h-1.5 bg-gray-200 rounded-full" />
                  <span className="text-[10px] text-gray-500 font-bold italic tracking-wide">
                    Ref ID: {new Date().getTime().toString(36).toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-3xl font-black text-gray-900 uppercase tracking-tighter mb-1">
                Báo Cáo Nhật Ký Note
              </h2>
              <p className="text-xs text-gray-500 font-bold italic">
                Thời gian xuất: {new Date().toLocaleString('vi-VN')}
              </p>
              <div className="mt-4 flex flex-col items-end gap-1">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest font-mono">
                  STATUS: FIELD_LOG_AUDIT
                </p>
                <div className="h-0.5 w-12 bg-primary/20 rounded-full" />
              </div>
            </div>
          </div>

          {/* Table */}
          <table className="w-full text-left border-collapse rounded-3xl overflow-hidden shadow-sm border border-gray-100">
            <thead>
              <tr className="bg-gray-800 text-white">
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest italic border-r border-white/10 w-16 text-center">
                  STT
                </th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest italic border-r border-white/10">
                  Tiêu đề / Đối tượng
                </th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest italic border-r border-white/10">
                  Nội dung note
                </th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest italic border-r border-white/10">
                  Thời tiết
                </th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest italic border-r border-white/10">
                  Ngày
                </th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest italic">
                  Vị trí
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs">
              {filteredNotes.map((note, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}>
                  <td className="px-6 py-4 text-center text-gray-400 font-bold">{idx + 1}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-black text-gray-900 uppercase tracking-tight">
                        {note.title || 'Không tiêu đề'}
                      </span>
                      <span className="text-[9px] text-primary font-bold italic tracking-wide">
                        {note.related_object || '—'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-700 leading-relaxed font-medium break-words whitespace-normal max-w-[400px]">
                    <div className="flex flex-col gap-2">
                      <span>{note.content}</span>
                      {note.image_urls && note.image_urls.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {note.image_urls.map((url, i) => (
                            <img
                              key={i}
                              src={url}
                              alt="note-img"
                              className="w-16 h-16 rounded-lg object-cover border border-gray-100"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 font-bold text-gray-500 italic">
                    {WEATHER_OPTIONS.find((w) => w.value === note.weather)?.label || '—'}
                  </td>
                  <td className="px-6 py-4 font-black text-gray-900 uppercase italic tracking-tighter">
                    {new Date(note.date).toLocaleDateString('vi-VN')}
                  </td>
                  <td className="px-6 py-4 text-[10px] text-gray-400 font-mono tracking-widest">
                    {note.location || '—'}
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
                End of field log report • Digital Asset Service
              </p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-black text-gray-300 uppercase tracking-[0.3em] mb-1">
                Log Synchronization Verified
              </p>
              <div className="text-[10px] text-gray-400 font-bold bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
                Sync Key:{' '}
                <span className="text-primary font-black tracking-widest italic ml-1 underline">
                  FIELD-NOTE-2026
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
