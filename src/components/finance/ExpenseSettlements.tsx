import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Employee } from '@/types';
import { ToastType, Button, ConfirmModal, ReportImagePreviewModal } from '@/components/shared';
import {
  Plus,
  Search,
  FileText,
  CheckCircle,
  Clock,
  X,
  Trash2,
  Printer,
  Camera,
  AlertCircle,
  Calendar,
  Building2,
  Tag,
  User,
  Wallet,
  Banknote,
  Edit2,
  Lock,
  Unlock,
  Share2,
  DollarSign,
  ArrowRight,
  Receipt,
  HelpCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency, toLocalISODate, formatDate } from '@/utils/format';
import { generateSmartCode } from '@/utils/codeGenerator';
import { numberToVietnamese } from '@/utils/helpers';
import { logoBase64 } from '@/utils/logoBase64';
import { toPng } from 'html-to-image';

interface CostItemInput {
  id?: string;
  cost_code?: string;
  date: string;
  content: string;
  amount: number;
  warehouse_id?: string;
  cost_group_id?: string;
}

interface AdvanceItemInput {
  id?: string;
  date: string;
  content: string;
  amount: number;
}

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
  const [editingSettlement, setEditingSettlement] = useState<any>(null);
  const [viewingSettlement, setViewingSettlement] = useState<any>(null);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Chờ duyệt' | 'Đã duyệt' | 'Từ chối'>(
    'all',
  );
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');

  // Metadata for dropdowns
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [costGroups, setCostGroups] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);

  // Form State
  const [formTitle, setFormTitle] = useState('');
  const [formDate, setFormDate] = useState(toLocalISODate());
  const [formNotes, setFormNotes] = useState('');
  // Previous balance logic:
  // 'debt': Cty còn nợ NV (Cty ÂM) -> dương trong công thức (cty nợ cộng dồn)
  // 'surplus': NV còn giữ tiền Cty (Cty DƯ) -> âm trong công thức (khấu trừ)
  // 'zero': Không có số dư cũ
  const [prevBalanceType, setPrevBalanceType] = useState<'debt' | 'surplus' | 'zero'>('debt');
  const [prevBalanceAmount, setPrevBalanceAmount] = useState<number>(0);

  const [costs, setCosts] = useState<CostItemInput[]>([
    { date: toLocalISODate(), content: '', amount: 0 },
  ]);
  const [advances, setAdvances] = useState<AdvanceItemInput[]>([
    { date: toLocalISODate(), content: 'Nhận tạm ứng', amount: 0 },
  ]);

  // Review & Allocation State (Person B)
  const [reviewCosts, setReviewCosts] = useState<CostItemInput[]>([]);
  const [isSavingReview, setIsSavingReview] = useState(false);

  // Modals & Capture
  const [confirmDeleteModal, setConfirmDeleteModal] = useState<any>(null);
  const [confirmApproveModal, setConfirmApproveModal] = useState<any>(null);
  const [confirmUnlockModal, setConfirmUnlockModal] = useState<any>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const receiptCardRef = useRef<HTMLDivElement>(null);

  const isAdmin = ['admin', 'develop'].includes(user.role?.toLowerCase() || '');

  useEffect(() => {
    fetchSettlements();
    fetchMetadata();
  }, []);

  const fetchMetadata = async () => {
    try {
      const [wRes, cgRes, empRes] = await Promise.all([
        supabase.from('warehouses').select('id, name, code, status').order('name'),
        supabase.from('cost_groups').select('id, name, code, status').order('name'),
        supabase.from('users').select('id, full_name, code, role').order('full_name'),
      ]);
      if (wRes.data) setWarehouses(wRes.data.filter((w) => w.status !== 'Ngừng hoạt động'));
      if (cgRes.data) setCostGroups(cgRes.data.filter((cg) => cg.status !== 'Ngừng hoạt động'));
      if (empRes.data) setEmployees(empRes.data);
    } catch (err: any) {
      console.warn('Error fetching metadata:', err);
    }
  };

  const fetchSettlements = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('expense_settlements')
        .select(
          '*, employee:users!employee_id(id, full_name, code), reviewer:users!reviewer_id(id, full_name, code)',
        )
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

  const loadSettlementDetails = async (settlement: any) => {
    try {
      const [cRes, aRes] = await Promise.all([
        supabase.from('costs').select('*').eq('settlement_id', settlement.id).order('date'),
        supabase.from('advances').select('*').eq('settlement_id', settlement.id).order('date'),
      ]);
      const detailedSettlement = {
        ...settlement,
        costs: cRes.data || [],
        advances: aRes.data || [],
      };
      setViewingSettlement(detailedSettlement);
      // Initialize review costs copy for Person B
      setReviewCosts(
        (cRes.data || []).map((c: any) => ({
          id: c.id,
          cost_code: c.cost_code,
          date: c.date,
          content: c.content,
          amount: Number(c.total_amount) || 0,
          warehouse_id: c.warehouse_id || '',
          cost_group_id: c.cost_group_id || '',
        })),
      );
    } catch (err: any) {
      addToast?.('Lỗi tải chi tiết: ' + err.message, 'error');
    }
  };

  // Open Form for New
  const handleOpenNewForm = () => {
    setEditingSettlement(null);
    setFormTitle('');
    setFormDate(toLocalISODate());
    setFormNotes('');
    setPrevBalanceType('debt');
    setPrevBalanceAmount(0);
    setCosts([{ date: toLocalISODate(), content: '', amount: 0 }]);
    setAdvances([{ date: toLocalISODate(), content: 'Nhận tạm ứng', amount: 0 }]);
    setShowForm(true);
    setViewingSettlement(null);
  };

  // Open Form for Edit (only if Chờ duyệt)
  const handleOpenEditForm = (settlement: any) => {
    if (settlement.status === 'Đã duyệt' && !isAdmin) {
      addToast?.('Phiếu đã được duyệt, không thể chỉnh sửa', 'error');
      return;
    }
    setEditingSettlement(settlement);
    setFormTitle(settlement.title || '');
    setFormDate(settlement.date || toLocalISODate());
    setFormNotes(settlement.notes || '');

    const pb = Number(settlement.previous_balance) || 0;
    if (pb > 0) {
      setPrevBalanceType('debt');
      setPrevBalanceAmount(pb);
    } else if (pb < 0) {
      setPrevBalanceType('surplus');
      setPrevBalanceAmount(Math.abs(pb));
    } else {
      setPrevBalanceType('zero');
      setPrevBalanceAmount(0);
    }

    if (settlement.costs && settlement.costs.length > 0) {
      setCosts(
        settlement.costs.map((c: any) => ({
          id: c.id,
          cost_code: c.cost_code,
          date: c.date,
          content: c.content,
          amount: Number(c.total_amount) || 0,
          warehouse_id: c.warehouse_id,
          cost_group_id: c.cost_group_id,
        })),
      );
    } else {
      setCosts([{ date: settlement.date || toLocalISODate(), content: '', amount: 0 }]);
    }

    if (settlement.advances && settlement.advances.length > 0) {
      setAdvances(
        settlement.advances.map((a: any) => ({
          id: a.id,
          date: a.date,
          content: a.notes || a.reason || 'Nhận tạm ứng',
          amount: Number(a.amount) || 0,
        })),
      );
    } else {
      setAdvances([
        { date: settlement.date || toLocalISODate(), content: 'Nhận tạm ứng', amount: 0 },
      ]);
    }

    setShowForm(true);
    setViewingSettlement(null);
  };

  // Real-time calculation helpers for Form
  const calculatedTotalCost = useMemo(() => {
    return costs.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  }, [costs]);

  const calculatedTotalAdvance = useMemo(() => {
    return advances.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
  }, [advances]);

  const calculatedPreviousBalance = useMemo(() => {
    if (prevBalanceType === 'debt') return Math.abs(prevBalanceAmount);
    if (prevBalanceType === 'surplus') return -Math.abs(prevBalanceAmount);
    return 0;
  }, [prevBalanceType, prevBalanceAmount]);

  // Final balance formula: Total Costs + (Signed Previous Balance) - Total Advances
  // If > 0: Cty ÂM (Company owes staff)
  // If < 0: Cty DƯ (Staff holds company money)
  const calculatedFinalBalance = useMemo(() => {
    return calculatedTotalCost + calculatedPreviousBalance - calculatedTotalAdvance;
  }, [calculatedTotalCost, calculatedPreviousBalance, calculatedTotalAdvance]);

  // Handle Save Settlement (Create or Update)
  const handleSaveSettlement = async () => {
    try {
      if (!formTitle.trim()) {
        addToast?.('Vui lòng nhập tên phiếu / hạng mục (VD: Chi phí LV - CĐ)', 'error');
        return;
      }
      const validCosts = costs.filter((c) => c.content.trim() && Number(c.amount) > 0);
      if (validCosts.length === 0) {
        addToast?.('Vui lòng nhập ít nhất 1 khoản chi có nội dung và số tiền', 'error');
        return;
      }
      const validAdvances = advances.filter((a) => Number(a.amount) > 0);

      const totalCost = validCosts.reduce((sum, c) => sum + Number(c.amount), 0);
      const totalAdvance = validAdvances.reduce((sum, a) => sum + Number(a.amount), 0);
      const finalBalance = totalCost + calculatedPreviousBalance - totalAdvance;

      if (editingSettlement) {
        // UPDATE EXISTING
        const { error: sError } = await supabase
          .from('expense_settlements')
          .update({
            title: formTitle.trim(),
            date: formDate,
            previous_balance: calculatedPreviousBalance,
            total_cost: totalCost,
            total_advance: totalAdvance,
            final_balance: finalBalance,
            notes: formNotes.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingSettlement.id);

        if (sError) throw sError;

        // Delete old linked costs & advances, reinsert updated list
        await supabase.from('costs').delete().eq('settlement_id', editingSettlement.id);
        await supabase.from('advances').delete().eq('settlement_id', editingSettlement.id);

        // Reinsert costs
        const costsToInsert = validCosts.map((c) => ({
          cost_code: c.cost_code || generateSmartCode('CP'),
          date: c.date,
          employee_id: editingSettlement.employee_id || user.id,
          content: c.content.trim(),
          quantity: 1,
          unit: 'Lần',
          unit_price: c.amount,
          total_amount: c.amount,
          cost_type: 'Chi phí',
          status: editingSettlement.status || 'Chờ duyệt',
          settlement_id: editingSettlement.id,
          warehouse_id: c.warehouse_id || null,
          cost_group_id: c.cost_group_id || null,
        }));
        await supabase.from('costs').insert(costsToInsert);

        // Reinsert advances
        if (validAdvances.length > 0) {
          const advancesToInsert = validAdvances.map((a) => ({
            employee_id: editingSettlement.employee_id || user.id,
            date: a.date,
            amount: a.amount,
            type: 'Tạm ứng',
            notes: a.content.trim() || 'Nhận tạm ứng',
            reason: a.content.trim() || 'Nhận tạm ứng',
            status: editingSettlement.status || 'Chờ duyệt',
            settlement_id: editingSettlement.id,
          }));
          await supabase.from('advances').insert(advancesToInsert);
        }

        addToast?.('Cập nhật phiếu quyết toán thành công', 'success');
      } else {
        // CREATE NEW
        const code = generateSmartCode('QT');
        const { data: newSettlement, error: sError } = await supabase
          .from('expense_settlements')
          .insert([
            {
              settlement_code: code,
              title: formTitle.trim(),
              employee_id: user.id,
              date: formDate,
              previous_balance: calculatedPreviousBalance,
              total_cost: totalCost,
              total_advance: totalAdvance,
              final_balance: finalBalance,
              status: 'Chờ duyệt',
              notes: formNotes.trim(),
            },
          ])
          .select('*, employee:users!employee_id(id, full_name, code)')
          .single();

        if (sError) throw sError;

        // Insert costs
        const costsToInsert = validCosts.map((c) => ({
          cost_code: generateSmartCode('CP'),
          date: c.date,
          employee_id: user.id,
          content: c.content.trim(),
          quantity: 1,
          unit: 'Lần',
          unit_price: c.amount,
          total_amount: c.amount,
          cost_type: 'Chi phí',
          status: 'Chờ duyệt',
          settlement_id: newSettlement.id,
        }));
        await supabase.from('costs').insert(costsToInsert);

        // Insert advances
        if (validAdvances.length > 0) {
          const advancesToInsert = validAdvances.map((a) => ({
            employee_id: user.id,
            date: a.date,
            amount: a.amount,
            type: 'Tạm ứng',
            notes: a.content.trim() || 'Nhận tạm ứng',
            reason: a.content.trim() || 'Nhận tạm ứng',
            status: 'Chờ duyệt',
            settlement_id: newSettlement.id,
          }));
          await supabase.from('advances').insert(advancesToInsert);
        }

        addToast?.('Tạo phiếu quyết toán thành công', 'success');
      }

      setShowForm(false);
      setEditingSettlement(null);
      await fetchSettlements();
    } catch (err: any) {
      addToast?.('Lỗi lưu phiếu: ' + err.message, 'error');
    }
  };

  // Person B: Save Allocations (Kho & Nhóm chi phí)
  const handleSaveAllocations = async () => {
    if (!viewingSettlement || !isAdmin) return;
    try {
      setIsSavingReview(true);
      for (const item of reviewCosts) {
        if (!item.id) continue;
        await supabase
          .from('costs')
          .update({
            warehouse_id: item.warehouse_id || null,
            cost_group_id: item.cost_group_id || null,
            content: item.content.trim(),
            unit_price: item.amount,
            total_amount: item.amount,
          })
          .eq('id', item.id);
      }

      // Recalculate totals if amounts were modified
      const newTotalCost = reviewCosts.reduce((s, c) => s + (Number(c.amount) || 0), 0);
      const newFinalBalance =
        newTotalCost +
        Number(viewingSettlement.previous_balance || 0) -
        Number(viewingSettlement.total_advance || 0);

      await supabase
        .from('expense_settlements')
        .update({
          total_cost: newTotalCost,
          final_balance: newFinalBalance,
          updated_at: new Date().toISOString(),
        })
        .eq('id', viewingSettlement.id);

      addToast?.('Đã lưu phân bổ kho và nhóm chi phí thành công', 'success');
      await loadSettlementDetails({
        ...viewingSettlement,
        total_cost: newTotalCost,
        final_balance: newFinalBalance,
      });
      await fetchSettlements();
    } catch (err: any) {
      addToast?.('Lỗi cập nhật: ' + err.message, 'error');
    } finally {
      setIsSavingReview(false);
    }
  };

  // Person B: Approve & Lock Settlement
  const handleApproveAndLock = async (settlement: any) => {
    try {
      // 1. First save any pending allocation changes
      if (reviewCosts.length > 0) {
        for (const item of reviewCosts) {
          if (!item.id) continue;
          await supabase
            .from('costs')
            .update({
              warehouse_id: item.warehouse_id || null,
              cost_group_id: item.cost_group_id || null,
              content: item.content.trim(),
              unit_price: item.amount,
              total_amount: item.amount,
              status: 'Đã duyệt',
            })
            .eq('id', item.id);
        }
      } else {
        await supabase
          .from('costs')
          .update({ status: 'Đã duyệt' })
          .eq('settlement_id', settlement.id);
      }

      // 2. Approve advances
      await supabase
        .from('advances')
        .update({ status: 'Đã duyệt' })
        .eq('settlement_id', settlement.id);

      // 3. Approve and lock settlement
      const { error } = await supabase
        .from('expense_settlements')
        .update({
          status: 'Đã duyệt',
          reviewer_id: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', settlement.id);

      if (error) throw error;

      addToast?.('Đã duyệt và khoá phiếu quyết toán thành công', 'success');
      setConfirmApproveModal(null);
      await loadSettlementDetails({
        ...settlement,
        status: 'Đã duyệt',
        reviewer_id: user.id,
        reviewer: user,
      });
      await fetchSettlements();
    } catch (err: any) {
      addToast?.('Lỗi duyệt phiếu: ' + err.message, 'error');
    }
  };

  // Person B: Unlock Settlement
  const handleUnlockSettlement = async (settlement: any) => {
    try {
      await supabase
        .from('expense_settlements')
        .update({
          status: 'Chờ duyệt',
          reviewer_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', settlement.id);

      await supabase
        .from('costs')
        .update({ status: 'Chờ duyệt' })
        .eq('settlement_id', settlement.id);
      await supabase
        .from('advances')
        .update({ status: 'Chờ duyệt' })
        .eq('settlement_id', settlement.id);

      addToast?.('Đã mở khoá phiếu quyết toán để chỉnh sửa', 'success');
      setConfirmUnlockModal(null);
      await loadSettlementDetails({
        ...settlement,
        status: 'Chờ duyệt',
        reviewer_id: null,
        reviewer: null,
      });
      await fetchSettlements();
    } catch (err: any) {
      addToast?.('Lỗi mở khoá: ' + err.message, 'error');
    }
  };

  // Delete Settlement
  const handleDeleteSettlement = async (settlementId: string) => {
    try {
      await supabase.from('costs').delete().eq('settlement_id', settlementId);
      await supabase.from('advances').delete().eq('settlement_id', settlementId);
      const { error } = await supabase.from('expense_settlements').delete().eq('id', settlementId);
      if (error) throw error;

      addToast?.('Đã xoá phiếu quyết toán', 'success');
      setConfirmDeleteModal(null);
      setViewingSettlement(null);
      await fetchSettlements();
    } catch (err: any) {
      addToast?.('Lỗi xoá phiếu: ' + err.message, 'error');
    }
  };

  // Image Capture & Share to Zalo
  const handleCaptureReceipt = useCallback(async () => {
    if (!receiptCardRef.current || !viewingSettlement) return;
    try {
      setIsCapturing(true);
      await new Promise((r) => setTimeout(r, 150));

      const scale = 3;
      const fileName = `CDX_QuyetToan_${viewingSettlement.settlement_code || 'Phieu'}.png`;

      const dataUrl = await toPng(receiptCardRef.current, {
        cacheBust: true,
        backgroundColor: '#FFFFFF',
        quality: 0.98,
        pixelRatio: scale,
        skipFonts: false,
      });

      setIsCapturing(false);

      // Check Mobile Share (directly sends image to Zalo/chat)
      if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
        try {
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          const file = new File([blob], fileName, { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: `Phiếu Quyết Toán: ${viewingSettlement.title}`,
              text: `Phiếu quyết toán chi phí ${viewingSettlement.title} - Mã: ${viewingSettlement.settlement_code}`,
            });
            addToast?.('Đã mở bảng chia sẻ Zalo!', 'success');
            return;
          }
        } catch (shareErr) {
          console.warn('Share cancelled or not supported, opening preview:', shareErr);
        }
      }

      setPreviewImageUrl(dataUrl);
      addToast?.('Đã chụp ảnh phiếu! Bạn có thể Chép ảnh hoặc Tải ảnh gửi Zalo.', 'success');
    } catch (err: any) {
      console.error('Capture error:', err);
      setIsCapturing(false);
      addToast?.('Lỗi khi chụp ảnh phiếu: ' + err.message, 'error');
    }
  }, [receiptCardRef, viewingSettlement, addToast]);

  // Filtered settlements list
  const filteredSettlements = useMemo(() => {
    return settlements.filter((s) => {
      const matchSearch =
        !searchTerm.trim() ||
        (s.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.settlement_code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.employee?.full_name || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchStatus = statusFilter === 'all' || s.status === statusFilter;
      const matchEmployee = employeeFilter === 'all' || s.employee_id === employeeFilter;

      return matchSearch && matchStatus && matchEmployee;
    });
  }, [settlements, searchTerm, statusFilter, employeeFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = settlements.length;
    const pending = settlements.filter((s) => s.status === 'Chờ duyệt').length;
    const approved = settlements.filter((s) => s.status === 'Đã duyệt').length;
    const totalApprovedAmount = settlements
      .filter((s) => s.status === 'Đã duyệt')
      .reduce((sum, s) => sum + (Number(s.total_cost) || 0), 0);
    return { total, pending, approved, totalApprovedAmount };
  }, [settlements]);

  return (
    <div className="p-4 md:p-6 space-y-4 pb-24 max-w-7xl mx-auto">
      {/* PAGE HEADER */}
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-white border border-gray-200 text-gray-500 hover:text-primary hover:border-primary/30 transition-all shadow-sm flex-shrink-0"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-0.5">
            Tài chính
          </p>
          <h1 className="text-xl font-black text-gray-900 leading-tight">
            Phiếu Quyết Toán Chi Phí
          </h1>
        </div>
        {!showForm && !viewingSettlement && (
          <Button
            onClick={handleOpenNewForm}
            icon={Plus}
            className="py-2.5 px-4 font-bold shadow-md shadow-primary/20 whitespace-nowrap text-sm flex-shrink-0"
          >
            Tạo phiếu mới
          </Button>
        )}
      </div>

      {/* OVERVIEW STATS CARDS */}
      {!showForm && !viewingSettlement && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Tổng số phiếu
              </p>
              <p className="text-2xl font-black text-gray-900 mt-1">{stats.total}</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <FileText size={22} />
            </div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-amber-100/60 bg-gradient-to-br from-amber-50/30 to-white shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-amber-600 uppercase tracking-wider">
                Đang chờ duyệt
              </p>
              <p className="text-2xl font-black text-amber-600 mt-1">{stats.pending}</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
              <Clock size={22} />
            </div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-green-100/60 bg-gradient-to-br from-green-50/30 to-white shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-green-600 uppercase tracking-wider">
                Đã duyệt & khoá
              </p>
              <p className="text-2xl font-black text-green-700 mt-1">{stats.approved}</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-green-100 text-green-700 flex items-center justify-center">
              <CheckCircle size={22} />
            </div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Tổng tiền đã duyệt
              </p>
              <p className="text-lg md:text-xl font-black text-primary mt-1">
                {formatCurrency(stats.totalApprovedAmount)}
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Wallet size={22} />
            </div>
          </div>
        </div>
      )}

      {/* LIST VIEW */}
      {!showForm && !viewingSettlement && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col space-y-4"
        >
          {/* Actions & Filters Header */}
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div className="flex-1 flex flex-wrap gap-2 items-center">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px]">
                <Search
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Tìm theo tên phiếu, mã, người lập..."
                  className="w-full pl-9 pr-4 py-2.5 bg-gray-50/80 rounded-xl text-sm border border-gray-200 focus:outline-none focus:border-primary"
                />
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                aria-label="Lọc theo trạng thái phiếu"
                className="py-2.5 px-3 bg-gray-50/80 rounded-xl text-sm border border-gray-200 font-medium text-gray-700 focus:outline-none focus:border-primary"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="Chờ duyệt">Chờ duyệt</option>
                <option value="Đã duyệt">Đã duyệt</option>
              </select>

              {/* Employee Filter (Admin only) */}
              {isAdmin && (
                <select
                  value={employeeFilter}
                  onChange={(e) => setEmployeeFilter(e.target.value)}
                  aria-label="Lọc theo người lập phiếu"
                  className="py-2.5 px-3 bg-gray-50/80 rounded-xl text-sm border border-gray-200 font-medium text-gray-700 focus:outline-none focus:border-primary max-w-[180px]"
                >
                  <option value="all">Tất cả nhân viên</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Settlements List */}
          <div className="grid gap-3">
            {loading ? (
              <div className="p-12 text-center text-gray-400 flex flex-col items-center gap-2">
                <div className="w-7 h-7 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                <span className="text-sm">Đang tải dữ liệu quyết toán...</span>
              </div>
            ) : filteredSettlements.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-2xl border border-dashed border-gray-200 text-gray-400">
                <Receipt size={40} className="mx-auto text-gray-300 mb-2" />
                <p className="font-bold text-gray-600">Chưa có phiếu quyết toán nào</p>
                <p className="text-xs text-gray-400 mt-1">
                  Bấm "Tạo phiếu quyết toán" để nhập các khoản chi hiện trường và xuất ảnh phiếu gửi
                  Zalo.
                </p>
              </div>
            ) : (
              filteredSettlements.map((s) => {
                const finalBal = Number(s.final_balance) || 0;
                const isCtyAm = finalBal > 0;
                return (
                  <div
                    key={s.id}
                    onClick={() => loadSettlementDetails(s)}
                    className="bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-gray-100 hover:border-primary/30 hover:shadow-md transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-3.5">
                      <div
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                          s.status === 'Đã duyệt'
                            ? 'bg-green-50 text-green-700'
                            : 'bg-amber-50 text-amber-600'
                        }`}
                      >
                        <FileText size={22} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-base text-gray-900">{s.title}</h3>
                          <span className="text-xs font-mono font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md">
                            {s.settlement_code}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-gray-500">
                          <span className="flex items-center gap-1 font-medium">
                            <Calendar size={13} className="text-gray-400" />
                            {formatDate(s.date)}
                          </span>
                          <span className="flex items-center gap-1 font-medium text-gray-700">
                            <User size={13} className="text-gray-400" />
                            {s.employee?.full_name || 'Nhân viên'}
                          </span>
                          {s.reviewer && (
                            <span className="text-green-700 font-medium">
                              ✓ Duyệt bởi: {s.reviewer.full_name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-6 pt-3 md:pt-0 border-t md:border-t-0 border-gray-100">
                      <div className="text-left md:text-right">
                        <div className="flex items-center md:justify-end gap-1.5">
                          <span className="text-xs text-gray-500 font-medium">Tổng chi:</span>
                          <span className="text-xs font-bold text-gray-800">
                            {formatCurrency(s.total_cost)}
                          </span>
                        </div>
                        <div className="mt-0.5">
                          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                            {isCtyAm
                              ? 'Cty ÂM (Còn nợ):'
                              : finalBal < 0
                                ? 'Cty DƯ (NV giữ):'
                                : 'Cân bằng:'}
                          </span>
                          <p
                            className={`text-lg font-black ${
                              isCtyAm
                                ? 'text-red-600'
                                : finalBal < 0
                                  ? 'text-blue-600'
                                  : 'text-gray-700'
                            }`}
                          >
                            {formatCurrency(Math.abs(finalBal))}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-black tracking-wider uppercase ${
                            s.status === 'Đã duyệt'
                              ? 'bg-green-100 text-green-700 border border-green-200'
                              : 'bg-amber-100 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {s.status}
                        </span>
                        <span className="text-xs text-primary font-bold flex items-center gap-0.5 hover:underline">
                          Xem phiếu <ArrowRight size={13} />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      )}

      {/* CREATE / EDIT FORM */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            className="bg-white p-5 md:p-8 rounded-3xl shadow-sm border border-gray-100 flex-1 overflow-y-auto space-y-6"
          >
            {/* Header */}
            <div className="flex justify-between items-center border-b border-gray-100 pb-4">
              <div>
                <h2 className="text-xl md:text-2xl font-black text-gray-900">
                  {editingSettlement ? 'Chỉnh Sửa Phiếu Quyết Toán' : 'Tạo Phiếu Quyết Toán Mới'}
                </h2>
                <p className="text-xs md:text-sm text-gray-500 mt-0.5">
                  Nhập các khoản chi, các đợt tạm ứng và số dư kỳ trước. Hệ thống tự động tính toán
                  chính xác để xuất ảnh phiếu gửi Zalo.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingSettlement(null);
                }}
                aria-label="Đóng biểu mẫu quyết toán"
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-600 transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* General Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-1">
                  Tên phiếu / Hạng mục công trình <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Ví dụ: Chi phí LV - CĐ hoặc Quyết toán công trình Tân Chánh"
                  className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 font-semibold text-gray-800 focus:outline-none focus:border-primary focus:bg-white"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-1">
                  Ngày quyết toán
                </label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 font-medium text-gray-800 focus:outline-none focus:border-primary focus:bg-white"
                />
              </div>
            </div>

            {/* SỐ DƯ KỲ TRƯỚC MANG SANG */}
            <div className="p-4 rounded-2xl bg-amber-50/50 border border-amber-200/60 space-y-3">
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-amber-700" />
                <span className="text-xs font-black text-amber-900 uppercase tracking-wider">
                  Số dư kỳ trước mang sang (Cty ÂM hoặc Cty DƯ)
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label
                  className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${prevBalanceType === 'debt' ? 'bg-amber-100/70 border-amber-400 text-amber-900 font-bold shadow-sm' : 'bg-white border-gray-200 text-gray-700'}`}
                >
                  <input
                    type="radio"
                    name="prevType"
                    checked={prevBalanceType === 'debt'}
                    onChange={() => setPrevBalanceType('debt')}
                    className="accent-amber-600"
                  />
                  <div className="text-xs">
                    <p className="font-bold">Cty còn nợ NV (Cty ÂM)</p>
                    <p className="text-[10px] text-gray-500">Cty nợ mang sang cộng thêm</p>
                  </div>
                </label>

                <label
                  className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${prevBalanceType === 'surplus' ? 'bg-blue-100/70 border-blue-400 text-blue-900 font-bold shadow-sm' : 'bg-white border-gray-200 text-gray-700'}`}
                >
                  <input
                    type="radio"
                    name="prevType"
                    checked={prevBalanceType === 'surplus'}
                    onChange={() => setPrevBalanceType('surplus')}
                    className="accent-blue-600"
                  />
                  <div className="text-xs">
                    <p className="font-bold">NV giữ tiền Cty (Cty DƯ)</p>
                    <p className="text-[10px] text-gray-500">Tiền cty thừa cấn trừ</p>
                  </div>
                </label>

                <label
                  className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${prevBalanceType === 'zero' ? 'bg-gray-100 border-gray-400 text-gray-900 font-bold shadow-sm' : 'bg-white border-gray-200 text-gray-700'}`}
                >
                  <input
                    type="radio"
                    name="prevType"
                    checked={prevBalanceType === 'zero'}
                    onChange={() => {
                      setPrevBalanceType('zero');
                      setPrevBalanceAmount(0);
                    }}
                    className="accent-gray-600"
                  />
                  <div className="text-xs">
                    <p className="font-bold">Không có số dư cũ (0 đ)</p>
                    <p className="text-[10px] text-gray-500">Đã thanh toán hết kỳ trước</p>
                  </div>
                </label>
              </div>

              {prevBalanceType !== 'zero' && (
                <div className="pt-1">
                  <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wider block mb-1">
                    Số tiền kỳ trước mang sang (VNĐ):
                  </label>
                  <input
                    type="number"
                    value={prevBalanceAmount || ''}
                    onChange={(e) => setPrevBalanceAmount(Math.max(0, Number(e.target.value)))}
                    placeholder="Nhập số tiền..."
                    className="w-full md:w-72 p-2.5 bg-white rounded-xl border border-amber-300 font-bold text-base text-gray-900 focus:outline-none focus:border-amber-600"
                  />
                </div>
              )}
            </div>

            {/* DANH SÁCH CÁC KHOẢN CHI */}
            <div className="space-y-3">
              <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-black flex items-center justify-center">
                    I
                  </span>
                  <h3 className="font-bold text-base text-gray-900">
                    Chi tiết các khoản chi phát sinh
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setCosts([...costs, { date: formDate, content: '', amount: 0 }])}
                  className="text-xs font-bold text-primary flex items-center gap-1 bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-lg transition-all"
                >
                  <Plus size={14} /> Thêm khoản chi
                </button>
              </div>

              <div className="space-y-2">
                {costs.map((c, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-12 gap-2 items-center bg-gray-50/80 p-2.5 rounded-xl border border-gray-100 hover:border-gray-200 transition-all"
                  >
                    <div className="col-span-1 text-center text-xs font-bold text-gray-400">
                      #{i + 1}
                    </div>
                    <div className="col-span-3 sm:col-span-2">
                      <input
                        type="date"
                        value={c.date}
                        onChange={(e) => {
                          const nc = [...costs];
                          nc[i].date = e.target.value;
                          setCosts(nc);
                        }}
                        className="w-full p-2 text-xs bg-white rounded-lg border border-gray-200 focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div className="col-span-5 sm:col-span-6">
                      <input
                        type="text"
                        value={c.content}
                        onChange={(e) => {
                          const nc = [...costs];
                          nc[i].content = e.target.value;
                          setCosts(nc);
                        }}
                        placeholder="Nội dung chi (VD: Dầu LV 2 lần 5 can, Ruột bánh xe cuốc...)"
                        className="w-full p-2 text-xs font-medium bg-white rounded-lg border border-gray-200 focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        value={c.amount || ''}
                        onChange={(e) => {
                          const nc = [...costs];
                          nc[i].amount = Number(e.target.value);
                          setCosts(nc);
                        }}
                        placeholder="Số tiền"
                        className="w-full p-2 text-xs font-bold text-right bg-white rounded-lg border border-gray-200 focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div className="col-span-1 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          if (costs.length === 1) {
                            setCosts([{ date: formDate, content: '', amount: 0 }]);
                          } else {
                            setCosts(costs.filter((_, idx) => idx !== i));
                          }
                        }}
                        className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center bg-gray-100/70 p-3 rounded-xl text-sm font-bold">
                <span className="text-gray-700">Tổng cộng các khoản chi:</span>
                <span className="text-primary text-base font-black">
                  {formatCurrency(calculatedTotalCost)}
                </span>
              </div>
            </div>

            {/* DANH SÁCH CÁC KHOẢN TẠM ỨNG */}
            <div className="space-y-3 pt-2">
              <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-black flex items-center justify-center">
                    II
                  </span>
                  <h3 className="font-bold text-base text-gray-900">
                    Chi tiết tạm ứng nhận được trong kỳ
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setAdvances([
                      ...advances,
                      { date: formDate, content: 'Nhận tạm ứng', amount: 0 },
                    ])
                  }
                  className="text-xs font-bold text-blue-700 flex items-center gap-1 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-all"
                >
                  <Plus size={14} /> Thêm khoản ứng
                </button>
              </div>

              <div className="space-y-2">
                {advances.map((a, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-12 gap-2 items-center bg-gray-50/80 p-2.5 rounded-xl border border-gray-100"
                  >
                    <div className="col-span-1 text-center text-xs font-bold text-gray-400">
                      #{i + 1}
                    </div>
                    <div className="col-span-3 sm:col-span-2">
                      <input
                        type="date"
                        value={a.date}
                        onChange={(e) => {
                          const na = [...advances];
                          na[i].date = e.target.value;
                          setAdvances(na);
                        }}
                        className="w-full p-2 text-xs bg-white rounded-lg border border-gray-200 focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div className="col-span-5 sm:col-span-6">
                      <input
                        type="text"
                        value={a.content}
                        onChange={(e) => {
                          const na = [...advances];
                          na[i].content = e.target.value;
                          setAdvances(na);
                        }}
                        placeholder="Nội dung tạm ứng (VD: 01/8 Chuyển khoản, 02/8 Ứng tiền mặt...)"
                        className="w-full p-2 text-xs font-medium bg-white rounded-lg border border-gray-200 focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        value={a.amount || ''}
                        onChange={(e) => {
                          const na = [...advances];
                          na[i].amount = Number(e.target.value);
                          setAdvances(na);
                        }}
                        placeholder="Số tiền"
                        className="w-full p-2 text-xs font-bold text-right bg-white rounded-lg border border-gray-200 focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div className="col-span-1 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          if (advances.length === 1) {
                            setAdvances([{ date: formDate, content: 'Nhận tạm ứng', amount: 0 }]);
                          } else {
                            setAdvances(advances.filter((_, idx) => idx !== i));
                          }
                        }}
                        className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center bg-gray-100/70 p-3 rounded-xl text-sm font-bold">
                <span className="text-gray-700">Tổng cộng tạm ứng nhận được:</span>
                <span className="text-blue-700 text-base font-black">
                  {formatCurrency(calculatedTotalAdvance)}
                </span>
              </div>
            </div>

            {/* REAL-TIME SUMMARY BOX (Sao y trang 2 sổ tay) */}
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 text-white p-5 rounded-2xl shadow-lg space-y-3">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400 border-b border-gray-700 pb-2">
                BẢNG TỔNG HỢP QUYẾT TOÁN TỰ ĐỘNG
              </p>

              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-300">Tổng chi phí phát sinh:</span>
                  <span className="font-bold">{formatCurrency(calculatedTotalCost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">
                    Số dư kỳ trước (
                    {prevBalanceType === 'debt'
                      ? 'Cty ÂM mang sang'
                      : prevBalanceType === 'surplus'
                        ? 'Cty DƯ mang sang'
                        : 'Không có'}
                    ):
                  </span>
                  <span
                    className={`font-bold ${prevBalanceType === 'debt' ? 'text-amber-400' : 'text-blue-400'}`}
                  >
                    {prevBalanceType === 'debt' ? '+ ' : prevBalanceType === 'surplus' ? '- ' : ''}
                    {formatCurrency(Math.abs(calculatedPreviousBalance))}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Tổng tiền tạm ứng đã nhận:</span>
                  <span className="font-bold text-red-400">
                    - {formatCurrency(calculatedTotalAdvance)}
                  </span>
                </div>
              </div>

              <div className="border-t border-gray-700 pt-3 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                    KẾT QUẢ QUYẾT TOÁN:
                  </span>
                  <p className="text-xs text-gray-300 italic mt-0.5">
                    {calculatedFinalBalance > 0
                      ? '=> Công ty cần thanh toán thêm cho nhân viên'
                      : calculatedFinalBalance < 0
                        ? '=> Nhân viên cần hoàn trả lại quỹ Công ty'
                        : '=> Đã thanh toán cân bằng đủ 0 đ'}
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`text-2xl md:text-3xl font-black ${
                      calculatedFinalBalance > 0
                        ? 'text-amber-400'
                        : calculatedFinalBalance < 0
                          ? 'text-blue-400'
                          : 'text-white'
                    }`}
                  >
                    {calculatedFinalBalance > 0
                      ? 'Cty ÂM '
                      : calculatedFinalBalance < 0
                        ? 'Cty DƯ '
                        : ''}
                    {formatCurrency(Math.abs(calculatedFinalBalance))}
                  </span>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-1">
                Ghi chú thêm (nếu có)
              </label>
              <textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={2}
                placeholder="Ví dụ: Đã gửi kèm hoá đơn mua ván cốp pha, dầu mua tại cây xăng..."
                className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary focus:bg-white"
              />
            </div>

            {/* Bottom Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingSettlement(null);
                }}
                className="px-6 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-all"
              >
                Hủy bỏ
              </button>
              <Button
                onClick={handleSaveSettlement}
                className="flex-1 py-3.5 font-bold text-base shadow-lg shadow-primary/20"
              >
                {editingSettlement ? 'Cập nhật phiếu quyết toán' : 'Lưu và tạo phiếu quyết toán'}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* VIEW RECEIPT & REVIEW (PERSON A & B) */}
      <AnimatePresence>
        {viewingSettlement && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            className="flex-1 flex flex-col space-y-6"
          >
            {/* Top Action Bar */}
            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-wrap items-center justify-between gap-3 print:hidden">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewingSettlement(null)}
                  className="p-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-700 font-bold transition-all text-sm flex items-center gap-1"
                >
                  <ArrowRight size={16} className="rotate-180" /> Quay lại
                </button>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase ${
                    viewingSettlement.status === 'Đã duyệt'
                      ? 'bg-green-100 text-green-800 border border-green-200'
                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                  }`}
                >
                  {viewingSettlement.status}
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Chụp ảnh phiếu gửi Zalo */}
                <button
                  onClick={handleCaptureReceipt}
                  disabled={isCapturing}
                  title="Chụp ảnh phiếu để gửi vào nhóm Zalo"
                  className="flex items-center gap-2 bg-primary text-white font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-primary-hover active:scale-95 shadow-md shadow-primary/25 transition-all"
                >
                  {isCapturing ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Camera size={18} />
                  )}
                  <span>Chụp ảnh gửi Zalo</span>
                </button>

                {/* Print button */}
                <button
                  onClick={() => window.print()}
                  title="In phiếu"
                  className="p-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-all"
                >
                  <Printer size={18} />
                </button>

                {/* Edit button (if Chờ duyệt or Admin) */}
                {(viewingSettlement.status === 'Chờ duyệt' || isAdmin) && (
                  <button
                    onClick={() => handleOpenEditForm(viewingSettlement)}
                    title="Chỉnh sửa phiếu"
                    className="p-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl transition-all"
                  >
                    <Edit2 size={18} />
                  </button>
                )}

                {/* Delete button (if Chờ duyệt) */}
                {viewingSettlement.status === 'Chờ duyệt' && (
                  <button
                    onClick={() => setConfirmDeleteModal(viewingSettlement)}
                    title="Xoá phiếu này"
                    className="p-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition-all"
                  >
                    <Trash2 size={18} />
                  </button>
                )}

                <button
                  onClick={() => setViewingSettlement(null)}
                  className="p-2.5 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-xl transition-all"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* RECEIPT CARD TO CAPTURE */}
            <div className="flex justify-center">
              <div
                ref={receiptCardRef}
                id="receipt-card"
                className="bg-white p-6 sm:p-10 rounded-2xl shadow-md border border-gray-200 max-w-3xl w-full text-gray-900 font-sans"
                style={{ backgroundColor: '#FFFFFF' }}
              >
                {/* Branded Header */}
                <div className="flex items-center justify-between border-b-2 border-primary/20 pb-4 mb-6">
                  <div className="flex items-center gap-3.5">
                    <img
                      src={logoBase64}
                      alt="CDX Logo"
                      className="w-14 h-14 object-contain rounded-xl shadow-sm border border-gray-100"
                    />
                    <div>
                      <h1 className="text-sm sm:text-base font-black text-gray-900 uppercase tracking-tight leading-tight">
                        CÔNG TY TNHH CƠ ĐIỆN XÂY DỰNG CDX
                      </h1>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                        CỘNG TÁC ĐỂ VƯƠN XA • HỆ THỐNG QUẢN TRỊ NGUỒN LỰC
                      </p>
                      <p className="text-[10px] text-gray-500 font-semibold mt-0.5">
                        Quyết toán chi phí công trình / hiện trường
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                      Mã phiếu
                    </span>
                    <span className="text-sm sm:text-base font-mono font-black text-primary">
                      {viewingSettlement.settlement_code}
                    </span>
                  </div>
                </div>

                {/* Title Banner */}
                <div className="text-center mb-6">
                  <h2 className="text-xl sm:text-2xl font-black text-gray-900 uppercase tracking-wide">
                    PHIẾU QUYẾT TOÁN CHI PHÍ
                  </h2>
                  <p className="text-sm sm:text-base font-bold text-primary mt-1">
                    Hạng mục: {viewingSettlement.title}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Ngày lập: {formatDate(viewingSettlement.date)} • Người lập:{' '}
                    <span className="font-bold text-gray-800">
                      {viewingSettlement.employee?.full_name || 'Nhân viên'}
                    </span>
                  </p>
                </div>

                {/* BẢNG I: CHI TIẾT CHI PHÍ */}
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-5 h-5 rounded-full bg-primary text-white text-[11px] font-black flex items-center justify-center">
                      I
                    </span>
                    <h3 className="font-bold text-xs uppercase tracking-wider text-gray-800">
                      CHI TIẾT CÁC KHOẢN CHI PHÁT SINH
                    </h3>
                  </div>

                  <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
                    <thead className="bg-gray-100/80 text-gray-700 font-bold border-b border-gray-200">
                      <tr>
                        <th className="py-2.5 px-2 text-center w-10">STT</th>
                        <th className="py-2.5 px-2 text-left w-20">Ngày</th>
                        <th className="py-2.5 px-3 text-left">Nội dung chi phí</th>
                        <th className="py-2.5 px-3 text-left hidden sm:table-cell">
                          Phân bổ kho / mục
                        </th>
                        <th className="py-2.5 px-3 text-right w-28">Số tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {viewingSettlement.costs?.map((c: any, idx: number) => {
                        const whName = warehouses.find((w) => w.id === c.warehouse_id)?.name;
                        const cgName = costGroups.find((cg) => cg.id === c.cost_group_id)?.name;
                        return (
                          <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                            <td className="py-2 px-2 text-center text-gray-400 font-medium">
                              {idx + 1}
                            </td>
                            <td className="py-2 px-2 text-gray-600 font-medium whitespace-nowrap">
                              {formatDate(c.date).substring(0, 5)}
                            </td>
                            <td className="py-2 px-3 font-semibold text-gray-900">{c.content}</td>
                            <td className="py-2 px-3 text-gray-500 text-[11px] hidden sm:table-cell">
                              {whName || cgName ? (
                                <span className="inline-block bg-gray-100 px-2 py-0.5 rounded text-gray-700 font-medium">
                                  {[whName, cgName].filter(Boolean).join(' • ')}
                                </span>
                              ) : (
                                <span className="text-gray-400 italic">Chưa phân loại</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right font-black text-gray-900 whitespace-nowrap">
                              {formatCurrency(c.total_amount)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-gray-100 font-black border-t-2 border-gray-300">
                      <tr>
                        <td
                          colSpan={3}
                          className="py-2.5 px-3 text-left text-gray-800 uppercase tracking-wide"
                        >
                          TỔNG CHI PHÍ PHÁT SINH (1):
                        </td>
                        <td className="hidden sm:table-cell"></td>
                        <td className="py-2.5 px-3 text-right text-primary text-sm whitespace-nowrap">
                          {formatCurrency(viewingSettlement.total_cost)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* BẢNG II: CHI TIẾT TẠM ỨNG */}
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-black flex items-center justify-center">
                      II
                    </span>
                    <h3 className="font-bold text-xs uppercase tracking-wider text-gray-800">
                      CHI TIẾT TẠM ỨNG ĐÃ NHẬN TRONG KỲ
                    </h3>
                  </div>

                  <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
                    <thead className="bg-gray-100/80 text-gray-700 font-bold border-b border-gray-200">
                      <tr>
                        <th className="py-2.5 px-2 text-center w-10">STT</th>
                        <th className="py-2.5 px-2 text-left w-20">Ngày</th>
                        <th className="py-2.5 px-3 text-left">Nội dung nhận tạm ứng</th>
                        <th className="py-2.5 px-3 text-right w-28">Số tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {viewingSettlement.advances && viewingSettlement.advances.length > 0 ? (
                        viewingSettlement.advances.map((a: any, idx: number) => (
                          <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                            <td className="py-2 px-2 text-center text-gray-400 font-medium">
                              {idx + 1}
                            </td>
                            <td className="py-2 px-2 text-gray-600 font-medium whitespace-nowrap">
                              {formatDate(a.date).substring(0, 5)}
                            </td>
                            <td className="py-2 px-3 font-semibold text-gray-900">
                              {a.notes || a.reason || 'Nhận tạm ứng'}
                            </td>
                            <td className="py-2 px-3 text-right font-black text-blue-700 whitespace-nowrap">
                              {formatCurrency(a.amount)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="py-3 text-center text-gray-400 italic">
                            Không có tạm ứng trong kỳ này
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot className="bg-gray-100 font-black border-t-2 border-gray-300">
                      <tr>
                        <td
                          colSpan={3}
                          className="py-2.5 px-3 text-left text-gray-800 uppercase tracking-wide"
                        >
                          TỔNG TIỀN TẠM ỨNG (2):
                        </td>
                        <td className="py-2.5 px-3 text-right text-blue-700 text-sm whitespace-nowrap">
                          {formatCurrency(viewingSettlement.total_advance)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* BẢNG III: BẢNG TỔNG HỢP QUYẾT TOÁN (SAO Y CUỐN SỔ TAY) */}
                <div className="border-2 border-gray-800 rounded-2xl p-4 sm:p-5 bg-gray-50/70 mb-6 space-y-3">
                  <div className="flex justify-between items-center border-b border-gray-300 pb-2">
                    <span className="font-black text-xs uppercase tracking-wider text-gray-700">
                      TỔNG HỢP VÀ KẾT QUẢ QUYẾT TOÁN
                    </span>
                    <span className="text-[11px] font-bold text-gray-500 italic">
                      Công thức: Chi phí + Số dư cũ - Tạm ứng
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs sm:text-sm">
                    <div className="flex justify-between">
                      <span className="font-semibold text-gray-700">Tổng chi phí phát sinh:</span>
                      <span className="font-bold text-gray-900">
                        {formatCurrency(viewingSettlement.total_cost)}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="font-semibold text-gray-700">
                        Số dư kỳ trước mang sang (
                        {Number(viewingSettlement.previous_balance) > 0
                          ? 'Cty ÂM'
                          : Number(viewingSettlement.previous_balance) < 0
                            ? 'Cty DƯ'
                            : '0 đ'}
                        ):
                      </span>
                      <span
                        className={`font-bold ${
                          Number(viewingSettlement.previous_balance) > 0
                            ? 'text-amber-700'
                            : Number(viewingSettlement.previous_balance) < 0
                              ? 'text-blue-700'
                              : 'text-gray-700'
                        }`}
                      >
                        {Number(viewingSettlement.previous_balance) > 0
                          ? '+ '
                          : Number(viewingSettlement.previous_balance) < 0
                            ? '- '
                            : ''}
                        {formatCurrency(Math.abs(Number(viewingSettlement.previous_balance) || 0))}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="font-semibold text-gray-700">
                        Tổng tiền tạm ứng trong kỳ:
                      </span>
                      <span className="font-bold text-red-600">
                        - {formatCurrency(viewingSettlement.total_advance)}
                      </span>
                    </div>
                  </div>

                  <div className="border-t-2 border-gray-800 pt-3 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                    <div>
                      <span className="text-xs font-black uppercase tracking-wider text-gray-900">
                        KẾT QUẢ QUYẾT TOÁN CUỐI KỲ:
                      </span>
                      <p className="text-xs font-semibold text-gray-600 italic mt-0.5">
                        {Number(viewingSettlement.final_balance) > 0
                          ? '=> Công ty thanh toán thêm cho nhân viên'
                          : Number(viewingSettlement.final_balance) < 0
                            ? '=> Nhân viên hoàn trả lại quỹ Công ty'
                            : '=> Đã thanh toán cân bằng đủ 0 đ'}
                      </p>
                    </div>

                    <div className="text-right">
                      <span
                        className={`text-xl sm:text-2xl font-black ${
                          Number(viewingSettlement.final_balance) > 0
                            ? 'text-red-600'
                            : Number(viewingSettlement.final_balance) < 0
                              ? 'text-blue-700'
                              : 'text-gray-900'
                        }`}
                      >
                        {Number(viewingSettlement.final_balance) > 0
                          ? 'Cty ÂM '
                          : Number(viewingSettlement.final_balance) < 0
                            ? 'Cty DƯ '
                            : ''}
                        {formatCurrency(Math.abs(Number(viewingSettlement.final_balance) || 0))}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-dashed border-gray-300 text-xs text-gray-600">
                    <span className="font-bold text-gray-500 uppercase tracking-tighter">
                      Bằng chữ:{' '}
                    </span>
                    <span className="font-bold italic text-gray-800">
                      {numberToVietnamese(Math.abs(Number(viewingSettlement.final_balance) || 0))}
                    </span>
                  </div>
                </div>

                {/* Signatures & Seal */}
                <div className="grid grid-cols-2 gap-8 pt-4 border-t border-gray-200 text-center text-xs">
                  <div>
                    <p className="font-bold text-gray-700 uppercase tracking-wider">
                      NGƯỜI LẬP PHIẾU
                    </p>
                    <p className="text-[10px] text-gray-400 italic mb-14">(Ký và ghi rõ họ tên)</p>
                    <p className="font-black text-gray-900 text-sm">
                      {viewingSettlement.employee?.full_name || 'Nhân viên'}
                    </p>
                  </div>

                  <div className="relative">
                    <p className="font-bold text-gray-700 uppercase tracking-wider">
                      KẾ TOÁN / NGƯỜI DUYỆT
                    </p>
                    <p className="text-[10px] text-gray-400 italic mb-14">
                      (Ký, họ tên và đóng dấu)
                    </p>
                    <p className="font-black text-gray-900 text-sm">
                      {viewingSettlement.reviewer?.full_name ||
                        (viewingSettlement.status === 'Đã duyệt'
                          ? 'Ban Giám Đốc CDX'
                          : 'Chưa duyệt')}
                    </p>

                    {/* RED APPROVAL STAMP */}
                    {viewingSettlement.status === 'Đã duyệt' && (
                      <div className="absolute top-6 left-1/2 -translate-x-1/2 w-28 h-28 border-4 border-red-600 rounded-full flex flex-col items-center justify-center text-red-600 font-black opacity-85 rotate-[-12deg] pointer-events-none select-none">
                        <span className="text-[8px] uppercase tracking-wider">CDX ERP</span>
                        <span className="text-sm font-black uppercase tracking-tight my-0.5 border-y-2 border-red-600 px-1">
                          ĐÃ DUYỆT
                        </span>
                        <span className="text-[7px] uppercase font-bold">
                          {formatDate(viewingSettlement.updated_at || viewingSettlement.date)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-center pt-6 text-[10px] text-gray-400 uppercase tracking-widest border-t border-gray-100 mt-6">
                  Phiếu Quyết Toán Nội Bộ CDX ERP • Xác thực tính toán tự động
                </div>
              </div>
            </div>

            {/* PERSON B: REVIEWER / ADMIN ALLOCATION PANEL */}
            {isAdmin && (
              <div className="bg-white p-5 md:p-6 rounded-2xl border border-amber-200/80 shadow-sm space-y-4 print:hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
                  <div>
                    <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
                      <Lock size={18} className="text-amber-600" />
                      QUYỀN DUYỆT & PHÂN BỔ CHI PHÍ (KẾ TOÁN / BAN GIÁM ĐỐC)
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Gán từng món chi vào đúng Kho/Công trình và Nhóm chi phí, chỉnh sửa nội
                      dung/số tiền nếu cần rồi duyệt và khoá phiếu.
                    </p>
                  </div>
                  {viewingSettlement.status === 'Đã duyệt' && (
                    <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-lg self-start">
                      ✓ Đã khoá phiếu an toàn
                    </span>
                  )}
                </div>

                {/* Table for line item allocation */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600 font-bold border-b border-gray-200">
                        <th className="py-2 px-2 text-left w-14">Ngày</th>
                        <th className="py-2 px-2 text-left">Nội dung chi</th>
                        <th className="py-2 px-2 text-right w-28">Số tiền</th>
                        <th className="py-2 px-2 text-left w-44">Kho / Công trình</th>
                        <th className="py-2 px-2 text-left w-48">Nhóm chi phí</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {reviewCosts.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/60">
                          <td className="py-2 px-2 text-gray-500 whitespace-nowrap">
                            {formatDate(item.date).substring(0, 5)}
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="text"
                              value={item.content}
                              disabled={viewingSettlement.status === 'Đã duyệt'}
                              onChange={(e) => {
                                const nc = [...reviewCosts];
                                nc[idx].content = e.target.value;
                                setReviewCosts(nc);
                              }}
                              className="w-full p-1.5 bg-gray-50 rounded border border-gray-200 font-medium focus:outline-none focus:border-primary disabled:bg-gray-100 disabled:text-gray-600"
                            />
                          </td>
                          <td className="py-2 px-2 text-right">
                            <input
                              type="number"
                              value={item.amount}
                              disabled={viewingSettlement.status === 'Đã duyệt'}
                              onChange={(e) => {
                                const nc = [...reviewCosts];
                                nc[idx].amount = Number(e.target.value);
                                setReviewCosts(nc);
                              }}
                              className="w-full p-1.5 bg-gray-50 rounded border border-gray-200 font-bold text-right focus:outline-none focus:border-primary disabled:bg-gray-100 disabled:text-gray-600"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <select
                              value={item.warehouse_id || ''}
                              disabled={viewingSettlement.status === 'Đã duyệt'}
                              onChange={(e) => {
                                const nc = [...reviewCosts];
                                nc[idx].warehouse_id = e.target.value;
                                setReviewCosts(nc);
                              }}
                              className="w-full p-1.5 bg-white rounded border border-gray-200 text-xs font-medium focus:outline-none focus:border-primary disabled:bg-gray-100 disabled:text-gray-600"
                            >
                              <option value="">-- Chọn Kho/CT --</option>
                              {warehouses.map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-2">
                            <select
                              value={item.cost_group_id || ''}
                              disabled={viewingSettlement.status === 'Đã duyệt'}
                              onChange={(e) => {
                                const nc = [...reviewCosts];
                                nc[idx].cost_group_id = e.target.value;
                                setReviewCosts(nc);
                              }}
                              className="w-full p-1.5 bg-white rounded border border-gray-200 text-xs font-medium focus:outline-none focus:border-primary disabled:bg-gray-100 disabled:text-gray-600"
                            >
                              <option value="">-- Chọn Nhóm CP --</option>
                              {costGroups.map((cg) => (
                                <option key={cg.id} value={cg.id}>
                                  {cg.name}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Person B Action Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-100">
                  {viewingSettlement.status === 'Chờ duyệt' ? (
                    <>
                      <button
                        type="button"
                        onClick={handleSaveAllocations}
                        disabled={isSavingReview}
                        className="px-4 py-2.5 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all"
                      >
                        {isSavingReview ? 'Đang lưu...' : 'Lưu cập nhật phân bổ'}
                      </button>

                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => setConfirmApproveModal(viewingSettlement)}
                          className="bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-6 rounded-xl text-sm shadow-md shadow-green-600/20"
                        >
                          Duyệt & Khoá Phiếu Này
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between w-full">
                      <p className="text-xs text-gray-500">
                        Phiếu đã duyệt và khoá an toàn. Chỉ mở khoá khi cần hiệu chỉnh lại số liệu.
                      </p>
                      <button
                        type="button"
                        onClick={() => setConfirmUnlockModal(viewingSettlement)}
                        className="px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all"
                      >
                        <Unlock size={14} /> Mở khoá phiếu để chỉnh sửa
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* CONFIRM DELETE MODAL */}
      <ConfirmModal
        show={!!confirmDeleteModal}
        title="Xác nhận xoá phiếu quyết toán"
        message={`Bạn có chắc chắn muốn xoá phiếu "${confirmDeleteModal?.title}" (${confirmDeleteModal?.settlement_code})? Thao tác này sẽ xoá các khoản chi và tạm ứng liên kết.`}
        type="danger"
        confirmText="Xoá vĩnh viễn"
        cancelText="Hủy bỏ"
        onConfirm={() => handleDeleteSettlement(confirmDeleteModal.id)}
        onCancel={() => setConfirmDeleteModal(null)}
      />

      {/* CONFIRM APPROVE MODAL */}
      <ConfirmModal
        show={!!confirmApproveModal}
        title="Xác nhận duyệt & khoá phiếu quyết toán"
        message={`Bạn đang duyệt phiếu "${confirmApproveModal?.title}" (${confirmApproveModal?.settlement_code}) với tổng chi phí ${formatCurrency(confirmApproveModal?.total_cost)}. Sau khi duyệt, phiếu sẽ được khoá và ghi nhận vào sổ kế toán.`}
        type="success"
        confirmText="Đồng ý duyệt & khoá"
        cancelText="Để mình xem lại"
        onConfirm={() => handleApproveAndLock(confirmApproveModal)}
        onCancel={() => setConfirmApproveModal(null)}
      />

      {/* CONFIRM UNLOCK MODAL */}
      <ConfirmModal
        show={!!confirmUnlockModal}
        title="Xác nhận mở khoá phiếu quyết toán"
        message={`Bạn có chắc muốn mở khoá phiếu "${confirmUnlockModal?.title}" (${confirmUnlockModal?.settlement_code})? Phiếu sẽ chuyển về trạng thái 'Chờ duyệt' để cho phép chỉnh sửa.`}
        type="warning"
        confirmText="Mở khoá phiếu"
        cancelText="Đóng"
        onConfirm={() => handleUnlockSettlement(confirmUnlockModal)}
        onCancel={() => setConfirmUnlockModal(null)}
      />

      {/* IMAGE PREVIEW MODAL */}
      {previewImageUrl && (
        <ReportImagePreviewModal
          imageDataUrl={previewImageUrl}
          fileName={`CDX_QuyetToan_${viewingSettlement?.settlement_code || 'Phieu'}.png`}
          onClose={() => setPreviewImageUrl(null)}
        />
      )}
    </div>
  );
};
