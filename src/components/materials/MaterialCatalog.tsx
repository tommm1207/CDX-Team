import { CanvasLogo } from '@/components/shared';
import { exportTableImage } from '../../utils/reportExport';
import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import {
  Package,
  Plus,
  Search,
  Edit,
  Trash2,
  X,
  Image as ImageIcon,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Image as LucideImageIcon,
  Share2,
} from 'lucide-react';
import { useRef } from 'react';

import { SaveImageButton } from '@/components/shared';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '@/lib/supabase';
import { Employee } from '@/types';
import { PageBreadcrumb } from '@/components/shared';
import { isActiveWarehouse, generateNextGroupCode } from '@/utils/inventory';
import { isUUID } from '@/utils/helpers';
import { CreatableSelect } from '@/components/shared';
import { ImageCapture } from '@/components/shared';
import { ToastType } from '@/components/shared';
import { Button } from '@/components/shared';
import { FAB } from '@/components/shared';
import { ExcelButton } from '@/components/shared';
import { SortButton, SortOption } from '@/components/shared';
import { checkUsage } from '@/utils/dataIntegrity';
import { generateSmartCode } from '@/utils/codeGenerator';
import { toLocalISODate } from '@/utils/format';

export const MaterialCatalog = ({
  user,
  onBack,
  onNavigate,
  addToast,
}: {
  user: Employee;
  onBack?: () => void;
  onNavigate?: (page: string) => void;
  addToast?: (message: string, type?: ToastType) => void;
}) => {
  const [materials, setMaterials] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>(
    (localStorage.getItem(`sort_pref_mat_catalog_${user.id}`) as SortOption) || 'newest',
  );

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [usageInfo, setUsageInfo] = useState<any>({ inUse: false, details: [] });
  const [isCapturingTable, setIsCapturingTable] = useState(false);

  const reportRef = useRef<HTMLDivElement>(null);

  const initialFormState = {
    id: '',
    code: '',
    name: '',
    group_id: '',
    specification: '',
    unit: '',
    description: '',
    image_url: '',
  };

  const [formData, setFormData] = useState(initialFormState);

  useEffect(() => {
    fetchMaterials();
    fetchGroups();
    fetchWarehouses();
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

  const handleExportExcel = () => {
    import('@/utils/excelExport').then(({ exportToExcel }) => {
      exportToExcel({
        title: 'Danh mục Vật tư',
        sheetName: 'Danh mục vật tư',
        columns: ['Mã vật tư', 'Tên vật tư', 'Nhóm', 'ĐVT', 'Quy cách', 'Ghi chú'],
        rows: filteredMaterials.map((it) => [
          it.code,
          it.name,
          it.group_name ?? '',
          it.unit ?? '',
          it.specification ?? '',
          it.notes ?? '',
        ]),
        fileName: `CDX_DanhMucVatTu_${toLocalISODate()}.xlsx`,
        addToast,
      });
    });
  };

  const fetchMaterials = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('materials')
        .select('*, material_groups(name)')
        .or('status.is.null,status.neq.Đã xóa')
        .order('name', { ascending: true });

      if (error) {
        throw error;
      } else {
        setMaterials(data || []);
      }
    } catch (err: any) {
      console.error('Error fetching materials:', err);
      if (addToast) addToast('Lỗi tải danh mục vật tư: ' + err.message, 'error');
      else alert('Lỗi tải danh mục vật tư: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const generateNextMaterialCode = async () => {
    try {
      const { data } = await supabase.from('materials').select('code').like('code', 'VT%');
      const codes = data?.map((m) => m.code) || [];
      return generateSmartCode(codes, 'VT', 3);
    } catch (err) {
      console.error('Error generating material code:', err);
      return 'VT001';
    }
  };

  const fetchGroups = async () => {
    const { data } = await supabase.from('material_groups').select('*').order('name');
    if (data) setGroups(data);
  };

  const fetchWarehouses = async () => {
    const { data } = await supabase
      .from('warehouses')
      .select('*')
      .or('status.is.null,status.neq.Đã xóa')
      .order('name');
    if (data) {
      setWarehouses(data.filter(isActiveWarehouse));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      let finalGroupId = formData.group_id;
      if (formData.group_id && !isUUID(formData.group_id)) {
        const groupByName = groups.find(
          (g) => g.name.toLowerCase() === formData.group_id.toLowerCase(),
        );
        if (groupByName) {
          finalGroupId = groupByName.id;
        } else {
          const generatedGroupCode = await generateNextGroupCode();
          const { data: newGroup, error: groupErr } = await supabase
            .from('material_groups')
            .insert([{ name: formData.group_id, code: generatedGroupCode }])
            .select();
          if (groupErr) throw groupErr;
          if (newGroup) {
            finalGroupId = newGroup[0].id;
            fetchGroups();
          }
        }
      }

      let finalWarehouseId = formData.warehouse_id;
      if (formData.warehouse_id && !isUUID(formData.warehouse_id)) {
        const whByName = warehouses.find(
          (w) => w.name.toLowerCase() === formData.warehouse_id.toLowerCase(),
        );
        if (whByName) {
          finalWarehouseId = whByName.id;
        } else {
          const random = Math.floor(100 + Math.random() * 900);
          const code = `K${(warehouses.length + 1).toString().padStart(2, '0')}-${random}`;
          const { data: newWh, error: whErr } = await supabase
            .from('warehouses')
            .insert([{ name: formData.warehouse_id, code }])
            .select();
          if (whErr) throw whErr;
          if (newWh) {
            finalWarehouseId = newWh[0].id;
            fetchWarehouses();
          }
        }
      }

      const dbPayload = {
        code: formData.code,
        name: formData.name,
        group_id: finalGroupId || null,
        warehouse_id: finalWarehouseId || null,
        specification: formData.specification,
        unit: formData.unit,
        description: formData.description,
        image_url: formData.image_url,
      };

      if (isEditing && formData.id) {
        const { error } = await supabase.from('materials').update(dbPayload).eq('id', formData.id);
        if (error) throw error;
      } else {
        dbPayload.code = formData.code || (await generateNextMaterialCode());
        const { error } = await supabase.from('materials').insert([dbPayload]);
        if (error) throw error;
      }
      setShowModal(false);
      fetchMaterials();
      setFormData(initialFormState);
      if (addToast)
        addToast(
          isEditing ? 'Cập nhật vật tư thành công!' : 'Thêm mới vật tư thành công!',
          'success',
        );
    } catch (err: any) {
      if (addToast) addToast('Lỗi: ' + err.message, 'error');
      else alert('Lỗi: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const [editingInUse, setEditingInUse] = useState(false);

  const handleEdit = async (item: any) => {
    const usage = await checkUsage('material', item.id);
    setEditingInUse(usage.inUse);
    if (usage.inUse && addToast) {
      addToast(`Vật tư đã phát sinh giao dịch — mã vật tư đã được khóa cố định.`, 'info');
    }
    setFormData(item);
    setIsEditing(true);
    setShowModal(true);
  };

  const handleDeleteClick = async (id: string) => {
    setItemToDelete(id);
    setShowDeleteModal(true);
    try {
      const usage = await checkUsage('material', id);
      setUsageInfo(usage);
    } catch (err) {
      console.error(err);
    }
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    setSubmitting(true);
    try {
      // Always allow moving to Trash (soft delete)

      const { error } = await supabase
        .from('materials')
        .update({ status: 'Đã xóa' })
        .eq('id', itemToDelete);
      if (error) throw error;
      fetchMaterials();
      if (addToast) addToast('Đã chuyển vật tư vào thùng rác!', 'success');
      setShowDeleteModal(false);
    } catch (err: any) {
      if (addToast) addToast('Lỗi: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePurgeRelated = async () => {
    if (!itemToDelete || user.role !== 'Develop' || !usageInfo.details) return;
    if (!window.confirm('CẢNH BÁO: Hành động này sẽ xóa VĨNH VIỄN vật tư này. Bạn có chắc chắn?'))
      return;

    setSubmitting(true);
    try {
      const { error } = await supabase.from('materials').delete().eq('id', itemToDelete);
      if (error) throw error;
      if (addToast) addToast('Đã xóa vĩnh viễn vật tư', 'success');
      fetchMaterials();
      setShowDeleteModal(false);
    } catch (err: any) {
      if (addToast) addToast('Lỗi xóa vĩnh viễn: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredMaterials = materials
    .filter((m) => {
      const name = m.name || '';
      const code = m.code || '';
      const matchesSearch =
        name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        code.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesGroup = groupFilter === '' || m.group_id === groupFilter;
      return matchesSearch && matchesGroup;
    })
    .sort((a, b) => {
      if (sortBy === 'newest')
        return new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime();
      if (sortBy === 'code') return (a.code || '').localeCompare(b.code || '');
      return 0;
    });

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24">
      <div className="flex items-center justify-between gap-2 mb-4">
        <PageBreadcrumb title="Danh mục vật tư" onBack={onBack} />
        <div className="flex items-center gap-1.5 justify-end flex-1 flex-shrink-0">
          <SaveImageButton
            onClick={handleSaveTableImage}
            isCapturing={isCapturingTable}
            title="Lưu ảnh danh mục vật tư"
          />
          <ExcelButton onClick={handleExportExcel} size="icon" />
          <SortButton
            currentSort={sortBy}
            onSortChange={(val) => {
              setSortBy(val);
              localStorage.setItem(`sort_pref_mat_catalog_${user.id}`, val);
            }}
            options={[
              { value: 'code', label: 'Mã hiệu' },
              { value: 'newest', label: 'Mới nhất' },
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

      <AnimatePresence>
        {showFilter && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: showFilter ? 'visible' : 'hidden' }}
          >
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase">Nhóm vật tư</label>
                <select
                  value={groupFilter}
                  onChange={(e) => setGroupFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">-- Tất cả nhóm --</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2 space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase">
                  Tìm kiếm nhanh
                </label>
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="text"
                    placeholder="Tìm theo tên hoặc mã vật tư..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-xs outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
              <div className="flex items-end">
                <Button
                  variant="ghost"
                  icon={RefreshCw}
                  onClick={fetchMaterials}
                  fullWidth
                  className="bg-gray-100 text-gray-600 hover:bg-gray-200"
                >
                  Làm mới dữ liệu
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-primary text-white">
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider border-r border-white/10">
                  Tên vật tư
                </th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider border-r border-white/10">
                  Nhóm
                </th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider border-r border-white/10">
                  Quy cách
                </th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider border-r border-white/10">
                  ĐVT
                </th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-center w-24">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400 italic">
                    Đang tải dữ liệu...
                  </td>
                </tr>
              ) : filteredMaterials.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400 italic">
                    Không tìm thấy vật tư nào
                  </td>
                </tr>
              ) : (
                filteredMaterials.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-gray-50 transition-colors group cursor-pointer"
                    onClick={() => {
                      setSelectedMaterial(item);
                      setShowDetailModal(true);
                    }}
                  >
                    <td className="px-4 py-3 text-xs text-gray-600 font-medium">
                      <div className="flex items-center gap-2">
                        {item.image_url && (
                          <div className="w-6 h-6 rounded bg-gray-100 overflow-hidden flex-shrink-0">
                            <img
                              src={item.image_url}
                              alt=""
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        )}
                        {item.name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {item.material_groups?.name || '-'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{item.specification || '-'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{item.unit || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(item);
                          }}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClick(item.id);
                          }}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
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
              <div className="text-sm text-gray-500 mb-6 text-left bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-2">
                <p>
                  Vật tư:{' '}
                  <strong className="text-primary uppercase">
                    {materials.find((m) => m.id === itemToDelete)?.code ||
                      itemToDelete?.slice(0, 8)}
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
                  <Button fullWidth variant="danger" onClick={confirmDelete} isLoading={submitting}>
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
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md overflow-hidden"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden relative z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-primary p-6 text-white flex items-center justify-between rounded-t-[2rem] md:rounded-t-[2.5rem] flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div
                    className="p-2 bg-white/20 rounded-xl cursor-pointer hover:bg-white/30 transition-all active:scale-95"
                    onClick={() => setShowModal(false)}
                  >
                    <Package size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">
                      {isEditing ? 'Cập nhật vật tư' : 'Thêm vật tư mới'}
                    </h3>
                    <p className="text-xs text-white/70">Thông tin chi tiết vật tư hệ thống</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 hover:bg-white/20 rounded-xl transition-all"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <form onSubmit={handleSubmit} className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* 1. NHÓM — chọn đầu tiên để sinh mã */}
                    <div className="md:col-span-2">
                      <CreatableSelect
                        label={`Nhóm vật tư *`}
                        value={formData.group_id}
                        options={groups}
                        onChange={async (val) => {
                          let nextCode = formData.code;
                          if (!isEditing && val && isUUID(val)) {
                            nextCode = await generateNextMaterialCode();
                          }
                          setFormData({ ...formData, group_id: val, code: nextCode });
                        }}
                        onCreate={async (val) => {
                          const existing = groups.find(
                            (g) => g.name.toLowerCase() === val.toLowerCase(),
                          );
                          if (existing) {
                            const nextCode = await generateNextMaterialCode();
                            setFormData({
                              ...formData,
                              group_id: existing.id,
                              code: isEditing ? formData.code : nextCode,
                            });
                            return;
                          }
                          const generatedCode = await generateNextGroupCode();
                          const { data: newGroup, error } = await supabase
                            .from('material_groups')
                            .insert([{ name: val, code: generatedCode }])
                            .select()
                            .single();
                          if (error || !newGroup) return;
                          fetchGroups();
                          const nextCode = isEditing
                            ? formData.code
                            : await generateNextMaterialCode();
                          setFormData({ ...formData, group_id: newGroup.id, code: nextCode });
                        }}
                        placeholder="Chọn nhóm trước để sinh mã tự động..."
                        required
                      />
                    </div>

                    {/* 2. MÃ — hiện sau khi chọn nhóm */}
                    <div className="md:col-span-2 hidden">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                        Mã tham chiếu (Vật tư)
                      </label>
                      <div className="bg-primary/5 px-5 py-3.5 rounded-2xl border border-primary/10 text-sm font-black text-primary uppercase shadow-inner italic">
                        {formData.code ||
                          (formData.group_id ? 'Đang tính...' : '← Chọn nhóm vật tư trước')}
                      </div>
                    </div>

                    {/* 3. Left column: Tên */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Tên vật tư *
                      </label>
                      <input
                        required
                        type="text"
                        placeholder="Ví dụ: Tôn kẽm 0.4mm"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>

                    {/* 3. Right column: Đơn vị tính */}
                    <div>
                      <CreatableSelect
                        label={`Đơn vị tính`}
                        value={formData.unit}
                        options={Array.from(new Set(materials.map((m) => m.unit)))
                          .filter(Boolean)
                          .map((u: any) => ({ id: String(u), name: String(u) }))}
                        onChange={(val) => setFormData({ ...formData, unit: val })}
                        onCreate={(val) => setFormData({ ...formData, unit: val })}
                        placeholder="Chọn hoặc nhập mới..."
                      />
                    </div>

                    {/* 4. Left column: Quy cách */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Quy cách / Kích thước
                      </label>
                      <input
                        type="text"
                        placeholder="Ví dụ: 1200mm x 2400mm"
                        value={formData.specification}
                        onChange={(e) =>
                          setFormData({ ...formData, specification: e.target.value })
                        }
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>

                    {/* 4. Right column: Mô tả */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Mô tả chi tiết
                      </label>
                      <textarea
                        rows={3}
                        placeholder="Thông tin thêm về vật tư..."
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                      />
                    </div>

                    {/* 5. Ảnh */}
                    <div className="col-span-1 md:col-span-2 space-y-4 pt-4 border-t border-gray-100">
                      <ImageCapture
                        maxImages={1}
                        existingImages={formData.image_url ? [formData.image_url] : []}
                        onUpload={(urls) => setFormData({ ...formData, image_url: urls[0] || '' })}
                        label="Hình ảnh vật tư"
                      />
                    </div>
                  </div>

                  <div className="mt-8 flex justify-end gap-3 pt-6 border-t border-gray-100 flex-shrink-0">
                    <Button variant="outline" onClick={() => setShowModal(false)}>
                      Hủy
                    </Button>
                    <Button type="submit" isLoading={submitting} className="min-w-[140px]">
                      Lưu dữ liệu
                    </Button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDetailModal && selectedMaterial && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md overflow-hidden"
            onClick={() => setShowDetailModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden relative z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-primary p-6 text-white flex items-center justify-between rounded-t-[2rem] md:rounded-t-[2.5rem] flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div
                    className="p-2 bg-white/20 rounded-xl cursor-pointer hover:bg-white/30 transition-all active:scale-95"
                    onClick={() => setShowDetailModal(false)}
                  >
                    <Package size={24} />
                  </div>
                  <h3 className="text-xl font-bold uppercase tracking-widest">Chi tiết vật tư</h3>
                </div>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="p-2 hover:bg-white/20 rounded-xl transition-all"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-8 space-y-8 overflow-y-auto flex-1">
                <div className="flex flex-col md:flex-row gap-8">
                  <div className="w-full md:w-48 h-48 rounded-2xl bg-gray-50 border border-gray-100 overflow-hidden flex-shrink-0">
                    {selectedMaterial.image_url ? (
                      <img
                        src={selectedMaterial.image_url}
                        alt={selectedMaterial.name}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 gap-2">
                        <ImageIcon size={48} />
                        <span className="text-[10px] font-bold uppercase">Không có ảnh</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 grid grid-cols-2 gap-6">
                    <div className="space-y-1 hidden"></div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Tên vật tư
                      </label>
                      <p className="text-sm font-bold text-gray-800 border-b border-gray-100 pb-2">
                        {selectedMaterial.name}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Nhóm vật tư
                      </label>
                      <p className="text-sm font-bold text-gray-800 border-b border-gray-100 pb-2">
                        {selectedMaterial.material_groups?.name || '-'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Kho lưu trữ
                      </label>
                      <p className="text-sm font-bold text-gray-800 border-b border-gray-100 pb-2">
                        {selectedMaterial.warehouses?.name || '-'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Đơn vị tính
                      </label>
                      <p className="text-sm font-bold text-gray-800 border-b border-gray-100 pb-2">
                        {selectedMaterial.unit || '-'}
                      </p>
                    </div>
                    <div className="col-span-2 space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Quy cách / Kích thước
                      </label>
                      <p className="text-sm font-bold text-gray-800 border-b border-gray-100 pb-2">
                        {selectedMaterial.specification || '-'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">
                    Mô tả chi tiết
                  </label>
                  <div className="p-4 bg-gray-50 rounded-xl text-sm text-gray-600 italic">
                    {selectedMaterial.description || 'Chưa có mô tả cho vật tư này.'}
                  </div>
                </div>
              </div>

              <div className="p-6 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                <Button
                  variant="danger"
                  icon={Trash2}
                  onClick={() => {
                    setShowDetailModal(false);
                    handleDeleteClick(selectedMaterial.id);
                  }}
                >
                  Xóa
                </Button>
                <div className="flex gap-3">
                  <Button
                    variant="warning"
                    icon={Edit}
                    onClick={() => {
                      setShowDetailModal(false);
                      handleEdit(selectedMaterial);
                    }}
                  >
                    Sửa
                  </Button>
                  <Button variant="outline" icon={X} onClick={() => setShowDetailModal(false)}>
                    Đóng
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* FAB — Thêm vật tư */}
      <FAB
        onClick={() => {
          setIsEditing(false);
          setFormData(initialFormState);
          setShowModal(true);
        }}
        label="Thêm vật tư"
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
                  <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-100 italic">
                    Inventory Assets Database
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
                Danh Mục Vật Tư Hệ Thống
              </h2>
              <p className="text-xs text-gray-500 font-bold italic">
                Thời gian xuất: {new Date().toLocaleString('vi-VN')}
              </p>
              <div className="mt-4 flex flex-col items-end gap-1">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest font-mono">
                  STATUS: MASTER_CATALOG
                </p>
                <div className="h-0.5 w-12 bg-primary/20 rounded-full" />
              </div>
            </div>
          </div>

          {/* Table */}
          <table className="w-full text-left border-collapse rounded-3xl overflow-hidden shadow-sm border border-gray-100">
            <thead>
              <tr className="bg-gray-800 text-white">
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest italic border-r border-white/10 w-16 text-center">
                  STT
                </th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest italic border-r border-white/10">
                  Tên vật tư
                </th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest italic border-r border-white/10">
                  Nhóm vật tư
                </th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest italic border-r border-white/10">
                  Quy cách / Kích thước
                </th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest italic text-right">
                  Đơn vị
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs">
              {filteredMaterials.map((item, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}>
                  <td className="px-4 py-3 text-center text-gray-400 font-bold">{idx + 1}</td>
                  <td className="px-4 py-3 font-black text-gray-900 uppercase tracking-tight break-words max-w-[300px] whitespace-normal leading-relaxed">
                    {item.name}
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-bold uppercase tracking-tight">
                    {item.material_groups?.name || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-400 italic font-medium">
                    {item.specification || '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-black text-gray-900 uppercase italic tracking-widest bg-gray-100/30">
                    {item.unit || '—'}
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
                End of material catalog report • Integrated Data Asset Management
              </p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-black text-gray-300 uppercase tracking-[0.3em] mb-1">
                Database Integrity Chain
              </p>
              <div className="text-[10px] text-gray-400 font-bold bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
                Security Hash:{' '}
                <span className="text-primary font-black tracking-widest italic ml-1 underline">
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
