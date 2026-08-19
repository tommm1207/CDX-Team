import {
  Package,
  Settings,
  Warehouse,
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowLeftRight,
  BarChart3,
  CalendarCheck,
  Wallet,
  Banknote,
  UserCircle,
  Settings2,
  Layers,
  Handshake,
  FileText,
  Filter,
  Trash2,
  Download,
  ClipboardCheck,
  Bell,
  BellRing,
  ClipboardList,
  Hammer,
  Shield,
} from 'lucide-react';

export const getMenuGroups = (pendingCount: number) => [
  {
    title: 'QUẢN LÝ TÀI CHÍNH',
    items: [
      { id: 'costs', label: 'Chi phí', icon: Wallet },
      { id: 'expense-settlements', label: 'Phiếu quyết toán', icon: FileText },
      { id: 'cost-groups', label: 'Nhóm chi phí', icon: Layers },
      { id: 'cost-report', label: 'Lệnh Chi phí', icon: FileText },
      { id: 'pending-approvals', label: 'Phiếu duyệt', icon: ClipboardCheck, badge: pendingCount },
      { id: 'cost-filter', label: 'Lọc chi phí', icon: Filter },
    ],
  },
  {
    title: 'QUẢN LÝ KHO',
    items: [
      { id: 'stock-in', label: 'Nhập kho', icon: ArrowDownCircle },
      { id: 'stock-out', label: 'Xuất kho', icon: ArrowUpCircle },
      { id: 'transfer', label: 'Luân chuyển kho', icon: ArrowLeftRight },
      { id: 'inventory-report', label: 'Kiểm tra tồn kho', icon: BarChart3 },
      { id: 'warehouses', label: 'Danh sách kho', icon: Warehouse },
      { id: 'material-groups', label: 'Nhóm vật tư', icon: Layers },
      { id: 'materials', label: 'Danh mục vật tư', icon: Package },
    ],
  },
  {
    title: 'SẢN XUẤT',
    items: [
      { id: 'construction-diary', label: 'Nhật ký thi công', icon: FileText },
      { id: 'xasa-gop', label: 'Rã / Gộp vật tư', icon: Layers },
      { id: 'bom-lenh-sx', label: 'Định mức sản xuất', icon: ClipboardList },
      { id: 'san-xuat-coc', label: 'Lệnh sản xuất cọc', icon: Hammer },
    ],
  },
  {
    title: 'TIỀN LƯƠNG',
    items: [
      { id: 'attendance', label: 'Chấm công', icon: CalendarCheck },
      { id: 'advances', label: 'Tạm ứng & phụ cấp', icon: Banknote },
      { id: 'payroll', label: 'Bảng lương', icon: Wallet },
      { id: 'salary-settings', label: 'Cài đặt lương', icon: Settings2 },
    ],
  },
  {
    title: 'ĐỐI TÁC',
    items: [{ id: 'partners', label: 'Khách hàng & nhà cung cấp', icon: Handshake }],
  },
  {
    title: 'HỆ THỐNG',
    items: [
      { id: 'hr-records', label: 'Hồ sơ nhân sự', icon: UserCircle },
      { id: 'contracts', label: 'Hợp đồng', icon: FileText },
      { id: 'notes', label: 'Note', icon: FileText },
      { id: 'reminders', label: 'Thông báo', icon: Bell },
      { id: 'trash', label: 'Thùng rác', icon: Trash2 },
      { id: 'audit-logs', label: 'Nhật ký hệ thống', icon: Shield, adminOnly: true },
    ],
  },
  {
    title: 'CÔNG CỤ SAO LƯU',
    items: [{ id: 'backup-now', label: 'Sao lưu', icon: Download }],
  },
];
