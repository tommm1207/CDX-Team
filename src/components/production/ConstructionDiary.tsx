import { CanvasLogo } from '@/components/shared';
import { exportTableImage } from '../../utils/reportExport';
import { useState, useEffect } from 'react';
import {
  ClipboardList,
  Plus,
  Search,
  X,
  Edit,
  Trash2,
  Calendar,
  Cloud,
  Users,
  Settings2,
  AlertCircle,
  MessageSquare,
  MapPin,
  ChevronRight,
  Image as ImageIcon,
  CheckCircle,
  Share2,
} from 'lucide-react';
import { useRef } from 'react';

import { SaveImageButton } from '@/components/shared';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '@/lib/supabase';
import { Employee, ConstructionDiary, Warehouse } from '@/types';
import { PageBreadcrumb } from '@/components/shared';
import { ToastType } from '@/components/shared';
import { FAB } from '@/components/shared';
import { Button } from '@/components/shared';
import { ConfirmModal } from '@/components/shared';
import { ImageCapture } from '@/components/shared';
import { WEATHER_OPTIONS } from '../notes/Notes';
import { SortButton, SortOption } from '@/components/shared';
import { ExcelButton } from '@/components/shared';
import { formatDate, formatNumber, toLocalISODate } from '@/utils/format';
import ExcelJS from 'exceljs';
import { formatDataForExcel } from '@/utils/excelHelper';

const CODE_PREFIX = 'NKTC-';

