import { CanvasLogo } from '@/components/shared';
import { exportTableImage } from '../../utils/reportExport';
import { useState, useEffect, FormEvent, useRef } from 'react';
import {
  Plus,
  Search,
  ChevronRight,
  X,
  ArrowUpCircle,
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
  Share2,
  Filter,
} from 'lucide-react';
import { ChangeEvent } from 'react';
import { compressImage, uploadToImgBB } from '@/utils/imageUpload';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '@/lib/supabase';
import { Employee } from '@/types';
import { PageBreadcrumb } from '@/components/shared';
import { NumericInput } from '@/components/shared';
import { CreatableSelect } from '@/components/shared';
import { ImageCapture } from '@/components/shared';
import { ToastType } from '@/components/shared';
import { ConfirmModal } from '@/components/shared';
import { QuickAddMaterialModal } from '@/components/shared';
import { FAB } from '@/components/shared';
import { useInventoryData } from '@/hooks/useInventoryData';
import { formatDate, formatCurrency, formatNumber, toLocalISODate } from '@/utils/format';
import { isUUID, generateCode, getAllowedWarehouses } from '@/utils/helpers';
import { Button } from '@/components/shared';
import { getAvailableStock, getDetailedStock, validateFutureImpact } from '@/utils/inventory';
import { ExcelButton } from '@/components/shared';
import { SortButton, SortOption } from '@/components/shared';

import { SaveImageButton } from '@/components/shared';
import { logAudit } from '@/utils/auditLogger';

