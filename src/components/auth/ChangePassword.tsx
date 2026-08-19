import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Lock, Save, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Employee } from '@/types';

import { PageBreadcrumb, ToastType } from '@/components/shared';

export const ChangePassword = ({
  user,
  onBack,
  addToast,
}: {
  user: Employee;
  onBack: () => void;
  addToast: (message: string, type?: ToastType) => void;
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      addToast('Mật khẩu mới không khớp!', 'error');
      return;
    }

    setLoading(true);
    try {
      // Xác minh mật khẩu hiện tại
      const { data: userData, error: fetchError } = await supabase
        .from('users')
        .select('app_pass')
        .eq('id', user.id)
        .single();

      if (fetchError || !userData) {
        throw new Error('Không thể tải thông tin người dùng');
      }

      const storedPass = userData.app_pass || '';
      const isMatch = currentPassword.trim() === storedPass.trim();

      if (!isMatch) {
        addToast(`Mật khẩu hiện tại không đúng!`, 'error');
        setLoading(false);
        return;
      }

      // Đổi mật khẩu
      const { error: updateError } = await supabase
        .from('users')
        .update({ app_pass: newPassword })
        .eq('id', user.id);

      if (updateError) throw updateError;

      addToast('Đổi mật khẩu thành công!', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onBack();
    } catch (err: any) {
      addToast('Lỗi: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto pb-24">
      <PageBreadcrumb title="Đổi Mật Khẩu" onBack={onBack} />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden"
      >
        <div className="p-6 border-b border-gray-50 flex items-center gap-3 bg-gray-50/50">
          <div className="p-3 bg-primary/10 rounded-xl text-primary">
            <Lock size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-800">Cập nhật mật khẩu</h3>
            <p className="text-xs text-gray-500 mt-0.5">Bảo vệ tài khoản của bạn</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">
              Mật khẩu hiện tại
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 rounded-xl border border-gray-100 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-sm outline-none font-medium"
              placeholder="Nhập mật khẩu hiện tại..."
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">
              Mật khẩu mới
            </label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 rounded-xl border border-gray-100 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-sm outline-none font-medium"
              placeholder="Nhập mật khẩu mới..."
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">
              Nhập lại mật khẩu mới
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 rounded-xl border border-gray-100 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-sm outline-none font-medium"
              placeholder="Nhập lại mật khẩu mới..."
            />
          </div>

          <div className="pt-4 border-t border-gray-50">
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 shadow-xl shadow-primary/20"
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Save size={18} />
                  <span>Cập nhật mật khẩu</span>
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
