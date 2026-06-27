import { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  Wallet,
  X,
  Image as ImageIcon,
  Camera,
  Search,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { toPng } from 'html-to-image';
import { logoBase64 } from '../../utils/logoBase64';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '@/lib/supabase';
import { Employee } from '@/types';
import { PageBreadcrumb } from '@/components/shared';
import { ToastType } from '@/components/shared';
import { formatCurrency } from '@/utils/format';
import { MonthYearPicker } from '@/components/shared';
import { Button } from '@/components/shared';
import { SortOption } from '@/components/shared';
import { slugify, numberToVietnamese } from '@/utils/helpers';
import { ReportImagePreviewModal } from '@/components/shared';
import {
  PageToolbar,
  FilterPanel,
  HideZeroToggle,
  FilterSearchInput,
  DateRangeFilter,
} from '@/components/shared';

export const MonthlySalary = ({
  user,
  onBack,
  addToast,
  setHideBottomNav,
}: {
  user: Employee;
  onBack?: () => void;
  addToast?: (message: string, type?: ToastType) => void;
  setHideBottomNav?: (hide: boolean) => void;
}) => {
  const [salaries, setSalaries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [isCapturing, setIsCapturing] = useState(false);
  const [hideZero, setHideZero] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const [isMainCustomRange, setIsMainCustomRange] = useState(false);
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Refs
  const mainTableRef = useRef<HTMLDivElement>(null);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${parseInt(d)}/${parseInt(m)}/${y}`;
  };

  // Helper: lấy ngày theo local timezone (tránh bug toISOString() lùi 1 ngày ở UTC+7)
  const toLocalISODate = (date: Date): string => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  useEffect(() => {
    fetchSalaries();
  }, [selectedMonth, selectedYear, isMainCustomRange, filterStartDate, filterEndDate]);

  const fetchSalaries = async () => {
    setLoading(true);
    try {
      const isAdmin = ['admin', 'develop'].includes(user.role?.toLowerCase() || '');

      let query = supabase.from('users').select('*');

      if (!isAdmin) {
        query = query.eq('id', user.id);
      } else {
        query = query
          .neq('status', 'Nghỉ việc')
          .neq('status', 'Đã xóa')
          .neq('role', 'Develop')
          .eq('has_salary', true);
      }

      const { data: employees } = await query.order('code');
      if (!employees) return;

      const { data: settings } = await supabase.from('salary_settings').select('*');

      let queryStart = '';
      let queryEnd = '';

      if (isMainCustomRange && filterStartDate && filterEndDate) {
        queryStart = filterStartDate;
        queryEnd = filterEndDate;
      } else {
        queryStart = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
        queryEnd = toLocalISODate(new Date(selectedYear, selectedMonth, 0));
      }

      let attQuery = supabase
        .from('attendance')
        .select('*')
        .gte('date', queryStart)
        .lte('date', queryEnd);
      let advQuery = supabase
        .from('advances')
        .select('*')
        .gte('date', queryStart)
        .lte('date', queryEnd);
      let allQuery = supabase
        .from('allowances')
        .select('*')
        .gte('date', queryStart)
        .lte('date', queryEnd);

      if (!isAdmin) {
        attQuery = attQuery.eq('employee_id', user.id);
        advQuery = advQuery.eq('employee_id', user.id);
        allQuery = allQuery.eq('employee_id', user.id);
      }

      const { data: att } = await attQuery;
      const { data: adv } = await advQuery;
      const { data: all } = await allQuery;

      // Xác định danh sách các tháng dương lịch trong khoảng
      const allMonthKeys: string[] = [];
      {
        const d = new Date(queryStart);
        const endD = new Date(queryEnd);
        while (d <= endD) {
          allMonthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
          d.setMonth(d.getMonth() + 1);
          d.setDate(1);
        }
      }

      // Helper: tìm salary_settings phù hợp cho 1 nhân viên tại 1 ngày cụ thể
      const findSettingsForDate = (empId: string, date: string) => {
        const empSettings = settings
          ?.filter((s) => s.employee_id === empId)
          .sort(
            (a, b) => new Date(b.valid_from || 0).getTime() - new Date(a.valid_from || 0).getTime(),
          );
        return (
          empSettings?.find((s) => {
            const start = (s.valid_from || '1900-01-01').slice(0, 10);
            const end = (s.valid_to || '2099-12-31').slice(0, 10);
            return date >= start && date <= end;
          }) ??
          empSettings?.[0] ?? {
            base_salary: 0,
            daily_rate: 0,
            monthly_ot_coeff: 1.0,
            insurance_deduction: 0,
          }
        );
      };

      const calculated = employees.map((emp) => {
        const empAtt = att?.filter((a) => a.employee_id === emp.id) || [];
        const empAdv = adv?.filter((a) => a.employee_id === emp.id) || [];
        const empAll = all?.filter((a) => a.employee_id === emp.id) || [];

        // Tạm ứng và phụ cấp tính tổng cả khoảng (không phụ thuộc settings)
        const totalAdv = empAdv.reduce((sum, a) => sum + Number(a.amount || 0), 0);
        const totalAll = empAll.reduce((sum, a) => sum + Number(a.amount || 0), 0);

        let earnedSalary = 0;
        const monthOTSalary = 0;
        let dayOTSalary = 0;
        let totalDays = 0;
        let totalOT = 0;
        let lastDailyRate = 0;
        let lastMonthlyCoeff = 1.0;
        let lastHourlyRate = 0;

        // Tính lương từng ngày chấm công theo settings áp dụng đúng ngày đó
        empAtt.forEach((a) => {
          if (!a.date) return;
          const daySet = findSettingsForDate(emp.id, a.date);
          const dRate = Number(daySet.daily_rate || 0);
          const hRate = dRate / 8;
          const mCoeff = Number(daySet.monthly_ot_coeff || 1.0);
          const mDays = Number(a.hours_worked || 0) / 8;
          const mOT = Number(a.overtime_hours || 0);

          earnedSalary += mDays * dRate;
          dayOTSalary += mOT * hRate * mCoeff; // giờ TC = (lương ngày ÷ 8) × hệ số
          totalDays += mDays;
          totalOT += mOT;
          lastDailyRate = dRate;
          lastMonthlyCoeff = mCoeff;
          lastHourlyRate = hRate;
        });

        // Bảo hiểm: tính 1 lần/tháng, theo settings áp dụng ngày đầu tháng
        let insuranceDeduction = 0;
        allMonthKeys.forEach((mk) => {
          const hasAtt = empAtt.some((a) => a.date?.startsWith(mk));
          if (!hasAtt) return;
          const monthSet = findSettingsForDate(emp.id, `${mk}-01`);
          insuranceDeduction += Number(monthSet.insurance_deduction || 0);
        });

        const netSalary =
          earnedSalary + monthOTSalary + dayOTSalary + totalAll - totalAdv - insuranceDeduction;

        return {
          ...emp,
          totalDays,
          totalOT,
          earnedSalary,
          monthOTSalary,
          dayOTSalary,
          totalAdv,
          totalAll,
          insuranceDeduction,
          netSalary,
          dailyRate: lastDailyRate,
          monthlyCoeff: lastMonthlyCoeff,
          hourlyRate: lastHourlyRate,
          attendanceDetails: empAtt,
          advancesDetails: empAdv,
          allowancesDetails: empAll,
        };
      });

      setSalaries(calculated);
    } catch (err: any) {
      console.error('Error calculating salaries:', err);
      if (addToast) addToast('Lỗi tính toán lương: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const [selectedSalary, setSelectedSalary] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [isCustomRange, setIsCustomRange] = useState(false);
  const [customRange, setCustomRange] = useState({
    start: '',
    end: '',
  });
  const billRef = useRef<HTMLDivElement>(null);

  const [billNote, setBillNote] = useState('');

  // Track whether user explicitly changed dates in modal
  const [userChangedDates, setUserChangedDates] = useState(false);

  useEffect(() => {
    if (showDetailModal && selectedSalary && isCustomRange && userChangedDates) {
      recalculateIndividual();
      setUserChangedDates(false);
    }
  }, [customRange.start, customRange.end, userChangedDates]);

  const recalculateIndividual = async () => {
    if (!selectedSalary || !customRange.start || !customRange.end) return;

    try {
      const { data: settings } = await supabase.from('salary_settings').select('*');
      const { data: att } = await supabase
        .from('attendance')
        .select('*')
        .eq('employee_id', selectedSalary.id)
        .gte('date', customRange.start)
        .lte('date', customRange.end);
      const { data: adv } = await supabase
        .from('advances')
        .select('*')
        .eq('employee_id', selectedSalary.id)
        .gte('date', customRange.start)
        .lte('date', customRange.end);
      const { data: all } = await supabase
        .from('allowances')
        .select('*')
        .eq('employee_id', selectedSalary.id)
        .gte('date', customRange.start)
        .lte('date', customRange.end);

      const attArr = att || [];
      const totalAdv = (adv || []).reduce((sum, a) => sum + Number(a.amount || 0), 0);
      const totalAll = (all || []).reduce((sum, a) => sum + Number(a.amount || 0), 0);

      // Xác định danh sách tháng trong khoảng
      const indMonthKeys: string[] = [];
      {
        const d = new Date(customRange.start);
        const endD = new Date(customRange.end);
        while (d <= endD) {
          indMonthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
          d.setMonth(d.getMonth() + 1);
          d.setDate(1);
        }
      }

      // Helper tìm settings cho ngày cụ thể
      const findSetForDate = (date: string) => {
        const empSettings = settings
          ?.filter((s) => s.employee_id === selectedSalary.id)
          .sort(
            (a, b) => new Date(b.valid_from || 0).getTime() - new Date(a.valid_from || 0).getTime(),
          );
        return (
          empSettings?.find((s) => {
            const start = (s.valid_from || '1900-01-01').slice(0, 10);
            const end = (s.valid_to || '2099-12-31').slice(0, 10);
            return date >= start && date <= end;
          }) ??
          empSettings?.[0] ?? {
            base_salary: 0,
            daily_rate: 0,
            monthly_ot_coeff: 1.0,
            insurance_deduction: 0,
          }
        );
      };

      let earnedSalary = 0;
      const monthOTSalary = 0;
      let dayOTSalary = 0;
      let totalDays = 0;
      let totalOT = 0;
      let lastDailyRate = 0;
      let lastMonthlyCoeff = 1.0;
      let lastHourlyRate = 0;

      // Tính lương từng ngày chấm công theo settings áp dụng đúng ngày đó
      attArr.forEach((a) => {
        if (!a.date) return;
        const daySet = findSetForDate(a.date);
        const dRate = Number(daySet.daily_rate || 0);
        const hRate = dRate / 8;
        const mCoeff = Number(daySet.monthly_ot_coeff || 1.0);
        const mDays = Number(a.hours_worked || 0) / 8;
        const mOT = Number(a.overtime_hours || 0);

        earnedSalary += mDays * dRate;
        dayOTSalary += mOT * hRate * mCoeff; // giờ TC = (lương ngày ÷ 8) × hệ số
        totalDays += mDays;
        totalOT += mOT;
        lastDailyRate = dRate;
        lastMonthlyCoeff = mCoeff;
        lastHourlyRate = hRate;
      });

      // Bảo hiểm: tính 1 lần/tháng, theo settings áp dụng ngày đầu tháng
      let insuranceDeduction = 0;
      indMonthKeys.forEach((mk) => {
        const hasAtt = attArr.some((a) => a.date?.startsWith(mk));
        if (!hasAtt) return;
        const monthSet = findSetForDate(`${mk}-01`);
        insuranceDeduction += Number(monthSet.insurance_deduction || 0);
      });

      const netSalary =
        earnedSalary + monthOTSalary + dayOTSalary + totalAll - totalAdv - insuranceDeduction;

      setSelectedSalary({
        ...selectedSalary,
        totalDays,
        totalOT,
        earnedSalary,
        monthOTSalary,
        dayOTSalary,
        totalAdv,
        totalAll,
        insuranceDeduction,
        netSalary,
        dailyRate: lastDailyRate,
        monthlyCoeff: lastMonthlyCoeff,
        hourlyRate: lastHourlyRate,
      });
    } catch (err) {
      console.error('Error recalculating:', err);
    }
  };

  const handleSaveImage = async () => {
    if (billRef.current === null) return;

    try {
      setIsCapturing(true);
      // Wait for Safari to stabilize
      await new Promise((resolve) => setTimeout(resolve, 900));

      const fileName = `Phieu_Luong_${selectedSalary.full_name}_T${selectedMonth}_${selectedYear}.png`;
      const scale = 4; // High resolution for premium quality

      // Step 1: Capture the bill base
      const rawDataUrl = await toPng(billRef.current, {
        cacheBust: true,
        backgroundColor: '#FCFCFC',
        quality: 1,
        pixelRatio: scale,
        skipFonts: false,
        style: {
          transform: 'scale(1)',
          webkitTransform: 'scale(1)',
        },
      });

      // Step 2: Manually draw logo on top of the canvas
      const finalDataUrl = await new Promise<string>((resolve) => {
        const billImg = new Image();
        billImg.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = billImg.width;
          canvas.height = billImg.height;
          const ctx = canvas.getContext('2d')!;

          // Draw the captured bill
          ctx.drawImage(billImg, 0, 0);

          // Draw logo manually with high quality
          const logoImg = new Image();
          logoImg.onload = () => {
            const logoX = Math.round(20 * scale);
            const logoY = Math.round(20 * scale);
            const logoSize = Math.round(36 * scale);
            const radius = Math.round(8 * scale);

            ctx.save();
            // Enable high quality smoothing
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            ctx.beginPath();
            if (ctx.roundRect) {
              ctx.roundRect(logoX, logoY, logoSize, logoSize, radius);
            } else {
              ctx.moveTo(logoX + radius, logoY);
              ctx.arcTo(logoX + logoSize, logoY, logoX + logoSize, logoY + logoSize, radius);
              ctx.arcTo(logoX + logoSize, logoY + logoSize, logoX, logoY + logoSize, radius);
              ctx.arcTo(logoX, logoY + logoSize, logoX, logoY, radius);
              ctx.arcTo(logoX, logoY, logoX + logoSize, logoY, radius);
            }
            ctx.closePath();
            ctx.clip();

            ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
            ctx.restore();
            resolve(canvas.toDataURL('image/png', 1.0));
          };
          logoImg.onerror = () => resolve(rawDataUrl);
          logoImg.src = logoBase64;
        };
        billImg.src = rawDataUrl;
      });

      setIsCapturing(false);

      // Step 3: Share (Mobile) or Download (Desktop)
      if (navigator.share && navigator.canShare) {
        try {
          // Convert dataUrl to File for sharing
          const res = await fetch(finalDataUrl);
          const blob = await res.blob();
          const file = new File([blob], fileName, { type: 'image/png' });

          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: 'Phiếu Lương',
              text: `Phiếu lương tháng ${selectedMonth}/${selectedYear} của ${selectedSalary.full_name}`,
            });
            if (addToast) addToast('Đã mở bảng chia sẻ!', 'success');
            return;
          }
        } catch (shareErr) {
          console.error('Share failed:', shareErr);
          // Fallback to traditional download if share is cancelled or fails
        }
      }

      // Traditional Download Fallback
      const link = document.createElement('a');
      link.download = fileName;
      link.href = finalDataUrl;
      link.click();
      if (addToast) addToast('Đã lưu ảnh phiếu lương thành công!', 'success');
    } catch (err) {
      setIsCapturing(false);
      console.error('Lỗi khi lưu ảnh:', err);
      if (addToast) addToast('Lỗi khi tạo ảnh phiếu lương', 'error');
    }
  };

  // --- Computed display data ---
  const displaySalaries = salaries
    .filter((s) => {
      if (hideZero && s.netSalary === 0) return false;
      if (searchTerm) {
        const t = searchTerm.toLowerCase();
        return (
          (s.full_name || '').toLowerCase().includes(t) || (s.code || '').toLowerCase().includes(t)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'newest') return (b.full_name || '').localeCompare(a.full_name || '');
      if (sortBy === 'price') return b.netSalary - a.netSalary;
      if (sortBy === 'date') return a.netSalary - b.netSalary;
      if (sortBy === 'code') return (a.code || '').localeCompare(b.code || '');
      return 0;
    });

  const totalDaysAll = displaySalaries.reduce((sum, s) => sum + s.totalDays, 0);
  const totalOTAll = displaySalaries.reduce((sum, s) => sum + s.totalOT, 0);
  const totalMonthOTAll = displaySalaries.reduce((sum, s) => sum + s.monthOTSalary, 0);
  const earnedSalaryAll = displaySalaries.reduce(
    (sum, s) => sum + s.earnedSalary + s.dayOTSalary + s.monthOTSalary,
    0,
  );
  const totalAllAll = displaySalaries.reduce((sum, s) => sum + s.totalAll, 0);
  const totalAdvAll = displaySalaries.reduce((sum, s) => sum + s.totalAdv, 0);
  const insuranceDeductionAll = displaySalaries.reduce((sum, s) => sum + s.insuranceDeduction, 0);
  const netSalaryAll = displaySalaries.reduce((sum, s) => sum + s.netSalary, 0);

  // Excel always exports full data (not affected by hideZero)
  const handleExportExcel = () => {
    const data = [
      [
        'Mã NV',
        'Họ tên',
        'Công',
        'TC Ngày (h)',
        'Lương/Ngày',
        'Hệ số',
        'TC Tháng',
        'TC Ngày',
        'Lương Công',
        'Phụ cấp',
        'Tạm ứng',
        'Bảo hiểm',
        'Thực lĩnh',
      ],
    ];

    salaries.forEach((s) => {
      data.push([
        s.code && !s.code.includes('-') && s.code.length < 20 ? s.code : '-',
        s.full_name,
        Number(s.totalDays.toFixed(1)),
        `${s.totalOT.toFixed(1)}h`,
        s.dailyRate,
        s.monthlyCoeff,
        s.monthOTSalary,
        s.dayOTSalary,
        s.earnedSalary + s.monthOTSalary + s.dayOTSalary,
        s.totalAll,
        s.totalAdv,
        s.insuranceDeduction,
        s.netSalary,
      ]);
    });

    const allTotal = {
      days: salaries.reduce((sum, s) => sum + s.totalDays, 0),
      ot: salaries.reduce((sum, s) => sum + s.totalOT, 0),
      monthOT: salaries.reduce((sum, s) => sum + s.monthOTSalary, 0),
      dayOT: salaries.reduce((sum, s) => sum + s.dayOTSalary, 0),
      earned: salaries.reduce(
        (sum, s) => sum + s.earnedSalary + s.monthOTSalary + s.dayOTSalary,
        0,
      ),
      all: salaries.reduce((sum, s) => sum + s.totalAll, 0),
      adv: salaries.reduce((sum, s) => sum + s.totalAdv, 0),
      ins: salaries.reduce((sum, s) => sum + s.insuranceDeduction, 0),
      net: salaries.reduce((sum, s) => sum + s.netSalary, 0),
    };
    data.push([
      '',
      'TỔNG CỘNG',
      Number(allTotal.days.toFixed(1)),
      `${allTotal.ot.toFixed(1)}h`,
      '',
      '',
      allTotal.monthOT,
      allTotal.dayOT,
      allTotal.earned,
      allTotal.all,
      allTotal.adv,
      allTotal.ins,
      allTotal.net,
    ]);

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Luong T${selectedMonth}-${selectedYear}`);
    XLSX.writeFile(wb, `CDX_BangLuong_T${selectedMonth}_${selectedYear}.xlsx`);
  };

  // Note: image capture handled by PageToolbar via captureOptions

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24 overflow-x-hidden">
      {/* Header + Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <PageBreadcrumb title="Bảng lương" onBack={onBack} />
        <PageToolbar
          tableRef={mainTableRef}
          captureOptions={{
            reportTitle: 'BẢNG TÍNH LƯƠNG',
            subtitle:
              isMainCustomRange && filterStartDate && filterEndDate
                ? `Kỳ lương: ${formatDate(filterStartDate)} - ${formatDate(filterEndDate)}`
                : `Kỳ lương: Tháng ${selectedMonth}/${selectedYear}`,
            showNetSalary: true,
          }}
          onImageCaptured={setPreviewImageUrl}
          onExportExcel={handleExportExcel}
          sortOptions={[
            { value: 'code', label: 'Mã NV (A→Z)' },
            { value: 'newest', label: 'Tên (A→Z)' },
            { value: 'price', label: 'Thực lĩnh (cao→thấp)' },
            { value: 'date', label: 'Thực lĩnh (thấp→cao)' },
          ]}
          currentSort={sortBy}
          onSortChange={(v) => setSortBy(v as SortOption)}
          showFilter={showFilter}
          onFilterToggle={() => setShowFilter((f) => !f)}
        />
      </div>

      <FilterPanel
        show={showFilter}
        onReset={() => {
          setSearchTerm('');
          setHideZero(false);
          setIsMainCustomRange(false);
          setFilterStartDate('');
          setFilterEndDate('');
          setSelectedMonth(new Date().getMonth() + 1);
          setSelectedYear(new Date().getFullYear());
        }}
      >
        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
          <label className="text-[10px] font-bold text-gray-400 uppercase">
            Khoảng ngày tùy chọn
          </label>
          <button
            onClick={() => setIsMainCustomRange(!isMainCustomRange)}
            className={`relative inline-flex items-center w-11 h-6 rounded-full transition-all duration-300 shadow-inner ${isMainCustomRange ? 'bg-primary' : 'bg-gray-200'}`}
          >
            <span
              className={`inline-block w-4 h-4 bg-white rounded-full shadow-md transform transition-transform duration-300 ml-1 ${isMainCustomRange ? 'translate-x-5' : 'translate-x-0'}`}
            />
          </button>
        </div>

        {isMainCustomRange ? (
          <DateRangeFilter
            startDate={filterStartDate}
            endDate={filterEndDate}
            onStartChange={setFilterStartDate}
            onEndChange={setFilterEndDate}
          />
        ) : (
          <div className="flex items-center gap-3">
            <label className="text-[10px] font-bold text-gray-400 uppercase whitespace-nowrap">
              Kỳ lương:
            </label>
            <MonthYearPicker
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              onMonthChange={setSelectedMonth}
              onYearChange={setSelectedYear}
            />
          </div>
        )}
        <HideZeroToggle value={hideZero} onChange={setHideZero} label="Ẩn dòng thực lĩnh = 0" />
        <FilterSearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Tìm theo tên, mã NV..."
        />
      </FilterPanel>

      <div
        ref={mainTableRef}
        className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden overflow-x-auto custom-scrollbar pb-2"
      >
        <table className="w-full text-left border-collapse min-w-[1100px] whitespace-nowrap">
          <thead>
            <tr className="bg-primary text-white">
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider">
                Mã bảng lương
              </th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider">
                Nhân viên
              </th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-center">
                Công
              </th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-center">
                TC h
              </th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-right">
                Lương/Ngày
              </th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-right">
                Hệ số
              </th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-right">
                TC Tháng
              </th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-right">
                TC Ngày
              </th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-right">
                Lương Công
              </th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-right">
                Phụ cấp
              </th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-right">
                Tạm ứng
              </th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-right">
                Bảo hiểm
              </th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-right">
                Thực lĩnh
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-400 italic">
                  <div className="flex flex-col items-center justify-center">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2"></div>
                    <p className="text-sm">Đang tính toán...</p>
                  </div>
                </td>
              </tr>
            ) : salaries.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-400 italic">
                  Không có dữ liệu bảng lương
                </td>
              </tr>
            ) : (
              displaySalaries.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => {
                    // Lưu effective range vào salary data
                    const effStart =
                      isMainCustomRange && filterStartDate && filterEndDate
                        ? filterStartDate
                        : `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
                    const effEnd =
                      isMainCustomRange && filterStartDate && filterEndDate
                        ? filterEndDate
                        : toLocalISODate(new Date(selectedYear, selectedMonth, 0));

                    setSelectedSalary({
                      ...s,
                      _effectiveStart: effStart,
                      _effectiveEnd: effEnd,
                    });
                    setCustomRange({ start: effStart, end: effEnd });
                    setIsCustomRange(false); // Luôn false khi mở, chỉ true khi user tự bật
                    setUserChangedDates(false);
                    setShowDetailModal(true);
                  }}
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div className="bg-primary/5 px-3 py-1.5 rounded-xl border border-primary/10 text-[10px] font-black text-primary uppercase shadow-inner italic inline-block">
                      SL-
                      {s.code && !s.code.includes('-') && s.code.length < 20
                        ? s.code
                        : s.id.includes('-')
                          ? '-'
                          : s.id}
                      -{selectedMonth.toString().padStart(2, '0')}
                      {selectedYear.toString().slice(-2)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs font-bold text-gray-800">{s.full_name}</p>
                    <p className="text-[9px] text-gray-400">
                      {s.code && !s.code.includes('-') && s.code.length < 20 ? s.code : '-'}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-center text-xs font-bold text-gray-600">
                    {s.totalDays.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-center text-xs font-bold text-amber-600">
                    {s.totalOT.toFixed(1)}h
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-medium text-gray-500 italic">
                    {formatCurrency(s.dailyRate)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-amber-600">
                    x{s.monthlyCoeff}
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-black text-amber-600">
                    {formatCurrency(s.monthOTSalary)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-amber-600">
                    {formatCurrency(s.dayOTSalary)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-medium text-gray-600">
                    {formatCurrency(s.earnedSalary + s.monthOTSalary + s.dayOTSalary)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-medium text-green-600">
                    +{formatCurrency(s.totalAll)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-medium text-red-600">
                    -{formatCurrency(s.totalAdv)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-medium text-red-600">
                    -{formatCurrency(s.insuranceDeduction)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-black text-primary">
                    {formatCurrency(s.netSalary)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {!loading && displaySalaries.length > 0 && (
            <tfoot className="bg-gray-50/80 border-t-2 border-primary/20">
              <tr>
                <td className="px-4 py-4 text-xs font-black text-gray-800 uppercase" colSpan={2}>
                  Tổng cộng
                </td>
                <td className="px-4 py-4 text-center text-xs font-black text-gray-800">
                  {totalDaysAll.toFixed(1)}
                </td>
                <td className="px-4 py-4 text-center text-xs font-black text-amber-600">
                  {totalOTAll.toFixed(1)}h
                </td>
                <td className="px-4 py-4 text-right text-xs font-black text-gray-400">-</td>
                <td className="px-4 py-4 text-right text-xs font-black text-gray-400">-</td>
                <td className="px-4 py-4 text-right text-xs font-black text-amber-600">
                  {formatCurrency(salaries.reduce((sum, s) => sum + s.monthOTSalary, 0))}
                </td>
                <td className="px-4 py-4 text-right text-xs font-black text-amber-600">
                  {formatCurrency(salaries.reduce((sum, s) => sum + s.dayOTSalary, 0))}
                </td>
                <td className="px-4 py-4 text-right text-xs font-black text-gray-800">
                  {formatCurrency(
                    salaries.reduce(
                      (sum, s) => sum + s.earnedSalary + s.monthOTSalary + s.dayOTSalary,
                      0,
                    ),
                  )}
                </td>
                <td className="px-4 py-4 text-right text-xs font-black text-green-600">
                  +{formatCurrency(totalAllAll)}
                </td>
                <td className="px-4 py-4 text-right text-xs font-black text-red-600">
                  -{formatCurrency(totalAdvAll)}
                </td>
                <td className="px-4 py-4 text-right text-xs font-black text-red-600">
                  -{formatCurrency(insuranceDeductionAll)}
                </td>
                <td className="px-4 py-4 text-right text-lg font-black text-primary">
                  <span className="underline decoration-double decoration-primary decoration-1 underline-offset-2">
                    {formatCurrency(netSalaryAll)}
                  </span>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <AnimatePresence>
        {showDetailModal && selectedSalary && (
          <div
            className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md overflow-hidden no-print"
            onClick={() => setShowDetailModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="bg-white/95 backdrop-blur-xl rounded-[2.5rem] md:rounded-[3rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] w-full max-w-lg overflow-hidden relative border border-white/40"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-gradient-to-br from-primary via-primary to-primary/80 p-6 text-white flex items-center justify-between no-print relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
                <div className="flex items-center gap-4 relative z-10">
                  <div
                    className="w-12 h-12 flex items-center justify-center bg-white/20 backdrop-blur-md rounded-2xl cursor-pointer hover:bg-white/30 transition-all active:scale-90 shadow-lg border border-white/20"
                    onClick={() => {
                      setShowDetailModal(false);
                      setIsCustomRange(false);
                      setBillNote('');
                    }}
                  >
                    <Wallet size={24} className="text-white drop-shadow-sm" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-lg leading-tight tracking-tight">
                      Phiếu lương — {selectedSalary.full_name} (
                      {selectedSalary.code &&
                      !selectedSalary.code.includes('-') &&
                      selectedSalary.code.length < 20
                        ? selectedSalary.code
                        : '-'}
                      )
                    </h3>
                    <p className="text-[10px] text-white/80 font-black uppercase tracking-widest bg-black/10 px-2 py-0.5 rounded-full w-fit mt-1">
                      {isCustomRange
                        ? `${formatDate(customRange.start)} → ${formatDate(customRange.end)}`
                        : selectedSalary._effectiveStart && selectedSalary._effectiveEnd
                          ? `${formatDate(selectedSalary._effectiveStart)} → ${formatDate(selectedSalary._effectiveEnd)}`
                          : `THÁNG ${selectedMonth}/${selectedYear}`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    setIsCustomRange(false);
                    setBillNote('');
                  }}
                  className="p-2.5 hover:bg-white/20 rounded-2xl transition-all active:scale-95 text-white/80 hover:text-white"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Custom date range controls */}
              <div className="px-5 pt-4 pb-2 no-print bg-gray-50 border-b border-gray-100">
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                      KHOẢNG NGÀY TÍNH LƯƠNG
                    </label>
                  </div>
                  <button
                    onClick={() => {
                      const newVal = !isCustomRange;
                      setIsCustomRange(newVal);
                      if (newVal) {
                        // Khi bật custom range, trigger recalculate với dates hiện tại
                        setUserChangedDates(true);
                      }
                    }}
                    className={`relative inline-flex items-center w-12 h-6 rounded-full transition-all duration-300 shadow-inner ${isCustomRange ? 'bg-primary' : 'bg-gray-200'}`}
                  >
                    <span
                      className={`inline-block w-4.5 h-4.5 bg-white rounded-full shadow-lg transform transition-transform duration-300 flex items-center justify-center ${isCustomRange ? 'translate-x-6.5' : 'translate-x-1'}`}
                    />
                  </button>
                </div>
                {isCustomRange && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-0.5">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">
                        Từ ngày
                      </label>
                      <input
                        type="date"
                        value={customRange.start}
                        onChange={(e) => {
                          setCustomRange({ ...customRange, start: e.target.value });
                          setUserChangedDates(true);
                        }}
                        className="w-full px-3 py-1.5 rounded-xl border border-gray-200 text-xs outline-none focus:ring-1 focus:ring-primary/20"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">
                        Đến ngày
                      </label>
                      <input
                        type="date"
                        value={customRange.end}
                        onChange={(e) => {
                          setCustomRange({ ...customRange, end: e.target.value });
                          setUserChangedDates(true);
                        }}
                        className="w-full px-3 py-1.5 rounded-xl border border-gray-200 text-xs outline-none focus:ring-1 focus:ring-primary/20"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Bill table */}
              <div className="max-h-[55dvh] overflow-y-auto custom-scrollbar">
                <div ref={billRef} className="bg-white">
                  {/* Explicit style block for perfect image capture consistency (fixes missing bold/italic/colors) */}
                  <style>{`
                    .bill-capture { font-family: 'Inter', system-ui, sans-serif !important; width: 380px !important; margin: 0 auto !important; background: #FCFCFC !important; position: relative !important; }
                    .bill-capture.is-capturing { border: none !important; box-shadow: none !important; overflow: visible !important; }
                    .bill-capture .font-bold { font-weight: 700 !important; }
                    .bill-capture .font-black { font-weight: 900 !important; }
                    .bill-capture .font-extrabold { font-weight: 800 !important; }
                    .bill-capture .italic { font-style: italic !important; }
                    .bill-capture .uppercase { text-transform: uppercase !important; }
                    .bill-capture .text-primary { color: #2D5A27 !important; }
                    .bill-capture .logo-img { width: 36px !important; height: 36px !important; opacity: 1 !important; visibility: hidden !important; display: block !important; background-color: transparent !important; transform: translateZ(0) !important; -webkit-transform: translateZ(0) !important; }
                    .bill-capture .main-title { color: #2D5A27 !important; font-weight: 900 !important; letter-spacing: -0.02em !important; text-shadow: none !important; }
                    .bill-capture .text-gray-400 { color: #9CA3AF !important; }
                    .bill-capture .text-gray-500 { color: #6B7280 !important; }
                    .bill-capture .text-gray-700 { color: #374151 !important; }
                    .bill-capture .text-gray-800 { color: #1F2937 !important; }
                    .bill-capture .text-gray-900 { color: #111827 !important; }
                    .bill-capture .bg-primary\\/5 { background-color: rgba(45, 90, 39, 0.05) !important; }
                    .bill-capture .bg-gray-50\\/30 { background-color: rgba(249, 250, 251, 0.3) !important; }
                    .bill-capture .border-gray-100 { border-color: #F3F4F6 !important; }
                    .bill-capture .border-primary\\/20 { border-color: rgba(45, 90, 39, 0.2) !important; }
                    .bill-capture .whitespace-nowrap { white-space: nowrap !important; }
                  `}</style>

                  <div className={`bill-capture ${isCapturing ? 'is-capturing' : ''}`}>
                    {/* Bill header for image */}
                    <div className="px-5 pt-5 pb-4 border-b border-gray-100">
                      {/* Logo row */}
                      <div className="flex items-center gap-2 mb-3">
                        <img
                          src={logoBase64}
                          alt="Logo"
                          className="logo-img rounded-lg flex-shrink-0"
                          style={{ objectFit: 'contain' }}
                        />
                        <div>
                          <p className="text-[9px] font-black text-gray-700 uppercase tracking-wider">
                            CÔNG TY CON ĐƯỜNG XANH
                          </p>
                          <p className="text-[7px] text-gray-400 uppercase tracking-widest">
                            Hệ thống Quản trị Nguồn lực thi công
                          </p>
                        </div>
                      </div>
                      {/* Title block */}
                      <h1
                        className="text-xl uppercase leading-none main-title italic"
                        style={{
                          color: '#2D5A27',
                          fontWeight: 900,
                        }}
                      >
                        BẢNG TÍNH LƯƠNG
                      </h1>
                      <p className="text-xs font-bold text-red-600 mt-0.5 whitespace-nowrap">
                        {isCustomRange
                          ? `Kỳ lương: ${formatDate(customRange.start)} — ${formatDate(customRange.end)}`
                          : selectedSalary._effectiveStart && selectedSalary._effectiveEnd
                            ? `Kỳ lương: ${formatDate(selectedSalary._effectiveStart)} — ${formatDate(selectedSalary._effectiveEnd)}`
                            : (() => {
                                const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
                                return `Kỳ lương: Tháng ${selectedMonth}/${selectedYear} (1/${selectedMonth} - ${lastDay}/${selectedMonth})`;
                              })()}
                      </p>
                      {/* Employee name row with Autofit logic */}
                      <div className="flex justify-between items-center mt-3 gap-2">
                        <span className="text-xs text-gray-500 font-medium whitespace-nowrap">
                          Tên nhân viên:
                        </span>
                        <span
                          className="font-black text-gray-900 whitespace-nowrap text-right"
                          style={{
                            fontSize: selectedSalary.full_name?.length > 20 ? '13px' : '16px',
                            maxWidth: '220px',
                            overflow: 'hidden',
                          }}
                        >
                          {selectedSalary.full_name}
                        </span>
                      </div>
                      <div className="flex justify-between items-center mt-1 gap-2">
                        <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap">
                          Mã nhân viên:
                        </span>
                        <span className="font-bold text-gray-500 text-[11px] whitespace-nowrap text-right">
                          {selectedSalary.code &&
                          !selectedSalary.code.includes('-') &&
                          selectedSalary.code.length < 20
                            ? selectedSalary.code
                            : '-'}
                        </span>
                      </div>
                    </div>

                    <div className="px-5 pb-6">
                      {/* Minimalist Bill List */}
                      <div className="border-t border-gray-100">
                        {/* Attendance rows */}
                        <div className="flex justify-between items-center py-2.5 border-b border-gray-100 gap-2">
                          <span className="text-[11px] font-bold text-gray-500 whitespace-nowrap">
                            Giờ công:
                          </span>
                          <span className="text-[11px] font-bold text-gray-800 whitespace-nowrap">
                            {(selectedSalary.totalDays * 8).toFixed(0)} giờ (
                            {selectedSalary.totalDays.toFixed(1)} công)
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2.5 border-b border-gray-100 gap-2">
                          <span className="text-[11px] font-bold text-gray-500 whitespace-nowrap">
                            Tăng ca:
                          </span>
                          <span className="text-[11px] font-bold text-gray-800 whitespace-nowrap">
                            {selectedSalary.totalOT.toFixed(1)} giờ
                          </span>
                        </div>

                        {/* Financial rows */}
                        <div className="flex justify-between items-center py-2.5 border-b border-gray-100 gap-2">
                          <span className="text-[11px] font-bold text-gray-500 whitespace-nowrap">
                            Lương cơ bản:
                          </span>
                          <span className="text-[11px] font-bold text-gray-800 whitespace-nowrap">
                            {formatCurrency(selectedSalary.earnedSalary)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2.5 border-b border-gray-100 gap-2">
                          <span className="text-[11px] font-bold text-gray-500 whitespace-nowrap">
                            Tiền tăng ca:
                          </span>
                          <span className="text-[11px] font-bold text-gray-800 whitespace-nowrap">
                            {formatCurrency(
                              selectedSalary.dayOTSalary + selectedSalary.monthOTSalary,
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2.5 border-b border-gray-100 gap-2">
                          <span className="text-[11px] font-bold text-gray-500 whitespace-nowrap">
                            Phụ cấp:
                          </span>
                          <span className="text-[11px] font-bold text-gray-800 whitespace-nowrap">
                            {formatCurrency(selectedSalary.totalAll)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2.5 border-b border-gray-100 gap-2">
                          <span className="text-[11px] font-bold text-gray-500 whitespace-nowrap">
                            Thưởng:
                          </span>
                          <span className="text-[11px] font-bold text-gray-800 whitespace-nowrap">
                            0 đ
                          </span>
                        </div>

                        {/* Total Earnings */}
                        <div className="flex justify-between items-center py-3 border-b border-gray-100 gap-2 bg-gray-50/30 px-2 -mx-2">
                          <span className="text-[11px] font-black text-gray-900 uppercase tracking-wide whitespace-nowrap">
                            TỔNG THU NHẬP:
                          </span>
                          <span className="text-[11px] font-black text-gray-900 whitespace-nowrap">
                            {formatCurrency(
                              selectedSalary.earnedSalary +
                                selectedSalary.dayOTSalary +
                                selectedSalary.monthOTSalary +
                                selectedSalary.totalAll,
                            )}
                          </span>
                        </div>

                        {/* Deductions rows */}
                        <div className="flex justify-between items-center py-2.5 border-b border-gray-100 gap-2">
                          <span className="text-[11px] font-bold text-gray-500 whitespace-nowrap">
                            Tạm ứng:
                          </span>
                          <span className="text-[11px] font-bold text-gray-800 whitespace-nowrap">
                            -{formatCurrency(selectedSalary.totalAdv)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2.5 border-b border-gray-100 gap-2">
                          <span className="text-[11px] font-bold text-gray-500 whitespace-nowrap">
                            Bảo hiểm:
                          </span>
                          <span className="text-[11px] font-bold text-gray-800 whitespace-nowrap">
                            -{formatCurrency(selectedSalary.insuranceDeduction)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2.5 border-b border-gray-100 gap-2">
                          <span className="text-[11px] font-bold text-gray-500 whitespace-nowrap">
                            Giảm trừ:
                          </span>
                          <span className="text-[11px] font-bold text-gray-800 whitespace-nowrap">
                            0 đ
                          </span>
                        </div>

                        {/* Total Deductions */}
                        <div className="flex justify-between items-center py-3 border-b border-gray-100 gap-2 bg-gray-50/30 px-2 -mx-2">
                          <span className="text-[11px] font-black text-gray-900 uppercase tracking-wide whitespace-nowrap">
                            TỔNG GIẢM:
                          </span>
                          <span className="text-[11px] font-black text-gray-900 whitespace-nowrap">
                            -
                            {formatCurrency(
                              selectedSalary.totalAdv + selectedSalary.insuranceDeduction,
                            )}
                          </span>
                        </div>

                        {/* Net Pay (RENAMED) */}
                        <div className="flex justify-between items-center pt-4 pb-1 border-red-600/20 bg-red-600/5 px-2 -mx-2">
                          <span className="text-xs font-black text-red-600 uppercase tracking-wider whitespace-nowrap italic flex items-center gap-1">
                            CÒN ĐƯỢC NHẬN:
                          </span>
                          <span className="text-sm font-black text-red-600 whitespace-nowrap flex items-center gap-1">
                            {formatCurrency(selectedSalary.netSalary)}
                          </span>
                        </div>
                        <div className="bg-primary/5 px-2 -mx-2 pb-3 border-b-2 border-primary/20">
                          <p className="text-[8px] font-black text-gray-900/40 uppercase tracking-[0.2em] leading-none">
                            NET SALARY DETAILS
                          </p>
                        </div>

                        <div className="flex justify-between items-start py-4 border-b border-gray-100 gap-2">
                          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-tighter whitespace-nowrap mt-0.5">
                            Bằng chữ:
                          </span>
                          <span className="text-[11px] font-extrabold italic text-gray-700 leading-normal text-right pl-4">
                            {numberToVietnamese(selectedSalary.netSalary)}
                          </span>
                        </div>

                        <div className="flex justify-between items-start py-2.5 gap-2">
                          <span className="text-[11px] font-bold text-gray-500 whitespace-nowrap mt-1">
                            Ghi chú:
                          </span>
                          {isCapturing ? (
                            <span className="text-[11px] font-bold text-gray-800 text-right pl-4">
                              {billNote || '—'}
                            </span>
                          ) : (
                            <textarea
                              rows={2}
                              value={billNote}
                              onChange={(e) => setBillNote(e.target.value)}
                              placeholder="Nhập ghi chú..."
                              className="flex-1 ml-2 px-2 py-1 text-[11px] font-bold text-gray-800 border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-primary/20 resize-none"
                            />
                          )}
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="pt-3 flex justify-between items-center whitespace-nowrap">
                        <div className="flex items-center gap-1.5 opacity-30 flex-shrink-0">
                          <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">
                            CDX ERP System
                          </span>
                        </div>
                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest opacity-30 flex-shrink-0">
                          {new Date().toLocaleString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="p-6 bg-white border-t border-gray-100 flex gap-3 no-print">
                <button
                  onClick={handleSaveImage}
                  className="flex-1 bg-gray-900 text-white font-black py-3.5 rounded-2xl hover:bg-black transition-all flex items-center justify-center gap-2 shadow-xl active:scale-95 text-[11px] uppercase tracking-wider"
                >
                  <ImageIcon size={18} /> LƯU ẢNH PHIẾU
                </button>
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    setIsCustomRange(false);
                    setBillNote('');
                  }}
                  className="px-6 bg-gray-100 text-gray-600 font-black py-3.5 rounded-2xl hover:bg-gray-200 transition-all active:scale-95 text-[11px] uppercase tracking-wider"
                >
                  ĐÓNG
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Preview modal */}
      {previewImageUrl && (
        <ReportImagePreviewModal
          imageDataUrl={previewImageUrl}
          fileName={`CDX_BangLuong_T${selectedMonth}_${selectedYear}.png`}
          onClose={() => setPreviewImageUrl(null)}
        />
      )}
    </div>
  );
};
