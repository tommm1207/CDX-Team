import { CanvasLogo } from '@/components/shared';
import { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  X,
  ChevronRight,
  Factory,
  CheckCircle,
  XCircle,
  AlertTriangle,
  PackageCheck,
  Loader2,
  Ban,
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
import { formatDate, formatNumber, formatCurrency, toLocalISODate } from '@/utils/format';
import { isActiveWarehouse, getAvailableStock } from '@/utils/inventory';
import { getAllowedWarehouses } from '@/utils/helpers';
import { logAudit } from '@/utils/auditLogger';

// ============================
// Production Orders Component
// ============================
export const ProductionOrders = ({
  user,
  onBack,
  addToast,
}: {
  user: Employee;
  onBack?: () => void;
  addToast?: (message: string, type?: ToastType) => void;
}) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [boms, setBoms] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('Tất cả');
  const [submitting, setSubmitting] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>(
    (localStorage.getItem(`sort_pref_prodOrders_${user.id}`) as SortOption) || 'newest',
  );
  const [showFilter, setShowFilter] = useState(true);
  const [isCapturingTable, setIsCapturingTable] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  // Form
  const [formData, setFormData] = useState({
    bom_id: '',
    kho_vat_tu_id: '',
    so_luong_ke_hoach: 0,
    ghi_chu: '',
  });

  // Preview data
  const [previewItems, setPreviewItems] = useState<any[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    fetchOrders();
    fetchBoms();
    fetchWarehouses();
  }, []);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('lenh_san_xuat')
        .select('*, san_pham_bom(ten_san_pham), warehouses(name), users(full_name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setOrders(data || []);
    } catch (err: any) {
      console.error('Error fetching orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBoms = async () => {
    const { data } = await supabase
      .from('san_pham_bom')
      .select('id, ten_san_pham, san_pham_bom_chi_tiet(*, materials(name, code, unit))')
      .eq('dang_hoat_dong', true)
      .order('ten_san_pham');
    if (data) setBoms(data);
  };

  const fetchWarehouses = async () => {
    let query = supabase
      .from('warehouses')
      .select('id, name, status')
      .or('status.is.null,status.neq.Đã xóa');

    const allowedWhIds = getAllowedWarehouses(user.data_view_permission);
    if (allowedWhIds) {
      query = query.in('id', allowedWhIds);
    }
    const { data } = await query;
    if (data) setWarehouses(data.filter(isActiveWarehouse));
  };

  const generateOrderCode = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const random = Math.floor(1000 + Math.random() * 9000);
    return `LSX${yyyy}${mm}${dd}-${random}`;
  };

  // Calculate preview when Norms + quantity + warehouse change
  const calculatePreview = async () => {
    if (!formData.bom_id || formData.so_luong_ke_hoach <= 0 || !formData.kho_vat_tu_id) {
      setPreviewItems([]);
      return;
    }

    setLoadingPreview(true);
    try {
      const bom = boms.find((b) => b.id === formData.bom_id);
      if (!bom) return;

      const items = await Promise.all(
        (bom.san_pham_bom_chi_tiet || []).map(async (bomItem: any) => {
          const canDung = bomItem.dinh_muc * formData.so_luong_ke_hoach;
          let tonKho = 0;
          try {
            tonKho = await getAvailableStock(
              bomItem.material_id,
              formData.kho_vat_tu_id,
              toLocalISODate(),
            );
          } catch (e) {
            // ignore
          }
          return {
            material_id: bomItem.material_id,
            material_name: bomItem.materials?.name || 'N/A',
            material_code: bomItem.materials?.code || '',
            dinh_muc: bomItem.dinh_muc,
            can_dung: canDung,
            ton_kho: tonKho,
            du: tonKho >= canDung,
            thieu: canDung - tonKho,
            don_vi: bomItem.don_vi,
          };
        }),
      );

      setPreviewItems(items);
    } catch (err) {
      console.error('Error calc preview:', err);
    } finally {
      setLoadingPreview(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      calculatePreview();
    }, 300);
    return () => clearTimeout(timer);
  }, [formData.bom_id, formData.so_luong_ke_hoach, formData.kho_vat_tu_id]);

  const handleAddNew = () => {
    setFormData({
      bom_id: '',
      kho_vat_tu_id: '',
      so_luong_ke_hoach: 0,
      ghi_chu: '',
    });
    setPreviewItems([]);
    setShowModal(true);
  };

  const handleSubmitOrder = async () => {
    if (!formData.bom_id) {
      if (addToast) addToast('Vui lòng chọn loại sản phẩm', 'error');
      return;
    }
    if (formData.so_luong_ke_hoach <= 0) {
      if (addToast) addToast('Số lượng phải lớn hơn 0', 'error');
      return;
    }
    if (!formData.kho_vat_tu_id) {
      if (addToast) addToast('Vui lòng chọn kho trừ vật tư', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const ma_lenh = generateOrderCode();
      const today = toLocalISODate();

      // 1. Create production order
      const { data: orderData, error: orderError } = await supabase
        .from('lenh_san_xuat')
        .insert([
          {
            ma_lenh,
            bom_id: formData.bom_id,
            kho_vat_tu_id: formData.kho_vat_tu_id,
            so_luong_ke_hoach: formData.so_luong_ke_hoach,
            ngay_phat_lenh: today,
            nguoi_phat_lenh: user.id,
            ghi_chu: formData.ghi_chu || null,
            trang_thai: 'cho_duyet',
          },
        ])
        .select()
        .single();

      if (orderError) throw orderError;

      // 2. Create stock_out for each material in norms (auto-approved)
      const bom = boms.find((b) => b.id === formData.bom_id);
      if (bom) {
        const stockOutItems = (bom.san_pham_bom_chi_tiet || []).map((bomItem: any) => ({
          slip_code: `XSX-${ma_lenh}`,
          date: today,
          material_id: bomItem.material_id,
          warehouse_id: formData.kho_vat_tu_id,
          quantity: bomItem.dinh_muc * formData.so_luong_ke_hoach,
          unit: bomItem.don_vi,
          employee_id: user.id,
          notes: `Xuất kho tự động - Lệnh SX: ${ma_lenh}`,
          status: 'Chờ duyệt',
          approved_by: null,
          approved_date: null,
        }));

        const { error: stockOutError } = await supabase.from('stock_out').insert(stockOutItems);
        if (stockOutError) throw stockOutError;
      }

      if (addToast)
        addToast(`Lệnh sản xuất ${ma_lenh} đã được khởi tạo và đang chờ duyệt.`, 'success');

      await logAudit(user, {
        module: 'PRODUCTION',
        action: 'CREATE',
        description: `Tạo lệnh sản xuất: ${ma_lenh}`,
        recordId: orderData.id,
      });

      setShowModal(false);
      fetchOrders();
    } catch (err: any) {
      if (addToast) addToast('Lỗi: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelOrder = async (order: any) => {
    if (order.so_luong_hoan_thanh > 0) {
      if (addToast) addToast('Không thể hủy lệnh đã có thành phẩm nhập kho!', 'error');
      return;
    }
    if (
      !window.confirm(
        `Hủy lệnh ${order.ma_lenh}? Toàn bộ lịch trình và xuất kho liên quan sẽ bị xóa.`,
      )
    )
      return;

    try {
      // 1. Delete associated stock_out
      await supabase.from('stock_out').delete().eq('slip_code', `XSX-${order.ma_lenh}`);

      // 2. Delete the order itself if it's just pending, or soft delete if it's production
      if (order.trang_thai === 'cho_duyet') {
        const { error } = await supabase.from('lenh_san_xuat').delete().eq('id', order.id);
        if (error) throw error;
        if (addToast) addToast('Đã xóa lệnh sản xuất thành công', 'success');
      } else {
        const { error } = await supabase
          .from('lenh_san_xuat')
          .update({ trang_thai: 'da_huy' })
          .eq('id', order.id);
        if (error) throw error;
        if (addToast) addToast('Đã hủy lệnh sản xuất thành công', 'success');
      }

      await logAudit(user, {
        module: 'PRODUCTION',
        action: 'DELETE',
        description: `Hủy lệnh sản xuất: ${order.ma_lenh}`,
        recordId: order.id,
      });

      if (selectedOrder?.id === order.id) setSelectedOrder(null);
      fetchOrders();
    } catch (err: any) {
      if (addToast) addToast('Lỗi: ' + err.message, 'error');
    }
  };

  const handleApproveOrder = async (order: any) => {
    if (user.role !== 'Admin' && user.role !== 'Develop') {
      if (addToast) addToast('Bạn không có quyền duyệt lệnh này', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const today = toLocalISODate();

      // 1. Approve associated stock_out
      const { error: stockError } = await supabase
        .from('stock_out')
        .update({
          status: 'Đã duyệt',
          approved_by: user.id,
          approved_date: today,
        })
        .eq('slip_code', `XSX-${order.ma_lenh}`);
      if (stockError) throw stockError;

      // 2. Update order status
      const { error: orderError } = await supabase
        .from('lenh_san_xuat')
        .update({ trang_thai: 'dang_san_xuat' })
        .eq('id', order.id);
      if (orderError) throw orderError;

      if (addToast)
        addToast(`Đã duyệt lệnh sản xuất ${order.ma_lenh}. Vật tư đã được trừ kho.`, 'success');

      await logAudit(user, {
        module: 'PRODUCTION',
        action: 'APPROVE',
        description: `Duyệt lệnh sản xuất: ${order.ma_lenh}`,
        recordId: order.id,
      });

      fetchOrders();
      if (selectedOrder?.id === order.id) {
        setSelectedOrder({ ...selectedOrder, trang_thai: 'dang_san_xuat' });
      }
    } catch (err: any) {
      if (addToast) addToast('Lỗi duyệt: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectOrder = async (order: any) => {
    if (!window.confirm(`Từ chối và xóa lệnh ${order.ma_lenh}?`)) return;

    setSubmitting(true);
    try {
      // Delete associated stock_out
      await supabase.from('stock_out').delete().eq('slip_code', `XSX-${order.ma_lenh}`);

      // Delete the order
      const { error } = await supabase.from('lenh_san_xuat').delete().eq('id', order.id);
      if (error) throw error;

      if (addToast) addToast('Đã từ chối lệnh sản xuất', 'info');
      fetchOrders();
      if (selectedOrder?.id === order.id) setSelectedOrder(null);
    } catch (err: any) {
      if (addToast) addToast('Lỗi: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (trang_thai: string) => {
    switch (trang_thai) {
      case 'cho_duyet':
        return { label: 'Chờ duyệt', bg: 'bg-primary/10', text: 'text-primary' };
      case 'dang_san_xuat':
        return { label: 'Đang SX', bg: 'bg-amber-100', text: 'text-amber-700' };
      case 'hoan_thanh':
        return { label: 'Hoàn thành', bg: 'bg-green-100', text: 'text-green-700' };
      case 'da_huy':
        return { label: 'Đã hủy', bg: 'bg-red-100', text: 'text-red-700' };
      default:
        return { label: trang_thai, bg: 'bg-gray-100', text: 'text-gray-700' };
    }
  };

  const filteredOrders = orders.filter((order) => {
    if (statusFilter !== 'Tất cả' && order.trang_thai !== statusFilter) return false;
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (
      (order.ma_lenh || '').toLowerCase().includes(s) ||
      (order.san_pham_bom?.ten_san_pham || '').toLowerCase().includes(s)
    );
  });

  const handleExportExcel = () => {
    import('@/utils/excelExport').then(({ exportToExcel }) => {
      exportToExcel({
        title: 'Lệnh sản xuất & Tách ghép vật tư',
        sheetName: 'Sản xuất',
        columns: ['Mã lệnh', 'Ngày', 'Vật tư', 'Kho', 'Số lượng', 'Trạng thái', 'Ghi chú'],
        rows: orders.map((o) => [
          o.order_code ?? '',
          o.date ?? '',
          o.materials?.name ?? '',
          o.warehouses?.name ?? '',
          o.quantity,
          o.status ?? '',
          o.notes ?? '',
        ]),
        fileName: `CDX_LenhSanXuat_${toLocalISODate()}.xlsx`,
        addToast,
      });
    });
  };

  const bomOptions = boms.map((b) => ({ id: b.id, name: b.ten_san_pham }));
  const warehouseOptions = warehouses.map((w) => ({ id: w.id, name: w.name }));

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageBreadcrumb title="Lệnh sản xuất" onBack={onBack} />
        <div className="flex items-center gap-1.5 justify-end flex-1">
          <SaveImageButton
            onClick={() => {
              if (reportRef.current) {
                exportTableImage({
                  element: reportRef.current,
                  fileName: `Lenh_San_Xuat_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.png`,
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
              localStorage.setItem(`sort_pref_prodOrders_${user.id}`, val);
            }}
            options={[
              { value: 'newest', label: 'Mới nhất' },
              { value: 'code', label: 'Mã lệnh' },
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

      {/* Filters */}
      <AnimatePresence>
        {showFilter && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: showFilter ? 'visible' : 'hidden' }}
          >
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 space-y-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Tìm kiếm</label>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Tìm mã lệnh, sản phẩm..."
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">
                    Trạng thái
                  </label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="Tất cả">Tất cả trạng thái</option>
                    <option value="dang_san_xuat">Đang SX</option>
                    <option value="hoan_thanh">Hoàn thành</option>
                    <option value="da_huy">Đã hủy</option>
                  </select>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Orders list */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex flex-col items-center py-12 text-gray-400">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2" />
            <p className="text-sm">Đang tải...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200">
            <Factory size={48} className="mb-3 text-gray-300" />
            <p className="font-medium">Chưa có lệnh sản xuất</p>
            <p className="text-xs mt-1">Bấm nút + để phát lệnh sản xuất mới</p>
          </div>
        ) : (
          filteredOrders.map((order) => {
            const badge = getStatusBadge(order.trang_thai);
            const progress =
              order.so_luong_ke_hoach > 0
                ? Math.round((order.so_luong_hoan_thanh / order.so_luong_ke_hoach) * 100)
                : 0;

            return (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => setSelectedOrder(selectedOrder?.id === order.id ? null : order)}
                className={`bg-white rounded-2xl p-4 border cursor-pointer transition-all hover:shadow-md ${
                  selectedOrder?.id === order.id
                    ? 'border-primary shadow-md ring-2 ring-primary/10'
                    : 'border-gray-100'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        order.trang_thai === 'hoan_thanh'
                          ? 'bg-green-100'
                          : order.trang_thai === 'da_huy'
                            ? 'bg-red-100'
                            : 'bg-amber-100'
                      }`}
                    >
                      {order.trang_thai === 'hoan_thanh' ? (
                        <PackageCheck size={20} className="text-green-600" />
                      ) : order.trang_thai === 'da_huy' ? (
                        <Ban size={20} className="text-red-600" />
                      ) : (
                        <Factory size={20} className="text-amber-600" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-gray-800 text-sm">{order.ma_lenh}</h3>
                        <span
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${badge.bg} ${badge.text}`}
                        >
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400 truncate">
                        {order.san_pham_bom?.ten_san_pham || 'N/A'} •{' '}
                        {formatDate(order.ngay_phat_lenh)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-gray-800">
                      {order.so_luong_hoan_thanh}/{order.so_luong_ke_hoach}
                    </p>
                    <p className="text-[10px] text-gray-400">{progress}%</p>
                  </div>
                </div>

                {/* Progress bar */}
                {order.trang_thai !== 'da_huy' && (
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        progress >= 100 ? 'bg-green-500' : 'bg-primary'
                      }`}
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                  </div>
                )}

                {/* Detail panel (expanded) */}
                <AnimatePresence>
                  {selectedOrder?.id === order.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <span className="text-gray-400">Kho vật tư:</span>
                            <p className="font-medium text-gray-800">
                              {order.warehouses?.name || 'N/A'}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-400">Người phát lệnh:</span>
                            <p className="font-medium text-gray-800">
                              {order.users?.full_name || 'N/A'}
                            </p>
                          </div>
                          {order.ghi_chu && (
                            <div className="col-span-2">
                              <span className="text-gray-400">Ghi chú:</span>
                              <p className="font-medium text-gray-800">{order.ghi_chu}</p>
                            </div>
                          )}
                        </div>

                        {order.trang_thai === 'cho_duyet' &&
                          (user.role === 'Admin' || user.role === 'Develop') && (
                            <div className="flex gap-2 w-full">
                              <Button
                                variant="success"
                                size="sm"
                                icon={CheckCircle}
                                onClick={(e: any) => {
                                  e.stopPropagation();
                                  handleApproveOrder(order);
                                }}
                                className="flex-1"
                                isLoading={submitting}
                              >
                                Duyệt lệnh
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                icon={XCircle}
                                onClick={(e: any) => {
                                  e.stopPropagation();
                                  handleRejectOrder(order);
                                }}
                                className="flex-1"
                                isLoading={submitting}
                              >
                                Từ chối
                              </Button>
                            </div>
                          )}

                        {order.trang_thai === 'dang_san_xuat' && (
                          <Button
                            variant="danger"
                            size="sm"
                            icon={XCircle}
                            onClick={(e: any) => {
                              e.stopPropagation();
                              handleCancelOrder(order);
                            }}
                            className="w-full"
                          >
                            Hủy lệnh sản xuất
                          </Button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })
        )}
      </div>

      {/* FAB — Thêm lệnh mới */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-3">
        <SaveImageButton
          onClick={() => {
            if (reportRef.current) {
              exportTableImage({
                element: reportRef.current,
                fileName: 'Danh_sach_lenh_san_xuat.png',
                addToast,
              });
            }
          }}
          isCapturing={isCapturingTable}
          title="Xuất báo cáo"
        />
        <FAB onClick={() => setShowModal(true)} label="Phát lệnh mới" />
      </div>

      {/* Hidden Ref for Report Capture */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        <div ref={reportRef} className="p-8 bg-white" style={{ width: '1200px' }}>
          <div className="flex items-center justify-between mb-8 pb-4 border-b-2 border-primary/20">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-lg">
                <Factory size={32} className="text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-gray-800 tracking-tight uppercase">
                  DANH SÁCH LỆNH SẢN XUẤT
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
                  Mã lệnh
                </th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider">
                  Sản phẩm
                </th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-center">
                  SL Kế hoạch
                </th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-center">
                  Hoàn thành
                </th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider">
                  Kho vật tư
                </th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-right">
                  Ngày phát
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.id} className="border-b border-gray-100">
                  <td className="px-4 py-3.5 text-xs font-black text-primary uppercase">
                    {order.ma_lenh}
                  </td>
                  <td className="px-4 py-3.5 text-xs font-bold text-gray-800">
                    {order.san_pham_bom?.ten_san_pham}
                  </td>
                  <td className="px-4 py-3.5 text-xs font-black text-center text-gray-700">
                    {order.so_luong_ke_hoach}
                  </td>
                  <td className="px-4 py-3.5 text-xs font-black text-center text-green-600">
                    {order.so_luong_hoan_thanh}
                  </td>
                  <td className="px-4 py-3.5 text-xs font-bold text-gray-500">
                    {order.warehouses?.name}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-right text-gray-400 italic">
                    {formatDate(order.ngay_phat_lenh)}
                  </td>
                </tr>
              ))}
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

      {/* Create Order Modal */}
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
              className="bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden relative z-10"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-primary p-6 text-white flex items-center justify-between rounded-t-[2rem] md:rounded-t-[2.5rem] flex-shrink-0">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowModal(false)}
                    className="p-1 hover:bg-white/20 rounded-full"
                  >
                    <X size={20} />
                  </button>
                  <div>
                    <h2 className="font-bold text-lg">Phát lệnh sản xuất</h2>
                    <p className="text-xs text-white/70">
                      Chọn định mức → nhập số lượng → kiểm tra tồn kho
                    </p>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="p-6 space-y-6 overflow-y-auto flex-1">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                    Loại sản phẩm (Định mức) *
                  </label>
                  <CreatableSelect
                    value={formData.bom_id}
                    options={bomOptions}
                    onChange={(val) => setFormData({ ...formData, bom_id: val })}
                    placeholder="Chọn loại cọc / sản phẩm..."
                    allowCreate={false}
                  />
                </div>

                <NumericInput
                  label="Số lượng kế hoạch *"
                  value={formData.so_luong_ke_hoach}
                  onChange={(val) => setFormData({ ...formData, so_luong_ke_hoach: val })}
                />

                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                    Kho trừ vật tư *
                  </label>
                  <CreatableSelect
                    value={formData.kho_vat_tu_id}
                    options={warehouseOptions}
                    onChange={(val) => setFormData({ ...formData, kho_vat_tu_id: val })}
                    placeholder="Chọn kho..."
                    allowCreate={false}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                    Ghi chú
                  </label>
                  <textarea
                    value={formData.ghi_chu}
                    onChange={(e) => setFormData({ ...formData, ghi_chu: e.target.value })}
                    placeholder="Ghi chú thêm cho lệnh sản xuất..."
                    rows={2}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary/20 outline-none resize-none"
                  />
                </div>

                {/* Preview Table */}
                {previewItems.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-gray-600 uppercase mb-3">
                      📋 Bảng dự trù vật tư
                    </h3>
                    <div className="bg-gray-50 rounded-2xl overflow-hidden border border-gray-100">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase">
                              Vật tư
                            </th>
                            <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase text-right">
                              Cần
                            </th>
                            <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase text-right">
                              Tồn kho
                            </th>
                            <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase text-center">
                              TT
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {previewItems.map((item, idx) => (
                            <tr key={idx}>
                              <td className="px-3 py-2.5 text-xs text-gray-800">
                                {item.material_name}
                              </td>
                              <td className="px-3 py-2.5 text-xs font-bold text-gray-800 text-right">
                                {formatNumber(item.can_dung)} {item.don_vi}
                              </td>
                              <td className="px-3 py-2.5 text-xs text-gray-600 text-right">
                                {formatNumber(item.ton_kho)} {item.don_vi}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                {item.du ? (
                                  <CheckCircle size={16} className="text-green-500 inline" />
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-500">
                                    <AlertTriangle size={12} />
                                    Thiếu {formatNumber(item.thieu)}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {previewItems.some((i) => !i.du) && (
                      <div className="mt-2 flex items-center gap-2 text-[10px] text-amber-600 bg-amber-50 px-3 py-2 rounded-xl">
                        <AlertTriangle size={14} />
                        <span>Một số vật tư chưa đủ tồn kho. Vẫn có thể phát lệnh.</span>
                      </div>
                    )}
                  </div>
                )}

                {loadingPreview && (
                  <div className="flex items-center gap-2 text-sm text-gray-400 justify-center py-4">
                    <Loader2 size={16} className="animate-spin" />
                    Đang kiểm tra tồn kho...
                  </div>
                )}
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
                  onClick={handleSubmitOrder}
                  disabled={submitting}
                  className="px-8 py-2.5 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90 shadow-lg shadow-primary/20 disabled:opacity-50"
                >
                  {submitting ? 'Đang xử lý...' : '🏭 Phát lệnh sản xuất'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
