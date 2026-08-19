import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Employee } from '@/types';
import { PageBreadcrumb, ToastType, Button } from '@/components/shared';
import {
  Plus,
  Search,
  FileText,
  CheckCircle,
  Clock,
  X,
  Save,
  Trash2,
  Printer,
  Camera,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency, toLocalISODate, formatDate } from '@/utils/format';
import { generateSmartCode } from '@/utils/codeGenerator';

export const ExpenseSettlements = ({
  user,
  onBack,
  addToast,
}: {
  user: Employee;
  onBack?: () => void;
  addToast?: (message: string, type?: ToastType) => void;
}) => {
  const [settlements, setSettlements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [viewingSettlement, setViewingSettlement] = useState<any>(null);

  // Data for dropdowns (Admin only)
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [costGroups, setCostGroups] = useState<any[]>([]);

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    date: toLocalISODate(),
    previous_balance: 0,
    notes: '',
  });
  const [costs, setCosts] = useState([
    { date: toLocalISODate(), content: '', amount: 0, warehouse_id: '', cost_group_id: '' },
  ]);
  const [advances, setAdvances] = useState([{ date: toLocalISODate(), amount: 0 }]);

  const isAdmin = ['Admin', 'Develop'].includes(user.role);

  useEffect(() => {
    fetchSettlements();
    if (isAdmin) {
      fetchWarehouses();
      fetchCostGroups();
    }
  }, []);

  const fetchSettlements = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('expense_settlements')
        .select('*, employee:users!employee_id(full_name, code)')
        .order('created_at', { ascending: false });

      if (!isAdmin) {
        query = query.eq('employee_id', user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setSettlements(data || []);
    } catch (err: any) {
      addToast?.(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchWarehouses = async () => {
    const { data } = await supabase.from('warehouses').select('*').eq('status', 'Hoạt động');
    if (data) setWarehouses(data);
  };
  const fetchCostGroups = async () => {
    const { data } = await supabase.from('cost_groups').select('*').eq('status', 'Hoạt động');
    if (data) setCostGroups(data);
  };

  const handleCreate = async () => {
    try {
      // Validate
      if (!formData.title) return addToast?.('Vui lòng nhập tên phiếu', 'error');
      const validCosts = costs.filter((c) => c.content && c.amount > 0);
      const validAdvances = advances.filter((a) => a.amount > 0);
      if (validCosts.length === 0) return addToast?.('Vui lòng nhập ít nhất 1 khoản chi', 'error');

      const totalCost = validCosts.reduce((sum, c) => sum + Number(c.amount), 0);
      const totalAdvance = validAdvances.reduce((sum, a) => sum + Number(a.amount), 0);
      const finalBalance = Number(formData.previous_balance) + totalAdvance - totalCost;

      const code = generateSmartCode('QT');

      // 1. Create settlement
      const { data: settlement, error: sError } = await supabase
        .from('expense_settlements')
        .insert([
          {
            settlement_code: code,
            title: formData.title,
            employee_id: user.id,
            date: formData.date,
            previous_balance: formData.previous_balance,
            total_advance: totalAdvance,
            total_cost: totalCost,
            final_balance: finalBalance,
            status: 'Chờ duyệt',
            notes: formData.notes,
          },
        ])
        .select()
        .single();

      if (sError) throw sError;

      // 2. Insert costs
      const costsToInsert = validCosts.map((c) => ({
        cost_code: generateSmartCode('CP'),
        date: c.date,
        employee_id: user.id,
        content: c.content,
        quantity: 1,
        unit: 'Lần',
        unit_price: c.amount,
        total_amount: c.amount,
        cost_type: 'Chi phí',
        status: 'Chờ duyệt',
        settlement_id: settlement.id,
      }));
      if (costsToInsert.length > 0) {
        await supabase.from('costs').insert(costsToInsert);
      }

      // 3. Insert advances
      const advancesToInsert = validAdvances.map((a) => ({
        employee_id: user.id,
        date: a.date,
        amount: a.amount,
        type: 'Tạm ứng',
        status: 'Chờ duyệt',
        settlement_id: settlement.id,
      }));
      if (advancesToInsert.length > 0) {
        await supabase.from('advances').insert(advancesToInsert);
      }

      addToast?.('Tạo phiếu quyết toán thành công', 'success');
      setShowForm(false);
      fetchSettlements();

      // Reset form
      setFormData({ title: '', date: toLocalISODate(), previous_balance: 0, notes: '' });
      setCosts([
        { date: toLocalISODate(), content: '', amount: 0, warehouse_id: '', cost_group_id: '' },
      ]);
      setAdvances([{ date: toLocalISODate(), amount: 0 }]);
    } catch (err: any) {
      addToast?.(err.message, 'error');
    }
  };

  const handleApprove = async (settlement: any) => {
    try {
      await supabase
        .from('expense_settlements')
        .update({ status: 'Đã duyệt', reviewer_id: user.id })
        .eq('id', settlement.id);
      await supabase
        .from('costs')
        .update({ status: 'Đã duyệt' })
        .eq('settlement_id', settlement.id);
      await supabase
        .from('advances')
        .update({ status: 'Đã duyệt' })
        .eq('settlement_id', settlement.id);
      addToast?.('Đã duyệt phiếu', 'success');
      setViewingSettlement(null);
      fetchSettlements();
    } catch (err: any) {
      addToast?.(err.message, 'error');
    }
  };

  const loadSettlementDetails = async (settlement: any) => {
    try {
      const { data: sCosts } = await supabase
        .from('costs')
        .select('*')
        .eq('settlement_id', settlement.id);
      const { data: sAdvances } = await supabase
        .from('advances')
        .select('*')
        .eq('settlement_id', settlement.id);
      setViewingSettlement({ ...settlement, costs: sCosts || [], advances: sAdvances || [] });
    } catch (err: any) {
      addToast?.('Lỗi tải chi tiết: ' + err.message, 'error');
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24 h-full flex flex-col">
      <PageBreadcrumb title="Phiếu Quyết Toán Chi Phí" onBack={onBack} />

      {!showForm && !viewingSettlement && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">Danh sách phiếu</h2>
            <Button onClick={() => setShowForm(true)} icon={Plus}>
              Tạo phiếu mới
            </Button>
          </div>

          <div className="grid gap-4">
            {settlements.map((s) => (
              <div
                key={s.id}
                onClick={() => loadSettlementDetails(s)}
                className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-all"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-lg text-primary">{s.title}</h3>
                    <p className="text-sm text-gray-500">
                      {s.settlement_code} - {formatDate(s.date)}
                    </p>
                    <p className="text-sm text-gray-600 font-medium mt-1">
                      Người lập: {s.employee?.full_name}
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`px-2 py-1 rounded-md text-xs font-bold ${s.status === 'Đã duyệt' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}
                    >
                      {s.status}
                    </span>
                    <p className="font-bold text-lg mt-2">{formatCurrency(s.final_balance)}</p>
                  </div>
                </div>
              </div>
            ))}
            {settlements.length === 0 && !loading && (
              <div className="text-center p-8 text-gray-500">Chưa có phiếu quyết toán nào</div>
            )}
          </div>
        </motion.div>
      )}

      {/* CREATE FORM */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex-1 overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h2 className="text-xl font-bold text-primary">Tạo Phiếu Quyết Toán Mới</h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">
                  Tên phiếu / Hạng mục
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full mt-1 p-3 bg-gray-50 rounded-xl border-gray-200"
                  placeholder="VD: Chi phí LV - CĐ"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Ngày</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full mt-1 p-3 bg-gray-50 rounded-xl border-gray-200"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">
                  Số dư kỳ trước (Cty nợ nhập dương, Cty dư nhập âm)
                </label>
                <input
                  type="number"
                  value={formData.previous_balance}
                  onChange={(e) =>
                    setFormData({ ...formData, previous_balance: Number(e.target.value) })
                  }
                  className="w-full mt-1 p-3 bg-gray-50 rounded-xl border-gray-200"
                />
              </div>
            </div>

            {/* CHI PHÍ */}
            <div className="mb-8">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold text-lg text-gray-700">Các khoản chi</h3>
                <button
                  type="button"
                  onClick={() =>
                    setCosts([
                      ...costs,
                      {
                        date: toLocalISODate(),
                        content: '',
                        amount: 0,
                        warehouse_id: '',
                        cost_group_id: '',
                      },
                    ])
                  }
                  className="text-primary text-sm font-bold flex items-center gap-1 hover:underline"
                >
                  <Plus size={16} /> Thêm dòng
                </button>
              </div>
              <div className="space-y-2">
                {costs.map((c, i) => (
                  <div
                    key={i}
                    className="flex flex-col sm:flex-row gap-2 items-center bg-gray-50 p-2 rounded-xl"
                  >
                    <input
                      type="text"
                      value={c.content}
                      onChange={(e) => {
                        const nc = [...costs];
                        nc[i].content = e.target.value;
                        setCosts(nc);
                      }}
                      placeholder="Nội dung chi..."
                      className="flex-1 p-2 rounded-lg border-gray-200 w-full sm:w-auto"
                    />
                    <input
                      type="number"
                      value={c.amount || ''}
                      onChange={(e) => {
                        const nc = [...costs];
                        nc[i].amount = Number(e.target.value);
                        setCosts(nc);
                      }}
                      placeholder="Số tiền"
                      className="w-full sm:w-32 p-2 rounded-lg border-gray-200"
                    />
                    <button
                      onClick={() => setCosts(costs.filter((_, idx) => idx !== i))}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* TẠM ỨNG */}
            <div className="mb-8">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold text-lg text-gray-700">Các khoản ứng</h3>
                <button
                  type="button"
                  onClick={() => setAdvances([...advances, { date: toLocalISODate(), amount: 0 }])}
                  className="text-primary text-sm font-bold flex items-center gap-1 hover:underline"
                >
                  <Plus size={16} /> Thêm dòng
                </button>
              </div>
              <div className="space-y-2">
                {advances.map((a, i) => (
                  <div key={i} className="flex gap-2 items-center bg-gray-50 p-2 rounded-xl">
                    <span className="flex-1 text-sm font-medium text-gray-600 px-2">
                      Nhận tạm ứng
                    </span>
                    <input
                      type="number"
                      value={a.amount || ''}
                      onChange={(e) => {
                        const na = [...advances];
                        na[i].amount = Number(e.target.value);
                        setAdvances(na);
                      }}
                      placeholder="Số tiền"
                      className="w-32 p-2 rounded-lg border-gray-200"
                    />
                    <button
                      onClick={() => setAdvances(advances.filter((_, idx) => idx !== i))}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t pt-4 flex justify-between items-center bg-gray-50 p-4 rounded-xl mb-6">
              <span className="font-bold text-gray-600">Tổng cộng cuối kỳ (Cty còn nợ)</span>
              <span className="text-xl font-black text-primary">
                {formatCurrency(
                  Number(formData.previous_balance) +
                    advances.reduce((s, a) => s + Number(a.amount), 0) -
                    costs.reduce((s, c) => s + Number(c.amount), 0),
                )}
              </span>
            </div>

            <Button onClick={handleCreate} className="w-full py-4 text-lg">
              Lưu phiếu quyết toán
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* VIEW / APPROVE SETTLEMENT (Receipt View) */}
      <AnimatePresence>
        {viewingSettlement && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex-1 overflow-y-auto max-w-3xl mx-auto w-full"
          >
            <div className="flex justify-between items-center mb-6 border-b pb-4 print:hidden">
              <h2 className="text-xl font-bold text-gray-800">Chi tiết Quyết toán</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => window.print()}
                  className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100"
                >
                  <Printer size={20} />
                </button>
                <button
                  onClick={() => setViewingSettlement(null)}
                  className="p-2 bg-gray-100 rounded-xl hover:bg-gray-200"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* RECEIPT DESIGN */}
            <div
              id="receipt-view"
              className="font-mono text-sm space-y-6 text-gray-800 p-4 sm:p-8 bg-amber-50/30 rounded-2xl border border-amber-100/50"
            >
              <div className="text-center border-b-2 border-dashed border-gray-300 pb-4">
                <h2 className="text-2xl font-black uppercase tracking-wider">
                  {viewingSettlement.title}
                </h2>
                <p className="mt-1">Mã: {viewingSettlement.settlement_code}</p>
                <p>Ngày lập: {formatDate(viewingSettlement.date)}</p>
                <p>Người lập: {viewingSettlement.employee?.full_name}</p>
              </div>

              <div>
                <h3 className="font-bold underline mb-2 uppercase">Chi tiết chi phí:</h3>
                <table className="w-full">
                  <tbody>
                    {viewingSettlement.costs?.map((c: any, i: number) => (
                      <tr key={i} className="border-b border-gray-100 last:border-0">
                        <td className="py-2 pr-2 whitespace-nowrap">
                          {formatDate(c.date).substring(0, 5)}
                        </td>
                        <td className="py-2 px-2">{c.content}</td>
                        <td className="py-2 pl-2 text-right font-medium whitespace-nowrap">
                          {formatCurrency(c.total_amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="border-t-2 border-dashed border-gray-300 pt-4 space-y-2">
                <div className="flex justify-between font-bold text-base">
                  <span>Tổng chi phí:</span>
                  <span>{formatCurrency(viewingSettlement.total_cost)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Dư kỳ trước (Cty âm/dương):</span>
                  <span>{formatCurrency(viewingSettlement.previous_balance)}</span>
                </div>
                {viewingSettlement.advances?.map((a: any, i: number) => (
                  <div key={i} className="flex justify-between text-gray-600">
                    <span>Ứng ({formatDate(a.date).substring(0, 5)}):</span>
                    <span>{formatCurrency(a.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-black text-lg pt-2 border-t border-gray-300 text-primary">
                  <span>Cty ÂM (Còn lại):</span>
                  <span>{formatCurrency(viewingSettlement.final_balance)}</span>
                </div>
              </div>

              <div className="text-center pt-8 opacity-50 text-xs">Phiếu quyết toán nội bộ CDX</div>
            </div>

            {/* ADMIN APPROVAL SECTION */}
            {isAdmin && viewingSettlement.status === 'Chờ duyệt' && (
              <div className="mt-8 pt-6 border-t print:hidden space-y-4">
                <h3 className="font-bold text-lg text-amber-600 flex items-center gap-2">
                  <AlertCircle size={20} /> Khu vực duyệt phiếu (Admin)
                </h3>
                <p className="text-sm text-gray-600">
                  Vui lòng kiểm tra kỹ các khoản chi trước khi duyệt. Việc duyệt sẽ khoá phiếu và
                  ghi nhận chi phí vào báo cáo tổng.
                </p>
                <Button
                  onClick={() => handleApprove(viewingSettlement)}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-4"
                >
                  Duyệt & Khoá Phiếu Này
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
