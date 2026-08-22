import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    '[CDX] CRITICAL: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables.',
  );
}

// Prevent crash if URL is missing by providing a placeholder if invalid
export const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : createClient('https://placeholder.supabase.co', 'placeholder');

// Monkey-patch supabase.from to automatically log audit events
const originalFrom = supabase.from.bind(supabase);

const logMutation = async (table: string, action: string, description: string, data?: any) => {
  if (table === 'audit_logs') return; // Prevent infinite loop
  try {
    const userStr = localStorage.getItem('cdx_user');
    if (!userStr) return;
    const user = JSON.parse(userStr);

    // Use dynamic import to avoid circular dependency with auditLogger.ts
    const { logAudit, getModuleFromTable } = await import('@/utils/auditLogger');

    let finalAction = action;
    let finalDesc = description;

    // Auto-detect APPROVE action based on status change
    if (action === 'UPDATE' && data && data.status === 'Đã duyệt') {
      finalAction = 'APPROVE';
      finalDesc = `Duyệt bản ghi [${table}]`;
    }

    await logAudit(user, {
      module: getModuleFromTable(table),
      action: finalAction,
      description: finalDesc,
      metadata: data ? { payload: data } : undefined,
    });
  } catch (e) {
    console.error('Failed to log mutation for table', table, e);
  }
};

supabase.from = (table: string): any => {
  const queryBuilder = originalFrom(table);

  const origInsert = queryBuilder.insert.bind(queryBuilder);
  const origUpdate = queryBuilder.update.bind(queryBuilder);
  const origDelete = queryBuilder.delete.bind(queryBuilder);
  const origUpsert = queryBuilder.upsert.bind(queryBuilder);

  queryBuilder.insert = (values: any, options?: any) => {
    logMutation(table, 'CREATE', `Tạo mới bản ghi [${table}]`, values);
    return origInsert(values, options);
  };

  queryBuilder.update = (values: any, options?: any) => {
    logMutation(table, 'UPDATE', `Cập nhật bản ghi [${table}]`, values);
    return origUpdate(values, options);
  };

  queryBuilder.delete = (options?: any) => {
    logMutation(table, 'DELETE', `Xóa bản ghi [${table}]`);
    return origDelete(options);
  };

  queryBuilder.upsert = (values: any, options?: any) => {
    logMutation(table, 'UPDATE', `Cập nhật/Tạo mới bản ghi [${table}] (Upsert)`, values);
    return origUpsert(values, options);
  };

  return queryBuilder;
};
