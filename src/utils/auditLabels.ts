/**
 * Từ điển dịch tên bảng và tên cột sang tiếng Việt,
 * dùng để hiển thị nhật ký cho người đọc thay vì tên kỹ thuật.
 */

export const TABLE_LABELS: Record<string, string> = {
  users: 'Nhân sự',
  attendance: 'Chấm công',
  advances: 'Tạm ứng',
  allowances: 'Phụ cấp',
  salary_settings: 'Cài đặt lương',
  costs: 'Chi phí',
  cost_groups: 'Nhóm chi phí',
  expense_settlements: 'Phiếu quyết toán',
  stock_in: 'Phiếu nhập kho',
  stock_out: 'Phiếu xuất kho',
  transfers: 'Phiếu luân chuyển',
  warehouses: 'Kho',
  materials: 'Vật tư',
  material_groups: 'Nhóm vật tư',
  lenh_san_xuat: 'Lệnh sản xuất',
  san_pham_bom: 'Định mức sản xuất (BOM)',
  construction_diaries: 'Nhật ký thi công',
  contracts: 'Hợp đồng',
  notes: 'Ghi chú',
  reminders: 'Nhắc việc',
  notifications: 'Thông báo',
  partners: 'Đối tác',
};

export const getTableLabel = (table: string): string => TABLE_LABELS[table] || table;

export const FIELD_LABELS: Record<string, string> = {
  // Chung
  name: 'Tên',
  code: 'Mã',
  status: 'Trạng thái',
  note: 'Ghi chú',
  notes: 'Ghi chú',
  description: 'Mô tả',
  quantity: 'Số lượng',
  qty: 'Số lượng',
  price: 'Đơn giá',
  unit_price: 'Đơn giá',
  amount: 'Số tiền',
  total: 'Tổng tiền',
  total_amount: 'Tổng tiền',
  unit: 'Đơn vị tính',
  date: 'Ngày',
  created_at: 'Ngày tạo',
  updated_at: 'Ngày cập nhật',
  is_deleted: 'Đã xóa',
  deleted_at: 'Ngày xóa',

  // Nhân sự
  full_name: 'Họ tên',
  phone: 'Số điện thoại',
  email: 'Email',
  role: 'Phân quyền',
  position: 'Chức vụ',
  app_pass: 'Mật khẩu',
  salary: 'Lương',
  base_salary: 'Lương cơ bản',
  daily_wage: 'Lương ngày',

  // Kho
  warehouse_id: 'Kho',
  from_warehouse_id: 'Kho xuất',
  to_warehouse_id: 'Kho nhận',
  material_id: 'Vật tư',
  supplier: 'Nhà cung cấp',
  slip_no: 'Số phiếu',
  slip_code: 'Số phiếu',

  // Tài chính
  cost_group_id: 'Nhóm chi phí',
  approved_by: 'Người duyệt',
  approved_at: 'Ngày duyệt',
  payment_method: 'Hình thức thanh toán',

  // Sản xuất
  product_id: 'Sản phẩm',
  bom_id: 'Định mức',
  progress: 'Tiến độ',
};

export const getFieldLabel = (field: string): string =>
  FIELD_LABELS[field] || field.replace(/_/g, ' ');

/** Các cột không bao giờ được ghi giá trị vào log (nhạy cảm). */
export const SENSITIVE_FIELDS = new Set(['app_pass', 'password', 'pass', 'token', 'secret']);

/** Các cột kỹ thuật, thay đổi không có ý nghĩa với người đọc log. */
export const NOISE_FIELDS = new Set(['updated_at', 'created_at', 'id']);

export const ACTION_LABELS: Record<string, string> = {
  LOGIN: 'Đăng nhập',
  LOGIN_FAILED: 'Đăng nhập thất bại',
  LOGOUT: 'Đăng xuất',
  CREATE: 'Thêm mới',
  UPDATE: 'Chỉnh sửa',
  DELETE: 'Xóa',
  RESTORE: 'Khôi phục',
  APPROVE: 'Duyệt',
  REJECT: 'Từ chối',
  EXPORT: 'Xuất dữ liệu',
  IMPORT: 'Nhập dữ liệu',
  FAILED: 'Thao tác lỗi',
};

export const getActionLabel = (action: string): string => ACTION_LABELS[action] || action;
