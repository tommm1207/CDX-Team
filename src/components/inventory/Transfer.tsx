import { CanvasLogo } from '@/components/shared';
import { exportTableImage } from '../../utils/reportExport';
import { useState, useEffect, FormEvent, useRef } from 'react';
import {
  Search,
  Plus,
  ArrowLeftRight,
  Edit,
  Trash2,
  ChevronDown,
  X,
  PackagePlus,
  ArrowDownCircle,
  Check,
  Image as ImageIcon,
  RefreshCw,
  Camera,
  ChevronRight,
  Share2,
  Filter,
  Printer,
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
import { formatDate, formatNumber, toLocalISODate } from '@/utils/format';
import { isUUID, generateCode, getAllowedWarehouses } from '@/utils/helpers';
import { getAvailableStock, getDetailedStock, validateFutureImpact } from '@/utils/inventory';
import { Button } from '@/components/shared';
import { ExcelButton } from '@/components/shared';
import { SortButton, SortOption } from '@/components/shared';
import { SaveImageButton } from '@/components/shared';
import { PrintTransferModal } from './PrintTransferModal';
import { logAudit } from '@/utils/auditLogger';

export const Transfer = ({
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
  const [isPrintMode, setIsPrintMode] = useState(false);
  const [selectedPrintIds, setSelectedPrintIds] = useState<string[]>([]);
  const [showPrintModal, setShowPrintModal] = useState(false);

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
  const [stockLoading, setStockLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAddMaterial, setShowAddMaterial] = useState(false);

  // === Số lượng cần (Warehouse Requirements cho Kho Đích) ===
  const [requiredQty, setRequiredQty] = useState<number>(0);
  const [currentStockDest, setCurrentStockDest] = useState<number | null>(null);
  const [reqLoading, setReqLoading] = useState(false);

  const { warehouses, materials, groups, refreshAll, fetchWarehouses } = useInventoryData(
    user.data_view_permission,
  );
  const [showFilter, setShowFilter] = useState(false);
  const [statusFilter, setStatusFilter] = useState('Tất cả');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterWarehouseId, setFilterWarehouseId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>(
    (localStorage.getItem(`sort_pref_transfer_${user.id}`) as SortOption) || 'newest',
  );
  const [isCapturingTable, setIsCapturingTable] = useState(false);

  const reportRef = useRef<HTMLDivElement>(null);

  const initialFormState = {
    date: toLocalISODate(),
    from_warehouse_id: '',
    to_warehouse_id: '',
    material_id: '',
    quantity: 0,
    notes: '',
    status: 'Chờ duyệt',
    transfer_code: generateCode('LC'),
    image_url: '',
  };

  const [formData, setFormData] = useState(initialFormState);

  useEffect(() => {
    fetchSlips();
  }, [statusFilter]);

  // Load required_qty + stock kho đích khi đổi Kho đích hoặc Vật tư
  useEffect(() => {
    const matId = isUUID(formData.material_id)
      ? formData.material_id
      : materials.find((m) => m.name === formData.material_id)?.id;
    const toWhId = isUUID(formData.to_warehouse_id)
      ? formData.to_warehouse_id
      : warehouses.find((w) => w.name === formData.to_warehouse_id)?.id;

    if (!matId || !toWhId) {
      setRequiredQty(0);
      setCurrentStockDest(null);
      return;
    }
    setReqLoading(true);
    Promise.all([
      supabase
        .from('warehouse_requirements')
        .select('required_quantity')
        .eq('warehouse_id', toWhId)
        .eq('material_id', matId)
        .maybeSingle(),
      getAvailableStock(matId, toWhId, toLocalISODate()),
    ]).then(([reqRes, stock]) => {
      setRequiredQty(reqRes.data?.required_quantity ?? 0);
      setCurrentStockDest(stock);
      setReqLoading(false);
    });
  }, [formData.material_id, formData.to_warehouse_id, materials, warehouses]);

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
        title: 'Báo cáo Chuyển kho',
        sheetName: 'Chuyển kho',
        columns: [
          'Mã phiếu',
          'Ngày',
          'Từ kho',
          'Đến kho',
          'Vật tư',
          'Số lượng',
          'Ghi chú',
          'Trạng thái',
        ],
        rows: slips.map((it) => [
          it.transfer_code,
          it.date,
          it.from_wh?.name ?? '',
          it.to_wh?.name ?? '',
          it.materials?.name ?? '',
          it.quantity,
          it.notes ?? '',
          it.status,
        ]),
        fileName: `CDX_ChuyenKho_${toLocalISODate()}.xlsx`,
        addToast,
      });
    });
  };

  useEffect(() => {
    if (formData.from_warehouse_id && formData.material_id && formData.date) {
      checkStock();
    } else {
      setAvailableStock(null);
    }
  }, [formData.from_warehouse_id, formData.material_id, formData.date, editingId]);

  const checkStock = async () => {
    try {
      const fromWh = warehouses.find(
        (w) => w.name === formData.from_warehouse_id || w.id === formData.from_warehouse_id,
      );
      const mat = materials.find(
        (m) => m.name === formData.material_id || m.id === formData.material_id,
      );

      if (!fromWh?.id || !mat?.id || !formData.date) return;

      setStockLoading(true);
      const stock = await getAvailableStock(
        mat.id,
        fromWh.id,
        formData.date,
        editingId || undefined,
      );
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
        .from('transfers')
        .select(
          '*, from_wh:warehouses!from_warehouse_id(name, code), to_wh:warehouses!to_warehouse_id(name, code), materials(name, code, unit)',
        );

      if (statusFilter === 'Tất cả') {
        query = query.neq('status', 'Đã xóa');
      } else {
        query = query.eq('status', statusFilter);
      }

      const allowedWhIds = getAllowedWarehouses(user.data_view_permission);
      if (allowedWhIds) {
        query = query.or(
          `from_warehouse_id.in.(${allowedWhIds.join(',')}),to_warehouse_id.in.(${allowedWhIds.join(',')})`,
        );
      }

      const { data, error } = await query.order('transfer_code', { ascending: false });
      if (error) {
        console.error('Error fetching transfers:', error);
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('transfers')
          .select('*')
          .order('transfer_code', { ascending: false });
        if (fallbackError) throw fallbackError;
        setSlips(fallbackData || []);
      } else {
        setSlips(data || []);
      }
    } catch (err: any) {
      if (addToast) addToast('Lỗi tải phiếu luân chuyển: ' + err.message, 'error');
      else alert('Lỗi tải phiếu luân chuyển: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!formData.from_warehouse_id || !formData.to_warehouse_id) {
      if (addToast) addToast('Vui lòng chọn đầy đủ Kho nguồn và Kho đích.', 'error');
      return;
    }
    if (formData.from_warehouse_id === formData.to_warehouse_id) {
      if (addToast) addToast('Kho nguồn và kho đích không được trùng nhau!', 'error');
      return;
    }
    if (!formData.material_id) {
      if (addToast) addToast('Vui lòng chọn Vật tư.', 'error');
      return;
    }
    if (!formData.quantity || formData.quantity <= 0) {
      if (addToast) addToast('Vui lòng nhập số lượng hợp lệ.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      let finalFromWhId = formData.from_warehouse_id;
      if (formData.from_warehouse_id && !isUUID(formData.from_warehouse_id)) {
        const whByName = warehouses.find(
          (w) => w.name.toLowerCase() === formData.from_warehouse_id.toLowerCase(),
        );
        if (whByName) finalFromWhId = whByName.id;
        else {
          const random = Math.floor(100 + Math.random() * 900);
          const code = `K${(warehouses.length + 1).toString().padStart(2, '0')}-${random}`;
          const { data: newWh } = await supabase
            .from('warehouses')
            .insert([{ name: formData.from_warehouse_id, code }])
            .select();
          if (newWh) finalFromWhId = newWh[0].id;
        }
      }

      let finalToWhId = formData.to_warehouse_id;
      if (formData.to_warehouse_id && !isUUID(formData.to_warehouse_id)) {
        const whByName = warehouses.find(
          (w) => w.name.toLowerCase() === formData.to_warehouse_id.toLowerCase(),
        );
        if (whByName) finalToWhId = whByName.id;
        else {
          const random = Math.floor(100 + Math.random() * 900);
          const code = `K${(warehouses.length + 1).toString().padStart(2, '0')}-${random}`;
          const { data: newWh } = await supabase
            .from('warehouses')
            .insert([{ name: formData.to_warehouse_id, code }])
            .select();
          if (newWh) finalToWhId = newWh[0].id;
        }
      }

      let finalMaterialId = formData.material_id;
      if (formData.material_id && !isUUID(formData.material_id)) {
        const matByName = materials.find(
          (m) => m.name.toLowerCase() === formData.material_id.toLowerCase(),
        );
        if (matByName) finalMaterialId = matByName.id;
        else throw new Error('Bạn phải chọn vật tư từ Danh mục!');
      }

      // 1. Kiểm tra tồn kho tại Kho NGUỒN vào ngày của phiếu
      const stockAtDate = await getAvailableStock(
        finalMaterialId,
        finalFromWhId,
        formData.date,
        editingId || undefined,
      );
      if (formData.quantity > stockAtDate) {
        throw new Error(
          `Kho nguồn không đủ tồn vào ngày ${formatDate(formData.date)} (Tồn: ${stockAtDate})`,
        );
      }

      // 2. Kiểm tra ÂM KHO TƯƠNG LAI (Cho phiếu Đã duyệt)
      if (isEditing && selectedSlip && selectedSlip.status === 'Đã duyệt') {
        const matChanged = finalMaterialId !== selectedSlip.material_id;
        const fromWhChanged = finalFromWhId !== selectedSlip.from_warehouse_id;
        const toWhChanged = finalToWhId !== selectedSlip.to_warehouse_id;
        const dateChanged = formData.date !== selectedSlip.date;

        if (matChanged || fromWhChanged || toWhChanged || dateChanged) {
          // Check 1: Việc "thu hồi" hàng từ kho ĐÍCH CŨ có gây âm kho tương lai ở đó không?
          const impactOldTo = await validateFutureImpact(
            selectedSlip.material_id,
            selectedSlip.to_warehouse_id,
            selectedSlip.date,
            -selectedSlip.quantity,
          );
          if (!impactOldTo.valid) {
            throw new Error(
              `Không thể thay đổi vì kho ĐÍCH CŨ sẽ bị âm kho vào ngày ${impactOldTo.failedDate}`,
            );
          }
          // Check 2: Việc "trừ" hàng từ kho NGUỒN MỚI có gây âm kho tương lai không?
          const impactNewFrom = await validateFutureImpact(
            finalMaterialId,
            finalFromWhId,
            formData.date,
            -formData.quantity,
          );
          if (!impactNewFrom.valid) {
            throw new Error(
              `Không thể chuyển đổi vì kho NGUỒN MỚI sẽ bị âm kho vào ngày ${impactNewFrom.failedDate}`,
            );
          }
        } else {
          // Cùng vị trí, check chênh lệch
          const diffFrom = selectedSlip.quantity - formData.quantity;
          const diffTo = formData.quantity - selectedSlip.quantity;

          if (diffFrom < 0) {
            const impactFrom = await validateFutureImpact(
              finalMaterialId,
              finalFromWhId,
              formData.date,
              diffFrom,
            );
            if (!impactFrom.valid)
              throw new Error(`Kho NGUỒN lỗi vào ngày ${impactFrom.failedDate}`);
          }
          if (diffTo < 0) {
            const impactTo = await validateFutureImpact(
              finalMaterialId,
              finalToWhId,
              formData.date,
              diffTo,
            );
            if (!impactTo.valid) throw new Error(`Kho ĐÍCH lỗi vào ngày ${impactTo.failedDate}`);
          }
        }
      }

      const payload = {
        ...formData,
        from_warehouse_id: finalFromWhId,
        to_warehouse_id: finalToWhId,
        material_id: finalMaterialId,
        employee_id: user.id,
        status: ['admin', 'develop'].includes(user.role?.toLowerCase() || '')
          ? isEditing
            ? formData.status
            : 'Chờ duyệt'
          : 'Chờ duyệt',
        transfer_code: formData.transfer_code || generateCode('LC'),
        notes: isEditing
          ? `[SỬA lúc ${new Date().toLocaleString('vi-VN')}] ${formData.notes.replace(/^\[SỬA lúc .*?\]\s*/, '')}`
          : formData.notes,
      };

      if (isEditing && selectedSlip) {
        const { error } = await supabase
          .from('transfers')
          .update(payload)
          .eq('id', selectedSlip.id);
        if (error) throw error;

        await logAudit(user, {
          module: 'WAREHOUSE',
          action: 'UPDATE',
          description: `Cập nhật phiếu luân chuyển: ${payload.transfer_code}`,
          recordId: selectedSlip.id,
        });
      } else {
        const { error } = await supabase.from('transfers').insert([payload]);
        if (error) throw error;

        await logAudit(user, {
          module: 'WAREHOUSE',
          action: 'CREATE',
          description: `Tạo phiếu luân chuyển: ${payload.transfer_code}`,
        });
      }

      setShowModal(false);
      fetchSlips();
      setFormData(initialFormState);
      setIsEditing(false);
      setEditingId(null);
      setAvailableStock(null);
      setSelectedSlip(null);

      // Lưu lại số lượng cần vào warehouse_requirements nếu requiredQty > 0
      const finalToWhId2 = payload.to_warehouse_id;
      const finalMatId2 = payload.material_id;
      if (requiredQty > 0 && finalToWhId2 && finalMatId2) {
        supabase.from('warehouse_requirements').upsert(
          {
            warehouse_id: finalToWhId2,
            material_id: finalMatId2,
            required_quantity: requiredQty,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'warehouse_id,material_id' },
        );
      }

      if (addToast)
        addToast(
          isEditing ? 'Cập nhật thành công!' : 'Lập phiếu luân chuyển thành công!',
          'success',
        );
    } catch (err: any) {
      if (addToast) addToast('Lỗi: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRowClick = (slip: any) => {
    setSelectedSlip(slip);
    setShowDetailModal(true);
  };

  const handleEdit = () => {
    setFormData({
      date: selectedSlip.date,
      from_warehouse_id: selectedSlip.from_warehouse_id,
      to_warehouse_id: selectedSlip.to_warehouse_id,
      material_id: selectedSlip.material_id,
      quantity: selectedSlip.quantity,
      notes: selectedSlip.notes || '',
      status: selectedSlip.status,
      transfer_code: selectedSlip.transfer_code || formData.transfer_code,
      image_url: selectedSlip.image_url || '',
    });
    setIsEditing(true);
    setEditingId(selectedSlip.id);
    setShowDetailModal(false);
    setShowModal(true);
  };

  const handleDelete = () => {
    if (!selectedSlip) return;
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    try {
      if (selectedSlip.status === 'Đã duyệt') {
        // Kiểm tra kho đích ('9999-12-31') — xóa phiếu chuyển sẽ hoàn trả vật tư về kho nguồn
        // cần kho đích còn đủ tồn kho (có thể xuất tiếp sau đó không bị âm).
        const stockFull = await getAvailableStock(
          selectedSlip.material_id,
          selectedSlip.to_warehouse_id,
          '9999-12-31',
        );
        if (stockFull < selectedSlip.quantity) {
          const thieu = selectedSlip.quantity - stockFull;
          throw new Error(`❌ Từ chối xóa phiếu luân chuyển ${selectedSlip.transfer_code}
- Mặt hàng: ${selectedSlip.materials?.name || selectedSlip.material_id}
- Tồn kho hiện tại khoản đích: ${stockFull}
- Số lượng cần xóa (rút về): ${selectedSlip.quantity}
- Tồn kho sau xóa (dự tính): ${stockFull - selectedSlip.quantity}
→ Từ kho đích này, đã có ${thieu} đơn vị được xuất/chuyển đi tiếp.
→ Không thể xóa vì sẽ làm tồn kho đích bị âm — không phản ánh thực tế.`);
        }
      }

      const { error } = await supabase
        .from('transfers')
        .update({ status: 'Đã xóa' })
        .eq('id', selectedSlip.id);
      if (error) throw error;

      // Vô hiệu chi phí liên quan
      await supabase
        .from('costs')
        .update({ status: 'Đã xóa' })
        .ilike('content', `%${selectedSlip.transfer_code || selectedSlip.id.slice(0, 8)}%`);

      if (addToast) addToast('Đã chuyển phiếu vào thùng rác', 'success');
      fetchSlips();
      setShowDetailModal(false);
      setShowDeleteConfirm(false);
    } catch (err: any) {
      const msg = err.message.includes('foreign key constraint')
        ? 'Không thể xóa phiếu này vì đang có dữ liệu liên quan khác.'
        : err.message;
      if (addToast) addToast('Lỗi: ' + msg, 'error');
      else alert('Lỗi: ' + msg);
    }
  };

  const handleApprove = async (id: string, status: string) => {
    try {
      // Kiểm tra tồn kho kho nguồn trước khi duyệt luân chuyển
      if (status === 'Đã duyệt') {
        const { data: slipToCheck } = await supabase
          .from('transfers')
          .select('material_id, from_warehouse_id, quantity, date')
          .eq('id', id)
          .maybeSingle();

        if (slipToCheck) {
          const impact = await validateFutureImpact(
            slipToCheck.material_id,
            slipToCheck.from_warehouse_id,
            slipToCheck.date,
            -Number(slipToCheck.quantity),
            id,
          );
          if (!impact.valid) {
            const stockInfo = await getDetailedStock(
              slipToCheck.material_id,
              slipToCheck.from_warehouse_id,
              slipToCheck.date,
              id,
            );
            const thieu = Math.abs((impact.currentStock || 0) - Number(slipToCheck.quantity));
            if (addToast)
              addToast(
                `❌ Từ chối duyệt phiếu luân chuyển
- Tồn thực tế tại kho nguồn: ${formatNumber(stockInfo.actual)}
- Đang giữ chỗ (Phân bổ khác): ${formatNumber(stockInfo.pendingOut)}
- Khả dụng ngay: ${formatNumber(stockInfo.available)}
- Thiếu hụt: ${formatNumber(thieu)}
- Sẽ bị âm vào ngày: ${formatDate(impact.failedDate || slipToCheck.date)}
→ Vui lòng kiểm tra lại số lượng hoặc duyệt các phiếu nhập kho nguồn trước khi duyệt.`,
                'error',
              );
            return;
          }
        }
      }

      const { error } = await supabase.from('transfers').update({ status }).eq('id', id);
      if (error) throw error;

      // Tạo chi phí tự động khi duyệt phiếu luân chuyển
      if (status === 'Đã duyệt') {
        const { data: slip } = await supabase
          .from('transfers')
          .select('*, users(id), materials(name, unit)')
          .eq('id', id)
          .maybeSingle();
        if (slip) {
          const { data: existingCost } = await supabase
            .from('costs')
            .select('id')
            .ilike('content', `%${slip.transfer_code || slip.id.slice(0, 8)}%`)
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
                transaction_type: 'Nội bộ',
                cost_code: costCode,
                date: slip.date,
                employee_id: user.id,
                cost_type: 'Luân chuyển',
                content: `Luân chuyển kho từ phiếu ${slip.transfer_code || slip.id.slice(0, 8)}`,
                material_id: slip.material_id,
                warehouse_id: slip.from_warehouse_id,
                quantity: slip.quantity,
                unit: (slip as any).materials?.unit,
                unit_price: 0,
                total_amount: 0,
                notes: 'Tự động tạo từ hệ thống Luân chuyển kho',
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

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24 overflow-x-hidden">
      <div className="flex items-center justify-between gap-2 mb-4">
        <PageBreadcrumb title="Luân chuyển kho" onBack={onBack} />
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
              localStorage.setItem(`sort_pref_transfer_${user.id}`, val);
            }}
            options={[
              { value: 'code', label: 'Mã chứng từ' },
              { value: 'newest', label: 'Mới nhất' },
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
                    placeholder="Vật tư, mã phiếu, kho..."
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
                  <div className="w-px h-6 bg-gray-200 mx-1 flex-shrink-0"></div>
                  <Button
                    size="sm"
                    variant={isPrintMode ? 'orange' : 'outline'}
                    onClick={() => {
                      setIsPrintMode(!isPrintMode);
                      if (!isPrintMode) setSelectedPrintIds([]);
                    }}
                    icon={Printer}
                    className="flex-shrink-0"
                  >
                    In Biên Bản
                  </Button>
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
            if (
              filterWarehouseId &&
              item.from_warehouse_id !== filterWarehouseId &&
              item.to_warehouse_id !== filterWarehouseId
            )
              match = false;
            if (searchTerm) {
              const s = searchTerm.toLowerCase();
              const nameMatch = (item.materials?.name || '').toLowerCase().includes(s);
              const codeMatch = (item.transfer_code || '').toLowerCase().includes(s);
              const fromMatch = (item.from_wh?.name || '').toLowerCase().includes(s);
              const toMatch = (item.to_wh?.name || '').toLowerCase().includes(s);
              if (!nameMatch && !codeMatch && !fromMatch && !toMatch) match = false;
            }
            return match;
          })
          .sort((a, b) => {
            if (sortBy === 'newest')
              return (b.transfer_code || '').localeCompare(a.transfer_code || '');
            if (sortBy === 'code')
              return (a.transfer_code || '').localeCompare(b.transfer_code || '');
            if (sortBy === 'date') return new Date(b.date).getTime() - new Date(a.date).getTime();
            return 0;
          });
        return (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px] whitespace-nowrap">
                <thead>
                  <tr className="bg-orange-500 text-white">
                    {isPrintMode && (
                      <th className="px-2 md:px-4 py-2 md:py-3 w-10 text-center border-r border-white/10">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 border-white/50 cursor-pointer"
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedPrintIds(filteredSlips.map((s) => s.id));
                            } else {
                              setSelectedPrintIds([]);
                            }
                          }}
                          checked={
                            selectedPrintIds.length > 0 &&
                            selectedPrintIds.length === filteredSlips.length
                          }
                        />
                      </th>
                    )}
                    <th className="px-2 md:px-4 py-2 md:py-3 text-[9px] md:text-[10px] font-bold uppercase tracking-wider border-r border-white/10">
                      Ngày
                    </th>
                    <th className="px-2 md:px-4 py-2 md:py-3 text-[9px] md:text-[10px] font-bold uppercase tracking-wider border-r border-white/10">
                      Từ kho
                    </th>
                    <th className="px-2 md:px-4 py-2 md:py-3 text-[9px] md:text-[10px] font-bold uppercase tracking-wider border-r border-white/10">
                      Đến kho
                    </th>
                    <th className="px-2 md:px-4 py-2 md:py-3 text-[9px] md:text-[10px] font-bold uppercase tracking-wider border-r border-white/10">
                      Vật tư
                    </th>
                    <th className="px-2 md:px-4 py-2 md:py-3 text-[9px] md:text-[10px] font-bold uppercase tracking-wider text-center border-r border-white/10">
                      SL
                    </th>
                    <th className="px-2 md:px-4 py-2 md:py-3 text-[9px] md:text-[10px] font-bold uppercase tracking-wider w-32 border-r border-white/10">
                      Trạng thái
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr>
                      <td
                        colSpan={isPrintMode ? 7 : 6}
                        className="px-4 py-8 text-center text-gray-400 italic"
                      >
                        Đang tải...
                      </td>
                    </tr>
                  ) : filteredSlips.length === 0 ? (
                    <tr>
                      <td
                        colSpan={isPrintMode ? 7 : 6}
                        className="px-4 py-8 text-center text-gray-400 italic"
                      >
                        Chưa có phiếu chuyển nào
                      </td>
                    </tr>
                  ) : (
                    (() => {
                      let currentBackgroundColor = 'bg-white';
                      let lastGroupKey = '';

                      return filteredSlips.map((item) => {
                        let groupKey = item.date;
                        if (sortBy === 'code' || sortBy === 'newest') {
                          const dateMatch = item.transfer_code?.match(/-(\d+)-/);
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
                            onClick={() => {
                              if (isPrintMode) {
                                setSelectedPrintIds((prev) =>
                                  prev.includes(item.id)
                                    ? prev.filter((id) => id !== item.id)
                                    : [...prev, item.id],
                                );
                              } else {
                                handleRowClick(item);
                              }
                            }}
                            className={`transition-colors cursor-pointer group hover:brightness-95 ${currentBackgroundColor}`}
                          >
                            {isPrintMode && (
                              <td className="px-2 md:px-4 py-2.5 md:py-3 text-center border-b border-gray-100/50">
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 border-gray-300 cursor-pointer"
                                  checked={selectedPrintIds.includes(item.id)}
                                  onChange={() => {
                                    setSelectedPrintIds((prev) =>
                                      prev.includes(item.id)
                                        ? prev.filter((id) => id !== item.id)
                                        : [...prev, item.id],
                                    );
                                  }}
                                />
                              </td>
                            )}
                            <td className="px-2 md:px-4 py-2.5 md:py-3 text-[10px] md:text-xs text-gray-600 border-b border-gray-100/50">
                              {formatDate(item.date)}
                            </td>
                            <td className="px-2 md:px-4 py-2.5 md:py-3 text-[10px] md:text-xs text-gray-600 max-w-[80px] break-words border-b border-gray-100/50">
                              {item.from_wh?.name}
                            </td>
                            <td className="px-2 md:px-4 py-2.5 md:py-3 text-[10px] md:text-xs text-gray-600 max-w-[80px] break-words border-b border-gray-100/50">
                              {item.to_wh?.name}
                            </td>
                            <td className="px-2 md:px-4 py-2.5 md:py-3 text-[11px] md:text-xs text-gray-800 font-bold border-b border-gray-100/50">
                              {item.materials?.name}
                            </td>
                            <td className="px-2 md:px-4 py-2.5 md:py-3 text-[11px] md:text-xs text-orange-600 text-center font-bold border-b border-gray-100/50">
                              {formatNumber(item.quantity)}{' '}
                              <span className="text-[9px] md:text-[10px] text-gray-400 font-normal">
                                {item.materials?.unit || ''}
                              </span>
                            </td>
                            <td className="px-2 md:px-4 py-2.5 md:py-3 text-[10px] md:text-xs w-32 border-b border-gray-100/50">
                              <span
                                className={`px-1.5 md:px-2 py-0.5 md:py-1 rounded-md md:rounded-full text-[9px] md:text-[10px] font-bold block text-center ${
                                  item.status === 'Đã duyệt'
                                    ? 'bg-green-100 text-green-600'
                                    : item.status === 'Từ chối'
                                      ? 'bg-red-100 text-red-600'
                                      : 'bg-amber-100 text-amber-600'
                                }`}
                              >
                                {item.status || 'Chờ duyệt'}
                              </span>
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
                    className="w-10 h-10 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center hover:bg-orange-100 transition-all active:scale-95 cursor-pointer shadow-sm border border-orange-100"
                    onClick={() => setShowDetailModal(false)}
                  >
                    <ArrowLeftRight size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-black text-orange-600">Chi tiết luân chuyển</p>
                    <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">
                      {formatDate(selectedSlip.date)}
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
                  { label: 'Ngày chuyển', value: formatDate(selectedSlip.date) },
                  { label: 'Vật tư', value: selectedSlip.materials?.name },
                  { label: 'Từ kho', value: selectedSlip.from_wh?.name },
                  { label: 'Đến kho', value: selectedSlip.to_wh?.name },
                  {
                    label: 'Số lượng',
                    value: `${formatNumber(selectedSlip.quantity)} ${selectedSlip.materials?.unit || ''}`,
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
                      className={`text-sm text-right ${highlight ? 'text-orange-600 font-bold' : 'text-gray-900'}`}
                    >
                      {value || '—'}
                    </p>
                  </div>
                ))}
                {/* Proof Image display */}
                {selectedSlip.image_url && (
                  <div className="space-y-3 pt-2">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                      Ảnh minh chứng điều chuyển
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
              </div>
              <div className="p-4 border-t border-gray-100 bg-gray-50 space-y-2">
                {selectedSlip.status !== 'Đã xóa' &&
                  (user.role === 'Admin' || user.role === 'Develop') &&
                  selectedSlip.status === 'Chờ duyệt' && (
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
                  )}
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
              <div className="bg-orange-500 p-6 text-white flex items-center justify-between rounded-t-[2rem] md:rounded-t-[2.5rem] flex-shrink-0 relative">
                <div className="flex items-center gap-3">
                  <div
                    className="p-2 bg-white/20 rounded-xl cursor-pointer hover:bg-white/30 transition-all active:scale-95"
                    onClick={() => setShowModal(false)}
                    title="Đóng (Bấm icon hoặc X)"
                  >
                    <ArrowDownCircle size={24} />
                  </div>
                  <h3 className="font-bold text-lg">
                    {isEditing ? 'Sửa phiếu chuyển kho' : 'Lập phiếu chuyển kho'}
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
                  className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-12"
                >
                  <div className="md:col-span-2 space-y-2 mb-2 hidden">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                      Mã tham chiếu (Phiếu điều chuyển)
                    </label>
                    <div className="bg-orange-50/50 px-5 py-3.5 rounded-2xl border border-orange-100 text-sm font-black text-orange-600 uppercase shadow-inner italic">
                      {formData.transfer_code ||
                        `LC-${toLocalISODate().replace(/-/g, '').slice(2)}-001`}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Ngày điều chuyển *
                      </label>
                      <input
                        type="date"
                        required
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-orange-600/20"
                      />
                    </div>

                    <div className="relative z-[120]">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase font-black">
                          Vật tư luân chuyển *
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowAddMaterial(true)}
                          className="text-[10px] font-bold text-blue-600 flex items-center gap-1 hover:underline"
                        >
                          <Plus size={12} /> Thêm mới
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
                        Diễn giải
                      </label>
                      <textarea
                        rows={2}
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                        placeholder="Ghi chú thêm..."
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <CreatableSelect
                      label="Kho nguồn (Xuất đi) *"
                      value={formData.from_warehouse_id}
                      options={warehouses}
                      onChange={(val) => setFormData({ ...formData, from_warehouse_id: val })}
                      onCreate={(val) => setFormData({ ...formData, from_warehouse_id: val })}
                      placeholder="Chọn kho nguồn..."
                      required
                    />

                    <CreatableSelect
                      label="Kho đích (Nhập đến) *"
                      value={formData.to_warehouse_id}
                      options={warehouses}
                      onChange={(val) => setFormData({ ...formData, to_warehouse_id: val })}
                      onCreate={(val) => setFormData({ ...formData, to_warehouse_id: val })}
                      placeholder="Chọn kho đích..."
                      required
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    </div>

                    {/* === Block Số lượng cần (Kho đích) === */}
                    {formData.material_id && formData.to_warehouse_id && (
                      <div className="p-3 rounded-xl border border-dashed border-orange-200 bg-orange-50/40 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-[10px] font-black text-orange-500 uppercase tracking-widest">
                            📋 Số cần tại kho đích
                          </label>
                          {reqLoading && (
                            <span className="text-[9px] text-orange-400 italic">Đang tải...</span>
                          )}
                        </div>
                        <NumericInput
                          value={requiredQty}
                          onChange={setRequiredQty}
                          placeholder="Nhập số cần..."
                        />
                        {requiredQty > 0 && currentStockDest !== null && (
                          <div className="text-[10px] space-y-1 pt-1">
                            <div className="flex justify-between text-gray-500">
                              <span>Đã có tại kho đích:</span>
                              <span className="font-bold text-gray-700">
                                {formatNumber(currentStockDest)}
                              </span>
                            </div>
                            <div className="flex justify-between text-gray-500">
                              <span>Cần tổng:</span>
                              <span className="font-bold text-orange-600">
                                {formatNumber(requiredQty)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">Còn thiếu:</span>
                              <span
                                className={`font-black ${Math.max(0, requiredQty - currentStockDest) > 0 ? 'text-red-600' : 'text-green-600'}`}
                              >
                                {Math.max(0, requiredQty - currentStockDest) > 0
                                  ? `-${formatNumber(Math.max(0, requiredQty - currentStockDest))}`
                                  : '✅ Đủ rồi!'}
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                              <div
                                className="bg-orange-500 h-1.5 rounded-full transition-all"
                                style={{
                                  width: `${Math.min(100, (currentStockDest / requiredQty) * 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {stockLoading && (
                      <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center gap-2">
                        <RefreshCw size={14} className="animate-spin text-primary" />
                        <p className="text-[10px] font-bold text-gray-400 uppercase">
                          Đang kiểm tra tồn...
                        </p>
                      </div>
                    )}
                    {!stockLoading && availableStock !== null && (
                      <div
                        className={`p-3 rounded-xl border ${availableStock <= 0 ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}
                      >
                        <p
                          className={`text-[10px] font-bold uppercase ${availableStock <= 0 ? 'text-red-400' : 'text-green-400'}`}
                        >
                          Tồn tại kho nguồn:
                        </p>
                        <p
                          className={`text-sm font-black ${availableStock <= 0 ? 'text-red-600' : 'text-green-600'}`}
                        >
                          {formatNumber(availableStock)}{' '}
                          {materials.find((m) => m.id === formData.material_id)?.unit || ''}
                          {availableStock <= 0 && ' ⚠️ Tồn kho không đủ!'}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="md:col-span-2 pt-4 border-t border-gray-100">
                    <ImageCapture
                      maxImages={1}
                      existingImages={formData.image_url ? [formData.image_url] : []}
                      onUpload={(urls) => setFormData({ ...formData, image_url: urls[0] || '' })}
                      label="Ảnh minh chứng (Phiếu điều chuyển, Hình ảnh bốc xếp...)"
                    />
                  </div>

                  <div className="md:col-span-2 flex justify-end gap-3 mt-4 pt-6 border-t border-gray-100">
                    <Button variant="outline" onClick={() => setShowModal(false)}>
                      Hủy
                    </Button>
                    <Button
                      type="submit"
                      variant="orange"
                      className="min-w-[120px]"
                      isLoading={submitting}
                      disabled={
                        availableStock !== null && Number(formData.quantity) > availableStock
                      }
                    >
                      Lưu phiếu điều chuyển
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
        warehouses={warehouses}
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
            ? `Phiếu chuyển kho ${selectedSlip?.transfer_code} đã được duyệt — hàng đã chuyển thực tế.\n\nXóa phiếu sẽ HOÀN TRẢ ${selectedSlip?.quantity} ${selectedSlip?.materials?.unit || ''} ${selectedSlip?.materials?.name || ''} về kho nguồn và TRỪ khỏi kho đích.\n\nBạn có chắc chắn muốn xóa?`
            : 'Bạn có chắc chắn muốn chuyển phiếu luân chuyển này vào thùng rác không?'
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

      {/* FAB — Lập phiếu luân chuyển */}
      <FAB
        onClick={() => {
          setFormData({ ...initialFormState, transfer_code: generateCode('LC') });
          setIsEditing(false);
          setEditingId(null);
          setShowModal(true);
        }}
        label="Điều chuyển"
        color="bg-primary"
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
                  <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-100 italic">
                    Inventory Flow Analysis
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
                Báo Cáo Điều Chuyển Kho
              </h2>
              <p className="text-xs text-gray-500 font-bold italic">
                Thời gian xuất: {new Date().toLocaleString('vi-VN')}
              </p>
              <div className="mt-4 flex flex-col items-end gap-1">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest font-mono">
                  Status: INTERNAL_FLOW
                </p>
                <div className="h-0.5 w-12 bg-primary/20 rounded-full" />
              </div>
            </div>
          </div>

          {/* Filters Info */}
          <div className="grid grid-cols-2 gap-8 mb-8 bg-gray-50/50 p-6 rounded-3xl border border-gray-100">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-4 bg-primary rounded-full" />
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
                  <p className="text-sm font-black text-primary italic uppercase tracking-widest">
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
              <tr className="bg-primary text-white">
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest italic border-r border-white/10">
                  Ngày
                </th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest italic border-r border-white/10">
                  Vật tư
                </th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest italic border-r border-white/10">
                  Từ kho
                </th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest italic border-r border-white/10">
                  Đến kho
                </th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest italic text-center">
                  SL
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
                    if (filterWarehouseId && item.from_warehouse_id !== filterWarehouseId)
                      match = false;
                    if (searchTerm) {
                      const s = searchTerm.toLowerCase();
                      const nameMatch = (item.materials?.name || '').toLowerCase().includes(s);
                      const codeMatch = (item.transfer_code || '').toLowerCase().includes(s);
                      if (!nameMatch && !codeMatch) match = false;
                    }
                    return match;
                  })
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                return filteredList.map((item, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-primary/5'}>
                    <td className="px-4 py-3 text-xs text-gray-600 font-medium italic">
                      {formatDate(item.date)}
                    </td>
                    <td className="px-4 py-3 text-xs font-black text-gray-900 uppercase tracking-tight">
                      {item.materials?.name}
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-gray-500">
                      {item.from_warehouses?.name}
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-gray-800">
                      {item.to_warehouses?.name}
                    </td>
                    <td className="px-4 py-3 text-xs font-black text-primary text-center tracking-tighter italic">
                      {formatNumber(item.quantity)} {item.materials?.unit}
                    </td>
                  </tr>
                ));
              })()}
              <tr className="bg-primary/10">
                <td
                  colSpan={5}
                  className="px-4 py-4 text-[11px] font-black text-primary uppercase text-right italic tracking-[0.1em]"
                >
                  Tổng số lượt điều chuyển:
                </td>
                <td className="px-4 py-4 text-lg font-black text-primary text-center tabular-nums">
                  {
                    slips.filter((item) => {
                      let match = true;
                      if (filterStartDate && item.date < filterStartDate) match = false;
                      if (filterEndDate && item.date > filterEndDate) match = false;
                      if (filterWarehouseId && item.from_warehouse_id !== filterWarehouseId)
                        match = false;
                      if (searchTerm) {
                        const s = searchTerm.toLowerCase();
                        const nameMatch = (item.materials?.name || '').toLowerCase().includes(s);
                        const codeMatch = (item.transfer_code || '').toLowerCase().includes(s);
                        if (!nameMatch && !codeMatch) match = false;
                      }
                      return match;
                    }).length
                  }{' '}
                  Lượt
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
                End of transaction report • Logistical Harmony
              </p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-black text-gray-300 uppercase tracking-[0.3em] mb-1">
                Transfer Protocol Verified
              </p>
              <div className="text-[10px] text-gray-400 font-bold bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
                System Hash:{' '}
                <span className="text-primary font-black tracking-widest italic ml-1 underline">
                  SYNC_OK
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Print Mode Action Bar */}
      <AnimatePresence>
        {isPrintMode && selectedPrintIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-4 border border-gray-800 print:hidden"
          >
            <span className="text-sm font-bold">Đã chọn {selectedPrintIds.length} mặt hàng</span>
            <div className="w-px h-5 bg-gray-700" />
            <button
              onClick={() => setShowPrintModal(true)}
              className="text-sm font-black text-orange-500 hover:text-orange-400 uppercase tracking-wide flex items-center gap-2"
            >
              <Printer size={16} /> Xuất in biên bản
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <PrintTransferModal
        show={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        selectedItems={slips.filter((s) => selectedPrintIds.includes(s.id))}
      />
    </div>
  );
};
