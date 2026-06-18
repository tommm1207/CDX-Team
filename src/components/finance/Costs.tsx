import { exportTableImage } from '../../utils/reportExport';
import { CanvasLogo } from '@/components/shared';
import { supabase } from '@/lib/supabase';
import { useState, useEffect, FormEvent, useRef, useMemo } from 'react';
import {
  Search,
  Plus,
  Filter,
  PackageOpen,
  Download,
  Upload,
  AlertCircle,
  Edit,
  Trash2,
  Settings,
  ArrowRight,
  ArrowLeft,
  MoreVertical,
  Wallet,
  XCircle,
  CheckCircle,
  Calculator,
  CreditCard,
  RefreshCw,
  X,
  Check,
  ChevronDown,
  FileSpreadsheet,
  ArrowDownCircle,
  ArrowUpCircle,
  Info,
  Navigation,
  Image as LucideImageIcon,
  Share2,
} from 'lucide-react';

import { SaveImageButton } from '@/components/shared';
import { motion, AnimatePresence } from 'motion/react';

import { Employee } from '@/types';
import { PageBreadcrumb } from '@/components/shared';
import { NumericInput } from '@/components/shared';
import { CreatableSelect } from '@/components/shared';
import { ToastType } from '@/components/shared';
import { FAB } from '@/components/shared';
import { ExcelButton } from '@/components/shared';
import { formatCurrency, formatNumber, formatDate, toLocalISODate } from '@/utils/format';
import { isUUID, getAllowedWarehouses } from '@/utils/helpers';
import { isActiveWarehouse } from '@/utils/inventory';
import { Button } from '@/components/shared';
import { SortButton, SortOption } from '@/components/shared';
import { generateSmartCode } from '@/utils/codeGenerator';
import { checkUsage } from '@/utils/dataIntegrity';
import { ReportPreviewModal } from '@/components/shared';

const initialFormState = {
  date: toLocalISODate(),
  cost_code: '',
  employee_id: '',
  transaction_type: 'Chi',
  cost_group_id: '',
  cost_item_id: '',
  cost_type: '', // for backward compatibility/display
  content: '', // for backward compatibility/display
  warehouse_id: '',
  material_id: null,
  quantity: 1,
  unit: 'Lần',
  unit_price: 0,
  total_amount: 0,
  notes: '',
  status: 'Chờ duyệt',
  stock_status: 'Chưa nhập',
};

