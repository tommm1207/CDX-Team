import { useState, useEffect } from 'react';
import {
  FileText,
  RefreshCw,
  Trash2,
  Square,
  CheckSquare,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Search,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '@/lib/supabase';
import { Employee } from '@/types';
import { PageBreadcrumb } from '@/components/shared';
import { ConfirmModal } from '@/components/shared';
import { ToastType } from '@/components/shared';
import { Button } from '@/components/shared';
import { SortButton, SortOption } from '@/components/shared';
import { checkUsage, UsageResult } from '@/utils/dataIntegrity';
import { getAvailableStock } from '@/utils/inventory';

export const DeletedSlips = ({
  user,
  onBack,
  addToast,
}: {
  user: Employee;
  onBack: () => void;
  addToast: (msg: string, type?: ToastType) => void;
}) => {
  const [slips, setSlips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>(
    (localStorage.getItem(`sort_pref_trashSlips_${user.id}`) as SortOption) || 'newest',
  );
  const [showFilter, setShowFilter] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showActionModal, setShowActionModal] = useState(false);
  const [showUsageDetails, setShowUsageDetails] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showEmptyTrashModal, setShowEmptyTrashModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [usageInfo, setUsageInfo] = useState<UsageResult>({
    inUse: false,
    tables: [],
    details: [],
  });

  const [selectedItem, setSelectedItem] = useState<{
    id: string;
    table: string;
    code?: string;
    type?: string;
  } | null>(null);

  useEffect(() => {
    fetchDeletedSlips();
  }, []);

  const fetchDeletedSlips = async () => {
    setLoading(true);
    try {
      const { data: inData } = await supabase
        .from('stock_in')
        .select('*, warehouses(name), materials(name)')
        .eq('status', 'Đã xóa');
      const { data: outData } = await supabase
        .from('stock_out')
        .select('*, warehouses(name), materials(name)')
        .eq('status', 'Đã xóa');
      const { data: transData } = await supabase
        .from('transfers')
        .select(
          '*, from_wh:warehouses!from_warehouse_id(name), to_wh:warehouses!to_warehouse_id(name), materials(name)',
        )
        .eq('status', 'Đã xóa');

      const allSlips = [
        ...(inData || []).map((s) => ({
          ...s,
          type: 'Nhập kho',
          table: 'stock_in',
          code: s.import_code || s.slip_code,
          wh_name: (s as any).warehouses?.name,
        })),
        ...(outData || []).map((s) => ({
          ...s,
          type: 'Xuất kho',
          table: 'stock_out',
          code: s.export_code || s.slip_code,
          wh_name: (s as any).warehouses?.name,
        })),
        ...(transData || []).map((s) => ({
          ...s,
          type: 'Chuyển kho',
          table: 'transfers',
          code: s.transfer_code || s.slip_code,
          wh_name: `${(s as any).from_wh?.name} -> ${(s as any).to_wh?.name}`,
        })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setSlips(allSlips);
      setSelectedIds(new Set());
    } catch (err: any) {
      addToast('Lỗi tải dữ liệu: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === slips.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(slips.map((s) => `${s.table}-${s.id}`)));
  };

  const handleRowClick = (item: any) => {
    setSelectedItem({ id: item.id, table: item.table, code: item.code, type: item.type });
    setShowActionModal(true);
  };

  const handleDeleteClick = async (item: any) => {
    setSelectedItem({ id: item.id, table: item.table, code: item.code, type: item.type });
    setShowActionModal(false);
    setShowDeleteModal(true);
    setShowUsageDetails(false);
    setUsageInfo({ inUse: false, tables: [], details: [] });
    try {
      // Slips don't usually have dependencies, but we check anyway
      const usage = await checkUsage('material', item.id);
      setUsageInfo(usage);
    } catch (e) {
      console.error(e);
    }
  };

  const isFromSplitMerge = (item: any) => {
    const code = item?.code || item?.slip_code || '';
    return code.startsWith('XA') || code.startsWith('GOP');
  };

  const confirmRestore = async () => {
    if (!selectedItem) return;
    setSubmitting(true);
    try {
      const table = selectedItem.table;
      const id = selectedItem.id;
      const slip = slips.find((s) => s.id === id && s.table === table);

      // Chặn khôi phục phiếu thuộc rã/gộp — phải khôi phục từ phiếu gốc
      if (slip && isFromSplitMerge(slip)) {
        throw new Error(
          `Phiếu này được tạo từ phiếu Rã/Gộp. Vui lòng khôi phục từ mục Rã / Gộp vật tư trong Thùng rác.`,
        );
      }

      // Logic check stock status before restoring export/transfer
      if (table === 'stock_out' || table === 'transfers') {
        const wh_id = table === 'stock_out' ? slip.warehouse_id : slip.from_warehouse_id;
        const stockAtDate = await getAvailableStock(slip.material_id, wh_id, slip.date);

        if (stockAtDate < slip.quantity) {
          throw new Error(
            `Không thể khôi phục. Tồn kho tại ngày ${slip.date} không đủ (${stockAtDate} < ${slip.quantity})`,
          );
        }
      }

      const { error } = await supabase.from(table).update({ status: 'Chờ duyệt' }).eq('id', id);
      if (error) throw error;
      addToast(`Đã khôi phục phiếu ${selectedItem.code} thành công!`, 'success');
      fetchDeletedSlips();
      setShowRestoreModal(false);
      setSelectedItem(null);
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!selectedItem) return;
    setSubmitting(true);
    try {
      const slip = slips.find((s) => s.id === selectedItem.id && s.table === selectedItem.table);

      // Chặn xóa vĩnh viễn phiếu thuộc rã/gộp — phải xóa từ phiếu gốc
      if (slip && isFromSplitMerge(slip)) {
        throw new Error(
          `Phiếu này được tạo từ phiếu Rã/Gộp. Vui lòng xóa vĩnh viễn từ mục Rã / Gộp vật tư trong Thùng rác.`,
        );
      }

      const { error } = await supabase.from(selectedItem.table).delete().eq('id', selectedItem.id);
      if (error) throw error;
      addToast(`Đã xóa vĩnh viễn phiếu ${selectedItem.code} thành công!`, 'success');
      fetchDeletedSlips();
      setShowDeleteModal(false);
      setSelectedItem(null);
    } catch (err: any) {
      addToast('Lỗi: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const bulkDelete = async () => {
    setSubmitting(true);
    try {
      let successCount = 0;
      let failCount = 0;
      for (const sid of selectedIds) {
        const [table, ...rest] = sid.split('-');
        const id = rest.join('-');
        const slip = slips.find((s) => s.id === id && s.table === table);
        if (slip && isFromSplitMerge(slip)) {
          failCount++;
          continue;
        }
        const { error } = await supabase.from(table).delete().eq('id', id);
        if (!error) successCount++;
        else failCount++;
      }
      addToast(
        `Đã xóa vĩnh viễn ${successCount} phiếu.${failCount > 0 ? ` Bỏ qua ${failCount} phiếu từ Rã/Gộp.` : ''}`,
        successCount > 0 ? 'success' : 'error',
      );
      setSelectedIds(new Set());
      fetchDeletedSlips();
      setShowBulkDeleteModal(false);
    } catch (err: any) {
      addToast('Lỗi xóa hàng loạt: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const emptyTrash = async () => {
    setSubmitting(true);
    try {
      let successCount = 0;
      let failCount = 0;
      for (const slip of slips) {
        if (isFromSplitMerge(slip)) {
          failCount++;
          continue;
        }
        const { error } = await supabase.from(slip.table).delete().eq('id', slip.id);
        if (!error) successCount++;
        else failCount++;
      }
      addToast(
        `Đã xóa vĩnh viễn ${successCount} phiếu.${failCount > 0 ? ` Bỏ qua ${failCount} phiếu từ Rã/Gộp.` : ''}`,
        successCount > 0 ? 'success' : 'error',
      );
      setSelectedIds(new Set());
      fetchDeletedSlips();
      setShowEmptyTrashModal(false);
    } catch (err: any) {
      addToast('Lỗi dọn thùng rác: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredSlips = slips
    .filter((s) => {
      if (!searchTerm) return true;
      const search = searchTerm.toLowerCase();
      return (
        (s.code || '').toLowerCase().includes(search) ||
        (s.materials?.name || '').toLowerCase().includes(search) ||
        (s.wh_name || '').toLowerCase().includes(search) ||
        (s.type || '').toLowerCase().includes(search)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'newest')
        return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
      if (sortBy === 'code') return (a.code || '').localeCompare(b.code || '');
      return 0;
    });

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24 overflow-x-hidden">
      <div className="flex items-center justify-between gap-2 mb-4">
        <PageBreadcrumb title="Phiếu kho đã xóa" onBack={onBack} />
        <div className="flex items-center gap-2">
          <SortButton
            currentSort={sortBy}
            onSortChange={(val) => {
              setSortBy(val);
              localStorage.setItem(`sort_pref_trashSlips_${user.id}`, val);
            }}
            options={[
              { value: 'newest', label: 'Mới nhất' },
              { value: 'code', label: 'Mã chứng từ' },
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

      {filteredSlips.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {selectedIds.size > 0 ? (
            <>
              <button
                onClick={() => setShowBulkDeleteModal(true)}
                className="whitespace-nowrap px-4 py-2 bg-red-600 text-white rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg shadow-red-200"
              >
                <Trash2 size={14} /> Xóa vĩnh viễn ({selectedIds.size})
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowEmptyTrashModal(true)}
              className="whitespace-nowrap px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl font-bold text-xs flex items-center gap-2"
            >
              <Trash2 size={14} /> Xóa tất cả
            </button>
          )}
        </div>
      )}

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
                placeholder="Mã phiếu, vật tư, kho..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden overflow-x-auto min-h-[300px]">
        <table className="w-full text-left border-collapse whitespace-nowrap">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-4 py-3 w-10">
                <button
                  onClick={toggleSelectAll}
                  className="p-1 text-gray-400 hover:text-primary transition-colors"
                >
                  {selectedIds.size === filteredSlips.length && filteredSlips.length > 0 ? (
                    <CheckSquare size={20} className="text-primary" />
                  ) : (
                    <Square size={20} />
                  )}
                </button>
              </th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Loại/Mã
              </th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Vật tư & Kho
              </th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400 text-right">
                Thao tác
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-gray-400 italic">
                  Đang tải...
                </td>
              </tr>
            ) : filteredSlips.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-gray-400 italic">
                  {searchTerm ? 'Không tìm thấy kết quả' : 'Thùng rác trống'}
                </td>
              </tr>
            ) : (
              filteredSlips.map((item) => {
                const isSelected = selectedIds.has(`${item.table}-${item.id}`);
                return (
                  <tr
                    key={`${item.table}-${item.id}`}
                    className={`hover:bg-gray-50/50 transition-colors cursor-pointer group ${isSelected ? 'bg-primary/5' : ''}`}
                    onClick={() => handleRowClick(item)}
                  >
                    <td
                      className="px-4 py-3"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(`${item.table}-${item.id}`);
                      }}
                    >
                      <div className="text-gray-400 hover:text-primary transition-colors">
                        {isSelected ? (
                          <CheckSquare size={20} className="text-primary" />
                        ) : (
                          <Square size={20} />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          item.type === 'Nhập kho'
                            ? 'bg-blue-100 text-blue-600'
                            : item.type === 'Xuất kho'
                              ? 'bg-orange-100 text-orange-600'
                              : 'bg-indigo-100 text-indigo-600'
                        }`}
                      >
                        {item.type}
                      </span>
                      <div className="text-[10px] text-gray-600 font-mono font-bold mt-1">
                        {item.code}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-bold text-gray-800">{item.materials?.name}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{item.wh_name}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedItem({
                              id: item.id,
                              table: item.table,
                              code: item.code,
                              type: item.type,
                            });
                            setShowRestoreModal(true);
                          }}
                          className="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors"
                        >
                          <RefreshCw size={14} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClick(item);
                          }}
                          className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {showActionModal && selectedItem && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm"
            onClick={() => setShowActionModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden p-8 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold text-gray-900 mb-2 uppercase tracking-wide">
                Tùy chọn thao tác
              </h3>
              <p className="text-sm text-gray-500 mb-8 font-medium">
                Đối tượng: <span className="font-black text-primary">{selectedItem.code}</span>
              </p>
              <div className="flex flex-col gap-4">
                <Button
                  fullWidth
                  variant="success"
                  onClick={() => setShowRestoreModal(true)}
                  icon={RefreshCw}
                >
                  KHÔI PHỤC PHIẾU
                </Button>
                <Button
                  fullWidth
                  variant="danger"
                  onClick={() => setShowDeleteModal(true)}
                  icon={Trash2}
                >
                  XÓA VĨNH VIỄN
                </Button>
                <Button
                  fullWidth
                  variant="outline"
                  onClick={() => setShowActionModal(false)}
                  className="mt-2"
                >
                  HUỶ BỎ
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDeleteModal && selectedItem && (
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
                  Mã phiếu: <strong className="text-primary">{selectedItem.code}</strong>
                </p>
                <p>
                  Loại: <strong className="text-primary">{selectedItem.type}</strong>
                </p>
                {usageInfo.inUse ? (
                  <div className="mt-2 pt-2 border-t border-gray-200">
                    <button
                      onClick={() => setShowUsageDetails(!showUsageDetails)}
                      className="flex items-center justify-between w-full text-[10px] text-red-500 font-black uppercase tracking-tighter hover:text-red-600"
                    >
                      <div className="flex items-center gap-1">
                        <AlertCircle size={12} /> Có dữ liệu liên quan
                      </div>
                      {showUsageDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    {showUsageDetails && (
                      <div className="mt-2 space-y-1 max-h-32 overflow-y-auto pr-1">
                        {usageInfo.details.map((d, idx) => (
                          <div
                            key={idx}
                            className="flex justify-between text-[10px] text-gray-500 bg-white p-1.5 rounded-lg border border-gray-100"
                          >
                            <span>{d.label}</span>
                            <span className="font-bold text-red-500">{d.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[10px] text-green-600 font-bold flex items-center gap-1 uppercase tracking-widest ">
                    <CheckCircle size={12} /> Sẵn sàng để xóa
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <Button fullWidth variant="outline" onClick={() => setShowDeleteModal(false)}>
                    Hủy bỏ
                  </Button>
                  <Button
                    fullWidth
                    variant="danger"
                    onClick={confirmDelete}
                    disabled={usageInfo.inUse && user.role?.toLowerCase() !== 'develop'}
                    isLoading={submitting}
                  >
                    {usageInfo.inUse && user.role?.toLowerCase() === 'develop'
                      ? 'XÓA CƯỞNG BỨC'
                      : 'Xác nhận xóa'}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmModal
        show={showRestoreModal}
        title="Xác nhận khôi phục"
        message={`Bạn có chắc muốn khôi phục phiếu ${selectedItem?.code} trở lại danh sách chính?`}
        onConfirm={confirmRestore}
        onCancel={() => setShowRestoreModal(false)}
        type="success"
        isLoading={submitting}
      />

      <ConfirmModal
        show={showBulkDeleteModal}
        title="Xóa vĩnh viễn các phiếu đã chọn"
        message={`Xóa vĩnh viễn ${selectedIds.size} phiếu đã chọn? Phiếu từ Rã/Gộp sẽ bị bỏ qua. Hành động này không thể hoàn tác.`}
        onConfirm={bulkDelete}
        onCancel={() => setShowBulkDeleteModal(false)}
        confirmText="Xóa vĩnh viễn"
        cancelText="Hủy"
        isLoading={submitting}
      />

      <ConfirmModal
        show={showEmptyTrashModal}
        title="Dọn sạch thùng rác"
        message={`Xóa vĩnh viễn tất cả ${slips.length} phiếu trong thùng rác? Phiếu từ Rã/Gộp sẽ bị bỏ qua. Hành động này không thể hoàn tác.`}
        onConfirm={emptyTrash}
        onCancel={() => setShowEmptyTrashModal(false)}
        confirmText="Xóa tất cả"
        cancelText="Hủy"
        isLoading={submitting}
      />
    </div>
  );
};
