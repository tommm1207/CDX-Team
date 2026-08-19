export type UserRole = 'Develop' | 'Admin' | 'User';

export interface Employee {
  id: string; // Khóa chính (TEXT, e.g., 'admin', 'cdx001')
  code: string; // Mã nhân viên hiển thị (giống id trong schema v2)
  full_name: string;
  email?: string;
  phone?: string;
  id_card?: string;
  dob?: string;
  join_date?: string;
  tax_id?: string;
  app_pass: string; // Mật khẩu ứng dụng
  department?: string;
  position?: string;
  has_salary?: boolean;
  role: UserRole; // Phân quyền
  data_view_permission?: string;
  resign_date?: string;
  initial_budget?: number;
  status: 'Đang làm việc' | 'Hoạt động' | 'Nghỉ việc';
  created_at?: string;
}

export interface Material {
  id: string;
  code: string; // Mã vật tư (ví dụ: MAT001)
  name: string;
  group_id?: string;
  warehouse_id?: string;
  specification?: string;
  unit?: string;
  description?: string;
  image_url?: string;
  status?: string;
  created_at?: string;
}

export interface Warehouse {
  id: string;
  name: string;
  address?: string;
  manager_id?: string;
  coordinates?: string;
  capacity?: string;
  notes?: string;
  status?: string;
  created_at?: string;
}

export interface MaterialGroup {
  id: string;
  code?: string;
  name: string;
  notes?: string;
  status?: string;
  created_at?: string;
}

export interface CostGroup {
  id: string;
  code?: string;
  name: string;
  notes?: string;
  status?: string;
  created_at?: string;
}

export interface CostItem {
  id: string;
  group_id?: string;
  code?: string;
  name: string;
  unit?: string;
  notes?: string;
  status?: string;
  created_at?: string;
}

export interface Cost {
  id: string;
  cost_code: string;
  date: string;
  employee_id: string;
  cost_type: string;
  content?: string;
  material_id?: string;
  warehouse_id?: string;
  cost_group_id?: string;
  cost_item_id?: string;
  quantity?: number;
  unit?: string;
  unit_price?: number;
  total_amount?: number;
  notes?: string;
  settlement_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ExpenseSettlement {
  id: string;
  settlement_code: string;
  title: string;
  employee_id: string;
  date: string;
  previous_balance: number;
  total_advance: number;
  total_cost: number;
  final_balance: number;
  status: string;
  reviewer_id?: string;
  image_url?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface StockIn {
  id: string;
  import_code?: string;
  date: string;
  warehouse_id?: string;
  material_id?: string;
  quantity: number;
  unit?: string;
  unit_price?: number;
  total_amount?: number;
  employee_id?: string;
  status?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface StockOut {
  id: string;
  export_code?: string;
  date: string;
  warehouse_id?: string;
  material_id?: string;
  quantity: number;
  unit?: string;
  unit_price?: number;
  total_amount?: number;
  employee_id?: string;
  status?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Transfer {
  id: string;
  transfer_code?: string;
  date: string;
  from_warehouse_id?: string;
  to_warehouse_id?: string;
  material_id?: string;
  quantity: number;
  unit?: string;
  employee_id?: string;
  status?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AttendanceRecord {
  id: string;
  employee_id: string;
  date: string;
  status: 'present' | 'half-day' | 'absent';
  hours_worked: number;
  overtime_hours: number;
  created_at?: string;
}

export interface Advance {
  id: string;
  employee_id: string;
  date: string;
  amount: number;
  type: string; // 'Tạm ứng' | 'Phụ cấp'
  notes?: string;
  status?: string;
  settlement_id?: string;
  created_at?: string;
}

export interface SalarySetting {
  id: string;
  employee_id: string;
  base_salary: number;
  daily_rate: number;
  insurance_deduction: number;
  created_at?: string;
}

export interface Note {
  id: string;
  employee_id?: string;
  date: string;
  title?: string;
  content: string;
  weather?: string;
  related_object?: string;
  object_code?: string;
  note_code?: string;
  location?: string;
  related_personnel?: string[];
  image_urls?: string[];
  status?: string;
  created_at?: string;
}

export interface Reminder {
  id: string;
  employee_id?: string;
  date: string;
  content: string;
  status?: string;
  created_at?: string;
}

export interface ConstructionDiary {
  id: string;
  diary_code?: string;
  date: string;
  weather?: string;
  temperature?: string;
  labor_info?: string;
  equipment_info?: string;
  work_progress: string;
  quality_issues?: string;
  supervision_comments?: string;
  image_urls?: string[];
  warehouse_id?: string;
  created_by: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
}
