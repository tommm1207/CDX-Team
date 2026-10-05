import { Employee } from '@/types';

/**
 * Quyền xem Nhật ký hệ thống.
 *
 * CHỈ role 'Develop' được xem. Admin KHÔNG được xem.
 * Đây là nguồn chân lý duy nhất cho cả menu, router và trang log —
 * sửa ở đây là sửa cho toàn bộ hệ thống.
 */
export const canViewAuditLogs = (user: Employee | null | undefined): boolean => {
  if (!user) return false;
  return (user.role || '').trim().toLowerCase() === 'develop';
};
