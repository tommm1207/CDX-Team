import { CanvasLogo } from '@/components/shared';
import { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  Filter,
  X,
  Scissors,
  Merge,
  ArrowRight,
  Package,
  Trash2,
  ChevronRight,
  Image as LucideImageIcon,
  Share2,
} from 'lucide-react';
import { useRef } from 'react';
import { exportTableImage } from '../../utils/reportExport';
import { SaveImageButton } from '@/components/shared';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '@/lib/supabase';
import { Employee } from '@/types';
import { PageBreadcrumb } from '@/components/shared';
import { NumericInput } from '@/components/shared';
import { CreatableSelect } from '@/components/shared';
import { ToastType } from '@/components/shared';
import { FAB } from '@/components/shared';
import { Button } from '@/components/shared';
import { SortButton, SortOption } from '@/components/shared';
import { ExcelButton } from '@/components/shared';
import { formatDate, formatNumber, toLocalISODate } from '@/utils/format';
import { isActiveWarehouse, getAvailableStock } from '@/utils/inventory';
import { getAllowedWarehouses } from '@/utils/helpers';

import { QuickAddMaterialModal } from '@/components/shared';
import { useInventoryData } from '@/hooks/useInventoryData';

// ============================
// Material Split / Merge
// ============================
export const MaterialSplitMerge = ({
  user,
  onBack,
  addToast,
}: {
  user: Employee;
  onBack?: () => void;
  addToast?: (message: string, type?: ToastType) => void;
}) => {
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const {
    warehouses,
    materials: inventoryMaterials,
    groups,
    refreshAll,
  } = useInventoryData(user.data_view_permission);
  const materials = inventoryMaterials || [];
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<'xa' | 'gop'>('xa');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>(
    (localStorage.getItem(`sort_pref_splitMerge_${user.id}`) as SortOption) || 'newest',
  );
  const [showFilter, setShowFilter] = useState(false);
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [isCapturingTable, setIsCapturingTable] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const [showDetailPhieu, setShowDetailPhieu] = useState(false);
  const [selectedPhieu, setSelectedPhieu] = useState<any>(null);

  // Form
  const [kho_id, setKhoId] = useState('');
  const [ghi_chu, setGhiChu] = useState('');

  // Xả: 1 nguồn → N output
  const [nguonXa, setNguonXa] = useState({
    material_id: '',
    material_name: '',
    so_luong: 0,
    don_vi: '',
    ton_kho: 0,
  });
  const [outputXa, setOutputXa] = useState<any[]>([]);

  // Gộp: N nguồn → 1 output
  const [nguonGop, setNguonGop] = useState<any[]>([]);
  const [outputGop, setOutputGop] = useState({
    material_id: '',
    material_name: '',
    so_luong: 0,
    don_vi: '',
  });

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('xasa_gop_phieu')
        .select(
          '*, warehouses(name), users(full_name), xasa_gop_chi_tiet(*, materials(name, code))',
        )
        .order('created_at', { ascending: false });
      if (error) throw error;
      const validData = (data || []).filter(
        (item: any) => item.status !== 'da_xoa' && item.status !== 'Đã xóa',
      );
      setHistory(validData);
    } catch (err: any) {
      console.error('Error:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchMaterials = async () => {
    /* Removed, use hook instead */
  };
  const fetchWarehouses = async () => {
    /* Removed, use hook instead */
  };

  const generateCode = (type: 'xa' | 'gop') => {
    const prefix = type === 'xa' ? 'XA' : 'GOP';
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const random = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}${yyyy}${mm}${dd}-${random}`;
  };

  const openModal = (m: 'xa' | 'gop') => {
    setMode(m);
    setIsEditing(false);
    setEditingId(null);
    setNguonXa({ material_id: '', material_name: '', so_luong: 0, don_vi: '', ton_kho: 0 });
    setOutputXa([{ material_id: '', material_name: '', so_luong: 0, don_vi: '', kg_per_unit: 0 }]);
    setNguonGop([
      { material_id: '', material_name: '', so_luong: 0, don_vi: '', ton_kho: 0 },
      { material_id: '', material_name: '', so_luong: 0, don_vi: '', ton_kho: 0 },
    ]);
    setOutputGop({ material_id: '', material_name: '', so_luong: 0, don_vi: '' });
    setGhiChu('');
    setKhoId('');
    setShowModal(true);
  };

  const handleSelectNguonXa = async (matId: string) => {
    const mat = materials.find((m) => m.id === matId);
    let tonKho = 0;
    if (kho_id) {
      try {
        tonKho = await getAvailableStock(matId, kho_id, toLocalISODate());
      } catch (e) {}
    }
    setNguonXa({
      material_id: matId,
      material_name: mat?.name || '',
      so_luong: 0,
      don_vi: mat?.unit || '',
      ton_kho: tonKho,
    });
  };

  const addOutputXa = () => {
    setOutputXa([
      ...outputXa,
      { material_id: '', material_name: '', so_luong: 0, don_vi: '', kg_per_unit: 0 },
    ]);
  };

  // Auto-compute nguồn so_luong = Σ(so_luong × kg_per_unit) khi có trọng lượng
  useEffect(() => {
    if (mode !== 'xa' || outputXa.length === 0) return;
    const hasWeight = outputXa.some((o) => o.kg_per_unit > 0);
    if (!hasWeight) return;
    const total = outputXa.reduce(
      (sum: number, o: any) => sum + (o.kg_per_unit > 0 ? o.so_luong * o.kg_per_unit : o.so_luong),
      0,
    );
    setNguonXa((prev) => ({ ...prev, so_luong: Math.round(total * 1000) / 1000 }));
  }, [outputXa, mode]);

  const addNguonGop = () => {
    setNguonGop([
      ...nguonGop,
      { material_id: '', material_name: '', so_luong: 0, don_vi: '', ton_kho: 0 },
    ]);
  };

  const handleSubmit = async () => {
    if (!kho_id) {
      if (addToast) addToast('Vui lòng chọn kho', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const ma_phieu = isEditing && selectedPhieu ? selectedPhieu.ma_phieu : generateCode(mode);
      const today = toLocalISODate();

      let phieuId = editingId;

      if (isEditing && editingId) {
        await supabase.from('stock_in').delete().like('import_code', `${ma_phieu}%`);
        await supabase.from('stock_out').delete().like('export_code', `${ma_phieu}%`);
        await supabase.from('xasa_gop_chi_tiet').delete().eq('phieu_id', editingId);

        const { error: updateErr } = await supabase
          .from('xasa_gop_phieu')
          .update({ kho_id, ghi_chu: ghi_chu || null })
          .eq('id', editingId);
        if (updateErr) throw updateErr;
      } else {
        const { data: phieu, error: phieuErr } = await supabase
          .from('xasa_gop_phieu')
          .insert([
            {
              ma_phieu,
              loai: mode,
              ngay: today,
              kho_id,
              nguoi_tao: user.id,
              ghi_chu: ghi_chu || null,
              status: 'cho_duyet',
            },
          ])
          .select()
          .single();
        if (phieuErr) throw phieuErr;
        phieuId = phieu.id;
      }

      if (mode === 'xa') {
        // Validate
        if (!nguonXa.material_id || nguonXa.so_luong <= 0) {
          throw new Error('Vui lòng chọn vật tư nguồn và nhập số lượng');
        }
        if (outputXa.length === 0) {
          throw new Error('Vui lòng thêm ít nhất 1 mảnh ra');
        }

        // Insert detail records
        const details = [
          {
            phieu_id: phieuId,
            material_id: nguonXa.material_id,
            vai_tro: 'nguon',
            so_luong: nguonXa.so_luong,
            don_vi: nguonXa.don_vi,
          },
          ...outputXa.map((o: any) => ({
            phieu_id: phieuId,
            material_id: o.material_id,
            vai_tro: 'ra',
            so_luong: o.so_luong,
            don_vi: o.don_vi,
          })),
        ];
        await supabase.from('xasa_gop_chi_tiet').insert(details);

        // Create stock_out for source + stock_in for outputs
        await supabase.from('stock_out').insert([
          {
            export_code: ma_phieu,
            date: today,
            material_id: nguonXa.material_id,
            warehouse_id: kho_id,
            quantity: nguonXa.so_luong,
            unit: nguonXa.don_vi,
            employee_id: user.id,
            notes: `Xả vật tư - Phiếu: ${ma_phieu}`,
            status: 'Chờ duyệt',
            unit_price: 0,
            total_amount: 0,
          },
        ]);

        // import_code has UNIQUE constraint — use suffix per output item
        const stockInItems = outputXa.map((o: any, idx: number) => ({
          import_code: outputXa.length === 1 ? ma_phieu : `${ma_phieu}-${idx + 1}`,
          date: today,
          material_id: o.material_id,
          warehouse_id: kho_id,
          quantity: o.so_luong,
          unit: o.don_vi,
          employee_id: user.id,
          notes: `Mảnh ra từ xả vật tư - Phiếu: ${ma_phieu}`,
          status: 'Chờ duyệt',
          unit_price: 0,
          total_amount: 0,
        }));
        await supabase.from('stock_in').insert(stockInItems);
      } else {
        // GỘP
        if (nguonGop.length === 0) throw new Error('Vui lòng thêm vật tư nguồn');
        if (!outputGop.material_id || outputGop.so_luong <= 0)
          throw new Error('Vui lòng khai báo vật tư gộp ra');

        const details = [
          ...nguonGop.map((n: any) => ({
            phieu_id: phieuId,
            material_id: n.material_id,
            vai_tro: 'nguon',
            so_luong: n.so_luong,
            don_vi: n.don_vi,
          })),
          {
            phieu_id: phieuId,
            material_id: outputGop.material_id,
            vai_tro: 'ra',
            so_luong: outputGop.so_luong,
            don_vi: outputGop.don_vi,
          },
        ];
        await supabase.from('xasa_gop_chi_tiet').insert(details);

        // stock_out for all sources (export_code with suffix per source)
        const stockOuts = nguonGop.map((n: any, idx: number) => ({
          export_code: nguonGop.length === 1 ? ma_phieu : `${ma_phieu}-N${idx + 1}`,
          date: today,
          material_id: n.material_id,
          warehouse_id: kho_id,
          quantity: n.so_luong,
          unit: n.don_vi,
          employee_id: user.id,
          notes: `Gộp vật tư - Phiếu: ${ma_phieu}`,
          status: 'Chờ duyệt',
          unit_price: 0,
          total_amount: 0,
        }));
        await supabase.from('stock_out').insert(stockOuts);

        // stock_in for output
        await supabase.from('stock_in').insert([
          {
            import_code: ma_phieu,
            date: today,
            material_id: outputGop.material_id,
            warehouse_id: kho_id,
            quantity: outputGop.so_luong,
            unit: outputGop.don_vi,
            employee_id: user.id,
            notes: `Vật tư gộp ra - Phiếu: ${ma_phieu}`,
            status: 'Chờ duyệt',
            unit_price: 0,
            total_amount: 0,
          },
        ]);
      }

      if (addToast)
        addToast(
          `Phiếu ${ma_phieu} đã được ${isEditing ? 'cập nhật' : 'tạo'} thành công!`,
          'success',
        );
      setShowModal(false);
      fetchHistory();
    } catch (err: any) {
      if (addToast) addToast('Lỗi: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprovePhieu = async (phieu: any) => {
    if (user.role !== 'Admin' && user.role !== 'Develop') {
      if (addToast) addToast('Bạn không có quyền duyệt phiếu này', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const today = toLocalISODate();

      // 1. Approve associated stock_in/out (import_code/export_code may have suffixes)
      await supabase
        .from('stock_in')
        .update({ status: 'Đã duyệt' })
        .like('import_code', `${phieu.ma_phieu}%`);

      await supabase
        .from('stock_out')
        .update({ status: 'Đã duyệt' })
        .like('export_code', `${phieu.ma_phieu}%`);

      // 2. Update phieu status
      const { error } = await supabase
        .from('xasa_gop_phieu')
        .update({ status: 'da_duyet' })
        .eq('id', phieu.id);
      if (error) throw error;

      if (addToast) addToast(`Đã duyệt phiếu ${phieu.ma_phieu} thành công!`, 'success');
      fetchHistory();
    } catch (err: any) {
      if (addToast) addToast('Lỗi duyệt: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectPhieu = async (phieu: any) => {
    if (!window.confirm(`Từ chối và xóa phiếu ${phieu.ma_phieu}?`)) return;

    setSubmitting(true);
    try {
      const pref = phieu.loai === 'xa' ? 'XA-' : 'GOP-';
      const slipCode = `${pref}${phieu.ma_phieu}`;

      // Delete stock records
      await supabase.from('stock_in').delete().like('import_code', `${phieu.ma_phieu}%`);
      await supabase.from('stock_out').delete().like('export_code', `${phieu.ma_phieu}%`);

      // Delete phieu chi tiet
      await supabase.from('xasa_gop_chi_tiet').delete().eq('phieu_id', phieu.id);

      // Đưa phieu header vào thùng rác (Soft Delete)
      const { error } = await supabase
        .from('xasa_gop_phieu')
        .update({ status: 'da_xoa' })
        .eq('id', phieu.id);
      if (error) throw error;

      if (addToast) addToast('Đã từ chối và xóa phiếu', 'info');
      fetchHistory();
    } catch (err: any) {
      if (addToast) addToast('Lỗi: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditPhieu = (phieu: any) => {
    setMode(phieu.loai);
    setIsEditing(true);
    setEditingId(phieu.id);
    setKhoId(phieu.kho_id || '');
    setGhiChu(phieu.ghi_chu || '');

    if (phieu.loai === 'xa') {
      const nguon = phieu.xasa_gop_chi_tiet?.find((c: any) => c.vai_tro === 'nguon');
      const ra = phieu.xasa_gop_chi_tiet?.filter((c: any) => c.vai_tro === 'ra') || [];
      if (nguon) {
        setNguonXa({
          material_id: nguon.material_id,
          material_name: nguon.materials?.name || '',
          so_luong: nguon.so_luong,
          don_vi: nguon.don_vi,
          ton_kho: 0,
        });
      }
      setOutputXa(
        ra.length > 0
          ? ra.map((r: any) => ({
              material_id: r.material_id,
              material_name: r.materials?.name || '',
              so_luong: r.so_luong,
              don_vi: r.don_vi,
              kg_per_unit: 0,
            }))
          : [{ material_id: '', material_name: '', so_luong: 0, don_vi: '', kg_per_unit: 0 }],
      );
    } else {
      const nguon = phieu.xasa_gop_chi_tiet?.filter((c: any) => c.vai_tro === 'nguon') || [];
      const ra = phieu.xasa_gop_chi_tiet?.find((c: any) => c.vai_tro === 'ra');
      setNguonGop(
        nguon.length > 0
          ? nguon.map((n: any) => ({
              material_id: n.material_id,
              material_name: n.materials?.name || '',
              so_luong: n.so_luong,
              don_vi: n.don_vi,
              ton_kho: 0,
            }))
          : [
              { material_id: '', material_name: '', so_luong: 0, don_vi: '', ton_kho: 0 },
              { material_id: '', material_name: '', so_luong: 0, don_vi: '', ton_kho: 0 },
            ],
      );
      if (ra) {
        setOutputGop({
          material_id: ra.material_id,
          material_name: ra.materials?.name || '',
          so_luong: ra.so_luong,
          don_vi: ra.don_vi,
        });
      } else {
        setOutputGop({ material_id: '', material_name: '', so_luong: 0, don_vi: '' });
      }
    }

    setShowDetailPhieu(false);
    setShowModal(true);
  };

  const handleDeletePhieu = async (phieu: any) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa phiếu ${phieu.ma_phieu}?`)) return;

    setSubmitting(true);
    try {
      await supabase.from('stock_in').delete().like('import_code', `${phieu.ma_phieu}%`);
      await supabase.from('stock_out').delete().like('export_code', `${phieu.ma_phieu}%`);
      await supabase.from('xasa_gop_chi_tiet').delete().eq('phieu_id', phieu.id);

      const { error } = await supabase
        .from('xasa_gop_phieu')
        .update({ status: 'da_xoa' })
        .eq('id', phieu.id);
      if (error) throw error;

      if (addToast) addToast('Đã xóa phiếu thành công', 'success');
      setShowDetailPhieu(false);
      fetchHistory();
    } catch (err: any) {
      if (addToast) addToast('Lỗi: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'cho_duyet':
        return { label: 'Chờ duyệt', bg: 'bg-primary/10', text: 'text-primary' };
      case 'da_duyet':
        return { label: 'Đã duyệt', bg: 'bg-green-100', text: 'text-green-700' };
      case 'da_huy':
        return { label: 'Đã hủy', bg: 'bg-red-100', text: 'text-red-700' };
      default:
        return { label: 'Đã duyệt', bg: 'bg-green-100', text: 'text-green-700' };
    }
  };

  const materialOptions = materials.map((m) => ({
    id: m.id,
    name: `${m.name}${m.code ? ` (${m.code})` : ''}`,
  }));
  const warehouseOptions = warehouses.map((w) => ({ id: w.id, name: w.name }));

  const filteredHistory = history.filter((h) => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (h.ma_phieu || '').toLowerCase().includes(s);
  });

  const handleExportExcel = () => {
    import('@/utils/excelExport').then(({ exportToExcel }) => {
      exportToExcel({
        title: 'Tách ghép Vật tư',
        sheetName: 'Tách ghép',
        columns: [
          'Mã phiếu',
          'Loại',
          'Ngày',
          'Kho',
          'Vật tư gốc',
          'Vật tư mới',
          'Số lượng',
          'Ghi chú',
        ],
        rows: history.map((s) => [
          s.slip_code ?? '',
          s.type ?? '',
          s.date ?? '',
          s.warehouses?.name ?? '',
          s.from_material?.name ?? '',
          s.to_material?.name ?? '',
          s.quantity,
          s.notes ?? '',
        ]),
        fileName: `CDX_TachGhep_${toLocalISODate()}.xlsx`,
        addToast,
      });
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24">
      <div className="flex items-center justify-between gap-2">
        <PageBreadcrumb title="Xả / Gộp vật tư" onBack={onBack} />
        <div className="flex items-center gap-1.5 justify-end flex-1">
          <SaveImageButton
            onClick={() => {
              if (reportRef.current) {
                exportTableImage({
                  element: reportRef.current,
                  fileName: `Xa_Gop_Vat_Tu_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.png`,
                  addToast,
                  onStart: () => setIsCapturingTable(true),
                  onEnd: () => setIsCapturingTable(false),
                });
              }
            }}
            isCapturing={isCapturingTable}
            title="Lưu ảnh báo cáo"
          />
          <ExcelButton onClick={handleExportExcel} size="icon" />
          <SortButton
            currentSort={sortBy}
            onSortChange={(val) => {
              setSortBy(val);
              localStorage.setItem(`sort_pref_splitMerge_${user.id}`, val);
            }}
            options={[
              { value: 'newest', label: 'Mới nhất' },
              { value: 'code', label: 'Mã phiếu' },
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

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => openModal('xa')}
          className="bg-white rounded-2xl p-4 border border-gray-100 hover:shadow-md transition-all flex items-center gap-3 active:scale-[0.98]"
        >
          <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
            <Scissors size={20} className="text-orange-600" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-bold text-gray-800">Xả vật tư</h3>
            <p className="text-[10px] text-gray-400">1 nguồn → N mảnh</p>
          </div>
        </button>
        <button
          onClick={() => openModal('gop')}
          className="bg-white rounded-2xl p-4 border border-gray-100 hover:shadow-md transition-all flex items-center gap-3 active:scale-[0.98]"
        >
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <Merge size={20} className="text-blue-600" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-bold text-gray-800">Gộp vật tư</h3>
            <p className="text-[10px] text-gray-400">N mảnh → 1 vật tư</p>
          </div>
        </button>
      </div>

      {/* History */}
      <AnimatePresence>
        {showFilter && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: showFilter ? 'visible' : 'hidden' }}
          >
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 space-y-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase">Tìm kiếm</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm mã phiếu..."
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-3">
        {loadingHistory ? (
          <div className="flex flex-col items-center py-12 text-gray-400">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2" />
            <p className="text-sm">Đang tải...</p>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200">
            <Package size={48} className="mb-3 text-gray-300" />
            <p className="font-medium">Chưa có phiếu nào</p>
          </div>
        ) : (
          filteredHistory.map((item) => {
            const nguonItems = (item.xasa_gop_chi_tiet || []).filter(
              (d: any) => d.vai_tro === 'nguon',
            );
            const raItems = (item.xasa_gop_chi_tiet || []).filter((d: any) => d.vai_tro === 'ra');

            return (
              <div
                key={item.id}
                onClick={() => {
                  setSelectedPhieu(item);
                  setShowDetailPhieu(true);
                }}
                className="bg-white rounded-xl py-1.5 px-3 border border-gray-100 shadow-sm transition-all hover:shadow-md cursor-pointer group active:scale-[0.99] flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="relative shrink-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center ${item.loai === 'xa' ? 'bg-orange-50' : 'bg-blue-50'}`}
                    >
                      {item.loai === 'xa' ? (
                        <Scissors size={14} className="text-orange-500" />
                      ) : (
                        <Merge size={14} className="text-blue-500" />
                      )}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 no-wrap overflow-hidden">
                      <h4 className="font-bold text-gray-800 text-[11px] truncate shrink min-w-0">
                        {nguonItems.map((n: any) => n.materials?.name || '...').join(', ')}
                        <ArrowRight size={10} className="inline mx-1 text-gray-400" />
                        {raItems.map((r: any) => r.materials?.name || '...').join(', ')}
                      </h4>
                      <span className="text-[7px] font-normal text-gray-200 shrink-0">
                        {item.ma_phieu.split('-')[1] || item.ma_phieu}
                      </span>
                      {(() => {
                        const badge = getStatusBadge(item.trang_thai);
                        return (
                          <span
                            className={`px-1 rounded text-[7px] font-bold shrink-0 ${badge.bg} ${badge.text}`}
                          >
                            {badge.label}
                          </span>
                        );
                      })()}
                    </div>
                    <p className="text-[8px] text-gray-400/40 font-medium truncate">
                      {formatDate(item.ngay)} • {item.warehouses?.name} • {item.users?.full_name}
                    </p>
                  </div>
                </div>
                <span
                  className={`px-1 py-0.5 rounded text-[7px] font-black shrink-0 ${item.loai === 'xa' ? 'text-orange-400 border border-orange-100' : 'text-blue-400 border border-blue-100'}`}
                >
                  {item.loai === 'xa' ? 'Xả' : 'Gộp'}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {showModal && (
          <div
            className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div
                className={`p-6 text-white flex items-center justify-between rounded-t-[2rem] md:rounded-t-[2.5rem] flex-shrink-0 ${mode === 'xa' ? 'bg-orange-500' : 'bg-blue-500'}`}
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowModal(false)}
                    className="p-1 hover:bg-white/20 rounded-full"
                  >
                    <X size={20} />
                  </button>
                  <div>
                    <h2 className="font-bold text-lg">
                      {mode === 'xa' ? 'Xả vật tư' : 'Gộp vật tư'}
                    </h2>
                    <p className="text-xs text-white/70">
                      {mode === 'xa' ? '1 vật tư nguồn → Nhiều mảnh' : 'Nhiều mảnh → 1 vật tư mới'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="p-6 space-y-5 overflow-y-auto flex-1">
                {/* Kho */}
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                    Chọn kho thực hiện *
                  </label>
                  <CreatableSelect
                    value={kho_id}
                    options={warehouseOptions}
                    onChange={(val) => setKhoId(val)}
                    placeholder="Chọn kho..."
                    allowCreate={false}
                  />
                </div>

                {mode === 'xa' ? (
                  <>
                    {/* Nguồn xả */}
                    <div className="bg-orange-50 rounded-2xl p-4 border border-orange-100">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="text-xs font-bold text-orange-700 uppercase">
                          📦 Vật tư nguồn
                        </h4>
                        <button
                          type="button"
                          onClick={() => setShowAddMaterial(true)}
                          className="text-[10px] font-bold text-orange-600 flex items-center gap-1 hover:underline"
                        >
                          <Plus size={12} /> Thêm vật tư mới
                        </button>
                      </div>
                      <CreatableSelect
                        value={nguonXa.material_id}
                        options={materialOptions}
                        onChange={(val) => handleSelectNguonXa(val)}
                        placeholder="Chọn vật tư cần xả..."
                        allowCreate={false}
                      />
                      {nguonXa.material_id && (
                        <div className="mt-3 grid grid-cols-12 gap-3">
                          <div className="col-span-8">
                            <NumericInput
                              label={
                                outputXa.some((o: any) => o.kg_per_unit > 0)
                                  ? 'Số lượng xả (Tự tính từ mảnh)'
                                  : 'Số lượng xả'
                              }
                              value={nguonXa.so_luong}
                              onChange={(val) => setNguonXa({ ...nguonXa, so_luong: val })}
                            />
                          </div>
                          <div className="col-span-4">
                            <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                              ĐVT
                            </label>
                            <input
                              type="text"
                              value={nguonXa.don_vi}
                              onChange={(e) => setNguonXa({ ...nguonXa, don_vi: e.target.value })}
                              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50/50"
                            />
                          </div>
                          {kho_id && (
                            <p className="text-[10px] text-gray-500 col-span-2">
                              Tồn kho hiện tại:{' '}
                              <span className="font-bold text-primary">
                                {formatNumber(nguonXa.ton_kho)}
                              </span>
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Output xả */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-bold text-gray-600 uppercase">
                          ✂️ Mảnh ra ({outputXa.length})
                        </h4>
                        <Button size="sm" variant="outline" icon={Plus} onClick={addOutputXa}>
                          Thêm
                        </Button>
                      </div>
                      {outputXa.map((o, idx) => (
                        <div
                          key={idx}
                          className="flex flex-col gap-2 mb-2 bg-gray-50 rounded-xl p-3"
                        >
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <CreatableSelect
                                value={o.material_id}
                                options={materialOptions}
                                onChange={(val) => {
                                  const mat = materials.find((m) => m.id === val);
                                  const updated = [...outputXa];
                                  updated[idx] = {
                                    ...updated[idx],
                                    material_id: val,
                                    material_name: mat?.name || '',
                                    don_vi: mat?.unit || '',
                                  };
                                  setOutputXa(updated);
                                }}
                                placeholder="Chọn vật tư..."
                                allowCreate={false}
                              />
                            </div>
                            <button
                              onClick={() => setOutputXa(outputXa.filter((_, i) => i !== idx))}
                              className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg shrink-0"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <div className="flex items-end gap-2">
                            <div className="w-20">
                              <NumericInput
                                label="Số lượng"
                                value={o.so_luong}
                                onChange={(val) => {
                                  const updated = [...outputXa];
                                  updated[idx] = { ...updated[idx], so_luong: val };
                                  setOutputXa(updated);
                                }}
                              />
                            </div>
                            <div className="w-20">
                              <NumericInput
                                label="kg/cái"
                                isDecimal
                                value={o.kg_per_unit || 0}
                                onChange={(val) => {
                                  const updated = [...outputXa];
                                  updated[idx] = { ...updated[idx], kg_per_unit: val };
                                  setOutputXa(updated);
                                }}
                              />
                            </div>
                            {o.kg_per_unit > 0 && (
                              <div className="pb-1 text-xs font-bold text-orange-600 whitespace-nowrap">
                                ={' '}
                                {formatNumber(Math.round(o.so_luong * o.kg_per_unit * 1000) / 1000)}{' '}
                                kg
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    {/* Nguồn gộp */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-bold text-blue-700 uppercase">
                          📦 Vật tư nguồn ({nguonGop.length})
                        </h4>
                        <Button size="sm" variant="outline" icon={Plus} onClick={addNguonGop}>
                          Thêm
                        </Button>
                      </div>
                      {nguonGop.map((n, idx) => (
                        <div className="flex items-center gap-2 mb-2 bg-blue-50 rounded-xl p-3">
                          <div className="flex-1">
                            <CreatableSelect
                              value={n.material_id}
                              options={materialOptions}
                              onChange={(val) => {
                                const mat = materials.find((m) => m.id === val);
                                const updated = [...nguonGop];
                                updated[idx] = {
                                  ...updated[idx],
                                  material_id: val,
                                  material_name: mat?.name || '',
                                  don_vi: mat?.unit || '',
                                };
                                setNguonGop(updated);
                              }}
                              placeholder="Chọn vật tư..."
                              allowCreate={false}
                            />
                          </div>
                          <div className="w-20 md:w-24">
                            <NumericInput
                              label=""
                              value={n.so_luong}
                              onChange={(val) => {
                                const updated = [...nguonGop];
                                updated[idx] = { ...updated[idx], so_luong: val };
                                setNguonGop(updated);
                              }}
                            />
                          </div>
                          <button
                            onClick={() => setNguonGop(nguonGop.filter((_, i) => i !== idx))}
                            className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg shrink-0"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Output gộp */}
                    <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="text-xs font-bold text-blue-700 uppercase">
                          🔗 Vật tư gộp ra
                        </h4>
                        <button
                          type="button"
                          onClick={() => setShowAddMaterial(true)}
                          className="text-[10px] font-bold text-blue-600 flex items-center gap-1 hover:underline"
                        >
                          <Plus size={12} /> Thêm vật tư mới
                        </button>
                      </div>
                      <CreatableSelect
                        value={outputGop.material_id}
                        options={materialOptions}
                        onChange={(val) => {
                          const mat = materials.find((m) => m.id === val);
                          setOutputGop({
                            ...outputGop,
                            material_id: val,
                            material_name: mat?.name || '',
                            don_vi: mat?.unit || '',
                          });
                        }}
                        placeholder="Chọn vật tư đầu ra..."
                        allowCreate={false}
                      />
                      {outputGop.material_id && (
                        <div className="mt-3 grid grid-cols-12 gap-3">
                          <div className="col-span-8">
                            <NumericInput
                              label="Số lượng"
                              value={outputGop.so_luong}
                              onChange={(val) => setOutputGop({ ...outputGop, so_luong: val })}
                            />
                          </div>
                          <div className="col-span-4">
                            <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                              ĐVT
                            </label>
                            <input
                              type="text"
                              value={outputGop.don_vi}
                              onChange={(e) =>
                                setOutputGop({ ...outputGop, don_vi: e.target.value })
                              }
                              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Ghi chú */}
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                    Ghi chú
                  </label>
                  <input
                    type="text"
                    value={ghi_chu}
                    onChange={(e) => setGhiChu(e.target.value)}
                    placeholder="Ghi chú..."
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-gray-100 flex justify-end gap-3 shrink-0">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-6 py-2.5 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100"
                >
                  Hủy
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className={`px-8 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg disabled:opacity-50 ${mode === 'xa' ? 'bg-orange-500 hover:bg-orange-600 shadow-orange-500/20' : 'bg-blue-500 hover:bg-blue-600 shadow-blue-500/20'}`}
                >
                  {submitting ? 'Đang xử lý...' : 'Xác nhận'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDetailPhieu && selectedPhieu && (
          <div
            className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowDetailPhieu(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className={`p-6 text-white flex items-center justify-between rounded-t-[2rem] md:rounded-t-[2.5rem] flex-shrink-0 ${selectedPhieu.loai === 'xa' ? 'bg-orange-500' : 'bg-blue-500'}`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-xl">
                    {selectedPhieu.loai === 'xa' ? <Scissors size={24} /> : <Merge size={24} />}
                  </div>
                  <div>
                    <h2 className="font-bold text-lg">Chi tiết phiếu {selectedPhieu.ma_phieu}</h2>
                    <p className="text-xs text-white/70">
                      Loại: {selectedPhieu.loai === 'xa' ? 'Xả vật tư' : 'Gộp vật tư'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDetailPhieu(false)}
                  className="p-2 hover:bg-white/20 rounded-xl transition-all"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Meta info */}
                <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-2xl">
                  <div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase">Ngày thực hiện</p>
                    <p className="text-sm font-bold text-gray-800">
                      {formatDate(selectedPhieu.ngay)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase">Kho xử lý</p>
                    <p className="text-sm font-bold text-gray-800">
                      {selectedPhieu.warehouses?.name}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase">Người tạo</p>
                    <p className="text-sm font-bold text-gray-800">
                      {selectedPhieu.users?.full_name}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase">Trạng thái</p>
                    <span
                      className={`px-2 py-0.5 rounded-lg text-xs font-bold ${getStatusBadge(selectedPhieu.trang_thai).bg} ${getStatusBadge(selectedPhieu.trang_thai).text}`}
                    >
                      {getStatusBadge(selectedPhieu.trang_thai).label}
                    </span>
                  </div>
                </div>

                {/* Groups */}
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase mb-2 ml-1">
                      📦 Vật tư nguồn
                    </h4>
                    <div className="bg-blue-50/50 border border-blue-100 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-blue-100/50">
                          <tr>
                            <th className="px-4 py-2 font-bold text-blue-800">Tên vật tư</th>
                            <th className="px-4 py-2 font-bold text-blue-800 text-center">
                              Số lượng
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-blue-100">
                          {(selectedPhieu.xasa_gop_chi_tiet || [])
                            .filter((d: any) => d.vai_tro === 'nguon')
                            .map((d: any, i: number) => (
                              <tr key={i}>
                                <td className="px-4 py-3">
                                  <p className="font-bold text-gray-800">{d.materials?.name}</p>
                                  <p className="text-[10px] text-gray-400">{d.materials?.code}</p>
                                </td>
                                <td className="px-4 py-3 text-center font-bold text-blue-700">
                                  {formatNumber(d.so_luong)} {d.don_vi}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase mb-2 ml-1">
                      {selectedPhieu.loai === 'xa' ? '✂️ Mảnh xả ra' : '🔗 Vật tư gộp lại'}
                    </h4>
                    <div className="bg-green-50/50 border border-green-100 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-green-100/50">
                          <tr>
                            <th className="px-4 py-2 font-bold text-green-800">Tên vật tư</th>
                            <th className="px-4 py-2 font-bold text-green-800 text-center">
                              Số lượng
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-green-100">
                          {(selectedPhieu.xasa_gop_chi_tiet || [])
                            .filter((d: any) => d.vai_tro === 'ra')
                            .map((d: any, i: number) => (
                              <tr key={i}>
                                <td className="px-4 py-3">
                                  <p className="font-bold text-gray-800">{d.materials?.name}</p>
                                  <p className="text-[10px] text-gray-400">{d.materials?.code}</p>
                                </td>
                                <td className="px-4 py-3 text-center font-bold text-green-700">
                                  {formatNumber(d.so_luong)} {d.don_vi}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {selectedPhieu.ghi_chu && (
                  <div className="bg-gray-50 p-4 rounded-2xl">
                    <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Ghi chú</p>
                    <p className="text-sm text-gray-600 italic">“{selectedPhieu.ghi_chu}”</p>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-gray-100 bg-gray-50 flex flex-wrap gap-3">
                {(user.role === 'Admin' ||
                  user.role === 'Develop' ||
                  selectedPhieu.nguoi_tao === user.id) && (
                  <>
                    <Button
                      variant="danger"
                      className="flex-1 rounded-2xl min-w-[120px]"
                      icon={Trash2}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePhieu(selectedPhieu);
                      }}
                      isLoading={submitting}
                    >
                      Xóa
                    </Button>
                    <Button
                      variant="primary"
                      className="flex-1 rounded-2xl min-w-[120px]"
                      icon={Scissors}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditPhieu(selectedPhieu);
                      }}
                      isLoading={submitting}
                    >
                      Sửa
                    </Button>
                  </>
                )}
                {selectedPhieu.trang_thai === 'cho_duyet' &&
                  (user.role === 'Admin' || user.role === 'Develop') && (
                    <>
                      <Button
                        variant="danger"
                        className="flex-1 rounded-2xl min-w-[120px]"
                        icon={X}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRejectPhieu(selectedPhieu);
                          setShowDetailPhieu(false);
                        }}
                        isLoading={submitting}
                      >
                        Từ chối
                      </Button>
                      <Button
                        variant="success"
                        className="flex-1 rounded-2xl min-w-[120px]"
                        icon={Package}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleApprovePhieu(selectedPhieu);
                          setShowDetailPhieu(false);
                        }}
                        isLoading={submitting}
                      >
                        Duyệt
                      </Button>
                    </>
                  )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <QuickAddMaterialModal
        show={showAddMaterial}
        onClose={() => setShowAddMaterial(false)}
        onSuccess={(newMat) => {
          refreshAll();
          setShowAddMaterial(false);
          if (addToast) addToast(`Đã thêm vật tư mới: ${newMat.name}`, 'success');
        }}
        groups={groups}
        color={mode === 'xa' ? 'orange' : 'blue'}
        addToast={addToast}
      />

      {/* FAB — Thêm phiếu mới */}
      <FAB onClick={() => setShowModal(true)} label="Tạo phiếu mới" />

      {/* Hidden Ref for Report Capture */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        <div ref={reportRef} className="p-8 bg-white" style={{ width: '1000px' }}>
          <div className="flex items-center justify-between mb-8 pb-4 border-b-2 border-primary/20">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-lg">
                <Scissors size={32} className="text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-gray-800 tracking-tight uppercase">
                  NHẬT KÝ XẢ / GỘP VẬT TƯ
                </h1>
                <p className="text-sm text-gray-500 font-bold uppercase tracking-widest mt-1">
                  Hệ thống CDX-2026 • {new Date().toLocaleDateString('vi-VN')}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">
                Xác nhận bởi
              </p>
              <p className="text-xs font-bold text-gray-800 uppercase bg-gray-50 px-3 py-1 rounded-lg border border-gray-100 italic">
                {user.full_name}
              </p>
            </div>
          </div>

          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-primary text-white">
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider">
                  Mã phiếu
                </th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider">Loại</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider">Ngày</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider">Kho</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider">
                  Chi tiết (Nguồn → Ra)
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map((item) => {
                const nguonItems = item.xasa_gop_chi_tiet?.filter((c: any) => c.is_input) || [];
                const raItems = item.xasa_gop_chi_tiet?.filter((c: any) => !c.is_input) || [];
                return (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="px-4 py-3.5 text-xs font-black text-primary uppercase">
                      {item.ma_phieu}
                    </td>
                    <td className="px-4 py-3.5 text-xs font-bold uppercase">
                      <span className={item.loai === 'xa' ? 'text-orange-500' : 'text-blue-500'}>
                        {item.loai === 'xa' ? 'Xả' : 'Gộp'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs font-bold text-gray-600">
                      {formatDate(item.ngay)}
                    </td>
                    <td className="px-4 py-3.5 text-xs font-bold text-gray-500">
                      {item.warehouses?.name}
                    </td>
                    <td className="px-4 py-3.5 text-[10px] font-bold text-gray-800">
                      {nguonItems.map((n: any) => n.materials?.name).join(', ')} →{' '}
                      {raItems.map((r: any) => r.materials?.name).join(', ')}
                    </td>
                  </tr>
                );
              })}
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
      </div>
    </div>
  );
};
