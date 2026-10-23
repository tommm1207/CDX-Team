import { useState, useEffect } from 'react';
import { RefreshCw, Trash2, Banknote } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Employee } from '@/types';
import { PageBreadcrumb, ConfirmModal, ToastType } from '@/components/shared';
import { formatCurrency, formatDate } from '@/utils/format';

type TrashTable = 'advances' | 'allowances';

/** Thùng rác cho Tạm ứng & Phụ cấp (xóa mềm bằng status = 'Đã xóa'). */
export const DeletedAdvances = ({
  user,
  onBack,
  addToast,
}: {
  user: Employee;
  onBack: () => void;
  addToast: (msg: string, type?: ToastType) => void;
}) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [restoreItem, setRestoreItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);

  const isDevelop = user.role === 'Develop';

  useEffect(() => {
    fetchDeleted();
  }, []);

  const fetchDeleted = async () => {
    setLoading(true);
    try {
      const [advRes, allRes] = await Promise.all([
        supabase.from('advances').select('*, users(full_name)').eq('status', 'Đã xóa'),
        supabase.from('allowances').select('*, users(full_name)').eq('status', 'Đã xóa'),
      ]);
      if (advRes.error) throw advRes.error;
      if (allRes.error) throw allRes.error;

      const merged = [
        ...(advRes.data || []).map((a) => ({
          ...a,
          table: 'advances' as TrashTable,
          label: 'Tạm ứng',
        })),
        ...(allRes.data || []).map((a) => ({
          ...a,
          table: 'allowances' as TrashTable,
          label: 'Phụ cấp',
        })),
      ].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setItems(merged);
    } catch (err: any) {
      addToast('Lỗi tải dữ liệu: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const confirmRestore = async () => {
    if (!restoreItem) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from(restoreItem.table)
        .update({ status: 'Chờ duyệt' })
        .eq('id', restoreItem.id);
      if (error) throw error;
      addToast(`Đã khôi phục ${restoreItem.label.toLowerCase()}`, 'success');
      setRestoreItem(null);
      fetchDeleted();
    } catch (err: any) {
      addToast('Lỗi khôi phục: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmPermanentDelete = async () => {
    if (!deleteItem || !isDevelop) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from(deleteItem.table).delete().eq('id', deleteItem.id);
      if (error) throw error;
      addToast('Đã xóa vĩnh viễn', 'success');
      setDeleteItem(null);
      fetchDeleted();
    } catch (err: any) {
      addToast('Lỗi xóa: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const describe = (item: any) =>
    item
      ? `${item.label} ${formatCurrency(item.amount)} của ${item.users?.full_name || 'nhân viên'} (${formatDate(item.date)})`
      : '';

  return (
    <div className="p-4 md:p-6 space-y-6 pb-44">
      <PageBreadcrumb title="Tạm ứng & phụ cấp đã xóa" onBack={onBack} />

      {loading ? (
        <div className="py-20 flex justify-center text-gray-400">
          <RefreshCw className="animate-spin" size={28} />
        </div>
      ) : items.length === 0 ? (
        <div className="py-20 text-center space-y-3 bg-white rounded-2xl border border-dashed border-gray-200">
          <Banknote size={40} className="mx-auto text-gray-300" />
          <p className="text-sm text-gray-400 italic">Thùng rác trống</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
          {items.map((item) => (
            <div
              key={`${item.table}-${item.id}`}
              className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-primary/5 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${item.table === 'advances' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}
                  >
                    {item.label}
                  </span>
                  <span className="font-bold text-gray-800 truncate">
                    {item.users?.full_name || '—'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {formatDate(item.date)} · {item.type || ''}
                  {item.notes ? ` · ${item.notes}` : ''}
                </p>
              </div>
              <div className="font-black text-gray-800">{formatCurrency(item.amount)}</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setRestoreItem(item)}
                  className="px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
                >
                  <RefreshCw size={14} /> Khôi phục
                </button>
                {isDevelop && (
                  <button
                    onClick={() => setDeleteItem(item)}
                    className="px-3 py-2 rounded-xl bg-red-50 text-red-600 text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
                  >
                    <Trash2 size={14} /> Xóa vĩnh viễn
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        show={!!restoreItem}
        type="success"
        title="Khôi phục"
        message={`Khôi phục ${describe(restoreItem)}? Khoản này sẽ được tính lại vào bảng lương.`}
        confirmText="Khôi phục"
        onConfirm={confirmRestore}
        onCancel={() => setRestoreItem(null)}
        isLoading={submitting}
      />
      <ConfirmModal
        show={!!deleteItem}
        title="Xóa vĩnh viễn"
        message={`Xóa vĩnh viễn ${describe(deleteItem)}? Không thể hoàn tác.`}
        confirmText="Xóa vĩnh viễn"
        onConfirm={confirmPermanentDelete}
        onCancel={() => setDeleteItem(null)}
        isLoading={submitting}
      />
    </div>
  );
};
