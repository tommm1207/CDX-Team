import { useState, useEffect } from 'react';
import { FileText, Plus, Search, MoreVertical, Trash2, Edit3, FileOutput, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '@/lib/supabase';
import { Button, ConfirmModal } from '@/components/shared';
import { exportLeaseVehicleContract, exportSteelSheetContract } from '@/utils/contractExport';
import { LeaseVehicleForm } from './LeaseVehicleForm';
import { LeaseSteelSheetForm } from './LeaseSteelSheetForm';

/** Chuyển bản ghi contracts trong DB về đúng dạng formData mà form và hàm xuất Word dùng. */
const toFormData = (contract: any) => {
  const { items, total: _total, date, ...content } = contract.content || {};
  return {
    contractCode: contract.contract_code,
    date: date || contract.created_at?.slice(0, 10),
    partyA: contract.party_a_info || {},
    partyB: contract.party_b_info || {},
    content,
    ...(contract.type === 'THUE_THEP_TAM' ? { items: items || [] } : {}),
  };
};

export const ContractModule = ({ user, addToast }: { user: any; addToast: any }) => {
  const [view, setView] = useState<'list' | 'create_thue_xe' | 'create_thue_thep_tam'>('list');
  const [editingContract, setEditingContract] = useState<any>(null);
  const [deletingContract, setDeletingContract] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    fetchContracts();
  }, []);

  const fetchContracts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('contracts')
        .select('*')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setContracts(data || []);
    } catch (error: any) {
      addToast('Lỗi tải danh sách: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const backToList = () => {
    setView('list');
    setEditingContract(null);
    fetchContracts();
  };

  const handleEdit = (contract: any) => {
    setEditingContract(contract);
    setView(contract.type === 'THUE_XE' ? 'create_thue_xe' : 'create_thue_thep_tam');
  };

  const handleExport = async (contract: any) => {
    setActionLoading(true);
    try {
      const data = toFormData(contract);
      if (contract.type === 'THUE_XE') await exportLeaseVehicleContract(data);
      else await exportSteelSheetContract(data);
      addToast('Đã tạo file Word thành công!', 'success');
    } catch (error: any) {
      addToast('Lỗi xuất file: ' + error.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Xóa mềm: danh sách chỉ hiện hợp đồng có is_deleted = false
  const confirmDelete = async () => {
    if (!deletingContract) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('contracts')
        .update({ is_deleted: true })
        .eq('id', deletingContract.id);
      if (error) throw error;
      addToast(`Đã xóa hợp đồng ${deletingContract.contract_code}`, 'success');
      setDeletingContract(null);
      fetchContracts();
    } catch (error: any) {
      addToast('Lỗi xóa hợp đồng: ' + error.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  if (view === 'create_thue_xe') {
    return (
      <LeaseVehicleForm
        key={editingContract?.id || 'new'}
        onBack={backToList}
        addToast={addToast}
        contractId={editingContract?.id}
        initialData={editingContract ? toFormData(editingContract) : undefined}
      />
    );
  }

  if (view === 'create_thue_thep_tam') {
    return (
      <LeaseSteelSheetForm
        key={editingContract?.id || 'new'}
        onBack={backToList}
        addToast={addToast}
        contractId={editingContract?.id}
        initialData={editingContract ? toFormData(editingContract) : undefined}
      />
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24 relative">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-800 uppercase tracking-tight flex items-center gap-3">
            <FileText className="text-primary" size={28} />
            Quản lý Hợp đồng
          </h1>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
            Tổng số: {contracts.length} hợp đồng
          </p>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto">
          <Button variant="blue" size="sm" onClick={() => setView('create_thue_xe')}>
            <Plus size={18} className="mr-1.5" /> Thuê xe
          </Button>
          <Button variant="orange" size="sm" onClick={() => setView('create_thue_thep_tam')}>
            <Plus size={18} className="mr-1.5" /> Thuê thép
          </Button>

          <button
            onClick={() => setShowSearch(!showSearch)}
            className={`p-2.5 rounded-xl transition-all ${showSearch ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white border border-gray-100 text-gray-500 hover:bg-gray-50'}`}
          >
            {showSearch ? <X size={20} /> : <Search size={20} />}
          </button>
        </div>
      </div>

      {/* Dropdown Search Bar */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ height: 0, opacity: 0, y: -10 }}
            animate={{ height: 'auto', opacity: 1, y: 0 }}
            exit={{ height: 0, opacity: 0, y: -10 }}
            className="overflow-hidden bg-white rounded-3xl border border-gray-100 shadow-xl shadow-gray-200/50"
          >
            <div className="p-4 flex items-center gap-3">
              <Search className="text-gray-400" size={18} />
              <input
                autoFocus
                type="text"
                placeholder="Tìm mã hợp đồng, tên đối tác..."
                className="flex-1 bg-transparent border-none outline-none font-bold text-gray-700 placeholder:text-gray-300"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="p-1 hover:bg-gray-50 rounded-lg"
                >
                  <X size={14} className="text-gray-400" />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Contract List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          Array(6)
            .fill(0)
            .map((_, i) => (
              <div
                key={i}
                className="bg-white p-6 rounded-3xl border border-gray-100 animate-pulse space-y-4"
              >
                <div className="h-4 bg-gray-100 rounded w-1/2"></div>
                <div className="h-10 bg-gray-50 rounded"></div>
                <div className="h-4 bg-gray-100 rounded w-3/4"></div>
              </div>
            ))
        ) : contracts.length === 0 ? (
          <div className="col-span-full py-20 text-center space-y-4">
            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto">
              <FileText size={40} className="text-gray-300" />
            </div>
            <p className="text-gray-400 italic font-medium uppercase text-[10px] tracking-widest">
              Chưa có hợp đồng nào được tạo
            </p>
          </div>
        ) : (
          contracts
            .filter(
              (c) =>
                c.contract_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                c.party_b_info?.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                c.party_a_info?.companyName?.toLowerCase().includes(searchTerm.toLowerCase()),
            )
            .map((contract) => (
              <motion.div
                layout
                key={contract.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all group relative overflow-hidden"
              >
                <div className="flex items-start justify-between">
                  <div
                    className={`p-2 rounded-xl ${contract.type === 'THUE_XE' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}
                  >
                    <FileText size={20} />
                  </div>
                  <button className="p-1 text-gray-400 hover:text-gray-600">
                    <MoreVertical size={18} />
                  </button>
                </div>

                <div className="mt-4 space-y-1">
                  <h3 className="font-black text-gray-800 uppercase text-sm truncate">
                    {contract.party_b_info?.companyName || 'Đối tác chưa xác định'}
                  </h3>
                  <p className="text-[10px] font-bold text-primary uppercase tracking-widest">
                    {contract.contract_code}
                  </p>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-gray-400 uppercase">Loại HĐ</span>
                    <span className="text-xs font-black text-gray-600">
                      {contract.type === 'THUE_XE' ? 'THUÊ XE CUỐC' : 'THUÊ THÉP TẤM'}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                      Trạng thái
                    </span>
                    <span className="text-[10px] font-black px-2 py-0.5 bg-green-50 text-green-600 rounded-full uppercase">
                      {contract.status}
                    </span>
                  </div>
                </div>

                {/* Action Overlay on Hover */}
                <div className="absolute inset-0 bg-primary/95 flex items-center justify-center gap-4 translate-y-full group-hover:translate-y-0 transition-transform duration-300 z-20">
                  <button
                    title="Sửa"
                    onClick={() => handleEdit(contract)}
                    className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-primary shadow-lg active:scale-95 transition-all"
                  >
                    <Edit3 size={20} />
                  </button>
                  <button
                    title="Xuất file Word"
                    disabled={actionLoading}
                    onClick={() => handleExport(contract)}
                    className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-blue-600 shadow-lg active:scale-95 transition-all disabled:opacity-50"
                  >
                    <FileOutput size={20} />
                  </button>
                  <button
                    title="Xóa"
                    onClick={() => setDeletingContract(contract)}
                    className="w-12 h-12 bg-red-500 rounded-2xl flex items-center justify-center text-white shadow-lg active:scale-95 transition-all"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </motion.div>
            ))
        )}
      </div>
      <ConfirmModal
        show={!!deletingContract}
        title="Xóa hợp đồng"
        message={`Xóa hợp đồng ${deletingContract?.contract_code || ''}? Hợp đồng sẽ bị ẩn khỏi danh sách.`}
        confirmText="Xóa"
        onConfirm={confirmDelete}
        onCancel={() => setDeletingContract(null)}
        isLoading={actionLoading}
      />
    </div>
  );
};
