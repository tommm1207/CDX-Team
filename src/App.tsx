import { useState, useEffect, useCallback, useMemo } from 'react';
import { Settings2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Employee } from '@/types';
import { REMINDER_CHECK_INTERVAL } from '@/constants/options';
import { getMenuGroups } from '@/constants/menu';
import { parseReminderContent } from '@/utils/reminderUtils';
import { registerServiceWorker, subscribeToPush } from '@/lib/webPush';

// Shared Components
import { ToastContainer, ToastMessage, ToastType } from '@/components/shared';

// Layout & Router
import { MainLayout } from '@/layouts/MainLayout';
import { AppRouter } from '@/routes/AppRouter';
import { ContractModule } from '@/components/contracts/ContractModule';
import { ReloadPrompt } from '@/components/shared';
import { ErrorBoundary } from '@/components/shared';

// Auth
import { LoginPage } from '@/components/auth/LoginPage';
import { logAudit } from '@/utils/auditLogger';

export default function App() {
  const [user, setUser] = useState<Employee | null>(() => {
    const saved = localStorage.getItem('cdx_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  const handleLogin = useCallback((u: Employee) => {
    setUser(u);
    localStorage.setItem('cdx_user', JSON.stringify(u));
  }, []);

  const handleLogout = useCallback(async () => {
    if (user) {
      await logAudit(user, {
        module: 'AUTH',
        action: 'LOGOUT',
        description: 'Đăng xuất hệ thống',
      });
    }
    setUser(null);
    localStorage.removeItem('cdx_user');
  }, [user]);

  // Check for missing configuration
  const isConfigMissing =
    !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY;

  const [currentPage, setCurrentPage] = useState('dashboard');
  const [pageParams, setPageParams] = useState<any>(null);
  const [navigationHistory, setNavigationHistory] = useState<string[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [hideBottomNav, setHideBottomNav] = useState(false);

  const addToast = useCallback(
    (message: string, type: ToastType = 'info', title?: string, duration: number = 4000) => {
      const id = Math.random().toString(36).substr(2, 9);
      setToasts((prev) => [...prev, { id, message, type, title }]);
      setTimeout(() => {
        removeToast(id);
      }, duration);
    },
    [],
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const fetchPendingCount = useCallback(async () => {
    if (!user) return;
    try {
      const [si, so, tr, co] = await Promise.all([
        supabase
          .from('stock_in')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'Chờ duyệt'),
        supabase
          .from('stock_out')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'Chờ duyệt'),
        supabase
          .from('transfers')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'Chờ duyệt'),
        supabase
          .from('costs')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'Chờ duyệt'),
      ]);
      setPendingCount((si.count || 0) + (so.count || 0) + (tr.count || 0) + (co.count || 0));
    } catch (err) {
      console.error('Error fetching pending count:', err);
    }
  }, [user]);

  // Notifications disabled as per user request

  // Real-time pending count updates
  useEffect(() => {
    if (!user) return;
    fetchPendingCount();

    const channel = supabase
      .channel('pending-count-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_in' },
        fetchPendingCount,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_out' },
        fetchPendingCount,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transfers' },
        fetchPendingCount,
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'costs' }, fetchPendingCount)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchPendingCount]);

  // Reminders / Notifications
  useEffect(() => {
    if (!user) return;

    // Browser notifications disabled

    const checkReminders = setInterval(async () => {
      const now = new Date().toISOString();
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      try {
        const { data, error } = await supabase
          .from('reminders')
          .select('*, sender:users!created_by(full_name)')
          .neq('status', 'Đã xóa')
          .lte('reminder_time', now)
          .gte('reminder_time', twentyFourHoursAgo);

        if (error) throw error;

        if (data && data.length > 0) {
          let hasNew = false;
          const notifiedRaw = localStorage.getItem('notified_reminders') || '[]';
          const notifiedMap = new Set(JSON.parse(notifiedRaw));

          data.forEach((rem) => {
            const payload = parseReminderContent(rem.content);
            const isParticipant =
              payload.assignees.length === 0 || payload.assignees.includes(user.id);

            if (!isParticipant) return;

            if (!notifiedMap.has(rem.id)) {
              const senderName = (rem as any).sender?.full_name || 'Hệ thống';
              const displayTitle = rem.title;
              const displayMessage = `${payload.text}\n\n**Thông báo từ ${senderName}**`;

              if (rem.browser_notification && Notification.permission === 'granted') {
                try {
                  new Notification(rem.title, {
                    body: `${payload.text}\nThông báo từ ${senderName}`,
                    icon: '/logo.png',
                  });
                } catch (e) {}
              }

              addToast(displayMessage, 'notification', displayTitle, 10000);
              notifiedMap.add(rem.id);
              hasNew = true;
            }
          });

          if (hasNew) {
            localStorage.setItem('notified_reminders', JSON.stringify([...notifiedMap]));
            if (currentPage === 'reminders') setRefreshKey((prev) => prev + 1);
          }
        }
      } catch (err) {}
    }, REMINDER_CHECK_INTERVAL);

    return () => clearInterval(checkReminders);
  }, [user, currentPage]);

  const navigateTo = useCallback(
    (page: string, params: any = null) => {
      if (page !== currentPage || params !== pageParams) {
        setNavigationHistory((prev) => [...prev, currentPage]);
        setCurrentPage(page);
        setPageParams(params);
        // Reset navigation visibility on page change
        setHideBottomNav(false);
      }
    },
    [currentPage, pageParams],
  );

  const goBack = useCallback(() => {
    setHideBottomNav(false);
    if (navigationHistory.length > 0) {
      const prevPage = navigationHistory[navigationHistory.length - 1];
      setNavigationHistory((prev) => prev.slice(0, -1));
      setCurrentPage(prevPage);
    } else {
      setCurrentPage('dashboard');
    }
  }, [navigationHistory]);

  const filteredMenuGroups = useMemo(() => {
    if (!user) return [];
    return getMenuGroups(pendingCount)
      .map((group) => ({
        ...group,
        items: group.items
          .filter((item) => {
            if (item.id === 'audit-logs') {
              return (
                user.code === 'admindev' ||
                ['admin', 'develop'].includes(user.role?.toLowerCase() || '')
              );
            }
            const isAdmin = ['admin', 'develop'].includes(user.role?.toLowerCase() || '');
            if (!isAdmin) {
              return [
                'stock-in',
                'stock-out',
                'transfer',
                'costs',
                'construction-diary',
                'contracts',
                'xasa-gop',
                'bom-lenh-sx',
                'nhap-thanh-pham',
                'attendance',
                'payroll',
                'notes',
                'reminders',
              ].includes(item.id);
            }
            if (user.role?.toLowerCase() === 'admin') return item.id !== 'database-setup';
            return true;
          })
          .map((item) =>
            item.id === 'pending-approvals' ? { ...item, badge: pendingCount } : item,
          ),
      }))
      .filter((group) => group.items.length > 0);
  }, [user, pendingCount]);

  if (isConfigMissing) {
    return (
      <div className="fixed inset-0 bg-white flex flex-col items-center justify-center p-6 text-center z-[999]">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
          <Settings2 size={32} />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Thiếu cấu hình hệ thống</h1>
        <p className="text-sm text-gray-500 max-w-sm mb-6">
          Vui lòng thiết lập <strong>VITE_SUPABASE_URL</strong> và{' '}
          <strong>VITE_SUPABASE_ANON_KEY</strong> trong bảng điều khiển Cloudflare Pages.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/20"
        >
          Thử lại
        </button>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <>
      <MainLayout
        user={user}
        pendingCount={pendingCount}
        currentPage={currentPage}
        refreshKey={refreshKey}
        filteredMenuGroups={filteredMenuGroups}
        onNavigate={navigateTo}
        onLogout={handleLogout}
        onRefresh={() => {
          fetchPendingCount();
          setRefreshKey((prev) => prev + 1);
        }}
        hideBottomNav={hideBottomNav}
      >
        <ErrorBoundary onBack={() => navigateTo('dashboard')}>
          <AppRouter
            currentPage={currentPage}
            pageParams={pageParams}
            user={user}
            pendingCount={pendingCount}
            navigateTo={navigateTo}
            goBack={goBack}
            addToast={addToast}
            fetchPendingCount={fetchPendingCount}
            setHideBottomNav={setHideBottomNav}
          />
        </ErrorBoundary>
      </MainLayout>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <ReloadPrompt currentPage={currentPage} />
    </>
  );
}
