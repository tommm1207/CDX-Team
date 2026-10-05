-- ============================================================================
-- Nâng cấp bảng audit_logs: chi tiết hơn + CHỈ role 'Develop' được xem
-- Chạy được nhiều lần, không làm mất dữ liệu cũ.
-- ============================================================================

-- 1. Bổ sung các cột mới ------------------------------------------------------
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_code    TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_role    TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS status       TEXT DEFAULT 'SUCCESS';
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS target_table TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS target_label TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS changes      JSONB;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS session_id   TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address   TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS location     TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS device       TEXT;

-- user_id phải cho phép NULL (ghi log đăng nhập thất bại khi chưa biết user)
ALTER TABLE audit_logs ALTER COLUMN user_id DROP NOT NULL;

-- 2. Chỉ mục phục vụ lọc ------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at   ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id      ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_name    ON audit_logs (user_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module       ON audit_logs (module);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action       ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status       ON audit_logs (status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_table ON audit_logs (target_table);
CREATE INDEX IF NOT EXISTS idx_audit_logs_session      ON audit_logs (session_id);

-- 3. Chống sửa / xóa nhật ký ---------------------------------------------------
-- Nhật ký chỉ được thêm mới. Không ai được sửa hay xóa, kể cả Develop.
CREATE OR REPLACE FUNCTION audit_logs_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Nhat ky he thong khong duoc phep sua hoac xoa';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_no_update ON audit_logs;
CREATE TRIGGER trg_audit_logs_no_update
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();

-- 4. Khóa hoàn toàn quyền đọc trực tiếp ---------------------------------------
-- Bật RLS và CHỈ cho phép INSERT. Không có policy SELECT nào,
-- nên mọi truy vấn `select` bằng anon key đều trả về rỗng — kể cả Admin.
-- Cách duy nhất đọc được log là qua hàm get_audit_logs() ở mục 5.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Xóa TẤT CẢ policy SELECT hiện có, bất kể tên là gì.
-- Đây là bước quan trọng nhất: chỉ cần sót một policy SELECT
-- là Admin vẫn đọc được log bằng anon key.
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'audit_logs' AND schemaname = 'public'
      AND cmd IN ('SELECT', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON audit_logs', p.policyname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "audit_logs_insert_all" ON audit_logs;

-- Ai cũng ghi được log (ứng dụng dùng anon key)
CREATE POLICY "audit_logs_insert_all"
  ON audit_logs FOR INSERT
  WITH CHECK (true);

-- 5. Hàm đọc log: tự kiểm tra role Develop ------------------------------------
-- SECURITY DEFINER cho phép hàm vượt RLS, nhưng chỉ sau khi đã tự xác thực
-- mã nhân viên + mật khẩu và xác nhận role = 'Develop'.
-- Admin gọi hàm này cũng bị từ chối.
DROP FUNCTION IF EXISTS get_audit_logs(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT, INT);

CREATE OR REPLACE FUNCTION get_audit_logs(
  p_actor_code   TEXT,
  p_actor_pass   TEXT,
  p_search       TEXT DEFAULT NULL,
  p_module       TEXT DEFAULT NULL,
  p_action       TEXT DEFAULT NULL,
  p_status       TEXT DEFAULT NULL,
  p_user_name    TEXT DEFAULT NULL,
  p_from         TEXT DEFAULT NULL,
  p_to           TEXT DEFAULT NULL,
  p_limit        INT  DEFAULT 100,
  p_offset       INT  DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  created_at TIMESTAMPTZ,
  user_id UUID,
  user_name TEXT,
  user_code TEXT,
  user_role TEXT,
  module TEXT,
  action TEXT,
  status TEXT,
  description TEXT,
  target_table TEXT,
  target_label TEXT,
  record_id TEXT,
  changes JSONB,
  session_id TEXT,
  metadata JSONB,
  ip_address TEXT,
  location TEXT,
  device TEXT,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Xác thực: mã nhân viên + mật khẩu phải khớp, và role phải là Develop
  SELECT u.role INTO v_role
  FROM users u
  WHERE lower(u.code) = lower(p_actor_code)
    AND u.app_pass = p_actor_pass
  LIMIT 1;

  IF v_role IS NULL OR lower(v_role) <> 'develop' THEN
    RAISE EXCEPTION 'Khong co quyen xem nhat ky he thong';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT l.*
    FROM audit_logs l
    WHERE (p_module    IS NULL OR p_module    = '' OR l.module = p_module)
      AND (p_action    IS NULL OR p_action    = '' OR l.action = p_action)
      AND (p_status    IS NULL OR p_status    = '' OR l.status = p_status)
      AND (p_user_name IS NULL OR p_user_name = '' OR l.user_name = p_user_name)
      AND (p_from      IS NULL OR p_from      = '' OR l.created_at >= p_from::timestamptz)
      AND (p_to        IS NULL OR p_to        = '' OR l.created_at <= p_to::timestamptz)
      AND (
        p_search IS NULL OR p_search = ''
        OR l.description  ILIKE '%' || p_search || '%'
        OR l.user_name    ILIKE '%' || p_search || '%'
        OR l.location     ILIKE '%' || p_search || '%'
        OR l.device       ILIKE '%' || p_search || '%'
        OR l.target_label ILIKE '%' || p_search || '%'
        OR l.ip_address   ILIKE '%' || p_search || '%'
      )
  ),
  counted AS (SELECT count(*) AS c FROM filtered)
  SELECT
    f.id, f.created_at, f.user_id, f.user_name, f.user_code, f.user_role,
    f.module, f.action, f.status, f.description, f.target_table, f.target_label,
    f.record_id, f.changes, f.session_id, f.metadata,
    f.ip_address, f.location, f.device,
    counted.c
  FROM filtered f, counted
  ORDER BY f.created_at DESC
  LIMIT  greatest(1, least(coalesce(p_limit, 100), 1000))
  OFFSET greatest(0, coalesce(p_offset, 0));
END;
$$;

GRANT EXECUTE ON FUNCTION get_audit_logs(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT, INT
) TO anon, authenticated;

-- 6. Hàm lấy danh sách người dùng có trong log (phục vụ bộ lọc) ---------------
DROP FUNCTION IF EXISTS get_audit_actors(TEXT, TEXT);

CREATE OR REPLACE FUNCTION get_audit_actors(p_actor_code TEXT, p_actor_pass TEXT)
RETURNS TABLE (user_name TEXT, log_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT u.role INTO v_role
  FROM users u
  WHERE lower(u.code) = lower(p_actor_code)
    AND u.app_pass = p_actor_pass
  LIMIT 1;

  IF v_role IS NULL OR lower(v_role) <> 'develop' THEN
    RAISE EXCEPTION 'Khong co quyen xem nhat ky he thong';
  END IF;

  RETURN QUERY
  SELECT l.user_name, count(*) AS log_count
  FROM audit_logs l
  WHERE l.user_name IS NOT NULL
  GROUP BY l.user_name
  ORDER BY count(*) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_audit_actors(TEXT, TEXT) TO anon, authenticated;
