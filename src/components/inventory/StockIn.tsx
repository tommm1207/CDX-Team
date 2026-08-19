import { useState, useEffect, FormEvent, useRef, useCallback } from 'react';

import {
  Plus,
  Search,
  ChevronRight,
  X,
  ArrowDownCircle,
  Edit,
  Navigation,
  Trash2,
  PackagePlus,
  ChevronDown,
  Check,
  Image as ImageIcon,
  RefreshCw,
  Camera,
} from 'lucide-react';
import { ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '@/lib/supabase';
import { Employee } from '@/types';
import { PageBreadcrumb } from '@/components/shared';
import { NumericInput } from '@/components/shared';
import { ImageCapture } from '@/components/shared';
import { CreatableSelect } from '@/components/shared';
import { ToastType } from '@/components/shared';
import { ConfirmModal } from '@/components/shared';
import { QuickAddMaterialModal } from '@/components/shared';
import { FAB } from '@/components/shared';
import { useInventoryData } from '@/hooks/useInventoryData';
import {
  formatDate,
  formatCurrency,
  formatNumber,
  numberToWords,
  toLocalISODate,
} from '@/utils/format';
import { isUUID, getAllowedWarehouses } from '@/utils/helpers';
import { getAvailableStock, validateFutureImpact } from '@/utils/inventory';
import { Button } from '@/components/shared';
import { SortButton, SortOption } from '@/components/shared';
import { PageToolbar, FilterPanel, FilterSearchInput, DateRangeFilter } from '@/components/shared';
import { ReportImagePreviewModal } from '@/components/shared';
import { logAudit } from '@/utils/auditLogger';

// Helper: lấy tồn kho hiện tại (tính tới hôm nay) cho cặp (material, warehouse)
const getCurrentStock = (matId: string, whId: string) =>
  getAvailableStock(matId, whId, toLocalISODate());

export const StockIn = ({
  user,
  onBack,
  initialStatus,
  initialAction,
  addToast,
  setHideBottomNav,
}: {
  user: Employee;
  onBack?: () => void;
  initialStatus?: string;
  initialAction?: string;
  addToast?: (message: string, type?: ToastType) => void;
  setHideBottomNav?: (hide: boolean) => void;
}) => {
  const [slips, setSlips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(initialAction === 'add');
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    if (setHideBottomNav) {
      setHideBottomNav(showModal || showDetailModal);
    }
    if (showModal || showDetailModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
  }, [showModal, showDetailModal, setHideBottomNav]);
  const [selectedSlip, setSelectedSlip] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [statusFilter, setStatusFilter] = useState(initialStatus || 'Tất cả');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterWarehouseId, setFilterWarehouseId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [materialHistory, setMaterialHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>(
    (localStorage.getItem(`sort_pref_stockin_${user.id}`) as SortOption) || 'date',
  );
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // === Số lượng cần (Warehouse Requirements) ===
  const [requiredQty, setRequiredQty] = useState<number>(0);
  const [currentStock, setCurrentStock] = useState<number | null>(null);
  const [reqLoading, setReqLoading] = useState(false);

  const { warehouses, materials, groups, refreshAll, fetchWarehouses } = useInventoryData(
    user.data_view_permission,
  );

  const initialFormState = {
    date: toLocalISODate(),
    warehouse_id: '',
    material_id: '',
    quantity: 0,
    unit_price: 0,
    unit: '',
    notes: '',
    import_code: `NK-${new Date().getFullYear().toString().slice(-2)}${(new Date().getMonth() + 1).toString().padStart(2, '0')}${new Date().getDate().toString().padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`,
    status: 'Chờ duyệt',
    image_url: '',
  };

  const [formData, setFormData] = useState(initialFormState);

  useEffect(() => {
    fetchSlips();
  }, []);

  // Load required_qty + current stock khi đổi kho hoặc vật tư
  useEffect(() => {
    const matId = isUUID(formData.material_id)
      ? formData.material_id
      : materials.find((m) => m.name === formData.material_id)?.id;
    const whId = isUUID(formData.warehouse_id)
      ? formData.warehouse_id
      : warehouses.find((w) => w.name === formData.warehouse_id)?.id;

    if (!matId || !whId) {
      setRequiredQty(0);
      setCurrentStock(null);
      return;
    }
    setReqLoading(true);
    Promise.all([
      supabase
        .from('warehouse_requirements')
        .select('required_quantity')
        .eq('warehouse_id', whId)
        .eq('material_id', matId)
        .maybeSingle(),
      getCurrentStock(matId, whId),
    ]).then(([reqRes, stock]) => {
      setRequiredQty(reqRes.data?.required_quantity ?? 0);
      setCurrentStock(stock);
      setReqLoading(false);
    });
  }, [formData.material_id, formData.warehouse_id, materials, warehouses]);

  const fetchSlips = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('stock_in')
        .select('*, warehouses(name, code), materials(name, code, unit)')
        .order('import_code', { ascending: false });

      if (statusFilter === 'Tất cả') {
        query = query.neq('status', 'Đã xóa');
      } else {
        query = query.eq('status', statusFilter);
      }

      const allowedWhIds = getAllowedWarehouses(user.data_view_permission);
      if (allowedWhIds) {
        query = query.in('warehouse_id', allowedWhIds);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error fetching stock_in:', error);
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('stock_in')
          .select('*')
          .order('import_code', { ascending: false });
        if (fallbackError) throw fallbackError;
        setSlips(fallbackData || []);
      } else {
        setSlips(data || []);
      }
    } catch (err: any) {
      if (addToast) addToast('Lỗi tải phiếu nhập kho: ' + err.message, 'error');
      else alert('Lỗi tải phiếu nhập kho: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSlips();
  }, [statusFilter]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!formData.material_id) {
      if (addToast) addToast('Vui lòng chọn Tên vật tư nhập.', 'error');
      return;
    }
    if (!formData.warehouse_id) {
      if (addToast) addToast('Vui lòng chọn Kho nhập.', 'error');
      return;
    }
    if (!formData.quantity || formData.quantity <= 0) {
      if (addToast) addToast('Vui lòng nhập số lượng nhập hợp lệ.', 'error');
      return;
    }

    setSubmitting(true);
    try {
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

      let finalMaterialId = formData.material_id;
      if (formData.material_id && !isUUID(formData.material_id)) {
        const matByName = materials.find(
          (m) => m.name.toLowerCase() === formData.material_id.toLowerCase(),
        );
        if (matByName) {
          finalMaterialId = matByName.id;
        } else {
          throw new Error('Bạn phải chọn vật tư từ Danh mục!');
        }
      }

      const payload = {
        ...formData,
        warehouse_id: finalWarehouseId,
        material_id: finalMaterialId,
        employee_id: user.id,
        total_amount: formData.quantity * formData.unit_price,
        unit: formData.unit || materials.find((m) => m.id === finalMaterialId)?.unit || '',
        status: ['admin', 'develop'].includes(user.role?.toLowerCase() || '')
          ? isEditing
            ? formData.status
            : 'Chờ duyệt'
          : 'Chờ duyệt',
        notes: isEditing
          ? `[SỬA lúc ${new Date().toLocaleString('vi-VN')}] ${formData.notes.replace(/^\[SỬA lúc .*?\]\s*/, '')}`
          : formData.notes,
      };

      if (isEditing && selectedSlip) {
        if (selectedSlip.status === 'Đã duyệt') {
          const matChanged = finalMaterialId !== selectedSlip.material_id;
          const whChanged = finalWarehouseId !== selectedSlip.warehouse_id;
          const dateChanged = formData.date !== selectedSlip.date;

          if (matChanged || whChanged || dateChanged) {
            const impactOld = await validateFutureImpact(
              selectedSlip.material_id,
              selectedSlip.warehouse_id,
              selectedSlip.date,
              -selectedSlip.quantity,
            );
            if (!impactOld.valid) {
              throw new Error(
                `Không thể thay đổi vì tồn kho ${selectedSlip.materials?.name} tại kho cũ sẽ bị âm vào ngày ${impactOld.failedDate}`,
              );
            }
          } else {
            const diff = formData.quantity - selectedSlip.quantity;
            if (diff < 0) {
              const impact = await validateFutureImpact(
                finalMaterialId,
                finalWarehouseId,
                formData.date,
                diff,
              );
              if (!impact.valid) {
                throw new Error(
                  `Không thể giảm số lượng nhập vì sẽ gây âm kho vào ngày ${impact.failedDate}`,
                );
              }
            }
          }
        }

        const { error } = await supabase.from('stock_in').update(payload).eq('id', selectedSlip.id);
        if (error) throw error;

        await supabase
          .from('costs')
          .update({
            quantity: payload.quantity,
            unit_price: payload.unit_price,
            total_amount: payload.total_amount,
            notes: `Cập nhật từ phiếu ${payload.import_code} (Sửa ngày ${new Date().toLocaleDateString()})`,
          })
          .ilike('content', `%${payload.import_code}%`);

        await logAudit(user, {
          module: 'WAREHOUSE',
          action: 'UPDATE',
          description: `Cập nhật phiếu nhập kho: ${payload.import_code}`,
          recordId: selectedSlip.id,
        });
      } else {
        const { error } = await supabase.from('stock_in').insert([payload]);
        if (error) throw error;

        await logAudit(user, {
          module: 'WAREHOUSE',
          action: 'CREATE',
          description: `Tạo phiếu nhập kho: ${payload.import_code}`,
        });
      }

      // Lưu lại số lượng cần vào warehouse_requirements nếu requiredQty > 0
      if (requiredQty > 0) {
        await supabase.from('warehouse_requirements').upsert(
          {
            warehouse_id: finalWarehouseId,
            material_id: finalMaterialId,
            required_quantity: requiredQty,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'warehouse_id,material_id' },
        );
      }

      setShowModal(false);
      fetchSlips();
      setIsEditing(false);
      setSelectedSlip(null);
      if (addToast)
        addToast(isEditing ? 'Cập nhật phiếu nhập thành công!' : 'Nhập kho thành công!', 'success');
    } catch (err: any) {
      if (addToast) addToast('Lỗi: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRowClick = async (slip: any) => {
    setSelectedSlip(slip);
    setShowDetailModal(true);

    setLoadingHistory(true);
    try {
      const { data } = await supabase
        .from('stock_in')
        .select(
          `
          *,
          materials(name, unit),
          warehouses(name),
          users(full_name)
        `,
        )
        .eq('material_id', slip.material_id)
        .eq('status', 'Đã duyệt')
        .order('import_code', { ascending: false })
        .limit(5);
      setMaterialHistory(data || []);
    } catch (err) {
      console.error('Error fetching history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleEdit = () => {
    setFormData({
      date: selectedSlip.date,
      warehouse_id: selectedSlip.warehouse_id,
      material_id: selectedSlip.material_id,
      quantity: selectedSlip.quantity,
      unit_price: selectedSlip.unit_price,
      unit: selectedSlip.unit,
      notes: selectedSlip.notes?.replace(/^\[SỬA lúc .*?\]\s*/, '') || '',
      import_code: selectedSlip.import_code || formData.import_code,
      status: selectedSlip.status,
      image_url: selectedSlip.image_url || '',
    });
    setIsEditing(true);
    setShowDetailModal(false);
    setShowModal(true);
  };

  const handleApprove = async (id: string, status: string) => {
    try {
      const { error } = await supabase.from('stock_in').update({ status }).eq('id', id);
      if (error) throw error;

      if (status === 'Đã duyệt') {
        const { data: slip } = await supabase
          .from('stock_in')
          .select('*, users(id)')
          .eq('id', id)
          .maybeSingle();
        if (slip && slip.total_amount > 0) {
          const { data: existingCost } = await supabase
            .from('costs')
            .select('id')
            .ilike('content', `%${slip.import_code}%`)
            .maybeSingle();

          if (!existingCost) {
            const dateObj = new Date(slip.date);
            const d = String(dateObj.getDate()).padStart(2, '0');
            const m = String(dateObj.getMonth() + 1).padStart(2, '0');
            const y = String(dateObj.getFullYear()).slice(-2);
            const random = Math.floor(1000 + Math.random() * 9000);
            const userPrefix = (slip as any).users?.id?.slice(0, 4) || 'SYS';
            const costCode = `CP-${userPrefix.toUpperCase()}-${d}${m}${y}-${random}`;

            await supabase.from('costs').insert([
              {
                transaction_type: 'Chi',
                cost_code: costCode,
                date: slip.date,
                employee_id: user.id,
                cost_type: 'Vật tư',
                content: `Nhập kho từ phiếu ${slip.import_code}`,
                material_id: slip.material_id,
                warehouse_id: slip.warehouse_id,
                quantity: slip.quantity,
                unit: slip.unit,
                unit_price: slip.unit_price,
                total_amount: slip.total_amount,
                notes: 'Tự động tạo từ hệ thống Nhập Kho',
              },
            ]);
          }
        }
      }

      fetchSlips();
      setShowDetailModal(false);
      if (addToast) addToast('Cập nhật trạng thái thành công!', 'success');
    } catch (err: any) {
      if (addToast) addToast('Lỗi: ' + err.message, 'error');
      else alert('Lỗi: ' + err.message);
    }
  };

  const handleDelete = () => {
    if (!selectedSlip) return;
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    try {
      if (selectedSlip.status === 'Đã duyệt') {
        const stockFull = await getAvailableStock(
          selectedSlip.material_id,
          selectedSlip.warehouse_id,
          '9999-12-31',
        );
        if (stockFull < selectedSlip.quantity) {
          const thieu = selectedSlip.quantity - stockFull;
          throw new Error(`❌ Từ chối xóa phiếu nhập ${selectedSlip.import_code}
- Mặt hàng: ${selectedSlip.materials?.name || selectedSlip.material_id}
- Tồn kho hiện tại: ${stockFull + selectedSlip.quantity}
- Số lượng phiếu nhập cần xóa: ${selectedSlip.quantity}
- Tồn/Hụt dự tính sau xóa: ${stockFull}
→ Phiếu nhập này đã có ${thieu} đơn vị được xuất hoặc chuyển đi.
→ Không thể xóa vì sẽ làm tồn kho âm — không phản ánh thực tế.`);
        }
      }

      const { error } = await supabase
        .from('stock_in')
        .update({ status: 'Đã xóa' })
        .eq('id', selectedSlip.id);
      if (error) throw error;

      await supabase
        .from('costs')
        .update({ status: 'Đã xóa' })
        .ilike('content', `%${selectedSlip.import_code}%`);

      if (addToast) addToast('Đã chuyển phiếu vào thùng rác', 'success');
      setShowDetailModal(false);
      setShowDeleteConfirm(false);
      fetchSlips();
    } catch (err: any) {
      const msg = err.message.includes('foreign key constraint')
        ? 'Không thể xóa phiếu này vì đang có dữ liệu liên quan khác.'
        : err.message;
      if (addToast) addToast('Lỗi: ' + msg, 'error');
      else alert('Lỗi: ' + msg);
    }
  };

  const handleExportExcel = useCallback(() => {
    import('@/utils/excelExport').then(({ exportToExcel }) => {
      exportToExcel({
        title: 'Báo cáo Nhập kho',
        sheetName: 'Nhập kho',
        columns: [
          'Ngày',
          'Mã phiếu',
          'Vật tư',
          'Kho',
          'Số lượng',
          'Đơn giá',
          'Thành tiền',
          'Trạng thái',
        ],
        rows: slips.map((it) => [
          it.date,
          it.import_code,
          it.materials?.name ?? '',
          it.warehouses?.name ?? '',
          it.quantity,
          it.unit_price,
          it.total_amount ?? 0,
          it.status,
        ]),
        fileName: `CDX_NhapKho_${toLocalISODate()}.xlsx`,
        addToast,
      });
    });
  }, [slips, addToast]);

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24 overflow-x-hidden">
      <div className="flex items-center justify-between gap-2 mb-4">
        <PageBreadcrumb title="Nhập kho" onBack={onBack} />
        <PageToolbar
          tableRef={tableRef}
          captureOptions={{ reportTitle: 'BẢNG NHẬP KHO' }}
          onImageCaptured={setPreviewImageUrl}
          onExportExcel={handleExportExcel}
          sortOptions={[
            { value: 'code', label: 'Mã chứng từ' },
            { value: 'newest', label: 'Mới nhất' },
            { value: 'price', label: 'Thành tiền' },
            { value: 'date', label: 'Ngày tạo' },
          ]}
          currentSort={sortBy}
          onSortChange={(v) => {
            setSortBy(v as SortOption);
            localStorage.setItem(`sort_pref_stockin_${user.id}`, v);
          }}
          showFilter={showFilter}
          onFilterToggle={() => setShowFilter((f) => !f)}
        />
      </div>

      <FilterPanel
        show={showFilter}
        hideTitle={true}
        onReset={() => {
          setFilterStartDate('');
          setFilterEndDate('');
          setFilterWarehouseId('');
          setSearchTerm('');
          setStatusFilter('Tất cả');
        }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase">Từ ngày</label>
            <input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs outline-none focus:ring-2 focus:ring-primary/20 bg-white"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase">Đến ngày</label>
            <input
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs outline-none focus:ring-2 focus:ring-primary/20 bg-white"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase">Kho</label>
            <select
              value={filterWarehouseId}
              onChange={(e) => setFilterWarehouseId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs outline-none focus:ring-2 focus:ring-primary/20 bg-white"
            >
              <option value="">Tất cả kho</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase">Tìm kiếm</label>
            <FilterSearchInput
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Vật tư, mã phiếu..."
            />
          </div>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-2">
          {['Tất cả', 'Chờ duyệt', 'Đã duyệt', 'Từ chối'].map((status) => (
            <Button
              key={status}
              size="sm"
              variant={statusFilter === status ? 'primary' : 'outline'}
              onClick={() => setStatusFilter(status)}
            >
              {status}
            </Button>
          ))}
        </div>
      </FilterPanel>

      {/* Table with ref for image capture */}
      {(() => {
        const filteredSlips = slips
          .filter((item) => {
            let match = true;
            if (filterStartDate && item.date < filterStartDate) match = false;
            if (filterEndDate && item.date > filterEndDate) match = false;
            if (filterWarehouseId && item.warehouse_id !== filterWarehouseId) match = false;
            if (searchTerm) {
              const s = searchTerm.toLowerCase();
              const nameMatch = (item.materials?.name || '').toLowerCase().includes(s);
              const codeMatch = (item.import_code || '').toLowerCase().includes(s);
              const noteMatch = (item.notes || '').toLowerCase().includes(s);
              if (!nameMatch && !codeMatch && !noteMatch) match = false;
            }
            return match;
          })
          .sort((a, b) => {
            if (sortBy === 'date' || sortBy === 'newest')
              return new Date(b.date).getTime() - new Date(a.date).getTime();
            if (sortBy === 'code') return (a.import_code || '').localeCompare(b.import_code || '');
            if (sortBy === 'price') return (b.total_amount || 0) - (a.total_amount || 0);
            return 0;
          });
        return (
          <div
            ref={tableRef}
            className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-primary text-white">
                    <th className="px-2 md:px-4 py-2 md:py-3 text-[9px] md:text-[10px] font-bold uppercase tracking-wider border-r border-white/10">
                      Vật tư
                    </th>
                    <th className="px-2 md:px-4 py-2 md:py-3 text-[9px] md:text-[10px] font-bold uppercase tracking-wider border-r border-white/10">
                      Kho
                    </th>
                    <th className="px-2 md:px-4 py-2 md:py-3 text-[9px] md:text-[10px] font-bold uppercase tracking-wider border-r border-white/10 text-center">
                      SL
                    </th>
                    <th className="px-2 md:px-4 py-2 md:py-3 text-[9px] md:text-[10px] font-bold uppercase tracking-wider border-r border-white/10 text-right">
                      Thành tiền
                    </th>
                    <th className="px-2 md:px-4 py-2 md:py-3 text-[9px] md:text-[10px] font-bold uppercase tracking-wider text-center w-36">
                      Trạng thái
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
                  ) : filteredSlips.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-400 italic">
                        Chưa có phiếu nhập nào
                      </td>
                    </tr>
                  ) : (
                    (() => {
                      let currentBackgroundColor = 'bg-white';
                      let lastGroupKey = '';

                      return filteredSlips.map((item) => {
                        let groupKey = item.date;
                        if (sortBy === 'code' || sortBy === 'newest') {
                          // Try grouping by date prefix if code has it, otherwise default to item.date
                          const dateMatch = item.import_code?.match(/-(\d+)-/);
                          groupKey = dateMatch ? dateMatch[1] : item.date;
                        }

                        if (groupKey !== lastGroupKey) {
                          currentBackgroundColor =
                            currentBackgroundColor === 'bg-white' ? 'bg-gray-100' : 'bg-white';
                          lastGroupKey = groupKey;
                        }

                        return (
                          <tr
                            key={item.id}
                            onClick={() => handleRowClick(item)}
                            className={`transition-colors cursor-pointer group ${currentBackgroundColor} hover:brightness-95`}
                          >
                            <td className="px-2 md:px-4 py-2.5 md:py-3 text-[10px] md:text-xs text-gray-600 border-b border-gray-100/50">
                              {formatDate(item.date)}
                            </td>
                            <td className="px-2 md:px-4 py-2.5 md:py-3 text-[11px] md:text-xs text-gray-800 font-bold border-b border-gray-100/50">
                              {item.materials?.name}
                            </td>
                            <td className="px-2 md:px-4 py-2.5 md:py-3 text-[10px] md:text-xs text-gray-600 border-b border-gray-100/50 max-w-[80px] truncate">
                              {item.warehouses?.name}
                            </td>
                            <td className="px-2 md:px-4 py-2.5 md:py-3 text-[11px] md:text-xs text-gray-700 font-medium text-center border-b border-gray-100/50">
                              {formatNumber(item.quantity)}{' '}
                              <span className="text-[9px] md:text-[10px] text-gray-400">
                                {item.unit || item.materials?.unit}
                              </span>
                            </td>
                            <td className="px-2 md:px-4 py-2.5 md:py-3 text-[11px] md:text-xs text-primary font-bold text-right border-b border-gray-100/50">
                              {formatCurrency(item.total_amount || 0)}
                            </td>
                            <td className="px-2 md:px-4 py-2.5 md:py-3 text-[10px] md:text-xs w-36 border-b border-gray-100/50">
                              <div className="flex items-center justify-between gap-1">
                                <div className="flex flex-wrap items-center gap-1">
                                  {(item.import_code || '').startsWith('XA') && (
                                    <span className="px-1.5 py-px rounded text-[8px] font-black bg-orange-50 text-orange-400 border border-orange-100 leading-none whitespace-nowrap">
                                      Rã
                                    </span>
                                  )}
                                  {(item.import_code || '').startsWith('GOP') && (
                                    <span className="px-1.5 py-px rounded text-[8px] font-black bg-blue-50 text-blue-400 border border-blue-100 leading-none whitespace-nowrap">
                                      Gộp
                                    </span>
                                  )}
                                  {(item.import_code || '').startsWith('SX-') && (
                                    <span className="px-1.5 py-px rounded text-[8px] font-black bg-purple-50 text-purple-600 border border-purple-100 leading-none whitespace-nowrap">
                                      SX Cọc
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  <span
                                    className={`px-1.5 md:px-2 py-0.5 rounded-md md:rounded-full text-[9px] md:text-[10px] font-bold leading-none whitespace-nowrap ${
                                      item.status === 'Đã duyệt'
                                        ? 'bg-green-100 text-green-600'
                                        : item.status === 'Từ chối'
                                          ? 'bg-red-100 text-red-600'
                                          : 'bg-yellow-100 text-yellow-600'
                                    }`}
                                  >
                                    {item.status || 'Chờ duyệt'}
                                  </span>
                                  <ChevronRight
                                    size={14}
                                    className="text-gray-300 group-hover:text-primary transition-colors hidden md:block"
                                  />
                                </div>
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
          </div>
        );
      })()}

      <AnimatePresence>
        {showDetailModal && selectedSlip && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDetailModal(false)}
              className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%', x: 0 }}
              animate={{ y: 0, x: 0 }}
              exit={{ y: '100%', x: 0 }}
              style={{ willChange: 'transform' }}
              className="fixed inset-x-0 bottom-0 z-[201] bg-white rounded-t-3xl shadow-2xl
                         flex flex-col max-h-[90dvh]
                         md:inset-x-auto md:inset-y-0 md:right-0 md:w-[420px] md:rounded-t-none md:rounded-l-3xl md:max-h-full"
              transition={{ type: 'spring', damping: 28, stiffness: 240 }}
            >
              <div className="flex justify-center pt-3 pb-1 md:hidden">
                <div className="w-10 h-1 bg-gray-200 rounded-full" />
              </div>

              <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center hover:bg-primary/20 transition-all active:scale-95 cursor-pointer shadow-sm border border-primary/10"
                    onClick={() => setShowDetailModal(false)}
                  >
                    <Navigation size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-black text-primary">{selectedSlip.import_code}</p>
                    <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">
                      Chi tiết nhập kho
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-xl transition-all active:scale-95 text-gray-400"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {[
                  { label: 'Ngày nhập', value: formatDate(selectedSlip.date) },
                  { label: 'Vật tư', value: selectedSlip.materials?.name },
                  { label: 'Kho nhập', value: selectedSlip.warehouses?.name },
                  {
                    label: 'Số lượng',
                    value: `${formatNumber(selectedSlip.quantity)} ${selectedSlip.unit || selectedSlip.materials?.unit || ''}`,
                  },
                  { label: 'Đơn giá', value: formatCurrency(selectedSlip.unit_price || 0) },
                  {
                    label: 'Thành tiền',
                    value: formatCurrency(selectedSlip.total_amount || 0),
                    highlight: true,
                  },
                  { label: 'Trạng thái', value: selectedSlip.status || 'Chờ duyệt' },
                  { label: 'Diễn giải', value: selectedSlip.notes || '—' },
                ].map(({ label, value, highlight }) => (
                  <div
                    key={label}
                    className="flex justify-between items-start border-b border-gray-50 pb-3 gap-4"
                  >
                    <span className="text-[11px] text-gray-500 font-medium shrink-0">{label}</span>
                    <p
                      className={`text-sm text-right ${highlight ? 'text-primary font-bold' : 'text-gray-900'}`}
                    >
                      {value || '—'}
                    </p>
                  </div>
                ))}

                {selectedSlip.image_url && (
                  <div className="space-y-2">
                    <p className="text-[10px] text-gray-400 font-bold uppercase">Ảnh minh chứng</p>
                    <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-gray-50">
                      <img
                        src={selectedSlip.image_url}
                        alt="Proof"
                        className="w-full h-auto object-contain max-h-[300px]"
                      />
                    </div>
                  </div>
                )}

                <div className="bg-blue-50 rounded-xl p-3">
                  <p className="text-[10px] text-blue-400 font-bold uppercase mb-1">
                    Thành tiền bằng chữ
                  </p>
                  <p className="text-xs text-blue-700 italic font-medium">
                    {numberToWords(selectedSlip.total_amount || 0)}
                  </p>
                </div>

                {materialHistory.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] text-gray-400 font-bold uppercase">
                      Lịch sử nhập gần đây
                    </p>
                    {materialHistory.map((h, i) => (
                      <div
                        key={i}
                        className="flex justify-between items-center text-[11px] bg-gray-50 p-2 rounded-lg"
                      >
                        <span className="text-gray-500">{formatDate(h.date)}</span>
                        <span className="font-bold text-primary">
                          {formatNumber(h.quantity)} {h.unit}
                        </span>
                        <span className="text-gray-400">{h.warehouses?.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-3xl md:rounded-b-none space-y-2">
                {selectedSlip.status !== 'Đã xóa' &&
                  (user.role === 'Admin' || user.role === 'Develop') &&
                  selectedSlip.status === 'Chờ duyệt' &&
                  ((selectedSlip.import_code || '').startsWith('XA') ||
                  (selectedSlip.import_code || '').startsWith('GOP') ||
                  (selectedSlip.import_code || '').startsWith('SX-') ? (
                    <div className="px-3 py-2 bg-orange-50 border border-orange-100 rounded-xl text-xs text-orange-600 font-medium text-center">
                      {(selectedSlip.import_code || '').startsWith('SX-')
                        ? 'Phiếu từ Sản xuất Cọc — duyệt từ màn hình Sản xuất Cọc'
                        : 'Phiếu từ Rã/Gộp — duyệt từ màn hình Rã/Gộp vật tư'}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        fullWidth
                        variant="danger"
                        icon={X}
                        onClick={() => handleApprove(selectedSlip.id, 'Từ chối')}
                      >
                        Từ chối
                      </Button>
                      <Button
                        fullWidth
                        variant="success"
                        icon={Check}
                        onClick={() => handleApprove(selectedSlip.id, 'Đã duyệt')}
                      >
                        Duyệt
                      </Button>
                    </div>
                  ))}
                {selectedSlip.status !== 'Đã xóa' && (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      fullWidth
                      variant="outline"
                      icon={Trash2}
                      onClick={handleDelete}
                      className="text-red-600 border-red-200 hover:bg-red-50"
                    >
                      Thùng rác
                    </Button>
                    <Button
                      fullWidth
                      variant="outline"
                      icon={Edit}
                      onClick={handleEdit}
                      className="text-gray-700 hover:bg-gray-50"
                    >
                      Sửa
                    </Button>
                  </div>
                )}
                <Button
                  fullWidth
                  variant="outline"
                  icon={X}
                  onClick={() => setShowDetailModal(false)}
                  className="text-gray-600 hover:bg-gray-50 border-gray-200"
                >
                  Đóng cửa sổ
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showModal && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md overflow-hidden"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[calc(100vh-40px)] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-blue-500 p-6 text-white flex items-center justify-between rounded-t-[2rem] md:rounded-t-[2.5rem] flex-shrink-0 relative">
                <div className="flex items-center gap-3">
                  <div
                    className="p-2 bg-white/20 rounded-xl cursor-pointer hover:bg-white/30 transition-all active:scale-95"
                    onClick={() => setShowModal(false)}
                    title="Đóng (Bấm icon hoặc X)"
                  >
                    <ArrowDownCircle size={24} />
                  </div>
                  <h3 className="font-bold text-lg">
                    {isEditing ? 'Sửa phiếu nhập kho' : 'Lập phiếu nhập kho'}
                  </h3>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 hover:bg-white/20 rounded-xl transition-all"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 custom-scrollbar">
                <form
                  onSubmit={handleSubmit}
                  className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-32"
                >
                  <div className="md:col-span-2 hidden">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                      Mã tham chiếu (Phiếu nhập)
                    </label>
                    <div className="bg-blue-50/50 px-5 py-3.5 rounded-2xl border border-blue-100 text-sm font-black text-blue-600 uppercase shadow-inner italic">
                      {formData.import_code ||
                        `NK-${toLocalISODate().replace(/-/g, '').slice(2)}-001`}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Ngày nhập kho *
                      </label>
                      <input
                        type="date"
                        required
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-blue-600/20"
                      />
                    </div>

                    <div className="relative z-[120]">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase font-black">
                          Vật tư cần nhập *
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowAddMaterial(true)}
                          className="text-[10px] font-bold text-blue-600 flex items-center gap-1 hover:underline"
                        >
                          <Plus size={12} /> Thêm vật tư mới
                        </button>
                      </div>
                      <CreatableSelect
                        value={formData.material_id}
                        options={materials}
                        onChange={(val) => {
                          const mat = materials.find((m) => m.id === val);
                          setFormData({
                            ...formData,
                            material_id: val,
                            unit: mat?.unit || formData.unit,
                          });
                        }}
                        allowCreate={false}
                        placeholder="Chọn vật tư..."
                        required
                      />
                    </div>

                    <div className="space-y-1 relative z-[110]">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Diễn giải
                      </label>
                      <textarea
                        rows={2}
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <CreatableSelect
                      label="Tên kho nhập *"
                      value={formData.warehouse_id}
                      options={warehouses}
                      onChange={(val) => setFormData({ ...formData, warehouse_id: val })}
                      onCreate={(val) => setFormData({ ...formData, warehouse_id: val })}
                      placeholder="Chọn kho..."
                      required
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase">
                          Số lượng
                        </label>
                        <NumericInput
                          value={formData.quantity}
                          onChange={(val) => setFormData({ ...formData, quantity: val })}
                          placeholder="Nhập SL..."
                        />
                      </div>

                      {/* === Block Số lượng cần === */}
                      {formData.material_id && formData.warehouse_id && (
                        <div className="md:col-span-2 p-3 rounded-xl border border-dashed border-blue-200 bg-blue-50/50 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest">
                              📋 Số lượng cần (Dự toán)
                            </label>
                            {reqLoading && (
                              <span className="text-[9px] text-blue-400 italic">Đang tải...</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <NumericInput
                              value={requiredQty}
                              onChange={setRequiredQty}
                              placeholder="Nhập số cần..."
                            />
                          </div>
                          {requiredQty > 0 && currentStock !== null && (
                            <div className="text-[10px] space-y-1 pt-1">
                              <div className="flex justify-between text-gray-500">
                                <span>Đã có trong kho:</span>
                                <span className="font-bold text-gray-700">
                                  {formatNumber(currentStock)}
                                </span>
                              </div>
                              <div className="flex justify-between text-gray-500">
                                <span>Cần tổng:</span>
                                <span className="font-bold text-blue-600">
                                  {formatNumber(requiredQty)}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Còn thiếu:</span>
                                <span
                                  className={`font-black ${Math.max(0, requiredQty - currentStock) > 0 ? 'text-red-600' : 'text-green-600'}`}
                                >
                                  {Math.max(0, requiredQty - currentStock) > 0
                                    ? `-${formatNumber(Math.max(0, requiredQty - currentStock))}`
                                    : '✅ Đủ rồi!'}
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                                <div
                                  className="bg-blue-500 h-1.5 rounded-full transition-all"
                                  style={{
                                    width: `${Math.min(100, (currentStock / requiredQty) * 100)}%`,
                                  }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase">
                          Đơn vị tính
                        </label>
                        <CreatableSelect
                          options={Array.from(new Set(materials.map((m) => m.unit))).map((u) => ({
                            id: String(u),
                            name: String(u),
                          }))}
                          value={formData.unit}
                          onChange={(val) => setFormData({ ...formData, unit: val })}
                          onCreate={(val) => setFormData({ ...formData, unit: val })}
                          placeholder="ĐVT..."
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase">
                          Đơn giá nhập
                        </label>
                        <NumericInput
                          value={formData.unit_price}
                          onChange={(val) => setFormData({ ...formData, unit_price: val })}
                          placeholder="Đơn giá..."
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase">
                          Thành tiền
                        </label>
                        <div className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-100 text-sm font-bold text-primary shadow-inner text-center">
                          {formatCurrency(formData.quantity * formData.unit_price)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-2 pt-4 border-t border-gray-100">
                    <ImageCapture
                      maxImages={1}
                      existingImages={formData.image_url ? [formData.image_url] : []}
                      onUpload={(urls) => setFormData({ ...formData, image_url: urls[0] || '' })}
                      label="Ảnh minh chứng (Hóa đơn, Vật tư thực tế...)"
                    />
                  </div>

                  <div className="md:col-span-2 flex justify-end gap-3 mt-4 pt-6 border-t border-gray-100">
                    <Button variant="outline" onClick={() => setShowModal(false)}>
                      Hủy
                    </Button>
                    <Button
                      type="submit"
                      variant="blue"
                      className="min-w-[120px]"
                      isLoading={submitting}
                    >
                      Lưu phiếu nhập
                    </Button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <QuickAddMaterialModal
        show={showAddMaterial}
        onClose={() => setShowAddMaterial(false)}
        onSuccess={(newMat) => {
          setFormData({ ...formData, material_id: newMat.id });
          setShowAddMaterial(false);
        }}
        groups={groups}
        warehouses={warehouses}
        color="green"
        addToast={addToast}
      />

      <ConfirmModal
        show={showDeleteConfirm}
        title="Xác nhận xóa"
        message="Bạn có chắc chắn muốn chuyển phiếu nhập kho này vào thùng rác? Hành động này cũng sẽ vô hiệu hóa bản ghi chi phí liên quan."
        confirmText="Chuyển vào thùng rác"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <FAB
        onClick={() => {
          setFormData({
            ...initialFormState,
            import_code: `NK-${new Date().getFullYear().toString().slice(-2)}${(new Date().getMonth() + 1).toString().padStart(2, '0')}${new Date().getDate().toString().padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`,
          });
          setIsEditing(false);
          setShowModal(true);
        }}
        label="Lập phiếu nhập"
        color="bg-blue-500"
      />

      {previewImageUrl && (
        <ReportImagePreviewModal
          imageDataUrl={previewImageUrl}
          fileName={`CDX_NhapKho_${toLocalISODate()}.png`}
          onClose={() => setPreviewImageUrl(null)}
        />
      )}
    </div>
  );
};
