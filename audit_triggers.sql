-- ============================================================
-- AUDIT LOG TRIGGERS - CDX SYSTEM (Fixed table names)
-- Chạy script này trong Supabase > SQL Editor
-- ============================================================

-- 1. Tạo hàm trigger chung
CREATE OR REPLACE FUNCTION fn_auto_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_action TEXT;
  v_record_id TEXT;
  v_description TEXT;
  v_module TEXT;
  v_old_data JSONB;
  v_new_data JSONB;
BEGIN
  v_action := TG_OP;

  v_module := CASE TG_TABLE_NAME
    WHEN 'users'                THEN 'HR'
    WHEN 'contracts'            THEN 'HR'
    WHEN 'attendance'           THEN 'HR'
    WHEN 'salary_settings'      THEN 'HR'
    WHEN 'advances'             THEN 'FINANCE'
    WHEN 'allowances'           THEN 'FINANCE'
    WHEN 'costs'                THEN 'FINANCE'
    WHEN 'cost_groups'          THEN 'FINANCE'
    WHEN 'expense_settlements'  THEN 'FINANCE'
    WHEN 'stock_in'             THEN 'WAREHOUSE'
    WHEN 'stock_out'            THEN 'WAREHOUSE'
    WHEN 'transfers'            THEN 'WAREHOUSE'
    WHEN 'warehouses'           THEN 'WAREHOUSE'
    WHEN 'materials'            THEN 'WAREHOUSE'
    WHEN 'material_groups'      THEN 'WAREHOUSE'
    WHEN 'lenh_san_xuat'        THEN 'PRODUCTION'
    WHEN 'san_pham_bom'         THEN 'PRODUCTION'
    WHEN 'san_pham_bom_chi_tiet' THEN 'PRODUCTION'
    WHEN 'construction_diaries' THEN 'PRODUCTION'
    WHEN 'notes'                THEN 'SYSTEM'
    WHEN 'reminders'            THEN 'SYSTEM'
    ELSE 'SYSTEM'
  END;

  IF TG_OP = 'DELETE' THEN
    v_record_id := OLD.id::TEXT;
    v_old_data := to_jsonb(OLD);
    v_new_data := NULL;
    v_description := 'Xóa bản ghi [' || TG_TABLE_NAME || ']';
  ELSIF TG_OP = 'UPDATE' THEN
    v_record_id := NEW.id::TEXT;
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
    v_description := 'Cập nhật bản ghi [' || TG_TABLE_NAME || ']';
  ELSE
    v_record_id := NEW.id::TEXT;
    v_old_data := NULL;
    v_new_data := to_jsonb(NEW);
    v_description := 'Tạo mới bản ghi [' || TG_TABLE_NAME || ']';
  END IF;

  INSERT INTO audit_logs (
    user_id, user_name, module, action,
    description, record_id, metadata, ip_address
  ) VALUES (
    NULL,
    'DB Trigger',
    v_module,
    v_action,
    v_description,
    v_record_id,
    jsonb_build_object('table', TG_TABLE_NAME, 'old', v_old_data, 'new', v_new_data),
    'DB Internal'
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD;
  ELSE RETURN NEW;
  END IF;
END;
$$;


-- 2. Gắn trigger vào các bảng (chỉ những bảng thực sự tồn tại)

-- HR
CREATE OR REPLACE TRIGGER trg_audit_users
  AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION fn_auto_audit_log();

CREATE OR REPLACE TRIGGER trg_audit_attendance
  AFTER INSERT OR UPDATE OR DELETE ON attendance
  FOR EACH ROW EXECUTE FUNCTION fn_auto_audit_log();

-- FINANCE
CREATE OR REPLACE TRIGGER trg_audit_advances
  AFTER INSERT OR UPDATE OR DELETE ON advances
  FOR EACH ROW EXECUTE FUNCTION fn_auto_audit_log();

CREATE OR REPLACE TRIGGER trg_audit_allowances
  AFTER INSERT OR UPDATE OR DELETE ON allowances
  FOR EACH ROW EXECUTE FUNCTION fn_auto_audit_log();

CREATE OR REPLACE TRIGGER trg_audit_costs
  AFTER INSERT OR UPDATE OR DELETE ON costs
  FOR EACH ROW EXECUTE FUNCTION fn_auto_audit_log();

CREATE OR REPLACE TRIGGER trg_audit_cost_groups
  AFTER INSERT OR UPDATE OR DELETE ON cost_groups
  FOR EACH ROW EXECUTE FUNCTION fn_auto_audit_log();

CREATE OR REPLACE TRIGGER trg_audit_expense_settlements
  AFTER INSERT OR UPDATE OR DELETE ON expense_settlements
  FOR EACH ROW EXECUTE FUNCTION fn_auto_audit_log();

-- WAREHOUSE
CREATE OR REPLACE TRIGGER trg_audit_stock_in
  AFTER INSERT OR UPDATE OR DELETE ON stock_in
  FOR EACH ROW EXECUTE FUNCTION fn_auto_audit_log();

CREATE OR REPLACE TRIGGER trg_audit_stock_out
  AFTER INSERT OR UPDATE OR DELETE ON stock_out
  FOR EACH ROW EXECUTE FUNCTION fn_auto_audit_log();

CREATE OR REPLACE TRIGGER trg_audit_transfers
  AFTER INSERT OR UPDATE OR DELETE ON transfers
  FOR EACH ROW EXECUTE FUNCTION fn_auto_audit_log();

CREATE OR REPLACE TRIGGER trg_audit_warehouses
  AFTER INSERT OR UPDATE OR DELETE ON warehouses
  FOR EACH ROW EXECUTE FUNCTION fn_auto_audit_log();

CREATE OR REPLACE TRIGGER trg_audit_materials
  AFTER INSERT OR UPDATE OR DELETE ON materials
  FOR EACH ROW EXECUTE FUNCTION fn_auto_audit_log();

CREATE OR REPLACE TRIGGER trg_audit_material_groups
  AFTER INSERT OR UPDATE OR DELETE ON material_groups
  FOR EACH ROW EXECUTE FUNCTION fn_auto_audit_log();

-- PRODUCTION
CREATE OR REPLACE TRIGGER trg_audit_lenh_san_xuat
  AFTER INSERT OR UPDATE OR DELETE ON lenh_san_xuat
  FOR EACH ROW EXECUTE FUNCTION fn_auto_audit_log();

CREATE OR REPLACE TRIGGER trg_audit_san_pham_bom
  AFTER INSERT OR UPDATE OR DELETE ON san_pham_bom
  FOR EACH ROW EXECUTE FUNCTION fn_auto_audit_log();

CREATE OR REPLACE TRIGGER trg_audit_construction_diaries
  AFTER INSERT OR UPDATE OR DELETE ON construction_diaries
  FOR EACH ROW EXECUTE FUNCTION fn_auto_audit_log();

-- ============================================================
-- Hoàn tất. Mọi thao tác từ bây giờ sẽ được tự động ghi log.
-- ============================================================
