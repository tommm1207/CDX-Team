import { Package } from 'lucide-react';
import { PageBreadcrumb } from '@/components/shared';
import { LoginPage } from '@/components/auth/LoginPage';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { HRRecords } from '@/components/hr/HRRecords';
import { Attendance } from '@/components/hr/Attendance';
import { Advances } from '@/components/hr/Advances';
import { MonthlySalary } from '@/components/hr/MonthlySalary';
import { SalarySettings } from '@/components/hr/SalarySettings';
import { Costs } from '@/components/finance/Costs';
import { ExpenseSettlements } from '@/components/finance/ExpenseSettlements';
import { CostReport } from '@/components/finance/CostReport';
import { CostFilter } from '@/components/finance/CostFilter';
import { PendingApprovals } from '@/components/finance/PendingApprovals';
import { CostGroups } from '@/components/finance/CostGroups';
import { StockIn } from '@/components/inventory/StockIn';
import { StockOut } from '@/components/inventory/StockOut';
import { Transfer } from '@/components/inventory/Transfer';
import { InventoryReport } from '@/components/inventory/InventoryReport';
import { InventoryDetailReport } from '@/components/inventory/InventoryDetailReport';
import { Warehouses } from '@/components/warehouses/Warehouses';
import { MaterialGroups } from '@/components/materials/MaterialGroups';
import { MaterialCatalog } from '@/components/materials/MaterialCatalog';
import { ConstructionDiaryComponent } from '@/components/production/ConstructionDiary';
import { BomManager } from '@/components/production/BomManager';
import { ProductionOrders } from '@/components/production/ProductionOrders';
import { SanXuatCoc } from '@/components/production/SanXuatCoc';
import { MaterialSplitMerge } from '@/components/production/MaterialSplitMerge';
import { PlaceholderPage } from '@/components/materials/PlaceholderPage';
import { Trash } from '@/components/trash/Trash';
import { DeletedWarehouses } from '@/components/trash/DeletedWarehouses';
import { DeletedMaterials } from '@/components/trash/DeletedMaterials';
import { DeletedSlips } from '@/components/trash/DeletedSlips';
import { DeletedEmployees } from '@/components/trash/DeletedEmployees';
import { DeletedCosts } from '@/components/trash/DeletedCosts';
import { DeletedProduction } from '@/components/trash/DeletedProduction';
import { Notes } from '@/components/notes/Notes';
import { Reminders } from '@/components/reminders/Reminders';
import { Backup } from '@/components/settings/Backup';
import { BackupNow } from '@/components/settings/BackupNow';
import { Notifications } from '@/components/notifications/Notifications';
import { DatabaseSetup } from '@/components/settings/DatabaseSetup';
import { Employee } from '@/types';
import { ErrorBoundary } from '@/components/shared';
import { ContractModule } from '@/components/contracts/ContractModule';
import { ChangePassword } from '@/components/auth/ChangePassword';

interface AppRouterProps {
  currentPage: string;
  pageParams: any;
  user: Employee;
  pendingCount: number;
  navigateTo: (page: string, params?: any) => void;
  goBack: () => void;
  addToast: (message: string, type?: any) => void;
  fetchPendingCount: () => void;
  setHideBottomNav: (hide: boolean) => void;
}