export const ConstructionDiaryComponent = ({
  user,
  onBack,
  addToast,
  setHideBottomNav,
}: {
  user: Employee;
  onBack: () => void;
  addToast?: (msg: string, type?: ToastType) => void;
  setHideBottomNav?: (hide: boolean) => void;
}) => {
  const [diaries, setDiaries] = useState<ConstructionDiary[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [showAddNew, setShowAddNew] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedDiary, setSelectedDiary] = useState<ConstructionDiary | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  // Filters
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterWarehouseId, setFilterWarehouseId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>(
    (localStorage.getItem(`sort_pref_diary_${user.id}`) as SortOption) || 'newest',
  );
  const [isCapturingTable, setIsCapturingTable] = useState(false);

  const reportRef = useRef<HTMLDivElement>(null);

  const initialFormState: Partial<ConstructionDiary> = {
    date: toLocalISODate(),
    weather: 'pleasant',
    temperature: '',
    labor_info: '',
    equipment_info: '',
    work_progress: '',
    quality_issues: '',
    supervision_comments: '',
    image_urls: [],
    warehouse_id: '',
    diary_code: '',
  };

  const [formData, setFormData] = useState<Partial<ConstructionDiary>>(initialFormState);

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddNew = () => {
    setFormData(initialFormState);
    setEditingId(null);
    setShowAddNew(true);
  };

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

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: diaryData } = await supabase
        .from('construction_diaries')
        .select('*, warehouses(id, name, code)')
        .or('status.is.null,status.neq.Đã xóa')
        .order('date', { ascending: false });
      if (diaryData) setDiaries(diaryData);

      const { data: whData } = await supabase
        .from('warehouses')
        .select('*')
        .neq('status', 'Đã xóa')
        .order('name');
      if (whData) setWarehouses(whData);
    } catch (err: any) {
      if (addToast) addToast('Lỗi tải dữ liệu: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const generateCode = () => {
    const dateStr = toLocalISODate().slice(2).replace(/-/g, '');
    const random = Math.floor(1000 + Math.random() * 9000);
    return `${CODE_PREFIX}${dateStr}-${random}`;
  };

  const handleSave = async () => {
    if (!formData.warehouse_id) {
      if (addToast) addToast('Vui lòng chọn địa điểm', 'warning');
      return;
    }

    try {
      if (editingId) {
        const { error } = await supabase
          .from('construction_diaries')
          .update({
            ...formData,
            status: ['admin', 'develop'].includes(user.role?.toLowerCase() || '')
              ? (formData as any).status
              : 'Chờ duyệt',
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingId);
        if (error) throw error;
        if (addToast) addToast('Đã cập nhật nhật ký thi công', 'success');
      } else {
        const code = generateCode();
        const { error } = await supabase.from('construction_diaries').insert([
          {
            ...formData,
            diary_code: code,
            created_by: user.id,
          },
        ]);
        if (error) throw error;
        if (addToast) addToast('Đã thêm mới nhật ký thi công: ' + code, 'success');
      }
      setShowAddNew(false);
      setEditingId(null);
      resetForm();
      fetchData();
    } catch (err: any) {
      if (addToast) addToast('Lỗi: ' + err.message, 'error');
    }
  };

  const resetForm = () => {
    setFormData(initialFormState);
  };

  const handleEdit = (diary: ConstructionDiary) => {
    setEditingId(diary.id);
    setFormData(diary);
    setShowAddNew(true);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      const { error } = await supabase
        .from('construction_diaries')
        .update({ status: 'Đã xóa' })
        .eq('id', deletingId);
      if (error) throw error;
      if (addToast) addToast('Đã chuyển nhật ký vào thùng rác', 'success');
      setDeletingId(null);
      fetchData();
    } catch (err: any) {
      if (addToast) addToast('Lỗi: ' + err.message, 'error');
    }
  };

  const filteredDiaries = diaries
    .filter((item) => {
      if (filterStartDate && item.date < filterStartDate) return false;
      if (filterEndDate && item.date > filterEndDate) return false;
      if (filterWarehouseId && item.warehouse_id !== filterWarehouseId) return false;
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        return (
          item.work_progress.toLowerCase().includes(s) ||
          item.labor_info?.toLowerCase().includes(s) ||
          item.diary_code?.toLowerCase().includes(s)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'newest') return (b.diary_code || '').localeCompare(a.diary_code || '');
      if (sortBy === 'code') return (a.diary_code || '').localeCompare(b.diary_code || '');
      if (sortBy === 'date') return new Date(b.date).getTime() - new Date(a.date).getTime();
      return 0;
    });

  const handleExportExcel = async () => {
    if (filteredDiaries.length === 0) {
      addToast?.('Không có dữ liệu để xuất!', 'warning');
      return;
    }

    setExporting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Nhật ký thi công');

      const lookupData = {
        warehouses: warehouses,
        users: [{ id: user.id, full_name: user.full_name }], // Minimal for helper
      };

      const formattedData = formatDataForExcel(filteredDiaries, lookupData);
      const columns = Object.keys(formattedData[0]);

      // Set header
      const headerRow = worksheet.addRow(columns);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D5A27' } };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

      // Add data
      formattedData.forEach((item) => {
        worksheet.addRow(Object.values(item));
      });

      // Auto-fit columns
      worksheet.columns.forEach((column) => {
        let maxLen = 0;
        column.eachCell!({ includeEmpty: true }, (cell) => {
          const len = cell.value ? cell.value.toString().length : 10;
          if (len > maxLen) maxLen = len;
        });
        column.width = Math.min(maxLen + 2, 50);
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Nhat_ky_thi_cong_${toLocalISODate()}.xlsx`;
      link.click();
      addToast?.('Xuất Excel thành công!', 'success');
    } catch (err: any) {
      addToast?.('Lỗi xuất Excel: ' + err.message, 'error');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (setHideBottomNav) setHideBottomNav(showAddNew || showDetail);
  }, [showAddNew, showDetail, setHideBottomNav]);

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24 max-w-[100vw] overflow-x-hidden">
      {/* Header Section */}
      <div className="flex items-center justify-between gap-2">
        <PageBreadcrumb title="Nhật ký thi công" onBack={onBack} />
        <div className="flex items-center gap-1.5 justify-end flex-1">
          <SaveImageButton
            onClick={handleSaveTableImage}
            isCapturing={isCapturingTable}
            title="Lưu ảnh báo cáo A4"
          />
          <ExcelButton onClick={handleExportExcel} loading={exporting} size="icon" />
          <SortButton
            currentSort={sortBy}
            onSortChange={(val) => {
              setSortBy(val);
              localStorage.setItem(`sort_pref_diary_${user.id}`, val);
            }}
            options={[
              { value: 'newest', label: 'Mới nhất' },
              { value: 'code', label: 'Mã nhật ký' },
              { value: 'date', label: 'Ngày lập' },
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

      {/* Advanced Filter Bar (Glassmorphism inspired) */}
      <AnimatePresence>
        {showFilter && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="z-10"
          >
            <div className="bg-white/80 backdrop-blur-md p-5 rounded-3xl shadow-sm border border-gray-100 mb-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Từ ngày
                  </label>
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-100 bg-white/50 text-sm outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Đến ngày
                  </label>
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-100 bg-white/50 text-sm outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Địa điểm / Kho
                  </label>
                  <select
                    value={filterWarehouseId}
                    onChange={(e) => setFilterWarehouseId(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-100 bg-white/50 text-sm outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all"
                  >
                    <option value="">Tất cả địa điểm</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Tìm kiếm
                  </label>
                  <input
                    type="text"
                    placeholder="Mã, nội dung, nhân sự..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-100 bg-white/50 text-sm outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area - Table for Desktop, Cards for Mobile */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Mobile View - Cards */}
        <div className="grid grid-cols-1 md:hidden overflow-y-auto no-scrollbar">
          {loading ? (
            Array(5)
              .fill(0)
              .map((_, i) => (
                <div
                  key={i}
                  className="h-32 bg-gray-50/50 animate-pulse border-b border-gray-50 last:border-0"
                />
              ))
          ) : filteredDiaries.length === 0 ? (
            <div className="p-10 text-center text-gray-400 italic text-sm">Chưa có nhật ký nào</div>
          ) : (
            filteredDiaries.map((diary) => (
              <div
                key={diary.id}
                onClick={() => {
                  setSelectedDiary(diary);
                  setShowDetail(true);
                }}
                className="p-4 border-b border-gray-50 last:border-0 flex items-center justify-between group active:bg-gray-50"
              >
                <div className="space-y-1 min-w-0">
                  <p className="text-xs font-bold text-gray-600">{formatDate(diary.date)}</p>
                  <p className="text-[10px] text-gray-400 font-bold uppercase truncate">
                    {(diary as any).warehouses?.name}
                  </p>
                  <p className="text-[11px] text-gray-600 line-clamp-1">{diary.work_progress}</p>
                </div>
                <div className="flex items-center gap-3">
                  {diary.image_urls && diary.image_urls.length > 0 && (
                    <div className="text-gray-300">
                      <ImageIcon size={14} />
                    </div>
                  )}
                  <ChevronRight
                    size={16}
                    className="text-gray-300 group-hover:text-primary transition-colors"
                  />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop View - Professional Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-primary text-white">
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest border-r border-white/10">
                  Ngày
                </th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest border-r border-white/10">
                  Địa điểm / Dự án
                </th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest border-r border-white/10">
                  Nhân sự chính
                </th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest border-r border-white/10">
                  Diễn biến thi công
                </th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-center">
                  Ảnh
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array(6)
                  .fill(0)
                  .map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array(5)
                        .fill(0)
                        .map((_, j) => (
                          <td key={j} className="px-6 py-4">
                            <div className="h-4 bg-gray-100 rounded-lg" />
                          </td>
                        ))}
                    </tr>
                  ))
              ) : filteredDiaries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center text-gray-400 italic">
                    Chưa có nhật ký nào được ghi nhận
                  </td>
                </tr>
              ) : (
                filteredDiaries.map((diary) => (
                  <tr
                    key={diary.id}
                    onClick={() => {
                      setSelectedDiary(diary);
                      setShowDetail(true);
                    }}
                    className="hover:bg-gray-50 transition-colors cursor-pointer group"
                  >
                    <td className="px-6 py-4 text-[11px] font-bold text-gray-600">
                      {formatDate(diary.date)}
                    </td>
                    <td className="px-6 py-4 text-xs font-black text-gray-800 uppercase tracking-tight">
                      {(diary as any).warehouses?.name}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-600 italic truncate max-w-[200px]">
                      {diary.labor_info || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-xs text-gray-600 truncate max-w-[350px]">
                        {diary.work_progress}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {diary.image_urls && diary.image_urls.length > 0 ? (
                          <div className="relative group/img">
                            <div className="p-1.5 bg-gray-50 rounded-lg text-primary border border-gray-100 group-hover/img:bg-primary group-hover/img:text-white transition-all">
                              <ImageIcon size={14} />
                            </div>
                            <span className="absolute -top-2 -right-2 bg-red-500 text-[8px] font-black text-white px-1 py-0.5 rounded-full ring-2 ring-white">
                              {diary.image_urls.length}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-gray-300 font-bold uppercase tracking-tight">
                            Ko có
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* FAB - Nhật ký mới */}
      <FAB
        onClick={() => {
          const newForm = { ...initialFormState, diary_code: generateCode() };
          setFormData(newForm);
          setShowAddNew(true);
        }}
        icon={Plus}
        label="Nhật ký mới"
        color="bg-primary"
      />

      {/* Detail Modal */}
      <AnimatePresence>
        {showDetail && selectedDiary && (
          <div
            className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowDetail(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 30 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90dvh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-primary p-6 text-white flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center shadow-lg">
                    <ClipboardList size={28} />
                  </div>
                  <div>
                    <h3 className="font-black text-xl leading-tight">Chi tiết Nhật ký</h3>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">
                      {formatDate(selectedDiary.date)}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(selectedDiary)}
                    className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors"
                    title="Sửa nhật ký"
                  >
                    <Edit size={20} />
                  </button>
                  <button
                    onClick={() => setShowDetail(false)}
                    className="p-2 hover:bg-white/20 rounded-xl transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="p-8 overflow-y-auto custom-scrollbar space-y-8 bg-white">
                {/* Summary Info Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="bg-gray-50/50 p-5 rounded-3xl border border-gray-100 flex items-center gap-4">
                    <div className="p-3 bg-blue-500/10 text-blue-600 rounded-2xl">
                      <Cloud size={20} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase leading-none mb-1">
                        Thời tiết
                      </p>
                      <p className="text-sm font-black text-gray-800">
                        {WEATHER_OPTIONS.find((w) => w.value === selectedDiary.weather)?.label}
                        {selectedDiary.temperature && ` - ${selectedDiary.temperature}°C`}
                      </p>
                    </div>
                  </div>
                  <div className="bg-gray-50/50 p-5 rounded-3xl border border-gray-100 flex items-center gap-4 lg:col-span-2">
                    <div className="p-3 bg-indigo-500/10 text-indigo-600 rounded-2xl">
                      <MapPin size={20} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase leading-none mb-1">
                        Địa điểm / Dự án
                      </p>
                      <p className="text-sm font-black text-gray-800 uppercase">
                        {(selectedDiary as any).warehouses?.name}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-8">
                  <section className="space-y-3">
                    <div className="flex items-center gap-3 ml-2">
                      <Users size={16} className="text-primary" />
                      <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                        Nhân sự & Tổ đội công trường
                      </h4>
                    </div>
                    <div className="bg-gray-50/50 p-6 rounded-3xl border border-gray-100 text-sm text-gray-700 font-medium leading-relaxed whitespace-pre-wrap">
                      {selectedDiary.labor_info || 'Không có ghi nhận đặc biệt'}
                    </div>
                  </section>

                  <section className="space-y-3">
                    <div className="flex items-center gap-3 ml-2">
                      <Settings2 size={16} className="text-amber-500" />
                      <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                        Máy móc thiết bị hoạt động
                      </h4>
                    </div>
                    <div className="bg-gray-50/50 p-6 rounded-3xl border border-gray-100 text-sm text-gray-700 font-medium leading-relaxed whitespace-pre-wrap">
                      {selectedDiary.equipment_info || 'Trống'}
                    </div>
                  </section>

                  <section className="space-y-3">
                    <div className="flex items-center gap-3 ml-2">
                      <ClipboardList size={16} className="text-indigo-500" />
                      <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                        Diễn biến và Nội dung thi công
                      </h4>
                    </div>
                    <div className="bg-primary/5 p-6 rounded-3xl border border-primary/10 text-sm text-gray-800 font-black leading-relaxed whitespace-pre-wrap shadow-inner shadow-primary/5">
                      {selectedDiary.work_progress}
                    </div>
                  </section>

                  <section className="space-y-3 text-red-600">
                    <div className="flex items-center gap-3 ml-2">
                      <AlertCircle size={16} />
                      <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                        Vấn đề chất lượng / An toàn
                      </h4>
                    </div>
                    <div className="bg-red-50/30 p-6 rounded-3xl border border-red-50 text-sm text-red-800 font-medium leading-relaxed whitespace-pre-wrap">
                      {selectedDiary.quality_issues || 'Mọi thứ đều ổn định'}
                    </div>
                  </section>

                  <section className="space-y-3 text-green-700">
                    <div className="flex items-center gap-3 ml-2">
                      <MessageSquare size={16} />
                      <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                        Ý kiến Giám sát / Ban QLDA
                      </h4>
                    </div>
                    <div className="bg-green-50/30 p-6 rounded-3xl border border-green-50 text-sm text-green-900 font-medium italic leading-relaxed whitespace-pre-wrap">
                      {selectedDiary.supervision_comments || 'Chưa có nhận xét'}
                    </div>
                  </section>

                  {(selectedDiary.image_urls?.length || 0) > 0 && (
                    <section className="space-y-4">
                      <div className="flex items-center justify-between ml-2">
                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                          Hình ảnh minh chứng ({selectedDiary.image_urls?.length})
                        </h4>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        {selectedDiary.image_urls?.map((url, i) => (
                          <motion.div
                            whileHover={{ scale: 1.02 }}
                            key={i}
                            className="rounded-3xl overflow-hidden shadow-lg border-4 border-white"
                          >
                            <img
                              src={url}
                              alt="Site work"
                              className="w-full aspect-video object-cover"
                            />
                          </motion.div>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              </div>

              <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 flex-shrink-0">
                <Button
                  variant="danger"
                  variantType="outline"
                  icon={Trash2}
                  onClick={() => {
                    setShowDetail(false);
                    setDeletingId(selectedDiary.id);
                  }}
                >
                  Xóa nhật ký
                </Button>
                <Button variant="primary" onClick={() => setShowDetail(false)}>
                  Đóng
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add/Edit Modal (Sync with other features) */}
      <AnimatePresence>
        {showAddNew && (
          <div
            className="fixed inset-0 z-[160] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-md overflow-hidden no-print"
            onClick={() => {
              setShowAddNew(false);
              setEditingId(null);
              resetForm();
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 30 }}
              className="bg-white rounded-[1.5rem] md:rounded-[2.5rem] shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[96dvh] md:max-h-[90dvh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-primary p-4 sm:p-6 text-white flex items-center justify-between flex-shrink-0 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/20 rounded-2xl flex items-center justify-center shadow-lg">
                    {editingId ? <Edit size={24} /> : <Plus size={24} />}
                  </div>
                  <div>
                    <h3 className="font-black text-lg sm:text-xl leading-tight">
                      {editingId ? 'Sửa Nhật ký' : 'Nhật ký Thi công Mới'}
                    </h3>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">
                      Mẫu hồ sơ xây dựng điện tử
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowAddNew(false);
                    setEditingId(null);
                    resetForm();
                  }}
                  className="p-2 hover:bg-white/20 rounded-xl transition-all"
                >
                  <X size={20} className="sm:w-6 sm:h-6" />
                </button>
              </div>

              <div className="p-4 sm:p-8 overflow-y-auto custom-scrollbar space-y-8 bg-gray-50/50 flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                      Ngày nhật ký *
                    </label>
                    <input
                      type="date"
                      className="w-full px-5 py-3.5 rounded-2xl border border-gray-100 bg-white focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none text-sm font-bold shadow-sm"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Dự án thi công / Địa điểm *
                  </label>
                  <select
                    className="w-full px-5 py-3.5 rounded-2xl border border-gray-100 bg-white focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none text-sm font-bold shadow-sm"
                    value={formData.warehouse_id}
                    onChange={(e) => setFormData({ ...formData, warehouse_id: e.target.value })}
                  >
                    <option value="">-- Chọn công trình / địa điểm --</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                      Thời tiết hiện tại
                    </label>
                    <select
                      className="w-full px-5 py-3.5 rounded-2xl border border-gray-100 bg-white focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none text-sm font-bold shadow-sm"
                      value={formData.weather}
                      onChange={(e) => setFormData({ ...formData, weather: e.target.value })}
                    >
                      {WEATHER_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                      Nhiệt độ trung bình (°C)
                    </label>
                    <input
                      type="number"
                      placeholder="Nhập nhiệt độ..."
                      className="w-full px-5 py-3.5 rounded-2xl border border-gray-100 bg-white focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none text-sm font-bold shadow-sm"
                      value={formData.temperature}
                      onChange={(e) => setFormData({ ...formData, temperature: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                      Nhân sự & Tổ đội công trường
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Số lượng công nhân, kỹ thuật, các đội thầu phụ..."
                      className="w-full px-5 py-4 rounded-3xl border border-gray-100 bg-white focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none text-sm font-medium shadow-sm resize-none"
                      value={formData.labor_info}
                      onChange={(e) => setFormData({ ...formData, labor_info: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                      Máy móc hoạt động
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Các loại máy thi công, trạng thái hoạt động..."
                      className="w-full px-5 py-4 rounded-3xl border border-gray-100 bg-white focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none text-sm font-medium shadow-sm resize-none"
                      value={formData.equipment_info}
                      onChange={(e) => setFormData({ ...formData, equipment_info: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1 flex items-center gap-2">
                    Tiến độ & Diễn biến thi công chính
                  </label>
                  <textarea
                    rows={6}
                    placeholder="Ghi nhận chi tiết tất cả hạng mục đã thực hiện trong ngày hôm nay..."
                    className="w-full px-6 py-5 rounded-[2rem] border-2 border-primary/10 bg-white focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none text-sm font-black text-gray-900 shadow-sm resize-none leading-relaxed transition-all"
                    value={formData.work_progress}
                    onChange={(e) => setFormData({ ...formData, work_progress: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-red-500 uppercase tracking-widest ml-1">
                      Vấn đề chất lượng / An toàn
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Các lỗi thi công, sự cố an toàn (nếu có)..."
                      className="w-full px-5 py-4 rounded-3xl border border-red-100 bg-white focus:ring-4 focus:ring-red-100 focus:border-red-400 outline-none text-sm font-medium shadow-sm resize-none"
                      value={formData.quality_issues}
                      onChange={(e) => setFormData({ ...formData, quality_issues: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-green-600 uppercase tracking-widest ml-1">
                      Ghi nhận của Giám sát
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Phát đạo, chỉ đạo hoặc các thay đổi thiết kế..."
                      className="w-full px-5 py-4 rounded-3xl border border-green-100 bg-white focus:ring-4 focus:ring-green-100 focus:border-green-400 outline-none text-sm font-medium shadow-sm italic resize-none"
                      value={formData.supervision_comments}
                      onChange={(e) =>
                        setFormData({ ...formData, supervision_comments: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100">
                  <ImageCapture
                    existingImages={formData.image_urls}
                    onUpload={(urls) => setFormData({ ...formData, image_urls: urls })}
                    label="Ảnh chụp hiện trường & Hồ sơ"
                    maxImages={10}
                  />
                </div>
              </div>

              <div className="p-8 bg-white border-t border-gray-100 flex gap-4 flex-shrink-0 shadow-2xl">
                <Button
                  variant="outline"
                  fullWidth
                  onClick={() => {
                    setShowAddNew(false);
                    setEditingId(null);
                    resetForm();
                  }}
                >
                  Huỷ bỏ
                </Button>
                <Button
                  variant="primary"
                  fullWidth
                  onClick={handleSave}
                  className="shadow-lg shadow-primary/20"
                >
                  {editingId ? 'Cập nhật bản ghi' : 'Xác nhận Lưu Nhật ký'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmModal
        show={!!deletingId}
        title="Xóa nhật ký này?"
        message="Hành động này sẽ xóa vĩnh viễn bản ghi nhật ký. Hãy chắc chắn bạn đã sao lưu dữ liệu này."
        onConfirm={handleDelete}
        onCancel={() => setDeletingId(null)}
      />
      <FAB onClick={handleAddNew} label="Viết nhật ký" />

      {/* Hidden Report Template (A4 Landscape) */}
      <div className="fixed -left-[4000px] -top-[4000px] no-print">
        <div
          ref={reportRef}
          className="bg-white p-12 w-[1123px] min-h-[794px] font-sans text-gray-900 border"
          style={{ width: '1123px' }}
        >
          {/* Company Header */}
          <div className="flex justify-between items-start mb-10 pb-6 border-b-2 border-indigo-200">
            <div className="flex items-center gap-6">
              <div className="bg-indigo-50 p-4 rounded-3xl border border-indigo-100">
                <CanvasLogo size={96} className="w-24 h-24 rounded-3xl object-contain shadow-sm" />
              </div>
              <div className="space-y-1">
                <h1 className="text-3xl font-black text-indigo-600 tracking-tighter uppercase italic">
                  CDX ERP SYSTEM
                </h1>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.3em]">
                  Smart Construction Management • 2026 Edition
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-indigo-100 italic">
                    Construction Diary Log
                  </span>
                  <span className="w-1.5 h-1.5 bg-gray-200 rounded-full" />
                  <span className="text-[10px] text-gray-500 font-bold italic tracking-wide">
                    Ref ID: DIARY_POOL_{new Date().getTime().toString(36).toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-3xl font-black text-gray-900 uppercase tracking-tighter mb-1">
                Tổng Hợp Nhật Ký Thi Công
              </h2>
              <p className="text-xs text-gray-500 font-bold italic">
                Thời gian xuất: {new Date().toLocaleString('vi-VN')}
              </p>
              <div className="mt-4 flex flex-col items-end gap-1">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest font-mono">
                  STATUS: FIELD_AUDITED
                </p>
                <div className="h-0.5 w-12 bg-indigo-200 rounded-full" />
              </div>
            </div>
          </div>

          {/* Table */}
          <table className="w-full text-left border-collapse rounded-3xl overflow-hidden shadow-sm border border-gray-100">
            <thead>
              <tr className="bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest italic">
                <th className="px-4 py-4 border-r border-white/10">Ngày</th>
                <th className="px-4 py-4 border-r border-white/10">Địa điểm / Dự án</th>
                <th className="px-4 py-4 border-r border-white/10">Nhân sự chính</th>
                <th className="px-4 py-4 border-r border-white/10">Diễn biến thi công</th>
                <th className="px-4 py-4 text-center">Ảnh</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-[11px]">
              {filteredDiaries.map((diary, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-indigo-50/10'}>
                  <td className="px-4 py-3 font-bold text-gray-600">{formatDate(diary.date)}</td>
                  <td className="px-4 py-3 font-black text-gray-900 uppercase tracking-tight">
                    {(diary as any).warehouses?.name}
                  </td>
                  <td className="px-4 py-3 text-gray-600 italic font-medium">
                    {diary.labor_info || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-800 leading-relaxed max-w-[400px] break-words">
                    {diary.work_progress}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {diary.image_urls && diary.image_urls.length > 0 ? (
                      <span className="px-2 py-0.5 bg-indigo-100 text-indigo-600 rounded-full font-black tracking-widest uppercase">
                        {diary.image_urls.length} PIC
                      </span>
                    ) : (
                      <span className="text-gray-300 font-bold uppercase tracking-widest">
                        NONE
                      </span>
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
                End of construction log report • Safety & Quality First
              </p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-black text-gray-300 uppercase tracking-[0.3em] mb-1">
                Operational Protocol Verified
              </p>
              <div className="text-[10px] text-gray-400 font-bold bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
                Log Integrity:{' '}
                <span className="text-indigo-500 font-black tracking-widest italic ml-1 underline">
                  {new Date().getTime().toString(16).toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
