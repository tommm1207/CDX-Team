// CDX Unified UI System - Refined with Premium Red Theme
import React, { useState } from 'react';
import {
  Home,
  RefreshCw,
  Search,
  ChevronDown,
  User as UserIcon,
  LogOut,
  UserCircle,
  Lock,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SidebarItem } from '@/components/layout/SidebarItem';
import { BottomNav } from '@/components/layout/BottomNav';
import { GlobalSearch } from '@/components/shared';
import { Employee } from '@/types';

interface MainLayoutProps {
  user: Employee;
  pendingCount: number;
  currentPage: string;
  refreshKey: number;
  filteredMenuGroups: any[];
  onNavigate: (page: string, params?: any) => void;
  onLogout: () => void;
  onRefresh: () => void;
  children: React.ReactNode;
  hideBottomNav?: boolean;
}

const LOGO_URL = '/logo.png';

export const MainLayout = ({
  user,
  pendingCount,
  currentPage,
  refreshKey,
  filteredMenuGroups,
  onNavigate,
  onLogout,
  onRefresh,
  children,
  hideBottomNav = false,
}: MainLayoutProps) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 1024);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  return (
    <div className="h-screen print:h-auto print:overflow-visible bg-slate-50/50 flex flex-col font-sans overflow-hidden selection:bg-primary/20 selection:text-primary-dark">
      <header className="bg-primary/95 backdrop-blur-md text-white flex items-center justify-between px-4 sticky top-0 z-[100] shadow-sm border-b border-white/10 h-[calc(3.5rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] flex-shrink-0 transition-colors duration-300">
        <div className="flex items-center gap-2">
          <div className="relative group/logo">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="flex items-center gap-2 hover:bg-white/10 p-1.5 rounded-xl transition-all active:scale-95 relative z-10"
            >
              <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center p-1 shadow-sm">
                <img src={LOGO_URL} alt="Logo" className="w-full h-full object-contain" />
              </div>
              <h1 className="font-bold text-sm tracking-wide hidden sm:block">QUẢN LÝ KHO CDX</h1>
            </button>

            {/* Menu Hint - Subtle Pulsating Dot & Text label */}
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute -top-1 -right-6 z-20 pointer-events-none flex items-center gap-1"
            >
              <div className="relative flex items-center justify-center">
                <div className="absolute inset-0 bg-amber-400 rounded-full animate-ping opacity-75" />
                <div className="relative w-2 h-2 bg-amber-400 rounded-full border border-primary shadow-sm" />
              </div>
              <motion.span
                animate={{ opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                className="text-[6px] font-black text-amber-400 uppercase tracking-tight"
              >
                menu
              </motion.span>
            </motion.div>
          </div>

          <div className="h-6 w-px bg-white/20 mx-1 hidden sm:block" />

          <button
            onClick={() => onNavigate('dashboard')}
            className="hover:bg-white/10 p-2 rounded-xl transition-colors flex items-center gap-2 group"
            title="Về trang chủ"
          >
            <Home size={20} className="group-hover:scale-110 transition-transform" />
          </button>

          <button
            onClick={onRefresh}
            className="hover:bg-white/10 p-2 rounded-xl transition-colors flex items-center gap-2 group"
            title="Tải lại dữ liệu"
          >
            <RefreshCw
              size={20}
              className="group-hover:rotate-180 transition-transform duration-500"
            />
          </button>

          <button
            onClick={() => setIsSearchOpen(true)}
            className="hover:bg-white/10 p-2 rounded-xl transition-colors flex items-center gap-2 group"
            title="Tìm kiếm toàn cục"
          >
            <Search size={20} className="group-hover:scale-110 transition-transform" />
          </button>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 relative">
          <div
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-2 bg-white/10 px-2 sm:px-3 py-1 rounded-full border border-white/20 cursor-pointer hover:bg-white/20 transition-colors"
          >
            <div className="flex flex-col items-start leading-none">
              <span className="text-[10px] sm:text-xs font-semibold truncate max-w-[80px] sm:max-w-none">
                {user.full_name}
              </span>
              <span className="text-[8px] opacity-70 hidden xs:block">{user.role}</span>
            </div>
            <ChevronDown
              size={14}
              className={`transition-transform duration-200 ${isUserMenuOpen ? 'rotate-180' : ''}`}
            />
          </div>

          <AnimatePresence>
            {isUserMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIsUserMenuOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-[70] text-gray-800"
                >
                  <div className="p-4 border-b border-gray-50 bg-gray-50/50">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                      Tài khoản
                    </p>
                    <p className="text-sm font-bold text-gray-800">{user.full_name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-500">
                        {user.code || user.id.slice(0, 8)}
                      </span>
                      <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider">
                        {user.role}
                      </span>
                    </div>
                  </div>
                  <div className="p-2">
                    <button
                      onClick={() => {
                        onNavigate('hr-records');
                        setIsUserMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm hover:bg-gray-50 transition-colors"
                    >
                      <UserCircle size={18} className="text-gray-400" />
                      <span>Hồ sơ cá nhân</span>
                    </button>
                    <button
                      onClick={() => {
                        onNavigate('change-password');
                        setIsUserMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm hover:bg-gray-50 transition-colors"
                    >
                      <Lock size={18} className="text-gray-400" />
                      <span>Đổi mật khẩu</span>
                    </button>
                    <div className="h-px bg-gray-100 my-2 mx-2" />
                    <button
                      onClick={onLogout}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut size={18} />
                      <span className="font-bold">Đăng xuất</span>
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden print:overflow-visible relative">
        <AnimatePresence>
          {isSidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-x-0 bottom-0 bg-black/20 backdrop-blur-sm z-[80] lg:hidden"
              style={{ top: 'calc(3.5rem + env(safe-area-inset-top))' }}
            />
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {isSidebarOpen && (
            <motion.aside
              initial={{ x: -280, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -280, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="bg-white/90 backdrop-blur-xl border-r border-gray-200/60 overflow-y-auto flex-shrink-0 z-[90] lg:z-30 fixed lg:relative lg:top-0 h-[calc(100vh-3.5rem-env(safe-area-inset-top))] lg:h-[calc(100vh-3.5rem)] w-[320px] shadow-[4px_0_24px_rgba(0,0,0,0.02)] lg:shadow-none custom-scrollbar"
              style={{
                top:
                  window.innerWidth < 1024 ? 'calc(3.5rem + env(safe-area-inset-top))' : undefined,
              }}
            >
              <div className="p-4 space-y-6 pb-24 lg:pb-4">
                <div className="flex items-center justify-between px-2">
                  <h2 className="text-xs font-bold text-gray-400 tracking-widest uppercase">
                    Menu
                  </h2>
                </div>

                <div className="space-y-6">
                  <SidebarItem
                    icon={Home}
                    label="Trang chủ"
                    active={currentPage === 'dashboard'}
                    onClick={() => {
                      onNavigate('dashboard');
                      if (window.innerWidth < 1024) setIsSidebarOpen(false);
                    }}
                  />

                  {filteredMenuGroups.map((group, idx) => (
                    <div key={idx} className="space-y-1">
                      <p className="text-[10px] font-bold text-gray-300 px-4 mb-2 tracking-wider">
                        {group.title}
                      </p>
                      {group.items.map((item: any) => (
                        <SidebarItem
                          key={item.id}
                          icon={item.icon}
                          label={item.label}
                          active={currentPage === item.id}
                          badge={item.badge}
                          onClick={() => {
                            onNavigate(item.id);
                            if (window.innerWidth < 1024) setIsSidebarOpen(false);
                          }}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        <main
          key={refreshKey}
          className="flex-1 overflow-y-auto overflow-x-hidden print:overflow-visible relative bg-transparent pb-24 lg:pb-0"
        >
          {children}

          <footer className="p-4 text-center text-[10px] text-gray-400 border-t border-gray-100 mt-auto">
            HỆ THỐNG QUẢN LÝ CÔNG TY CON ĐƯỜNG XANH © since 2026
          </footer>
        </main>
      </div>
      <BottomNav
        currentPage={currentPage}
        onNavigate={onNavigate}
        user={user}
        pendingCount={pendingCount}
        isHidden={hideBottomNav}
      />
      <GlobalSearch
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onNavigate={onNavigate}
      />
    </div>
  );
};