export const AppRouter = ({
  currentPage,
  pageParams,
  user,
  pendingCount,
  navigateTo,
  goBack,
  addToast,
  fetchPendingCount,
  setHideBottomNav,
}: AppRouterProps) => {
  const isAdmin = ['admin', 'develop'].includes(user.role?.toLowerCase() || '');

  switch (currentPage) {
    case 'dashboard':
      return (
        <Dashboard
          user={user}
          onNavigate={navigateTo}
          addToast={addToast}
          pendingApprovals={pendingCount}
        />
      );
    case 'hr-records':
      if (!isAdmin) {
        return (
          <Dashboard
            user={user}
            onNavigate={navigateTo}
            addToast={addToast}
            pendingApprovals={pendingCount}
          />
        );
      }
      return <HRRecords user={user} onBack={goBack} addToast={addToast} />;
    case 'attendance':
      return (
        <Attendance
          user={user}
          onBack={goBack}
          addToast={addToast}
          setHideBottomNav={setHideBottomNav}
        />
      );
    case 'costs':
      return (
        <ErrorBoundary onBack={goBack}>
          <Costs
            user={user}
            onBack={goBack}
            addToast={addToast}
            initialAction={pageParams?.action}
          />
        </ErrorBoundary>
      );
    case 'expense-settlements':
      return <ExpenseSettlements user={user} onBack={goBack} addToast={addToast} />;
    case 'cost-groups':
      if (!isAdmin) {
        return (
          <Dashboard
            user={user}
            onNavigate={navigateTo}
            addToast={addToast}
            pendingApprovals={pendingCount}
          />
        );
      }
      return <CostGroups user={user} onBack={goBack} addToast={addToast} />;
    case 'warehouses':
      return <Warehouses user={user} onBack={goBack} addToast={addToast} />;
    case 'materials':
      return (
        <MaterialCatalog user={user} onBack={goBack} onNavigate={navigateTo} addToast={addToast} />
      );
    case 'stock-in':
      return (
        <StockIn
          user={user}
          onBack={goBack}
          addToast={addToast}
          initialStatus={pageParams?.status}
          initialAction={pageParams?.action}
          setHideBottomNav={setHideBottomNav}
        />
      );
    case 'pending-approvals':
      return (
        <PendingApprovals
          user={user}
          onBack={goBack}
          onNavigate={navigateTo}
          onRefreshCount={fetchPendingCount}
          addToast={addToast}
          initialCount={pendingCount}
        />
      );
    case 'stock-out':
      return (
        <StockOut
          user={user}
          onBack={goBack}
          addToast={addToast}
          initialAction={pageParams?.action}
          setHideBottomNav={setHideBottomNav}
        />
      );
    case 'transfer':
      return (
        <Transfer
          user={user}
          onBack={goBack}
          addToast={addToast}
          initialAction={pageParams?.action}
          setHideBottomNav={setHideBottomNav}
        />
      );
    case 'cost-report':
      if (!isAdmin) {
        return (
          <Dashboard
            user={user}
            onNavigate={navigateTo}
            addToast={addToast}
            pendingApprovals={pendingCount}
          />
        );
      }
      return <CostReport user={user} onBack={goBack} addToast={addToast} />;
    case 'cost-filter':
      return <CostFilter user={user} onBack={goBack} addToast={addToast} />;
    case 'advances':
      return (
        <Advances
          user={user}
          onBack={goBack}
          addToast={addToast}
          initialAction={pageParams?.action}
          setHideBottomNav={setHideBottomNav}
        />
      );
    case 'payroll':
      return (
        <MonthlySalary
          user={user}
          onBack={goBack}
          addToast={addToast}
          setHideBottomNav={setHideBottomNav}
        />
      );
    case 'salary-settings':
      if (!isAdmin) {
        return (
          <Dashboard
            user={user}
            onNavigate={navigateTo}
            addToast={addToast}
            pendingApprovals={pendingCount}
          />
        );
      }
      return <SalarySettings user={user} onBack={goBack} addToast={addToast} />;
    case 'notes':
      return (
        <Notes user={user} onBack={goBack} addToast={addToast} initialAction={pageParams?.action} />
      );
    case 'notifications':
      return (
        <Notifications user={user} onBack={goBack} onNavigate={navigateTo} addToast={addToast} />
      );
    case 'reminders':
      return (
        <Reminders
          user={user}
          onBack={goBack}
          addToast={addToast}
          initialAction={pageParams?.action}
          setHideBottomNav={setHideBottomNav}
        />
      );
    case 'contracts':
      return <ContractModule user={user} addToast={addToast} />;
    case 'partners':
      return <PlaceholderPage title="Khách hàng & nhà cung cấp" onBack={goBack} />;
    case 'inventory-report':
      if (!isAdmin) {
        return (
          <Dashboard
            user={user}
            onNavigate={navigateTo}
            addToast={addToast}
            pendingApprovals={pendingCount}
          />
        );
      }
      return (
        <InventoryReport user={user} onBack={goBack} addToast={addToast} onNavigate={navigateTo} />
      );

    case 'inventory-detail':
      return (
        <InventoryDetailReport
          user={user}
          materialId={pageParams?.materialId}
          warehouseId={pageParams?.warehouseId}
          startDate={pageParams?.startDate}
          endDate={pageParams?.endDate}
          onBack={goBack}
          addToast={addToast}
        />
      );

    case 'construction-diary':
      return (
        <ConstructionDiaryComponent
          user={user}
          onBack={goBack}
          addToast={addToast}
          setHideBottomNav={setHideBottomNav}
        />
      );

    case 'xasa-gop':
      return (
        <ErrorBoundary onBack={goBack}>
          <MaterialSplitMerge user={user} onBack={goBack} addToast={addToast} />
        </ErrorBoundary>
      );

    case 'bom-lenh-sx':
      return (
        <ErrorBoundary onBack={goBack}>
          <BomManager user={user} onBack={goBack} addToast={addToast} />
        </ErrorBoundary>
      );

    case 'lenh-san-xuat':
      return (
        <ErrorBoundary onBack={goBack}>
          <ProductionOrders user={user} onBack={goBack} addToast={addToast} />
        </ErrorBoundary>
      );

    case 'san-xuat-coc':
      return (
        <ErrorBoundary onBack={goBack}>
          <SanXuatCoc user={user} onBack={goBack} addToast={addToast} />
        </ErrorBoundary>
      );

    case 'trash':
      if (!isAdmin) {
        return (
          <Dashboard
            user={user}
            onNavigate={navigateTo}
            addToast={addToast}
            pendingApprovals={pendingCount}
          />
        );
      }
      return <Trash user={user} onNavigate={navigateTo} onBack={goBack} />;
    case 'deleted-warehouses':
      return <DeletedWarehouses user={user} onBack={goBack} addToast={addToast} />;
    case 'deleted-materials':
      return <DeletedMaterials user={user} onBack={goBack} addToast={addToast} />;
    case 'deleted-slips':
      return <DeletedSlips user={user} onBack={goBack} addToast={addToast} />;
    case 'deleted-employees':
      return <DeletedEmployees user={user} onBack={goBack} addToast={addToast} />;
    case 'deleted-costs':
      return <DeletedCosts user={user} onBack={goBack} addToast={addToast} />;
    case 'deleted-production':
      return <DeletedProduction user={user} onBack={goBack} addToast={addToast} />;
    case 'material-groups':
      return <MaterialGroups user={user} onBack={goBack} addToast={addToast} />;
    case 'backup-settings':
      if (user.role !== 'Admin' && user.role !== 'Develop')
        return (
          <Dashboard
            user={user}
            onNavigate={navigateTo}
            addToast={addToast}
            pendingApprovals={pendingCount}
          />
        );
      return <Backup user={user} onBack={goBack} addToast={addToast} />;
    case 'backup-now':
      if (user.role !== 'Admin' && user.role !== 'Develop')
        return (
          <Dashboard
            user={user}
            onNavigate={navigateTo}
            addToast={addToast}
            pendingApprovals={pendingCount}
          />
        );
      return <BackupNow onBack={goBack} addToast={addToast} />;
    case 'database-setup':
      if (user.role !== 'Develop')
        return (
          <Dashboard
            user={user}
            onNavigate={navigateTo}
            addToast={addToast}
            pendingApprovals={pendingCount}
          />
        );
      return <DatabaseSetup onBack={goBack} />;
    case 'change-password':
      return <ChangePassword user={user} onBack={goBack} addToast={addToast} />;
    default:
      return (
        <div className="p-4 md:p-6 space-y-6">
          <PageBreadcrumb title={currentPage} onBack={goBack} />
          <div className="p-12 flex flex-col items-center justify-center text-gray-400 gap-4 bg-white rounded-2xl border border-dashed border-gray-200">
            <div className="p-6 bg-gray-100 rounded-full">
              <Package size={48} />
            </div>
            <p className="text-lg font-medium italic">
              Tính năng "{currentPage}" đang được phát triển...
            </p>
          </div>
        </div>
      );
  }
};
