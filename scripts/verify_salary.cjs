const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load .env from project root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Core calculation logic — phải khớp từng bước với fetchSalaries() trong
 * src/components/hr/MonthlySalary.tsx (góc nhìn Admin). Sửa công thức ở đó thì sửa cả ở đây.
 */
async function calculateSalary(queryStart, queryEnd, targetEmployeeId) {
  const { data: employees } = await supabase
    .from('users')
    .select('*')
    .neq('status', 'Nghỉ việc')
    .neq('status', 'Đã xóa')
    .neq('role', 'Develop')
    .eq('has_salary', true)
    .order('code');
  const { data: settings } = await supabase.from('salary_settings').select('*');

  let attQuery = supabase.from('attendance').select('*').gte('date', queryStart).lte('date', queryEnd);
  let advQuery = supabase.from('advances').select('*').gte('date', queryStart).lte('date', queryEnd);
  let allQuery = supabase.from('allowances').select('*').gte('date', queryStart).lte('date', queryEnd);

  if (targetEmployeeId) {
    attQuery = attQuery.eq('employee_id', targetEmployeeId);
    advQuery = advQuery.eq('employee_id', targetEmployeeId);
    allQuery = allQuery.eq('employee_id', targetEmployeeId);
  }

  const { data: att } = await attQuery;
  const { data: adv } = await advQuery;
  const { data: all } = await allQuery;

  // Danh sách các tháng dương lịch trong khoảng
  const allMonthKeys = [];
  const d = new Date(queryStart);
  const endD = new Date(queryEnd);
  while (d <= endD) {
    allMonthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() + 1);
    d.setDate(1);
  }

  // Mức lương áp dụng cho đúng ngày; không có thì lấy mức mới nhất
  const findSettingsForDate = (empId, date) => {
    const empSettings = (settings || [])
      .filter((s) => s.employee_id === empId)
      .sort((a, b) => new Date(b.valid_from || 0).getTime() - new Date(a.valid_from || 0).getTime());
    return (
      empSettings.find((s) => {
        const start = (s.valid_from || '1900-01-01').slice(0, 10);
        const end = (s.valid_to || '2099-12-31').slice(0, 10);
        return date >= start && date <= end;
      }) ??
      empSettings[0] ?? { daily_rate: 0, monthly_ot_coeff: 1.0, insurance_deduction: 0 }
    );
  };

  const results = (employees || [])
    .filter((e) => !targetEmployeeId || e.id === targetEmployeeId)
    .map((emp) => {
      const empAtt = att?.filter((a) => a.employee_id === emp.id) || [];
      const empAdv = adv?.filter((a) => a.employee_id === emp.id) || [];
      const empAll = all?.filter((a) => a.employee_id === emp.id) || [];

      if (!targetEmployeeId && empAtt.length === 0 && empAdv.length === 0 && empAll.length === 0)
        return null;

      // Tạm ứng và phụ cấp: cộng toàn bộ trong khoảng (không lọc theo trạng thái)
      const totalAdv = empAdv.reduce((sum, a) => sum + Number(a.amount || 0), 0);
      const totalAll = empAll.reduce((sum, a) => sum + Number(a.amount || 0), 0);

      let earnedSalary = 0;
      let dayOTSalary = 0;
      let totalDays = 0;

      // Lương từng ngày theo mức áp dụng đúng ngày đó; giờ TC = (lương ngày ÷ 8) × hệ số
      empAtt.forEach((a) => {
        if (!a.date) return;
        const daySet = findSettingsForDate(emp.id, a.date);
        const dRate = Number(daySet.daily_rate || 0);
        const mCoeff = Number(daySet.monthly_ot_coeff || 1.0);
        const mDays = Number(a.hours_worked || 0) / 8;
        earnedSalary += mDays * dRate;
        dayOTSalary += Number(a.overtime_hours || 0) * (dRate / 8) * mCoeff;
        totalDays += mDays;
      });

      // Bảo hiểm: 1 lần/tháng có chấm công, theo mức áp dụng ngày đầu tháng
      let insuranceDeduction = 0;
      allMonthKeys.forEach((mk) => {
        if (!empAtt.some((a) => a.date?.startsWith(mk))) return;
        insuranceDeduction += Number(findSettingsForDate(emp.id, `${mk}-01`).insurance_deduction || 0);
      });

      const netSalary = earnedSalary + dayOTSalary + totalAll - totalAdv - insuranceDeduction;

      return {
        Name: emp.full_name,
        Days: totalDays.toFixed(2),
        Earned: earnedSalary,
        OT: dayOTSalary,
        Allow: totalAll,
        Adv: totalAdv,
        Ins: insuranceDeduction,
        Net: Math.round(netSalary),
        RawNet: netSalary,
        ID: emp.id,
      };
    })
    .filter(Boolean);

  return results;
}

const formatRow = ({ RawNet, ID, ...rest }) => ({
  ...rest,
  Earned: Math.round(rest.Earned).toLocaleString(),
  OT: Math.round(rest.OT).toLocaleString(),
  Net: rest.Net.toLocaleString(),
});

async function runTests() {
  console.log('\n🚀 BẮT ĐẦU KIỂM TRA LƯƠNG...');

  console.log('\n--- CASE 1: Tháng 3/2026 (Toàn tháng) ---');
  const t1 = await calculateSalary('2026-03-01', '2026-03-31');
  console.table(t1.map(formatRow));

  console.log('\n--- CASE 2: Khoảng gộp T2-T4/2026 (Quarterly) ---');
  const t3 = await calculateSalary('2026-02-01', '2026-04-30');
  console.table(t3.map(formatRow));

  // find any employee who worked in multiple months for consistency check
  const sampleEmp = t3.find((e) => parseFloat(e.Days) > 10);
  if (sampleEmp) {
    console.log(`\n--- KIỂM TRA ĐỐI CHIẾU (Nhân viên: ${sampleEmp.Name}) ---`);
    const id = sampleEmp.ID;
    const m2 = (await calculateSalary('2026-02-01', '2026-02-28', id))[0];
    const m3 = (await calculateSalary('2026-03-01', '2026-03-31', id))[0];
    const m4 = (await calculateSalary('2026-04-01', '2026-04-30', id))[0];

    const sumIndividual = (m2?.RawNet || 0) + (m3?.RawNet || 0) + (m4?.RawNet || 0);
    console.log(`- Tháng 2: ${(m2?.Net || 0).toLocaleString()} đ`);
    console.log(`- Tháng 3: ${(m3?.Net || 0).toLocaleString()} đ`);
    console.log(`- Tháng 4: ${(m4?.Net || 0).toLocaleString()} đ`);
    console.log(`=> Tổng lẻ: ${Math.round(sumIndividual).toLocaleString()} đ`);
    console.log(`=> Tính gộp: ${sampleEmp.Net.toLocaleString()} đ`);
    console.log(`Xác nhận khớp: ${Math.abs(sumIndividual - sampleEmp.RawNet) < 1 ? 'ĐÚNG ✅' : 'SAI ❌'}`);
  }

  console.log('\n✅ HOÀN TẤT KIỂM TRA.');
}

runTests().catch(console.error);