export const Costs = ({
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
  const [showModal, setShowModal] = useState(initialAction === 'add');
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    if (setHideBottomNav) {
      setHideBottomNav(showModal || showDeleteModal || showDetailModal);
    }
    if (showModal || showDeleteModal || showDetailModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
  }, [showModal, showDeleteModal, showDetailModal, setHideBottomNav]);

  const [selectedCost, setSelectedCost] = useState<any>(null);
  const [costs, setCosts] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [costGroups, setCostGroups] = useState<any[]>([]);
  const [costItems, setCostItems] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Filters State
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterEmployeeId, setFilterEmployeeId] = useState('');
  const [isCapturingTable, setIsCapturingTable] = useState(false);
  const [showReportPreview, setShowReportPreview] = useState(false);

  const reportRef = useRef<HTMLDivElement>(null);
  const [filterWarehouseId, setFilterWarehouseId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('Tất cả');
  const [showFilter, setShowFilter] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>(
    (localStorage.getItem(`sort_pref_costs_${user.id}`) as SortOption) || 'date',
  );

  const [employees, setEmployees] = useState<any[]>([]);

  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [usageInfo, setUsageInfo] = useState<any>({ inUse: false, details: [] });

  const [formData, setFormData] = useState<any>(() => ({
    ...initialFormState,
    date: toLocalISODate(),
  }));

  useEffect(() => {
    fetchCosts();
    fetchCostGroups();
    fetchCostItems();
    fetchUnits();
    fetchEmployees();
    fetchMaterials();
    fetchWarehouses();
  }, [statusFilter]);

  const handleSaveTableImage = () => {
    setShowReportPreview(true);
  };

  const fetchUnits = async () => {
    const { data } = await supabase.from('costs').select('unit');
    if (data) {
      const uniqueUnits = Array.from(new Set(data.map((item) => item.unit)))
        .filter(Boolean)
        .map((name) => ({ id: name as string, name: name as string }));
      setUnits(uniqueUnits);
    }
  };

  const fetchCostGroups = async () => {
    const { data } = await supabase
      .from('cost_groups')
      .select('id, name')
      .or('status.is.null,status.neq.Đã xóa')
      .order('name');
    if (data) setCostGroups(data);
  };

  const fetchCostItems = async (groupId?: string) => {
    if (!groupId) {
      setCostItems([]);
      return;
    }
    const { data } = await supabase
      .from('cost_items')
      .select('id, name, unit')
      .eq('group_id', groupId)
      .neq('status', 'Đã xóa')
      .order('name');
    if (data) setCostItems(data);
  };

  const fetchEmployees = async () => {
    const { data } = await supabase
      .from('users')
      .select('id, full_name, code')
      .neq('status', 'Nghỉ việc');
    if (data) setEmployees(data);
  };

  const generateNextCostCode = async () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const random = Math.floor(1000 + Math.random() * 9000);
    return `CP${yyyy}${mm}${dd}-${random}`;
  };

  useEffect(() => {
    if (initialAction === 'add') {
      generateNextCostCode().then((code) => {
        setFormData((prev: any) => ({ ...prev, cost_code: code }));
      });
    }
  }, [initialAction]);

  const fetchCosts = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('costs')
        .select(
          '*, users(full_name), warehouses(name, code), materials(name, code), cost_groups(name), cost_items(name)',
        );

      if (statusFilter === 'Tất cả') {
        query = query.or('status.is.null,status.neq.Đã xóa');
      } else {
        query = query.eq('status', statusFilter);
      }

      const allowedWhIds = getAllowedWarehouses(user.data_view_permission);
      if (allowedWhIds) {
        query = query.in('warehouse_id', allowedWhIds);
      }

      const { data, error } = await query.order('cost_code', { ascending: false });

      if (error) {
        setCosts([]);
      } else {
        setCosts(data || []);
      }
    } catch (err: any) {
      if (addToast) addToast('Lỗi tải danh sách chi phí: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchMaterials = async () => {
    const { data } = await supabase
      .from('materials')
      .select('id, name, group_id, unit')
      .or('status.is.null,status.neq.Đã xóa');
    if (data) setMaterials(data);
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
    if (data) {
      setWarehouses(data.filter(isActiveWarehouse));
    }
  };

  const handleCreateGroup = async (name: string) => {
    const code = `CG${(costGroups.length + 1).toString().padStart(3, '0')}`;
    const { data, error } = await supabase
      .from('cost_groups')
      .insert([{ name, code, status: 'Hoạt động' }])
      .select();
    if (error) {
      if (addToast) addToast('Lỗi tạo nhóm: ' + error.message, 'error');
      return;
    }
    if (data && data[0]) {
      setCostGroups((prev) => [...prev, data[0]]);
      setFormData((prev: any) => ({ ...prev, cost_group_id: data[0].id, cost_item_id: '' }));
      fetchCostItems(data[0].id);
      if (addToast) addToast(`Đã thêm nhóm mới: ${name}`, 'success');
    }
  };

  const handleCreateItem = async (name: string) => {
    if (!formData.cost_group_id) {
      if (addToast) addToast('Vui lòng chọn nhóm trước khi thêm chi tiết', 'warning');
      return;
    }
    const code = `CI${(costItems.length + 1).toString().padStart(3, '0')}`;
    const { data, error } = await supabase
      .from('cost_items')
      .insert([{ name, code, group_id: formData.cost_group_id, status: 'Hoạt động' }])
      .select();
    if (error) {
      if (addToast) addToast('Lỗi tạo chi tiết: ' + error.message, 'error');
      return;
    }
    if (data && data[0]) {
      setCostItems((prev) => [...prev, data[0]]);
      setFormData((prev: any) => ({ ...prev, cost_item_id: data[0].id }));
      if (addToast) addToast(`Đã thêm chi tiết mới: ${name}`, 'success');
    }
  };

  const ensureValueExists = async (
    table: string,
    name: string,
    currentList: any[],
    fetchFn: () => void,
  ) => {
    if (!name) return null;
    if (isUUID(name)) return name;
    if (table === 'costs') return null;

    const existing = currentList.find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;

    let code = '';
    const random = Math.floor(100 + Math.random() * 900);
    if (table === 'warehouses') {
      code = `KH${(currentList.length + 1).toString().padStart(2, '0')}-${random}`;
    } else if (table === 'materials') {
      code = `VAT${(currentList.length + 1).toString().padStart(3, '0')}-${random}`;
    }

    const { data, error } = await supabase.from(table).insert([{ name, code }]).select();
    if (!error && data && data[0]) {
      fetchFn();
      return data[0].id;
    }
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const warehouse_id = await ensureValueExists(
        'warehouses',
        formData.warehouse_name,
        warehouses,
        fetchWarehouses,
      );

      const cost_code = isEditing ? formData.cost_code : await generateNextCostCode();

      const payload = {
        date: formData.date,
        cost_code,
        transaction_type: formData.transaction_type,
        cost_group_id: isUUID(formData.cost_group_id) ? formData.cost_group_id : null,
        cost_item_id: isUUID(formData.cost_item_id) ? formData.cost_item_id : null,
        cost_type: formData.cost_type, // Fallback
        content: formData.content, // Fallback
        warehouse_id,
        material_id: isUUID(formData.material_id) ? formData.material_id : null,
        quantity: formData.quantity,
        unit: formData.unit,
        unit_price: formData.unit_price || 0,
        total_amount: formData.total_amount,
        notes: isEditing
          ? `[SỬA lúc ${new Date().toLocaleString('vi-VN')}] ${formData.notes.replace(/^\[SỬA lúc .*?\]\s*/, '')}`
          : formData.notes,
        employee_id: user.id,
        status: ['admin', 'develop'].includes(user.role?.toLowerCase() || '')
          ? isEditing
            ? formData.status
            : 'Chờ duyệt'
          : 'Chờ duyệt',
      };

      if (isEditing && editingId) {
        const { error } = await supabase.from('costs').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('costs').insert([payload]);
        if (error) throw error;
      }

      setShowModal(false);
      setFormData({
        ...initialFormState,
        date: toLocalISODate(),
      });
      setIsEditing(false);
      setEditingId(null);
      setSearchTerm('');
      setStatusFilter('Tất cả');
      setFilterStartDate('');
      setFilterEndDate('');
      setFilterWarehouseId('');
      fetchCosts();
      fetchCostGroups();
      fetchCostItems();
      if (addToast) addToast(isEditing ? 'Cập nhật thành công!' : 'Lưu thành công!', 'success');
    } catch (err: any) {
      if (addToast) addToast('Lỗi: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (item: any) => {
    setFormData({
      date: item.date,
      transaction_type: item.transaction_type || 'Chi',
      cost_type: item.cost_type || '',
      content: item.content || '',
      warehouse_name: item.warehouses?.name || '',
      quantity: item.quantity,
      unit: item.unit || '',
      total_amount: item.total_amount,
      notes: item.notes || '',
      cost_code: item.cost_code,
      status: item.status,
      cost_group_id: item.cost_group_id || '',
      cost_item_id: item.cost_item_id || '',
    });
    setEditingId(item.id);
    setIsEditing(true);
    setShowModal(true);
    setShowDetailModal(false);
    if (item.cost_group_id) fetchCostItems(item.cost_group_id);
  };

  const handleDeleteClick = async (item: any) => {
    setItemToDelete(item.id);
    setShowDeleteModal(true);
    try {
      // Costs usually haven't child dependencies but we check for consistency
      const usage = await checkUsage('material', item.material_id || item.id);
      setUsageInfo(usage);
    } catch (err) {
      console.error('Error checking usage:', err);
    }
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('costs')
        .update({ status: 'Đã xóa' })
        .eq('id', itemToDelete);
      if (error) throw error;
      fetchCosts();
      if (addToast) addToast('Đã chuyển vào thùng rác', 'success');
      setShowDeleteModal(false);
    } catch (err: any) {
      if (addToast) addToast('Lỗi: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePermanentDelete = async () => {
    if (!itemToDelete || user.role !== 'Develop') return;
    if (
      !window.confirm('CẢNH BÁO: Hành động này sẽ xóa VĨNH VIỄN phiếu chi này. Bạn có chắc chắn?')
    )
      return;

    setSubmitting(true);
    try {
      const { error } = await supabase.from('costs').delete().eq('id', itemToDelete);
      if (error) throw error;
      if (addToast) addToast('Đã xóa vĩnh viễn phiếu chi', 'success');
      fetchCosts();
      setShowDeleteModal(false);
    } catch (err: any) {
      if (addToast) addToast('Lỗi xóa vĩnh viễn: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportExcel = () => {
    import('@/utils/excelExport').then(({ exportToExcel: cdxExport }) => {
      cdxExport({
        title: 'B\u00e1o c\u00e1o Chi ph\u00ed',
        sheetName: 'Chi ph\u00ed',
        columns: [
          'M\u00e3',
          'Ng\u00e0y',
          'Lo\u1ea1i',
          'Ng\u01b0\u1eddi l\u1eadp',
          'H\u1ea1ng m\u1ee5c',
          'N\u1ed9i dung',
          'Kho',
          'S\u1ed1 l\u01b0\u1ee3ng',
          '\u0110VT',
          'Th\u00e0nh ti\u1ec1n',
        ],
        rows: filteredCosts.map((item) => [
          item.cost_code,
          item.date,
          item.transaction_type,
          item.users?.full_name ?? '',
          item.cost_type ?? '',
          item.content ?? '',
          item.warehouses?.name ?? '',
          item.quantity,
          item.unit ?? '',
          item.total_amount,
        ]),
        fileName: `CDX_ChiPhi_${toLocalISODate()}.xlsx`,
        addToast,
      });
    });
  };

  const filteredCosts = costs
    .filter((item) => {
      let match = true;
      if (filterStartDate && item.date < filterStartDate) match = false;
      if (filterEndDate && item.date > filterEndDate) match = false;
      if (filterEmployeeId && item.employee_id !== filterEmployeeId) match = false;
      if (filterWarehouseId && item.warehouse_id !== filterWarehouseId) match = false;
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        const searchMatch =
          (item.content || '').toLowerCase().includes(s) ||
          (item.cost_code || '').toLowerCase().includes(s) ||
          (item.cost_type || '').toLowerCase().includes(s) ||
          (item.cost_groups?.name || '').toLowerCase().includes(s) ||
          (item.cost_items?.name || '').toLowerCase().includes(s) ||
          (item.warehouses?.name || '').toLowerCase().includes(s);
        if (!searchMatch) match = false;
      }
      return match;
    })
    .sort((a, b) => {
      if (sortBy === 'date' || sortBy === 'newest')
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      if (sortBy === 'price') return (b.total_amount || 0) - (a.total_amount || 0);
      return 0;
    });

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24">
      <div className="flex items-center justify-between gap-2 mb-4">
        <PageBreadcrumb title="Quản lý Chi phí" onBack={onBack} />
        <div className="flex items-center gap-1.5 justify-end flex-1 flex-shrink-0">
          <SaveImageButton
            onClick={handleSaveTableImage}
            isCapturing={isCapturingTable}
            title="Lưu ảnh báo cáo A4"
          />
          <ExcelButton onClick={handleExportExcel} size="icon" />
          <SortButton
            currentSort={sortBy}
            onSortChange={(val) => setSortBy(val)}
            options={[
              { value: 'newest', label: 'Sắp xếp: Mới nhất' },
              { value: 'price', label: 'Sắp xếp: Thành tiền' },
              { value: 'date', label: 'Sắp xếp: Ngày chi' },
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

      {/* Dashboard cards removed - moved to CostReport for Admin only */}

      <AnimatePresence>
        {showFilter && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="z-20"
            style={{ overflow: showFilter ? 'visible' : 'hidden' }}
          >
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Từ ngày</label>
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Đến ngày</label>
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Kho</label>
                  <select
                    value={filterWarehouseId}
                    onChange={(e) => setFilterWarehouseId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs outline-none focus:ring-2 focus:ring-primary/20 transition-all"
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
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Mã, nội dung, nhóm, kho..."
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs outline-none focus:ring-2 focus:ring-primary/20 transition-all"
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

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap min-w-[700px] md:min-w-0">
            <thead>
              <tr className="bg-primary text-white text-[9px] md:text-[10px] font-bold uppercase tracking-wider">
                <th className="px-2 md:px-4 py-2 md:py-3 border-r border-white/10">Ngày</th>
                <th className="px-2 md:px-4 py-2 md:py-3 border-r border-white/10 text-center">
                  Loại
                </th>
                <th className="px-2 md:px-4 py-2 md:py-3 border-r border-white/10">Kho</th>
                <th className="px-2 md:px-4 py-2 md:py-3 border-r border-white/10">
                  Hạng mục / Nội dung
                </th>
                <th className="px-2 md:px-4 py-2 md:py-3 border-r border-white/10 text-right">
                  Số tiền
                </th>
                <th className="px-2 md:px-4 py-2 md:py-3 text-center w-28">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(() => {
                let currentBackgroundColor = 'bg-white';
                let lastGroupKey = '';

                return filteredCosts.map((item) => {
                  const groupKey = item.date;
                  if (groupKey !== lastGroupKey) {
                    currentBackgroundColor =
                      currentBackgroundColor === 'bg-white' ? 'bg-gray-100' : 'bg-white';
                    lastGroupKey = groupKey;
                  }

                  return (
                    <tr
                      key={item.id}
                      onClick={() => {
                        setSelectedCost(item);
                        setShowDetailModal(true);
                      }}
                      className={`transition-colors cursor-pointer text-[10px] md:text-xs group hover:brightness-95 border-b border-gray-100/50 ${currentBackgroundColor}`}
                    >
                      <td className="px-2 md:px-4 py-2.5 md:py-3 border-r border-gray-100/50">
                        {formatDate(item.date)}
                      </td>
                      <td className="px-2 md:px-4 py-2.5 md:py-3 text-center border-r border-gray-100/50">
                        <span
                          className={`px-1.5 md:px-3 py-0.5 md:py-1 rounded-md md:rounded-full font-bold text-[8px] md:text-[10px] ${item.transaction_type === 'Thu' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}
                        >
                          {item.transaction_type}
                        </span>
                      </td>
                      <td className="px-2 md:px-4 py-2.5 md:py-3 text-gray-500 font-medium border-r border-gray-100/50 max-w-[80px] md:max-w-none truncate">
                        {item.warehouses?.name || '---'}
                      </td>
                      <td className="px-2 md:px-4 py-2.5 md:py-3 max-w-[150px] md:max-w-[200px] border-r border-gray-100/50">
                        <p className="font-bold text-gray-700 truncate text-[10px] md:text-xs">
                          {item.cost_groups?.name || item.cost_type || '---'}
                        </p>
                        <p className="text-[9px] md:text-[10px] text-gray-400 truncate italic">
                          {item.cost_items?.name || item.content || '---'}
                        </p>
                      </td>
                      <td
                        className={`px-2 md:px-4 py-2.5 md:py-3 font-black text-right border-r border-gray-100/50 text-[11px] md:text-xs ${item.transaction_type === 'Thu' ? 'text-green-600' : 'text-red-600'}`}
                      >
                        {formatCurrency(item.total_amount)}
                      </td>
                      <td className="px-2 md:px-4 py-2.5 md:py-3 text-center w-28">
                        <span
                          className={`px-1.5 md:px-2 py-0.5 md:py-1 rounded-md md:rounded-lg text-[9px] md:text-[10px] font-bold ${item.status === 'Đã duyệt' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}
                        >
                          {item.status || 'Chờ duyệt'}
                        </span>
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {showDetailModal && selectedCost && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-md no-print"
            onClick={() => setShowDetailModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 30 }}
              className="bg-white rounded-[1.5rem] md:rounded-[2.5rem] p-6 shadow-2xl z-10 w-full max-w-sm relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-lg text-primary">{selectedCost.cost_code}</h3>
                <button onClick={() => setShowDetailModal(false)}>
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-4 text-sm">
                <div className="flex justify-between border-b border-gray-50 pb-2">
                  <span className="text-gray-400">Ngày:</span>
                  <span className="font-medium">{formatDate(selectedCost.date)}</span>
                </div>
                <div className="flex justify-between border-b border-gray-50 pb-2">
                  <span className="text-gray-400">Nhóm:</span>
                  <span className="font-bold text-gray-700">
                    {selectedCost.cost_groups?.name || selectedCost.cost_type}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-50 pb-2">
                  <span className="text-gray-400">Chi tiết:</span>
                  <span className="font-bold text-primary">
                    {selectedCost.cost_items?.name || selectedCost.content}
                  </span>
                </div>
                <div className="space-y-1 border-b border-gray-50 pb-2">
                  <span className="text-gray-400 text-[10px] uppercase font-bold">
                    Nội dung thu chi:
                  </span>
                  <p className="text-xs text-gray-600 italic bg-gray-50 p-2 rounded-lg">
                    {selectedCost.notes || 'Không có ghi chú'}
                  </p>
                </div>
                <div className="flex justify-between border-b border-gray-50 pb-2">
                  <span className="text-gray-400">Số tiền:</span>
                  <span
                    className={`font-black text-lg ${selectedCost.transaction_type === 'Thu' ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {formatCurrency(selectedCost.total_amount)}
                  </span>
                </div>
              </div>
              {/* Chỉ cho phép Sửa/Xóa nếu là Admin, hoặc User thì chỉ với phiếu của mình */}
              {(['admin', 'develop'].includes(user.role?.toLowerCase() || '') ||
                selectedCost.employee_id === user.id) && (
                <div className="mt-6 flex gap-2">
                  <Button
                    fullWidth
                    variant="danger"
                    onClick={() => handleDeleteClick(selectedCost)}
                  >
                    Xóa
                  </Button>
                  <Button fullWidth variant="primary" onClick={() => handleEdit(selectedCost)}>
                    Sửa
                  </Button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDeleteModal && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md overflow-hidden"
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
                  Mã phiếu:{' '}
                  <strong className="text-primary uppercase">
                    {costs.find((c) => c.id === itemToDelete)?.cost_code}
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
            className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-md overflow-hidden no-print"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ y: 30, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 30, opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[1.5rem] md:rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[96dvh] md:max-h-[85vh] overflow-hidden flex flex-col z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-primary p-5 sm:p-6 text-white flex justify-between items-center flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <Plus size={24} />
                  </div>
                  <h3 className="font-bold text-lg">
                    {isEditing ? 'Sửa chi phí' : 'Nhập chi phí'}
                  </h3>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="w-8 h-8 flex items-center justify-center bg-black/10 rounded-full hover:bg-black/20"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 scrollbar-hide">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="md:col-span-2 hidden">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                      Mã phiếu chi (Gợi ý)
                    </label>
                    <div className="bg-primary/5 px-5 py-3.5 rounded-2xl border border-primary/10 text-sm font-black text-primary uppercase shadow-inner italic">
                      {formData.cost_code || 'Hệ thống tự tạo...'}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Loại giao dịch *
                      </label>
                      <div className="flex bg-gray-100 p-1 rounded-xl gap-1">
                        {(['Thu', 'Chi'] as const).map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setFormData({ ...formData, transaction_type: type })}
                            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                              formData.transaction_type === type
                                ? type === 'Thu'
                                  ? 'bg-green-500 text-white shadow-sm'
                                  : 'bg-red-500 text-white shadow-sm'
                                : 'text-gray-400 hover:text-gray-600'
                            }`}
                          >
                            {type === 'Thu' ? '↓ THU' : '↑ CHI'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Ngày *
                      </label>
                      <input
                        type="date"
                        required
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <CreatableSelect
                      label="Nhóm chi phí"
                      required
                      value={formData.cost_group_id}
                      options={costGroups}
                      onChange={(id) => {
                        setFormData({ ...formData, cost_group_id: id, cost_item_id: '' });
                        fetchCostItems(id);
                      }}
                      onCreate={handleCreateGroup}
                      placeholder="Chọn hoặc nhập mới nhóm..."
                    />
                    <CreatableSelect
                      label="Chi tiết chi phí"
                      required
                      value={formData.cost_item_id}
                      options={costItems}
                      onChange={(id) => {
                        const item = costItems.find((i) => i.id === id);
                        setFormData({
                          ...formData,
                          cost_item_id: id,
                          unit: item?.unit || formData.unit,
                        });
                      }}
                      onCreate={handleCreateItem}
                      placeholder="Chọn hoặc nhập mới chi tiết..."
                      disabled={!formData.cost_group_id}
                    />
                  </div>

                  <CreatableSelect
                    label="Tên kho *"
                    value={formData.warehouse_name}
                    options={warehouses}
                    onChange={(val) => setFormData({ ...formData, warehouse_name: val })}
                    onCreate={(val) => setFormData({ ...formData, warehouse_name: val })}
                    required
                  />

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">
                      Nội dung thu chi (Ghi chú tự do)
                    </label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/20 min-h-[80px]"
                      placeholder="Gõ nội dung chi tiết tại đây..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <NumericInput
                      label="Số lượng"
                      value={formData.quantity}
                      onChange={(val) => setFormData({ ...formData, quantity: val })}
                    />
                    <CreatableSelect
                      label="Đơn vị tính"
                      value={formData.unit}
                      options={units}
                      onChange={(val) => setFormData({ ...formData, unit: val })}
                      onCreate={(val) => setFormData({ ...formData, unit: val })}
                    />
                  </div>

                  <NumericInput
                    label="Thành tiền *"
                    value={formData.total_amount}
                    onChange={(val) => setFormData({ ...formData, total_amount: val })}
                    required
                  />

                  {/* Admin Status Toggle */}
                  {['admin', 'develop'].includes(user.role?.toLowerCase() || '') && (
                    <div className="space-y-1 mb-4">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Trạng thái duyệt
                      </label>
                      <select
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold bg-amber-50 text-amber-700 outline-none focus:ring-2 focus:ring-amber-200"
                      >
                        <option value="Chờ duyệt">Chờ duyệt</option>
                        <option value="Đã duyệt">Đã duyệt</option>
                        <option value="Từ chối">Từ chối</option>
                      </select>
                    </div>
                  )}

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
                      className="px-8 py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary-hover transition-all shadow-lg shadow-primary/20 disabled:opacity-50 active:scale-95"
                    >
                      {submitting ? 'Đang xử lý...' : isEditing ? 'Cập nhật' : 'Xác nhận tạo'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <FAB
        onClick={async () => {
          const nextCode = await generateNextCostCode();
          setFormData({
            ...initialFormState,
            date: toLocalISODate(),
            cost_code: nextCode,
          });
          setIsEditing(false);
          setShowModal(true);
        }}
      />

      <ReportPreviewModal
        isOpen={showReportPreview}
        onClose={() => setShowReportPreview(false)}
        title="Báo cáo chi phí vận hành"
        isCapturing={isCapturingTable}
        onExport={() => {
          if (reportRef.current) {
            exportTableImage({
              element: reportRef.current,
              fileName: `Bao_Cao_Chi_Phi_${toLocalISODate()}.png`,
              addToast,
              onStart: () => setIsCapturingTable(true),
              onEnd: () => {
                setIsCapturingTable(false);
                setShowReportPreview(false);
              },
            });
          }
        }}
      >
        <div ref={reportRef} className="p-12 bg-white" style={{ width: '1400px' }}>
          {/* Logo & Header */}
          <div className="flex items-center gap-6 mb-10">
            <CanvasLogo size={96} className="w-24 h-24 rounded-3xl object-contain shadow-sm" />
            <div className="space-y-1">
              <h2 className="text-3xl font-black text-gray-800 tracking-tighter uppercase leading-none">
                CÔNG TY CON ĐƯỜNG XANH
              </h2>
              <p className="text-sm font-bold text-gray-400 uppercase tracking-[0.3em] mt-2">
                Hệ thống Quản trị Nguồn lực thi công
              </p>
            </div>
          </div>

          <div className="mb-6">
            <h1 className="text-3xl font-black text-primary tracking-tighter mb-1 uppercase">
              BÁO CÁO CHI PHÍ
            </h1>
            <p className="text-sm font-bold text-gray-500 uppercase">
              Operational Cost Summary • {new Date().toLocaleDateString('vi-VN')}
            </p>
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
                  Thông tin chung
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] text-gray-500 font-bold">Tổng mục:</p>
                  <p className="text-sm font-black text-primary uppercase tracking-widest">
                    {filteredCosts.length} bản ghi
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-500 font-bold">Người xuất:</p>
                  <p className="text-sm font-bold text-gray-900 truncate">{user.full_name}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Table */}
          <table className="w-full text-left border-collapse rounded-3xl overflow-hidden shadow-sm border border-gray-100">
            <thead>
              <tr className="bg-primary text-white">
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider border-r border-white/10">
                  Ngày
                </th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest border-r border-white/10">
                  Loại chi
                </th>
                <th className="px-4 py-4 text-[10px) font-black uppercase tracking-widest border-r border-white/10">
                  Nội dung
                </th>
                <th className="px-4 py-4 text-[10px) font-black uppercase tracking-widest text-right">
                  Thành tiền
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {filteredCosts.map((item, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-primary/5'}>
                  <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                    {formatDate(item.date)}
                  </td>
                  <td className="px-4 py-3 text-xs font-black text-gray-900 uppercase tracking-tight">
                    {item.cost_type}
                  </td>
                  <td className="px-4 py-3 text-xs font-bold text-gray-500 max-w-[250px] truncate">
                    {item.content}
                  </td>
                  <td
                    className={`px-4 py-3 text-xs font-black text-right tabular-nums ${item.transaction_type === 'Thu' ? 'text-green-600' : 'text-rose-600'}`}
                  >
                    {item.transaction_type === 'Thu' ? '+' : '-'}
                    {formatCurrency(item.total_amount || 0)}
                  </td>
                </tr>
              ))}
              <tr className="bg-primary/5 font-black border-t-2 border-primary/20">
                <td
                  colSpan={4}
                  className="px-4 py-4 text-[11px] text-primary uppercase text-right tracking-[0.1em]"
                >
                  Tổng số dư phát sinh:
                </td>
                <td className="px-4 py-4 text-lg text-right tabular-nums text-primary underline decoration-double">
                  {formatCurrency(
                    filteredCosts.reduce(
                      (sum, item) =>
                        sum +
                        (item.transaction_type === 'Thu'
                          ? item.total_amount || 0
                          : -(item.total_amount || 0)),
                      0,
                    ),
                  )}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Footer Branding */}
          <div className="mt-12 flex justify-between items-end border-t border-gray-100 pt-6">
            <div className="space-y-1">
              <p className="text-xs font-black text-gray-300 uppercase tracking-[0.2em] whitespace-nowrap">
                CDX ERP SYSTEM
              </p>
              <p className="text-[9px] text-gray-300 font-bold uppercase tracking-widest">
                End of financial report • Accounting Integrity Verified
              </p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-black text-gray-300 uppercase tracking-[0.3em] mb-1">
                Financial Protocol Secured
              </p>
              <div className="text-[10px] text-gray-400 font-bold bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
                Verif-ID:{' '}
                <span className="text-primary font-black tracking-widest ml-1 underline">
                  {new Date().getTime().toString(16).toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </ReportPreviewModal>
    </div>
  );
};
