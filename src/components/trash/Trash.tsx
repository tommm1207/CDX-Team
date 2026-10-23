import { motion } from 'motion/react';
import {
  Package,
  Warehouse,
  Archive,
  UserCircle,
  Wallet,
  Layers,
  Factory,
  Banknote,
} from 'lucide-react';
import { PageBreadcrumb } from '@/components/shared';

export const Trash = ({
  user,
  onNavigate,
  onBack,
}: {
  user: any;
  onNavigate: (page: string) => void;
  onBack: () => void;
}) => {
  const trashItems = [
    {
      id: 'deleted-slips',
      label: 'Phiếu nhập xuất đã xóa',
      icon: Archive,
      color: 'bg-blue-50 text-blue-600',
    },
    {
      id: 'deleted-costs',
      label: 'Dữ liệu chi phí đã xóa',
      icon: Wallet,
      color: 'bg-purple-50 text-purple-600',
    },
    {
      id: 'deleted-materials',
      label: 'Danh mục vật tư & nhóm xóa',
      icon: Package,
      color: 'bg-emerald-50 text-emerald-600',
    },
    {
      id: 'deleted-employees',
      label: 'Hồ sơ nhân sự đã xóa',
      icon: UserCircle,
      color: 'bg-rose-50 text-rose-600',
    },
    {
      id: 'deleted-warehouses',
      label: 'Danh sách kho xóa',
      icon: Warehouse,
      color: 'bg-orange-50 text-orange-600',
    },
    {
      id: 'deleted-production',
      label: 'Dữ liệu sản xuất đã xóa',
      icon: Factory,
      color: 'bg-indigo-50 text-indigo-600',
    },
    {
      id: 'deleted-advances',
      label: 'Tạm ứng & phụ cấp đã xóa',
      icon: Banknote,
      color: 'bg-amber-50 text-amber-600',
    },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24">
      <PageBreadcrumb title="Thùng rác" onBack={onBack} />

      <div className="flex flex-wrap gap-6">
        {trashItems.map((item) => (
          <motion.div
            key={item.id}
            whileHover={{ y: -4 }}
            onClick={() => onNavigate(item.id)}
            className="flex-1 min-w-[280px] bg-white p-8 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center gap-4 cursor-pointer group"
          >
            <div
              className={`p-6 rounded-2xl ${item.color} group-hover:scale-110 transition-transform`}
            >
              <item.icon size={40} />
            </div>
            <div className="text-center">
              <h3 className="text-sm font-bold text-gray-800">{item.label}</h3>
              <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider">
                Xem dữ liệu đã xóa
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
