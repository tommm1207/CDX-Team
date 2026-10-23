import { CanvasLogo } from '@/components/shared';
import { exportTableImage } from '../../utils/reportExport';
import { useState, useEffect, FormEvent, MouseEvent, ChangeEvent } from 'react';
import {
  Layers,
  Plus,
  Search,
  Edit,
  Trash2,
  X,
  Package,
  Eye,
  Image as ImageIcon,
  SlidersHorizontal,
  AlertCircle,
  CheckCircle,
  Image as LucideImageIcon,
  Share2,
} from 'lucide-react';
import { useRef } from 'react';
import { toLocalISODate } from '@/utils/format';

import { SaveImageButton } from '@/components/shared';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '@/lib/supabase';
import { Employee } from '@/types';
import { PageBreadcrumb } from '@/components/shared';
import { isActiveWarehouse } from '@/utils/inventory';
import { ToastType } from '@/components/shared';
import { FAB } from '@/components/shared';
import { checkUsage } from '@/utils/dataIntegrity';
import { generateNextGroupCode, generateNextMaterialCode } from '@/utils/inventory';
import { ExcelButton } from '@/components/shared';
import { SortButton, SortOption } from '@/components/shared';
import { Button } from '@/components/shared';

export const MaterialGroups = ({
  user,
  onBack,
  addToast,
}: {
  user: Employee;
  onBack?: () => void;
  addToast?: (message: string, type?: ToastType) => void;
}) => {
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [showMaterialDetailModal, setShowMaterialDetailModal] = useState(false);

  const [groups, setGroups] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<any>(null);

  const [loading, setLoading] = useState(true);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingMaterial, setIsEditingMaterial] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>(
    (localStorage.getItem(`sort_pref_mat_groups_${user.id}`) as SortOption) || 'newest',
  );

  const [isCapturingTable, setIsCapturingTable] = useState(false);

  const reportRef = useRef<HTMLDivElement>(null);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [deleteType, setDeleteType] = useState<'group' | 'material'>('group');
  const [usageInfo, setUsageInfo] = useState<any>({ inUse: false, details: [] });

  const initialFormState = { id: '', code: '', name: '', notes: '' };
  const initialMaterialFormState = {
    id: '',
    name: '',
    group_id: '',
    warehouse_id: '',
    specification: '',
    unit: '',
    description: '',
    image_url: '',
    code: '',
  };

  const [formData, setFormData] = useState(initialFormState);
  const [materialFormData, setMaterialFormData] = useState(initialMaterialFormState);

  useEffect(() => {
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
        title: 'Nhóm Vật tư',
        sheetName: 'Nhóm vật tư',
        columns: ['Mã nhóm', 'Tên nhóm', 'Ghi chú'],
        rows: groups.map((it) => [it.code, it.name, it.notes ?? '']),
        fileName: `CDX_NhomVatTu_${toLocalISODate()}.xlsx`,
        addToast,
      });
    });
  };

  const fetchGroups = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('material_groups')
      .select('*')
      .or('status.is.null,status.neq.Đã xóa')
      .order('code', { ascending: true });
    if (data) setGroups(data);
    setLoading(false);
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

  const fetchMaterialsByGroup = async (groupId: string, groupObj?: any) => {
    setMaterialsLoading(true);
    setMaterials([]);

    try {
      const { data, error } = await supabase
        .from('materials')
        .select(`*, material_groups (name)`)
        .eq('group_id', groupId)
        .or('status.is.null,status.neq.Đã xóa')
        .order('created_at', { ascending: false });

      if (error) throw error;

      let finalMaterials = data || [];
      const groupName = groupObj?.name ?? selectedGroup?.name;

      if (finalMaterials.length === 0 && groupName) {
        const { data: allMats, error: allError } = await supabase
          .from('materials')
          .select(`*, material_groups (name)`)
          .or('status.is.null,status.neq.Đã xóa')
          .order('created_at', { ascending: false });

        if (!allError && allMats) {
          finalMaterials = allMats.filter((m) => {
            const matchesId = m.group_id === groupId;
            const matGroupName = m.material_groups?.name || '';
            const matchesName = matGroupName.toLowerCase() === groupName.toLowerCase();
            return matchesId || matchesName;
          });
        }
      }

      setMaterials(finalMaterials);
    } catch (err: any) {
      console.error('Error fetching materials:', err);
      if (addToast) addToast('Lỗi tải danh sách vật tư trong nhóm: ' + err.message, 'error');
    } finally {
      setMaterialsLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (isEditing) {
        const { error } = await supabase
          .from('material_groups')
          .update({
            name: formData.name,
            notes: formData.notes,
          })
          .eq('id', formData.id);
        if (error) throw error;
      } else {
        const generatedCode = await generateNextGroupCode();
        const { error } = await supabase.from('material_groups').insert([
          {
            code: generatedCode,
            name: formData.name,
            notes: formData.notes,
          },
        ]);
        if (error) throw error;
      }
      setShowModal(false);
      fetchGroups();
      setFormData(initialFormState);
      if (addToast)
        addToast(isEditing ? 'Cập nhật nhóm thành công!' : 'Thêm nhóm thành công!', 'success');
    } catch (err: any) {
      if (addToast) addToast('Lỗi: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMaterialSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // _inUse là cờ giao diện, material_groups là dữ liệu join — không phải cột của bảng
      const { id, _inUse, material_groups, ...rest } = materialFormData as any;
      const dataToSubmit = {
        ...rest,
        group_id: selectedGroup.id,
        warehouse_id: rest.warehouse_id || null, // cột uuid: chuỗi rỗng không hợp lệ
      };

      if (isEditingMaterial) {
        const { error } = await supabase.from('materials').update(dataToSubmit).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('materials').insert([dataToSubmit]);
        if (error) throw error;
      }
      setShowMaterialModal(false);
      fetchMaterialsByGroup(selectedGroup.id);
      setMaterialFormData(initialMaterialFormState);
      if (addToast)
        addToast(
          isEditingMaterial ? 'Cập nhật vật tư thành công!' : 'Thêm vật tư thành công!',
          'success',
        );
    } catch (err: any) {
      if (addToast) addToast('Lỗi: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRowClick = (group: any) => {
    setSelectedGroup(group);
    fetchMaterialsByGroup(group.id, group);
    setShowDetailModal(true);
  };

  const handleEdit = async (e: MouseEvent, item: any) => {
    e.stopPropagation();
    setFormData({
      id: item.id,
      code: item.code || '',
      name: item.name,
      notes: item.notes || '',
    });
    setIsEditing(true);
    setShowModal(true);
  };

  const handleEditMaterial = async (item: any) => {
    const usage = await checkUsage('material', item.id);
    if (usage.inUse && addToast) {
      addToast(`Vật tư đang được sử dụng — một số trường sẽ bị khóa.`, 'info');
    }
    setMaterialFormData({ ...item, _inUse: usage.inUse });
    setIsEditingMaterial(true);
    setShowMaterialModal(true);
  };

  const handleDeleteClick = async (e: MouseEvent | null, id: string) => {
    if (e) e.stopPropagation();
    setItemToDelete(id);
    setDeleteType('group');
    setShowDeleteModal(true);
    try {
      const usage = await checkUsage('group', id);
      setUsageInfo(usage);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteMaterialClick = async (id: string) => {
    setItemToDelete(id);
    setDeleteType('material');
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

      const table = deleteType === 'group' ? 'material_groups' : 'materials';
      const { error } = await supabase
        .from(table)
        .update({ status: 'Đã xóa' })
        .eq('id', itemToDelete);
      if (error) throw error;

      if (deleteType === 'group') {
        fetchGroups();
        setShowDetailModal(false);
      } else {
        fetchMaterialsByGroup(selectedGroup.id);
        setShowMaterialDetailModal(false);
      }

      if (addToast) addToast('Đã chuyển vào thùng rác!', 'success');
      setShowDeleteModal(false);
    } catch (err: any) {
      if (addToast) addToast('Lỗi: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePurgeRelated = async () => {
    if (!itemToDelete || user.role !== 'Develop' || !usageInfo.details) return;
    if (!window.confirm('CẢNH BÁO: Hành động này sẽ xóa VĨNH VIỄN. Bạn có chắc chắn?')) return;

    setSubmitting(true);
    try {
      const table = deleteType === 'group' ? 'material_groups' : 'materials';
      const { error } = await supabase.from(table).delete().eq('id', itemToDelete);
      if (error) throw error;
      if (addToast) addToast('Đã xóa vĩnh viễn', 'success');

      if (deleteType === 'group') {
        fetchGroups();
        setShowDetailModal(false);
      } else {
        fetchMaterialsByGroup(selectedGroup.id);
        setShowMaterialDetailModal(false);
      }
      setShowDeleteModal(false);
    } catch (err: any) {
      if (addToast) addToast('Lỗi xóa vĩnh viễn: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePermanentDelete = async () => {
    if (!itemToDelete || user.role !== 'Develop') return;
    if (!window.confirm('CẢNH BÁO: Hành động này sẽ xóa VĨNH VIỄN. Bạn có chắc chắn?')) return;

    setSubmitting(true);
    try {
      const table = deleteType === 'group' ? 'material_groups' : 'materials';
      const { error } = await supabase.from(table).delete().eq('id', itemToDelete);
      if (error) throw error;
      if (addToast) addToast('Đã xóa vĩnh viễn', 'success');

      if (deleteType === 'group') {
        fetchGroups();
        setShowDetailModal(false);
      } else {
        fetchMaterialsByGroup(selectedGroup.id);
        setShowMaterialDetailModal(false);
      }
      setShowDeleteModal(false);
    } catch (err: any) {
      if (addToast) addToast('Lỗi xóa vĩnh viễn: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredGroups = groups
    .filter(
      (g) =>
        g.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (g.code && g.code.toLowerCase().includes(searchTerm.toLowerCase())),
    )
    .sort((a, b) => {
      if (sortBy === 'newest')
        return new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime();
      if (sortBy === 'code') return (a.code || '').localeCompare(b.code || '');
      return 0;
    });

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24">
      <div className="flex items-center justify-between gap-2 mb-4">
        <PageBreadcrumb title="Nhóm vật tư" onBack={onBack} />
        <div className="flex items-center gap-1.5 justify-end flex-1 flex-shrink-0">
          <SaveImageButton
            onClick={handleSaveTableImage}
            isCapturing={isCapturingTable}
            title="Lưu ảnh nhóm vật tư"
          />
          <ExcelButton onClick={handleExportExcel} size="icon" />
          <SortButton
            currentSort={sortBy}
            onSortChange={(val) => {
              setSortBy(val);
              localStorage.setItem(`sort_pref_mat_groups_${user.id}`, val);
            }}
            options={[
              { value: 'newest', label: 'Tên nhóm' },
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
            <div className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="text"
                  placeholder="Tìm kiếm nhóm vật tư..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  autoFocus
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
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
                  Nhóm vật tư
                </th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider border-r border-white/10">
                  Ghi chú
                </th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-center w-24">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-gray-400 italic">
                    Đang tải dữ liệu...
                  </td>
                </tr>
              ) : filteredGroups.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-gray-400 italic">
                    Chưa có nhóm vật tư nào
                  </td>
                </tr>
              ) : (
                filteredGroups.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => handleRowClick(item)}
                    className="hover:bg-gray-50 transition-colors group cursor-pointer"
                  >
                    <td className="px-4 py-3 text-xs text-gray-600 font-medium">{item.name}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 italic">{item.notes || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1 transition-opacity">
                        <button
                          onClick={(e) => handleEdit(e, item)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          onClick={(e) => handleDeleteClick(e, item.id)}
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
            className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md overflow-hidden"
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
                  Loại: <strong>{deleteType === 'group' ? 'Nhóm vật tư' : 'Vật tư'}</strong>
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
              className="bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden relative z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-primary p-6 text-white flex items-center justify-between rounded-t-[2rem] md:rounded-t-[2.5rem] flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div
                    className="p-2 bg-white/20 rounded-xl cursor-pointer hover:bg-white/30 transition-all active:scale-95"
                    onClick={() => setShowModal(false)}
                  >
                    <Layers size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">
                      {isEditing ? 'Cập nhật nhóm' : 'Thêm nhóm'}
                    </h3>
                    <p className="text-xs text-white/70">Mã nhóm tự động sinh</p>
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
                  <div className="space-y-4">
                    <div className="space-y-2 mb-2 hidden">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                        Mã tham chiếu (Nhóm vật tư)
                      </label>
                      <div className="bg-indigo-50/50 px-5 py-3.5 rounded-2xl border border-indigo-100 text-sm font-black text-indigo-600 uppercase shadow-inner italic">
                        {formData.code || `GR-${toLocalISODate().replace(/-/g, '').slice(2)}-001`}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Tên nhóm vật tư *
                      </label>
                      <input
                        required
                        type="text"
                        placeholder="Ví dụ: Tôn, sắt, thép..."
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Ghi chú
                      </label>
                      <textarea
                        rows={3}
                        placeholder="Thông tin thêm về nhóm này..."
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                      />
                    </div>

                    <div className="mt-8 flex justify-end gap-3 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowModal(false)}
                        className="px-6 py-2 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 transition-colors"
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        disabled={submitting}
                        className="px-6 py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary-hover transition-colors shadow-lg shadow-primary/20 disabled:opacity-50"
                      >
                        {submitting ? 'Đang lưu...' : 'Lưu dữ liệu'}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDetailModal && selectedGroup && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md overflow-hidden"
            onClick={() => setShowDetailModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden relative z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-primary p-6 text-white flex items-center justify-between rounded-t-[2rem] md:rounded-t-[2.5rem] flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div
                    className="p-2 bg-white/20 rounded-xl cursor-pointer hover:bg-white/30 transition-all active:scale-95"
                    onClick={() => setShowDetailModal(false)}
                  >
                    <Layers size={24} />
                  </div>
                  <h3 className="text-xl font-bold uppercase tracking-widest">
                    Chi tiết nhóm vật tư
                  </h3>
                </div>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="p-2 hover:bg-white/20 rounded-xl transition-all"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-8 overflow-y-auto flex-1 space-y-8">
                <div className="grid grid-cols-2 gap-12">
                  <div className="space-y-1 hidden"></div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">
                      Nhóm vật tư
                    </label>
                    <p className="text-sm font-bold text-gray-800 border-b border-gray-100 pb-2">
                      {selectedGroup.name}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-primary/10 text-primary rounded-lg">
                        <Package size={16} />
                      </div>
                      <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
                        Danh mục vật tư trong nhóm
                      </h4>
                      <span className="px-2 py-0.5 bg-primary text-white text-[10px] font-bold rounded-full">
                        {materials.length}
                      </span>
                    </div>
                    <button
                      onClick={async () => {
                        setMaterialFormData(initialMaterialFormState);
                        setIsEditingMaterial(false);
                        setShowMaterialModal(true);
                        const nextCode = await generateNextMaterialCode(selectedGroup.id);
                        setMaterialFormData((prev) => ({ ...prev, code: nextCode }));
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors"
                    >
                      <Plus size={14} /> Thêm dòng
                    </button>
                  </div>

                  <div className="border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-left border-collapse whitespace-nowrap">
                      <thead>
                        <tr className="bg-primary text-white text-[10px] uppercase font-bold tracking-wider">
                          <th className="px-4 py-2 border-r border-white/10">Tên vật tư</th>
                          <th className="px-4 py-2 border-r border-white/10">Kho</th>
                          <th className="px-4 py-2 border-r border-white/10">Quy cách</th>
                          <th className="px-4 py-2 text-center w-24">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {materialsLoading ? (
                          <tr>
                            <td colSpan={4} className="px-4 py-8 text-center text-gray-400 italic">
                              Đang tải vật tư...
                            </td>
                          </tr>
                        ) : materials.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-4 py-8 text-center text-gray-400 italic">
                              Nhóm này chưa có vật tư nào
                            </td>
                          </tr>
                        ) : (
                          materials.map((mat) => (
                            <tr
                              key={mat.id}
                              className="hover:bg-gray-50 transition-colors group cursor-pointer"
                              onClick={() => {
                                setSelectedMaterial(mat);
                                setShowMaterialDetailModal(true);
                              }}
                            >
                              <td className="px-4 py-2 text-xs text-gray-600">{mat.name}</td>
                              <td className="px-4 py-2 text-xs text-gray-500">
                                {warehouses.find((w) => w.id === mat.warehouse_id)?.name || '-'}
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-500">
                                {mat.specification || '-'}
                              </td>
                              <td className="px-4 py-2 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedMaterial(mat);
                                      setShowMaterialDetailModal(true);
                                    }}
                                    className="p-1 text-primary hover:bg-primary/10 rounded transition-colors"
                                  >
                                    <Eye size={14} />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditMaterial(mat);
                                    }}
                                    className="p-1 text-yellow-600 hover:bg-yellow-50 rounded transition-colors"
                                  >
                                    <Edit size={14} />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteMaterialClick(mat.id);
                                    }}
                                    className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
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
              </div>

              <div className="p-6 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                <Button variant="danger" onClick={(e) => handleDeleteClick(null, selectedGroup.id)}>
                  Xóa nhóm
                </Button>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setShowDetailModal(false)}>
                    Đóng
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {/* Form thêm/sửa vật tư trong nhóm — bị mất ở 19566ea, khôi phục lại */}
        {showMaterialModal && (
          <div
            className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md overflow-hidden"
            onClick={() => setShowMaterialModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col my-8 m-4 overflow-hidden relative z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-blue-600 p-6 text-white flex items-center justify-between rounded-t-[2rem] md:rounded-t-[2.5rem] flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div
                    className="p-2 bg-white/20 rounded-xl cursor-pointer hover:bg-white/30 transition-all active:scale-95"
                    onClick={() => setShowMaterialModal(false)}
                  >
                    <Package size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">
                      {isEditingMaterial ? 'Cập nhật vật tư' : 'Thêm vật tư mới'}
                    </h3>
                    <p className="text-xs text-white/70">Thuộc nhóm: {selectedGroup?.name}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowMaterialModal(false)}
                  className="p-2 hover:bg-white/20 rounded-xl transition-all"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <form
                  onSubmit={handleMaterialSubmit}
                  className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4"
                >
                  <div className="col-span-1 md:col-span-2 space-y-2 mb-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                      Mã tham chiếu (Vật tư)
                    </label>
                    <div className="bg-primary/5 px-5 py-3.5 rounded-2xl border border-primary/10 text-sm font-black text-primary uppercase shadow-inner italic">
                      {materialFormData.code || 'VAT-001'}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">
                      Tên vật tư *
                    </label>
                    <input
                      required
                      type="text"
                      value={materialFormData.name}
                      onChange={(e) =>
                        setMaterialFormData({ ...materialFormData, name: e.target.value })
                      }
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">
                      Kho lưu trữ
                    </label>
                    <select
                      value={materialFormData.warehouse_id || ''}
                      onChange={(e) =>
                        setMaterialFormData({ ...materialFormData, warehouse_id: e.target.value })
                      }
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="">-- Chọn kho --</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">
                      Quy cách
                    </label>
                    <input
                      type="text"
                      value={materialFormData.specification || ''}
                      onChange={(e) =>
                        setMaterialFormData({ ...materialFormData, specification: e.target.value })
                      }
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">
                      Đơn vị tính
                    </label>
                    <input
                      type="text"
                      value={materialFormData.unit || ''}
                      onChange={(e) =>
                        setMaterialFormData({ ...materialFormData, unit: e.target.value })
                      }
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div className="col-span-1 md:col-span-2 space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Mô tả</label>
                    <textarea
                      rows={2}
                      value={materialFormData.description || ''}
                      onChange={(e) =>
                        setMaterialFormData({ ...materialFormData, description: e.target.value })
                      }
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                    />
                  </div>
                  <div className="col-span-1 md:col-span-2 mt-4 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setShowMaterialModal(false)}
                      className="px-6 py-2 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 transition-colors"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-6 py-2 rounded-xl text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20 disabled:opacity-50"
                    >
                      {submitting ? 'Đang lưu...' : 'Lưu vật tư'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <FAB
        onClick={() => {
          setIsEditing(false);
          setFormData(initialFormState);
          setShowModal(true);
        }}
        label="Thêm nhóm"
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
                    Material Classification Hub
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
                Danh Mục Nhóm Vật Tư
              </h2>
              <p className="text-xs text-gray-500 font-bold italic">
                Thời gian xuất: {new Date().toLocaleString('vi-VN')}
              </p>
              <div className="mt-4 flex flex-col items-end gap-1">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest font-mono">
                  STATUS: GROUP_AUDIT
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
                  Tên nhóm vật tư
                </th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest italic text-left">
                  Ghi chú / Mô tả nhóm
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs">
              {filteredGroups.map((group, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}>
                  <td className="px-6 py-4 text-center text-gray-400 font-bold">{idx + 1}</td>
                  <td className="px-6 py-4 font-black text-gray-900 uppercase tracking-tight break-words max-w-[300px] whitespace-normal leading-relaxed">
                    {group.name}
                  </td>
                  <td className="px-6 py-4 text-gray-500 font-bold italic break-words max-w-[400px] whitespace-normal leading-relaxed">
                    {group.notes || '—'}
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
                End of material groups report • Category Management Service
              </p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-black text-gray-300 uppercase tracking-[0.3em] mb-1">
                Corporate Hierarchy Verified
              </p>
              <div className="text-[10px] text-gray-400 font-bold bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
                Data Chain:{' '}
                <span className="text-primary font-black tracking-widest italic ml-1 underline">
                  HIE-CAT-001
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
