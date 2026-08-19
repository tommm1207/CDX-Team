import { ClipboardCheck, AlertCircle } from 'lucide-react';
import { PageBreadcrumb } from '@/components/shared';

export const DatabaseSetup = ({ onBack }: { onBack: () => void }) => {
  const sqlSchema = `-- SQL Schema for CDX Warehouse Management
-- Updated: 2026-03-12

-- 1. Users table (Employees)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  id_card TEXT,
  dob DATE,
  join_date DATE DEFAULT CURRENT_DATE,
  tax_id TEXT,
  app_pass TEXT NOT NULL,
  department TEXT,
  position TEXT,
  has_salary BOOLEAN DEFAULT false,
  role TEXT NOT NULL DEFAULT 'User',
  data_view_permission TEXT,
  avatar_url TEXT,
  resign_date DATE,
  initial_budget NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'Đang làm việc',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Material Groups table
CREATE TABLE IF NOT EXISTS material_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Materials table
CREATE TABLE IF NOT EXISTS materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  group_id UUID REFERENCES material_groups(id),
  warehouse_id UUID, -- Optional: default warehouse
  specification TEXT,
  unit TEXT,
  description TEXT,
  image_url TEXT,
  status TEXT DEFAULT 'Đang sử dụng',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Warehouses table
CREATE TABLE IF NOT EXISTS warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  manager_id UUID REFERENCES users(id),
  coordinates TEXT,
  notes TEXT,
  capacity TEXT,
  status TEXT DEFAULT 'Đang hoạt động',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Stock In table
CREATE TABLE IF NOT EXISTS stock_in (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_code TEXT UNIQUE NOT NULL,
  date DATE NOT NULL,
  warehouse_id UUID REFERENCES warehouses(id),
  material_id UUID REFERENCES materials(id),
  quantity NUMERIC NOT NULL,
  unit_price NUMERIC NOT NULL,
  total_amount NUMERIC NOT NULL,
  unit TEXT,
  notes TEXT,
  employee_id UUID REFERENCES users(id),
  status TEXT DEFAULT 'Chờ duyệt',
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Stock Out table
CREATE TABLE IF NOT EXISTS stock_out (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  export_code TEXT UNIQUE NOT NULL,
  date DATE NOT NULL,
  warehouse_id UUID REFERENCES warehouses(id),
  material_id UUID REFERENCES materials(id),
  quantity NUMERIC NOT NULL,
  unit_price NUMERIC DEFAULT 0,
  total_amount NUMERIC,
  notes TEXT,
  employee_id UUID REFERENCES users(id),
  status TEXT DEFAULT 'Chờ duyệt',
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Transfers table
CREATE TABLE IF NOT EXISTS transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_code TEXT UNIQUE NOT NULL,
  date DATE NOT NULL,
  from_warehouse_id UUID REFERENCES warehouses(id),
  to_warehouse_id UUID REFERENCES warehouses(id),
  material_id UUID REFERENCES materials(id),
  quantity NUMERIC NOT NULL,
  notes TEXT,
  employee_id UUID REFERENCES users(id),
  status TEXT DEFAULT 'Chờ duyệt',
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Costs table
CREATE TABLE IF NOT EXISTS costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cost_code TEXT UNIQUE,
  date DATE NOT NULL,
  employee_id UUID REFERENCES users(id),
  cost_type TEXT,
  content TEXT,
  warehouse_id UUID REFERENCES warehouses(id),
  material_id UUID REFERENCES materials(id),
  quantity NUMERIC DEFAULT 0,
  unit TEXT,
  unit_price NUMERIC DEFAULT 0,
  total_amount NUMERIC NOT NULL,
  notes TEXT,
  cost_type TEXT DEFAULT 'Chi phí',
  stock_status TEXT DEFAULT 'Chưa nhập',
  status TEXT DEFAULT 'Chờ duyệt',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8.1. Expense Settlements table
CREATE TABLE IF NOT EXISTS expense_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_code TEXT UNIQUE,
  title TEXT NOT NULL,
  employee_id UUID REFERENCES users(id),
  date DATE NOT NULL,
  previous_balance NUMERIC DEFAULT 0,
  total_advance NUMERIC DEFAULT 0,
  total_cost NUMERIC DEFAULT 0,
  final_balance NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'Chờ duyệt',
  reviewer_id UUID REFERENCES users(id),
  image_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE costs ADD COLUMN IF NOT EXISTS settlement_id UUID REFERENCES expense_settlements(id);
-- 9. Attendance table
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES users(id),
  date DATE NOT NULL,
  status TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, date)
);

-- 10. Advances table
CREATE TABLE IF NOT EXISTS advances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES users(id),
  date DATE NOT NULL,
  amount NUMERIC NOT NULL,
  type TEXT NOT NULL,
  notes TEXT,
  status TEXT DEFAULT 'Chờ duyệt',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE advances ADD COLUMN IF NOT EXISTS settlement_id UUID REFERENCES expense_settlements(id);

-- 11. Reminders table
CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT,
  reminder_time TIMESTAMPTZ NOT NULL,
  browser_notification BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'pending',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 12. Notes table
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  content TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  weather TEXT,
  related_object TEXT,
  object_code TEXT,
  note_code TEXT,
  location TEXT,
  related_personnel JSONB DEFAULT '[]',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 13. Inventory table (Real-time balance)
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID REFERENCES warehouses(id),
  material_id UUID REFERENCES materials(id),
  quantity NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(warehouse_id, material_id)
);

-- 14. Construction Diaries table
CREATE TABLE IF NOT EXISTS construction_diaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diary_code TEXT UNIQUE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  weather TEXT,
  temperature TEXT,
  labor_info TEXT,
  equipment_info TEXT,
  work_progress TEXT,
  quality_issues TEXT,
  supervision_comments TEXT,
  image_urls JSONB DEFAULT '[]',
  warehouse_id UUID REFERENCES warehouses(id),
  created_by UUID REFERENCES users(id),
  status TEXT DEFAULT 'Mới',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 15. Salary Settings table
CREATE TABLE IF NOT EXISTS salary_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES users(id) UNIQUE,
  base_salary NUMERIC DEFAULT 0,
  daily_rate NUMERIC DEFAULT 0,
  insurance_deduction NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 15. Partners table (Customers & Suppliers)
CREATE TABLE IF NOT EXISTS partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT, -- 'Khách hàng', 'Nhà cung cấp', 'Cả hai'
  phone TEXT,
  address TEXT,
  tax_id TEXT,
  notes TEXT,
  status TEXT DEFAULT 'Hoạt động',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 16. Allowances table
CREATE TABLE IF NOT EXISTS allowances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES users(id),
  date DATE NOT NULL,
  amount NUMERIC NOT NULL,
  type TEXT NOT NULL, -- 'Phụ cấp', 'Thưởng', 'Khác'
  notes TEXT,
  status TEXT DEFAULT 'Chờ duyệt',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 17. BOM Configs (Định mức sản xuất)
CREATE TABLE IF NOT EXISTS bom_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_item_id UUID REFERENCES materials(id), -- Thành phẩm (Cọc)
  name TEXT NOT NULL,
  is_two_stage BOOLEAN DEFAULT false, -- Quy trình 2 bước (Lồng thép -> Cọc)
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 18. Chi tiết định mức (BOM Items)
CREATE TABLE IF NOT EXISTS bom_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id UUID REFERENCES bom_configs(id) ON DELETE CASCADE,
  material_item_id UUID REFERENCES materials(id), -- Nguyên liệu (Xi măng, Cát, Thép...)
  quantity_per_unit NUMERIC NOT NULL, -- Lượng cần cho 1 đơn vị thành phẩm
  unit TEXT
);

-- 19. Lệnh sản xuất (Production Orders)
CREATE TABLE IF NOT EXISTS production_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code TEXT UNIQUE NOT NULL, -- LSX-2024-001
  bom_id UUID REFERENCES bom_configs(id),
  warehouse_id UUID REFERENCES warehouses(id), -- Kho xuất nguyên liệu
  output_warehouse_id UUID REFERENCES warehouses(id), -- Kho nhập thành phẩm
  quantity NUMERIC NOT NULL, -- Số lượng thành phẩm cần đúc
  status TEXT DEFAULT 'Mới', -- 'Mới' | 'Đã duyệt' | 'Hoàn thành' | 'Hủy'
  planned_date DATE,
  created_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  notes TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) CONFIGURATION
-- ==========================================

-- Enable RLS for all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_in ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_out ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE allowances ENABLE ROW LEVEL SECURITY;
ALTER TABLE construction_diaries ENABLE ROW LEVEL SECURITY;

-- Helper function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- 1. Users Table Policies
CREATE POLICY "Users can view their own profile" ON users FOR SELECT USING (auth.uid() = id OR get_user_role() IN ('Admin', 'Develop'));
CREATE POLICY "Admins can manage users" ON users FOR ALL USING (get_user_role() IN ('Admin', 'Develop'));

-- 2. Material Groups Policies
CREATE POLICY "Everyone can view material groups" ON material_groups FOR SELECT USING (true);
CREATE POLICY "Admins can manage material groups" ON material_groups FOR ALL USING (get_user_role() IN ('Admin', 'Develop'));

-- 3. Materials Policies
CREATE POLICY "Everyone can view materials" ON materials FOR SELECT USING (true);
CREATE POLICY "Admins can manage materials" ON materials FOR ALL USING (get_user_role() IN ('Admin', 'Develop'));

-- 4. Warehouses Policies
CREATE POLICY "Everyone can view warehouses" ON warehouses FOR SELECT USING (true);
CREATE POLICY "Admins can manage warehouses" ON warehouses FOR ALL USING (get_user_role() IN ('Admin', 'Develop'));

-- 5. Stock In Policies
CREATE POLICY "Users can view stock in" ON stock_in FOR SELECT USING (true);
CREATE POLICY "Users can create stock in" ON stock_in FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can manage stock in" ON stock_in FOR ALL USING (get_user_role() IN ('Admin', 'Develop'));

-- 6. Stock Out Policies
CREATE POLICY "Users can view stock out" ON stock_out FOR SELECT USING (true);
CREATE POLICY "Users can create stock out" ON stock_out FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can manage stock out" ON stock_out FOR ALL USING (get_user_role() IN ('Admin', 'Develop'));

-- 7. Transfers Policies
CREATE POLICY "Users can view transfers" ON transfers FOR SELECT USING (true);
CREATE POLICY "Users can create transfers" ON transfers FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can manage transfers" ON transfers FOR ALL USING (get_user_role() IN ('Admin', 'Develop'));

-- 8. Costs Policies
CREATE POLICY "Users can view costs" ON costs FOR SELECT USING (true);
CREATE POLICY "Users can create costs" ON costs FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can manage costs" ON costs FOR ALL USING (get_user_role() IN ('Admin', 'Develop'));

-- 9. Attendance Policies
CREATE POLICY "Users can view attendance" ON attendance FOR SELECT USING (true);
CREATE POLICY "Admins can manage attendance" ON attendance FOR ALL USING (get_user_role() IN ('Admin', 'Develop'));

-- 10. Advances Policies
CREATE POLICY "Users can view their own advances" ON advances FOR SELECT USING (auth.uid() = employee_id OR get_user_role() IN ('Admin', 'Develop'));
CREATE POLICY "Admins can manage advances" ON advances FOR ALL USING (get_user_role() IN ('Admin', 'Develop'));

-- 11. Reminders Policies
CREATE POLICY "Users can manage their own reminders" ON reminders FOR ALL USING (true); -- Simplified for now

-- 12. Notes Policies
CREATE POLICY "Users can view notes" ON notes FOR SELECT USING (true);
CREATE POLICY "Users can manage their own notes" ON notes FOR ALL USING (auth.uid() = created_by OR get_user_role() IN ('Admin', 'Develop'));

-- 13. Inventory Policies
CREATE POLICY "Everyone can view inventory" ON inventory FOR SELECT USING (true);
CREATE POLICY "System can manage inventory" ON inventory FOR ALL USING (true); -- Usually managed via triggers or app logic

-- 14. Salary Settings Policies
CREATE POLICY "Users can view their own salary settings" ON salary_settings FOR SELECT USING (auth.uid() = employee_id OR get_user_role() IN ('Admin', 'Develop'));
CREATE POLICY "Admins can manage salary settings" ON salary_settings FOR ALL USING (get_user_role() IN ('Admin', 'Develop'));

-- 15. Partners Policies
CREATE POLICY "Everyone can view partners" ON partners FOR SELECT USING (true);
CREATE POLICY "Admins can manage partners" ON partners FOR ALL USING (get_user_role() IN ('Admin', 'Develop'));

-- 16. Allowances Policies
CREATE POLICY "Users can view their own allowances" ON allowances FOR SELECT USING (auth.uid() = employee_id OR get_user_role() IN ('Admin', 'Develop'));
CREATE POLICY "Admins can manage allowances" ON allowances FOR ALL USING (get_user_role() IN ('Admin', 'Develop'));

-- 17. BOM Configs Policies
CREATE POLICY "Everyone can view bom configs" ON bom_configs FOR SELECT USING (true);
CREATE POLICY "Admins can manage bom configs" ON bom_configs FOR ALL USING (get_user_role() IN ('Admin', 'Develop'));

-- 18. BOM Items Policies
CREATE POLICY "Everyone can view bom items" ON bom_items FOR SELECT USING (true);
CREATE POLICY "Admins can manage bom items" ON bom_items FOR ALL USING (get_user_role() IN ('Admin', 'Develop'));

-- 19. Production Orders Policies
CREATE POLICY "Everyone can view production orders" ON production_orders FOR SELECT USING (true);
CREATE POLICY "Admins can manage production orders" ON production_orders FOR ALL USING (get_user_role() IN ('Admin', 'Develop'));

-- 19.1 Expense Settlements Policies
CREATE POLICY "Everyone can view expense settlements" ON expense_settlements FOR SELECT USING (true);
CREATE POLICY "Users can insert expense settlements" ON expense_settlements FOR INSERT WITH CHECK (auth.uid() = employee_id OR get_user_role() IN ('Admin', 'Develop'));
CREATE POLICY "Admins can manage expense settlements" ON expense_settlements FOR ALL USING (get_user_role() IN ('Admin', 'Develop'));


-- 20. Construction Diaries Policies
CREATE POLICY "Everyone can view diaries" ON construction_diaries FOR SELECT USING (true);
CREATE POLICY "Users can manage their own diaries" ON construction_diaries FOR ALL USING (auth.uid() = created_by OR get_user_role() IN ('Admin', 'Develop'));
`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(sqlSchema);
    alert('Đã sao chép SQL vào bộ nhớ tạm!');
  };

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24">
      <PageBreadcrumb title="Cấu hình Database" onBack={onBack} />

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
          <div>
            <h3 className="text-lg font-bold text-gray-800">SQL Schema cho Supabase</h3>
            <p className="text-xs text-gray-500 mt-1">
              Sử dụng mã SQL này trong Supabase SQL Editor để khởi tạo các bảng.
            </p>
          </div>
          <button
            onClick={copyToClipboard}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
          >
            <ClipboardCheck size={18} /> Sao chép SQL
          </button>
        </div>

        <div className="p-6">
          <div className="bg-gray-900 rounded-2xl p-6 overflow-x-auto">
            <pre className="text-green-400 text-xs font-mono leading-relaxed">{sqlSchema}</pre>
          </div>

          <div className="mt-8 p-6 bg-amber-50 rounded-2xl border border-amber-100 space-y-4">
            <div className="flex gap-4">
              <div className="p-3 bg-amber-100 rounded-2xl text-amber-600 h-fit">
                <AlertCircle size={24} />
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-amber-900">Lưu ý quan trọng về RLS</h4>
                <p className="text-xs text-amber-800 leading-relaxed">
                  Mặc định Supabase bật <b>Row Level Security (RLS)</b>. Nếu bạn không thêm các
                  Policy để cho phép <b>INSERT/SELECT/UPDATE</b>, ứng dụng sẽ không thể nhập dữ
                  liệu.
                </p>
                <p className="text-xs text-amber-800 leading-relaxed font-bold">
                  Để thử nghiệm nhanh, bạn có thể tắt RLS cho từng bảng trong Supabase Dashboard
                  (không khuyến khích cho sản xuất).
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