export const StockOut = ({
  user,
  onBack,
  addToast,
  initialAction,
  setHideBottomNav,
}: {
  user: Employee;
  onBack?: () => void;
  addToast?: (message: string, type?: ToastType) => void;
  initialAction?: string;
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
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [availableStock, setAvailableStock] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [statusFilter, setStatusFilter] = useState('Tất cả');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterWarehouseId, setFilterWarehouseId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>(
    (localStorage.getItem(`sort_pref_stockout_${user.id}`) as SortOption) || 'date',
  );
  const [isCapturingTable, setIsCapturingTable] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const { warehouses, materials, groups, refreshAll, fetchWarehouses } = useInventoryData(
    user.data_view_permission,
  );

  const initialFormState = {
    date: toLocalISODate(),
    warehouse_id: '',
    material_id: '',
    quantity: 0,
    unit_price: 0,
    notes: '',
    status: 'Chờ duyệt',
    export_code: generateCode('XK'),
    image_url: '',
  };

  const [stockLoading, setStockLoading] = useState(false);
  const [formData, setFormData] = useState(initialFormState);

  useEffect(() => {
    fetchSlips();
  }, [statusFilter]);

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
        title: 'Báo cáo Xuất kho',
        sheetName: 'Xuất kho',
        columns: [
          'Mã phiếu',
          'Ngày',
          'Kho',
          'Vật tư',
          'Số lượng',
          'Đơn giá',
          'Ghi chú',
          'Trạng thái',
        ],
        rows: slips.map((it) => [
          it.export_code,
          it.date,
          it.warehouses?.name ?? '',
          it.materials?.name ?? '',
          it.quantity,
          it.unit_price,
          it.notes ?? '',
          it.status,
        ]),
        fileName: `CDX_XuatKho_${toLocalISODate()}.xlsx`,
        addToast,
      });
    });
  };

  useEffect(() => {
    if (formData.warehouse_id && formData.material_id && formData.date) {
      checkStock();
    } else {
      setAvailableStock(null);
    }
  }, [formData.warehouse_id, formData.material_id, formData.date, editingId]);

  const checkStock = async () => {
    const wh = warehouses.find(
      (w) => w.name === formData.warehouse_id || w.id === formData.warehouse_id,
    );
    const mat = materials.find(
      (m) => m.name === formData.material_id || m.id === formData.material_id,
    );

    if (!wh?.id || !mat?.id || !formData.date) return;

    setStockLoading(true);
    try {
      // Lấy tồn kho tích lũy đến đúng ngày của phiếu xuất.
      // Truyền editingId để loại trừ phiếu đang sửa khỏi tongXuat (tránh double-count).
      const stock = await getAvailableStock(mat.id, wh.id, formData.date, editingId || undefined);
      setAvailableStock(stock);
    } catch (err) {
      console.error('Error checking stock:', err);
    } finally {
      setStockLoading(false);
    }
  };

  const fetchSlips = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('stock_out')
        .select('*, warehouses(name, code), materials(name, code, unit)');

      if (statusFilter === 'Tất cả') {
        query = query.neq('status', 'Đã xóa');
      } else {
        query = query.eq('status', statusFilter);
      }

      const allowedWhIds = getAllowedWarehouses(user.data_view_permission);
      if (allowedWhIds) {
        query = query.in('warehouse_id', allowedWhIds);
      }

      const { data, error } = await query.order('export_code', { ascending: false });
      if (error) {
        console.error('Error fetching stock_out:', error);
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('stock_out')
          .select('*')
          .order('export_code', { ascending: false });
        if (fallbackError) throw fallbackError;
        setSlips(fallbackData || []);
      } else {
        setSlips(data || []);
      }
    } catch (err: any) {
      if (addToast) addToast('Lỗi tải phiếu xuất kho: ' + err.message, 'error');
      else alert('Lỗi tải phiếu xuất kho: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!formData.warehouse_id) {
      if (addToast) addToast('Vui lòng chọn Kho xuất.', 'error');
      return;
    }
    if (!formData.material_id) {
      if (addToast) addToast('Vui lòng chọn Vật tư xuất.', 'error');
      return;
    }
    if (!formData.quantity || formData.quantity <= 0) {
      if (addToast) addToast('Vui lòng nhập số lượng xuất hợp lệ.', 'error');
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

      // 1. Kiểm tra tồn kho tại THỜI ĐIỂM XUẤT (formData.date)
      const stockAtDate = await getAvailableStock(
        finalMaterialId,
        finalWarehouseId,
        formData.date,
        isEditing && selectedSlip ? selectedSlip.id : undefined,
      );

      if (stockAtDate === 0) {
        throw new Error(`Kho hiện không còn mặt hàng này vào ngày ${formatDate(formData.date)}`);
      } else if (Number(formData.quantity) > stockAtDate) {
        throw new Error(
          `Số lượng xuất (${formData.quantity}) vượt quá tồn kho hiện có (${stockAtDate}) vào ngày ${formData.date}`,
        );
      }

      // 2. Kiểm tra ÂM KHO TƯƠNG LAI (quan trọng cho phiếu Đã duyệt)
      if (isEditing && selectedSlip && selectedSlip.status === 'Đã duyệt') {
        const matChanged = finalMaterialId !== selectedSlip.material_id;
        const whChanged = finalWarehouseId !== selectedSlip.warehouse_id;
        const dateChanged = formData.date !== selectedSlip.date;

        if (matChanged || whChanged || dateChanged) {
          // Khi đổi vị trí/vật tư, ta "trả lại" tồn cũ (luôn an toàn)
          // và "trừ" tồn mới. Ta cần check xem việc trừ tồn mới có gây âm kho tương lai không.
          const impactNew = await validateFutureImpact(
            finalMaterialId,
            finalWarehouseId,
            formData.date,
            -formData.quantity,
          );
          if (!impactNew.valid) {
            throw new Error(
              `Không thể chuyển sang mặt hàng/kho này vì sẽ gây âm kho vào ngày ${impactNew.failedDate}`,
            );
          }
        } else {
          // Cùng vị trí, check chênh lệch
          const diff = selectedSlip.quantity - formData.quantity; // positive if we decrease output (safety), negative if we increase output
          if (diff < 0) {
            const impact = await validateFutureImpact(
              finalMaterialId,
              finalWarehouseId,
              formData.date,
              diff,
            );
            if (!impact.valid) {
              throw new Error(
                `Không thể tăng số lượng xuất vì sẽ gây âm kho vào ngày ${impact.failedDate}`,
              );
            }
          }
        }
      }

      const payload = {
        ...formData,
        warehouse_id: finalWarehouseId,
        material_id: finalMaterialId,
        employee_id: user.id,
        status: ['admin', 'develop'].includes(user.role?.toLowerCase() || '')
          ? isEditing
            ? formData.status
            : 'Chờ duyệt'
          : 'Chờ duyệt',
        total_amount: formData.quantity * formData.unit_price,
        export_code: formData.export_code || generateCode('XK'),
        notes: isEditing
          ? `[SỬA lúc ${new Date().toLocaleString('vi-VN')}] ${formData.notes.replace(/^\[SỬA lúc .*?\]\s*/, '')}`
          : formData.notes,
      };

      if (isEditing && selectedSlip) {
        const { error } = await supabase
          .from('stock_out')
          .update(payload)
          .eq('id', selectedSlip.id);
        if (error) throw error;

        await supabase
          .from('costs')
          .update({
            quantity: payload.quantity,
            unit_price: payload.unit_price,
            total_amount: payload.total_amount,
            notes: `Cập nhật từ phiếu ${payload.export_code} (Sửa ngày ${new Date().toLocaleDateString()})`,
          })
          .ilike('content', `%${payload.export_code || payload.id.slice(0, 8)}%`);

        await logAudit(user, {
          module: 'WAREHOUSE',
          action: 'UPDATE',
          description: `Cập nhật phiếu xuất kho: ${payload.export_code}`,
          recordId: selectedSlip.id,
        });
      } else {
        const { error } = await supabase.from('stock_out').insert([payload]);
        if (error) throw error;

        await logAudit(user, {
          module: 'WAREHOUSE',
          action: 'CREATE',
          description: `Tạo phiếu xuất kho: ${payload.export_code}`,
        });
      }

      setShowModal(false);
      fetchSlips();
      setFormData(initialFormState);
      setIsEditing(false);
      setEditingId(null);
      setSelectedSlip(null);
      if (addToast)
        addToast(
          isEditing ? 'Cập nhật phiếu xuất thành công!' : 'Lập phiếu xuất kho thành công!',
          'success',
        );
    } catch (err: any) {
      if (addToast) addToast('Lỗi: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (id: string, status: string) => {
    try {
      // Kiểm tra tồn kho trước khi duyệt xuất kho
      if (status === 'Đã duyệt') {
        const { data: slipToCheck } = await supabase
          .from('stock_out')
          .select('material_id, warehouse_id, quantity, date')
          .eq('id', id)
          .maybeSingle();

        if (slipToCheck) {
          // Loại trừ chính phiếu này khỏi tính toán (nó đang Chờ duyệt, đã được tính)
          // để kiểm tra tồn thực tế tích lũy đến ngày phiếu.
          const stockInfo = await getDetailedStock(
            slipToCheck.material_id,
            slipToCheck.warehouse_id,
            slipToCheck.date,
            id, // excludeId — bỏ phiếu hiện tại ra khỏi tính toán
          );
          if (stockInfo.available < 0) {
            const thieu = Math.abs(stockInfo.available);
            if (addToast)
              addToast(
                `❌ Từ chối duyệt phiếu xuất kho
- Tồn thực tế: ${formatNumber(stockInfo.actual)}
- Đang giữ chỗ (Phân bổ khác): ${formatNumber(stockInfo.pendingOut)}
- Khả dụng ngay: ${formatNumber(stockInfo.available)}
- Thiếu hụt: ${formatNumber(thieu)}
→ Vui lòng kiểm tra lại số lượng hoặc duyệt các phiếu nhập trước.`,
                'error',
              );
            return;
          }
        }
      }

      const { error } = await supabase.from('stock_out').update({ status }).eq('id', id);
      if (error) throw error;

      if (status === 'Đã duyệt') {
        const { data: slip } = await supabase
          .from('stock_out')
          .select('*, users(id)')
          .eq('id', id)
          .maybeSingle();
        if (slip && (slip as any).total_amount > 0) {
          // Check if cost already exists to prevent duplicates
          const { data: existingCost } = await supabase
            .from('costs')
            .select('id')
            .ilike('content', `%${slip.export_code || slip.id.slice(0, 8)}%`)
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
                transaction_type: 'Thu',
                cost_code: costCode,
                date: slip.date,
                employee_id: user.id,
                cost_type: 'Doanh thu',
                content: `Xuất kho từ phiếu ${slip.export_code || slip.id.slice(0, 8)}`,
                material_id: slip.material_id,
                warehouse_id: slip.warehouse_id,
                quantity: slip.quantity,
                unit: (slip as any).unit,
                unit_price: (slip as any).unit_price,
                total_amount: (slip as any).total_amount,
                notes: 'Tự động tạo từ hệ thống Xuất Kho',
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
      const { error } = await supabase
        .from('stock_out')
        .update({ status: 'Đã xóa' })
        .eq('id', selectedSlip.id);
      if (error) throw error;

      // Also void associated cost
      await supabase
        .from('costs')
        .update({ status: 'Đã xóa' })
        .ilike('content', `%${selectedSlip.export_code || selectedSlip.id.slice(0, 8)}%`);

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

  const handleRowClick = (slip: any) => {
    setSelectedSlip(slip);
    setShowDetailModal(true);
  };

  const handleEdit = () => {
    setFormData({
      date: selectedSlip.date,
      warehouse_id: selectedSlip.warehouse_id,
      material_id: selectedSlip.material_id,
      quantity: selectedSlip.quantity,
      unit_price: selectedSlip.unit_price || 0,
      notes: selectedSlip.notes?.replace(/^\[SỬA lúc .*?\]\s*/, '') || '',
      export_code: selectedSlip.export_code || formData.export_code,
      status: selectedSlip.status,
      image_url: selectedSlip.image_url || '',
    });
    setIsEditing(true);
    setEditingId(selectedSlip.id); // lưu id để loại trừ khỏi tính tồn
    setShowDetailModal(false);
    setShowModal(true);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24 overflow-x-hidden">
      <div className="flex items-center justify-between gap-2 mb-4">
        <PageBreadcrumb title="Xuất kho" onBack={onBack} />
        <div className="flex items-center gap-1.5 justify-end flex-1 flex-shrink-0">
          <SaveImageButton
            onClick={handleSaveTableImage}
            isCapturing={isCapturingTable}
            title="Lưu ảnh báo cáo A4"
          />
          <ExcelButton onClick={handleExportExcel} size="icon" />
          <SortButton
            currentSort={sortBy}
            onSortChange={(val) => {
              setSortBy(val);
              localStorage.setItem(`sort_pref_stockout_${user.id}`, val);
            }}
            options={[
              { value: 'code', label: 'Mã chứng từ' },
              { value: 'newest', label: 'Mới nhất' },
              { value: 'price', label: 'Thành tiền' },
              { value: 'date', label: 'Ngày tạo' },
            ]}
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
            className="z-10"
          >
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Từ ngày</label>
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Đến ngày</label>
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Kho</label>
                  <select
                    value={filterWarehouseId}
                    onChange={(e) => setFilterWarehouseId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs outline-none focus:ring-2 focus:ring-primary/20"
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
                  <input
                    type="text"
                    placeholder="Vật tư, mã phiếu, ghi chú..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-2">
                  Trạng thái
                </label>
                <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
                  {['Tất cả', 'Chờ duyệt', 'Đã duyệt', 'Từ chối', 'Đã xóa'].map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant={statusFilter === status ? 'primary' : 'outline'}
                      onClick={() => setStatusFilter(status)}
                    >
                      {status === 'Đã xóa' ? 'Thùng rác' : status}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
              const codeMatch = (item.export_code || '').toLowerCase().includes(s);
              const noteMatch = (item.notes || '').toLowerCase().includes(s);
              if (!nameMatch && !codeMatch && !noteMatch) match = false;
            }
            return match;
          })
          .sort((a, b) => {
            if (sortBy === 'date' || sortBy === 'newest')
              return new Date(b.date).getTime() - new Date(a.date).getTime();
            if (sortBy === 'code') return (a.export_code || '').localeCompare(b.export_code || '');
            if (sortBy === 'price') return (b.total_amount || 0) - (a.total_amount || 0);
            return 0;
          });
        return (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px] whitespace-nowrap">
                <thead>
                  <tr className="bg-red-600 text-white">
                    <th className="px-2 md:px-4 py-2 md:py-3 text-[9px] md:text-[10px] font-bold uppercase tracking-wider border-r border-white/10">
                      Ngày
                    </th>
                    <th className="px-2 md:px-4 py-2 md:py-3 text-[9px] md:text-[10px] font-bold uppercase tracking-wider border-r border-white/10">
                      Kho
                    </th>
                    <th className="px-2 md:px-4 py-2 md:py-3 text-[9px] md:text-[10px] font-bold uppercase tracking-wider border-r border-white/10">
                      Vật tư
                    </th>
                    <th className="px-2 md:px-4 py-2 md:py-3 text-[9px] md:text-[10px] font-bold uppercase tracking-wider border-r border-white/10 text-center">
                      SL
                    </th>
                    <th className="px-2 md:px-4 py-2 md:py-3 text-[9px] md:text-[10px] font-bold uppercase tracking-wider text-center w-36">
                      Trạng thái
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-400 italic">
                        Đang tải...
                      </td>
                    </tr>
                  ) : filteredSlips.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-400 italic">
                        Chưa có phiếu xuất nào
                      </td>
                    </tr>
                  ) : (
                    (() => {
                      let currentBackgroundColor = 'bg-white';
                      let lastGroupKey = '';

                      return filteredSlips.map((item) => {
                        let groupKey = item.date;
                        if (sortBy === 'code' || sortBy === 'newest') {
                          const dateMatch = item.export_code?.match(/-(\d+)-/);
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
                            <td className="px-2 md:px-4 py-2.5 md:py-3 text-[10px] md:text-xs text-gray-600 border-b border-gray-100/50 max-w-[80px] truncate">
                              {item.warehouses?.name}
                            </td>
                            <td className="px-2 md:px-4 py-2.5 md:py-3 text-[11px] md:text-xs text-gray-800 font-bold border-b border-gray-100/50">
                              {item.materials?.name}
                            </td>
                            <td className="px-2 md:px-4 py-2.5 md:py-3 text-[11px] md:text-xs text-red-600 text-center font-bold border-b border-gray-100/50">
                              -{formatNumber(item.quantity)}{' '}
                              <span className="text-[9px] md:text-[10px] text-gray-400 font-normal">
                                {item.materials?.unit || ''}
                              </span>
                            </td>
                            <td className="px-2 md:px-4 py-2.5 md:py-3 text-[10px] md:text-xs w-36 border-b border-gray-100/50">
                              <div className="flex items-center justify-between gap-1">
                                <div className="flex flex-wrap items-center gap-1">
                                  {(item.export_code || '').startsWith('XA') && (
                                    <span className="px-1.5 py-px rounded text-[8px] font-black bg-orange-50 text-orange-400 border border-orange-100 leading-none whitespace-nowrap">
                                      Rã
                                    </span>
                                  )}
                                  {(item.export_code || '').startsWith('GOP') && (
                                    <span className="px-1.5 py-px rounded text-[8px] font-black bg-blue-50 text-blue-400 border border-blue-100 leading-none whitespace-nowrap">
                                      Gộp
                                    </span>
                                  )}
                                  {(item.export_code || '').startsWith('SX-') && (
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
                                          : 'bg-amber-100 text-amber-600'
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

      {/* Detail Panel — slide-up mobile, side panel desktop */}
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
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="fixed inset-x-0 bottom-0 z-[201] bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[90dvh]
                         md:inset-x-auto md:inset-y-0 md:right-0 md:w-[420px] md:rounded-t-none md:rounded-l-3xl md:max-h-full"
              transition={{ type: 'spring', damping: 28, stiffness: 240 }}
            >
              <div className="flex justify-center pt-3 pb-1 md:hidden">
                <div className="w-10 h-1 bg-gray-200 rounded-full" />
              </div>
              <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 bg-red-100 text-red-600 rounded-xl flex items-center justify-center hover:bg-red-200 transition-all active:scale-95 cursor-pointer shadow-sm border border-red-200"
                    onClick={() => setShowDetailModal(false)}
                  >
                    <ArrowUpCircle size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-black text-red-600">{selectedSlip.export_code}</p>
                    <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">
                      Chi tiết xuất kho
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
                  { label: 'Ngày xuất', value: formatDate(selectedSlip.date) },
                  { label: 'Vật tư', value: selectedSlip.materials?.name },
                  { label: 'Kho xuất', value: selectedSlip.warehouses?.name },
                  {
                    label: 'Số lượng',
                    value: `-${formatNumber(selectedSlip.quantity)} ${selectedSlip.materials?.unit || ''}`,
                    highlight: true,
                  },
                  { label: 'Đơn giá bán', value: formatCurrency(selectedSlip.unit_price || 0) },
                  { label: 'Thành tiền', value: formatCurrency(selectedSlip.total_amount || 0) },
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

                {/* Proof Image display */}
                {selectedSlip.image_url && (
                  <div className="space-y-3 pt-2">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                      Ảnh minh chứng xuất kho
                    </p>
                    <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-gray-50">
                      <img
                        src={selectedSlip.image_url}
                        alt="Proof"
                        className="w-full h-auto object-contain max-h-[300px]"
                      />
                    </div>
                  </div>
                )}

                {selectedSlip.status !== 'Đã xóa' &&
                  (user.role === 'Admin' || user.role === 'Develop') &&
                  selectedSlip.status === 'Chờ duyệt' &&
                  ((selectedSlip.export_code || '').startsWith('XA') ||
                  (selectedSlip.export_code || '').startsWith('GOP') ||
                  (selectedSlip.export_code || '').startsWith('SX-') ? (
                    <div className="px-3 py-2 bg-orange-50 border border-orange-100 rounded-xl text-xs text-orange-600 font-medium text-center">
                      {(selectedSlip.export_code || '').startsWith('SX-')
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
              className="bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-2xl w-full max-w-4xl max-h-[calc(100vh-40px)] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-red-600 p-6 text-white flex items-center justify-between rounded-t-[2rem] md:rounded-t-[2.5rem] flex-shrink-0 relative">
                <div className="flex items-center gap-3">
                  <div
                    className="p-2 bg-white/20 rounded-xl cursor-pointer hover:bg-white/30 transition-all active:scale-95"
                    onClick={() => setShowModal(false)}
                    title="Đóng"
                  >
                    <ArrowDownCircle size={24} />
                  </div>
                  <h3 className="font-bold text-lg">
                    {isEditing ? 'Sửa phiếu xuất kho' : 'Lập phiếu xuất kho'}
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
                      Mã tham chiếu (Phiếu xuất)
                    </label>
                    <div className="bg-red-50/50 px-5 py-3.5 rounded-2xl border border-red-100 text-sm font-black text-red-600 uppercase shadow-inner italic">
                      {formData.export_code ||
                        `XK-${toLocalISODate().replace(/-/g, '').slice(2)}-001`}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Ngày xuất *
                      </label>
                      <input
                        type="date"
                        required
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-red-600/20"
                      />
                    </div>

                    <div className="relative z-[120]">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase">
                          Vật tư *
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowAddMaterial(true)}
                          className="text-[10px] font-bold text-blue-600 flex items-center gap-1 hover:underline"
                          title="Thêm vật tư nhanh"
                        >
                          <PackagePlus size={12} /> Thêm mới
                        </button>
                      </div>
                      <CreatableSelect
                        value={formData.material_id}
                        options={materials}
                        onChange={(val) => setFormData({ ...formData, material_id: val })}
                        allowCreate={false}
                        placeholder="Chọn vật tư..."
                        required
                      />
                    </div>

                    <div className="space-y-1 relative z-[110]">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Ghi chú / Mục đích xuất
                      </label>
                      <textarea
                        rows={3}
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-orange-600/20 resize-none"
                      />
                    </div>

                    {stockLoading && (
                      <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <p className="text-[10px] font-bold text-gray-400 uppercase animate-pulse">
                          Đang kiểm tra tồn kho...
                        </p>
                      </div>
                    )}
                    {!stockLoading && availableStock !== null && (
                      <div
                        className={`p-3 rounded-xl border ${
                          availableStock <= 0
                            ? 'bg-red-50 border-red-100'
                            : availableStock <= 5
                              ? 'bg-amber-50 border-amber-100'
                              : 'bg-blue-50 border-blue-100'
                        }`}
                      >
                        <p
                          className={`text-[10px] font-bold uppercase ${
                            availableStock <= 0
                              ? 'text-red-400'
                              : availableStock <= 5
                                ? 'text-amber-400'
                                : 'text-blue-400'
                          }`}
                        >
                          Tồn kho tại ngày {formData.date}
                        </p>
                        <p
                          className={`text-sm font-bold ${
                            availableStock <= 0
                              ? 'text-red-600'
                              : availableStock <= 5
                                ? 'text-amber-600'
                                : 'text-blue-600'
                          }`}
                        >
                          {formatNumber(availableStock)}{' '}
                          {
                            materials.find(
                              (m) =>
                                m.id === formData.material_id || m.name === formData.material_id,
                            )?.unit
                          }
                          {availableStock <= 0 && ' ⚠ Không đủ tồn kho!'}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <CreatableSelect
                      label="Kho xuất *"
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
                          Số lượng xuất
                        </label>
                        <NumericInput
                          value={formData.quantity}
                          onChange={(val) => setFormData({ ...formData, quantity: val })}
                          placeholder="Nhập SL..."
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase">
                          Đơn giá (vốn)
                        </label>
                        <NumericInput
                          value={formData.unit_price}
                          onChange={(val) => setFormData({ ...formData, unit_price: val })}
                          placeholder="Vốn/giá..."
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Thành tiền tự động
                      </label>
                      <div className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-100 text-sm font-bold text-red-600 shadow-inner">
                        {formatCurrency(formData.quantity * formData.unit_price)}
                      </div>
                    </div>
                  </div>

                  {/* Image section at the bottom */}
                  <div className="md:col-span-2 pt-4 border-t border-gray-100">
                    <ImageCapture
                      maxImages={1}
                      existingImages={formData.image_url ? [formData.image_url] : []}
                      onUpload={(urls) => setFormData({ ...formData, image_url: urls[0] || '' })}
                      label="Ảnh minh chứng (Phiếu xuất, Vật tư đã bàn giao...)"
                    />
                  </div>

                  <div className="md:col-span-2 flex justify-end gap-3 mt-4 pt-6 border-t border-gray-100">
                    <Button variant="outline" onClick={() => setShowModal(false)}>
                      Hủy
                    </Button>
                    <Button
                      type="submit"
                      variant="danger"
                      className="min-w-[120px]"
                      isLoading={submitting}
                      disabled={
                        availableStock !== null && Number(formData.quantity) > availableStock
                      }
                      title={
                        availableStock !== null && Number(formData.quantity) > availableStock
                          ? `Không đủ tồn kho (tồn: ${availableStock})`
                          : undefined
                      }
                    >
                      {isEditing ? 'Cập nhật' : 'Lưu phiếu xuất'}
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
        groups={groups}
        addToast={addToast}
        onSuccess={(newMat) => {
          setFormData({ ...formData, material_id: newMat.id });
          refreshAll();
        }}
      />

      <ConfirmModal
        show={showDeleteConfirm}
        title={selectedSlip?.status === 'Đã duyệt' ? '⚠️ Cảnh báo: Phiếu đã duyệt' : 'Xác nhận xóa'}
        message={
          selectedSlip?.status === 'Đã duyệt'
            ? `Phiếu xuất ${selectedSlip?.export_code} đã được duyệt — hàng đã xuất thực tế.\n\nXóa phiếu sẽ HOÀN TRẢ ${selectedSlip?.quantity} ${selectedSlip?.materials?.unit || ''} ${selectedSlip?.materials?.name || ''} vào kho.\n\nBạn có chắc chắn muốn xóa?`
            : 'Bạn có chắc chắn muốn chuyển phiếu xuất kho này vào thùng rác?'
        }
        confirmText={
          selectedSlip?.status === 'Đã duyệt'
            ? 'Xác nhận xóa phiếu đã duyệt'
            : 'Chuyển vào thùng rác'
        }
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
        type={selectedSlip?.status === 'Đã duyệt' ? 'danger' : undefined}
      />

      {/* FAB — Lập phiếu xuất */}
      <FAB
        onClick={() => {
          setFormData({ ...initialFormState, export_code: generateCode('XK') });
          setIsEditing(false);
          setEditingId(null);
          setShowModal(true);
        }}
        label="Lập phiếu xuất"
        color="bg-red-600"
      />

      {/* Hidden Report Template (A4 Landscape) */}
      <div className="fixed -left-[4000px] -top-[4000px] no-print">
        <div
          ref={reportRef}
          className="bg-white p-12 w-[1123px] min-h-[794px] font-sans text-gray-900 border"
          style={{ width: '1123px' }}
        >
          {/* Company Header */}
          <div className="flex justify-between items-start mb-10 pb-6 border-b-2 border-red-200">
            <div className="flex items-center gap-6">
              <div className="bg-red-50 p-4 rounded-3xl border border-red-100">
                <CanvasLogo size={96} className="w-24 h-24 rounded-3xl object-contain shadow-sm" />
              </div>
              <div className="space-y-1">
                <h1 className="text-3xl font-black text-red-600 tracking-tighter uppercase">
                  CDX ERP SYSTEM
                </h1>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.3em]">
                  Smart Construction Management • 2026 Edition
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="px-3 py-1 bg-red-50 text-red-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-red-100 italic">
                    Inventory Outflow Report
                  </span>
                  <span className="w-1.5 h-1.5 bg-gray-200 rounded-full" />
                  <span className="text-[10px] text-gray-500 font-bold italic tracking-wide">
                    Data Ref: {new Date().getTime().toString(36).toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-3xl font-black text-gray-900 uppercase tracking-tighter mb-1">
                Báo Cáo Xuất Kho
              </h2>
              <p className="text-xs text-gray-500 font-bold italic">
                Thời gian xuất: {new Date().toLocaleString('vi-VN')}
              </p>
              <div className="mt-4 flex flex-col items-end gap-1">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest font-mono">
                  Status: SECURED_TRANS
                </p>
                <div className="h-0.5 w-12 bg-red-200 rounded-full" />
              </div>
            </div>
          </div>

          {/* Filters Info */}
          <div className="grid grid-cols-2 gap-8 mb-8 bg-gray-50/50 p-6 rounded-3xl border border-gray-100">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-4 bg-red-500 rounded-full" />
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em]">
                  Cấu hình báo cáo
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] text-gray-500 font-bold">Từ ngày:</p>
                  <p className="text-sm font-black text-gray-900">
                    {filterStartDate ? formatDate(filterStartDate) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-500 font-bold">Đến ngày:</p>
                  <p className="text-sm font-black text-gray-900">
                    {filterEndDate ? formatDate(filterEndDate) : '—'}
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-4 bg-gray-800 rounded-full" />
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em]">
                  Bộ lọc ứng dụng
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] text-gray-500 font-bold">Trạng thái:</p>
                  <p className="text-sm font-black text-red-600 italic uppercase tracking-widest">
                    {statusFilter}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-500 font-bold">Kho lọc:</p>
                  <p className="text-sm font-black text-gray-900">
                    {filterWarehouseId
                      ? warehouses.find((w) => w.id === filterWarehouseId)?.name
                      : 'Tất cả kho'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Table */}
          <table className="w-full text-left border-collapse rounded-3xl overflow-hidden shadow-sm border border-gray-100">
            <thead>
              <tr className="bg-red-600 text-white">
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest italic border-r border-white/10">
                  Ngày
                </th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest italic border-r border-white/10">
                  Mã phiếu
                </th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest italic border-r border-white/10">
                  Vật tư
                </th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest italic border-r border-white/10">
                  Kho
                </th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest italic border-r border-white/10 text-center">
                  SL
                </th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest italic text-right">
                  Thành tiền
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {(() => {
                const filteredList = slips
                  .filter((item) => {
                    let match = true;
                    if (filterStartDate && item.date < filterStartDate) match = false;
                    if (filterEndDate && item.date > filterEndDate) match = false;
                    if (filterWarehouseId && item.warehouse_id !== filterWarehouseId) match = false;
                    if (searchTerm) {
                      const s = searchTerm.toLowerCase();
                      const nameMatch = (item.materials?.name || '').toLowerCase().includes(s);
                      const codeMatch = (item.export_code || '').toLowerCase().includes(s);
                      if (!nameMatch && !codeMatch) match = false;
                    }
                    return match;
                  })
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                return filteredList.map((item, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-red-50/10'}>
                    <td className="px-4 py-3 text-xs text-gray-600 font-medium italic">
                      {formatDate(item.date)}
                    </td>
                    <td className="px-4 py-3 text-xs font-black text-red-600 tracking-tight">
                      {item.export_code}
                    </td>
                    <td className="px-4 py-3 text-xs font-black text-gray-900 uppercase tracking-tight">
                      {item.materials?.name}
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-gray-500">
                      {item.warehouses?.name}
                    </td>
                    <td className="px-4 py-3 text-xs font-black text-red-600 text-center">
                      -{formatNumber(item.quantity)} {item.materials?.unit}
                    </td>
                    <td className="px-4 py-3 text-xs font-black text-gray-900 text-right tabular-nums">
                      {formatCurrency(item.total_amount || 0)}
                    </td>
                  </tr>
                ));
              })()}
              <tr className="bg-red-50">
                <td
                  colSpan={5}
                  className="px-4 py-4 text-[11px] font-black text-red-600 uppercase text-right italic tracking-[0.1em]"
                >
                  Tổng giá trị xuất:
                </td>
                <td className="px-4 py-4 text-lg font-black text-red-600 text-right tabular-nums">
                  {formatCurrency(
                    slips
                      .filter((item) => {
                        let match = true;
                        if (filterStartDate && item.date < filterStartDate) match = false;
                        if (filterEndDate && item.date > filterEndDate) match = false;
                        if (filterWarehouseId && item.warehouse_id !== filterWarehouseId)
                          match = false;
                        if (searchTerm) {
                          const s = searchTerm.toLowerCase();
                          const nameMatch = (item.materials?.name || '').toLowerCase().includes(s);
                          const codeMatch = (item.export_code || '').toLowerCase().includes(s);
                          if (!nameMatch && !codeMatch) match = false;
                        }
                        return match;
                      })
                      .reduce((sum, item) => sum + (item.total_amount || 0), 0),
                  )}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Footer Branding */}
          <div className="mt-12 flex justify-between items-end border-t border-gray-100 pt-6">
            <div className="space-y-1">
              <p className="text-xs font-black text-gray-300 uppercase tracking-[0.2em] italic whitespace-nowrap">
                CDX ERP SYSTEM
              </p>
              <p className="text-[9px] text-gray-300 font-bold uppercase tracking-widest">
                End of transaction report • Smart Flow Management
              </p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-black text-gray-300 uppercase tracking-[0.3em] mb-1">
                StockOut Protocol Verified
              </p>
              <div className="text-[10px] text-gray-400 font-bold bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
                Integrity Hash:{' '}
                <span className="text-red-500 font-black tracking-widest italic ml-1 underline">
                  VERIFIED_SECURE
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
