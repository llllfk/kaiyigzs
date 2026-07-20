-- Sales CRM schema (Coze PostgreSQL)

CREATE TABLE IF NOT EXISTS companies (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT REFERENCES companies(id),
  manager_id BIGINT REFERENCES users(id),
  role VARCHAR(32) NOT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(200) UNIQUE,
  phone VARCHAR(50) NOT NULL,
  password_hash TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMPTZ,
  notification_prefs JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_company_admin
  ON users (company_id)
  WHERE role = 'company_admin' AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_users_phone
  ON users (phone)
  WHERE phone IS NOT NULL AND phone <> '';

-- 账号：邮箱可选、手机号必填（兼容已有库）
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
UPDATE users SET email = NULL WHERE email IS NOT NULL AND btrim(email) = '';
UPDATE users
SET phone = '199' || lpad((id % 100000000)::text, 8, '0')
WHERE phone IS NULL OR btrim(phone) = '';
DO $$
BEGIN
  ALTER TABLE users ALTER COLUMN phone SET NOT NULL;
EXCEPTION
  WHEN others THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  owner_id BIGINT REFERENCES users(id),
  company_name VARCHAR(200),
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(50),
  industry VARCHAR(100),
  scale VARCHAR(50),
  source VARCHAR(100),
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- active跟进中 / paused暂停 / invalid无效
  pool_status VARCHAR(20) NOT NULL DEFAULT 'private',
  claimed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  tags JSONB DEFAULT '[]',
  profile_json JSONB DEFAULT '{}',
  extra JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- migrate existing DBs
ALTER TABLE customers ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_name VARCHAR(200);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS pool_status VARCHAR(20) NOT NULL DEFAULT 'private';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;
-- 旧数据：原 name 多为公司名，回填到客户公司
UPDATE customers
SET company_name = name
WHERE company_name IS NULL OR company_name = '';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_users_phone
  ON users (phone)
  WHERE phone IS NOT NULL AND phone <> '';

CREATE TABLE IF NOT EXISTS contacts (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  title VARCHAR(100),
  phone VARCHAR(50),
  wechat VARCHAR(100),
  email VARCHAR(200),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS opportunities (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  owner_id BIGINT NOT NULL REFERENCES users(id),
  title VARCHAR(200) NOT NULL,
  stage VARCHAR(32) NOT NULL DEFAULT 'lead',
  amount NUMERIC(14, 2),
  expected_close_date DATE,
  stage_suggestion_json JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS follow_ups (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  opportunity_id BIGINT REFERENCES opportunities(id) ON DELETE SET NULL,
  owner_id BIGINT NOT NULL REFERENCES users(id),
  type VARCHAR(50) NOT NULL DEFAULT 'call',
  content TEXT NOT NULL,
  followed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  opportunity_id BIGINT REFERENCES opportunities(id) ON DELETE SET NULL,
  owner_id BIGINT NOT NULL REFERENCES users(id),
  title VARCHAR(300) NOT NULL,
  due_at TIMESTAMPTZ,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  source VARCHAR(20) NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT REFERENCES companies(id),
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(300) NOT NULL,
  body TEXT,
  link VARCHAR(500),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS competitors (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  name VARCHAR(200) NOT NULL,
  summary TEXT,
  strengths TEXT,
  weaknesses TEXT,
  playbook TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS competitor_mentions (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  competitor_id BIGINT REFERENCES competitors(id) ON DELETE SET NULL,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  insight_id BIGINT,
  name VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS media_assets (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  uploader_id BIGINT NOT NULL REFERENCES users(id),
  kind VARCHAR(50) NOT NULL,
  file_name VARCHAR(300) NOT NULL,
  uri TEXT NOT NULL,
  mime VARCHAR(100),
  size_bytes BIGINT,
  duration_ms BIGINT,
  transcript TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'uploaded',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_insights (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  customer_id BIGINT REFERENCES customers(id) ON DELETE CASCADE,
  media_asset_id BIGINT REFERENCES media_assets(id) ON DELETE SET NULL,
  kind VARCHAR(50) NOT NULL,
  result_json JSONB NOT NULL DEFAULT '{}',
  summary TEXT,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS opportunity_reviews (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  opportunity_id BIGINT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  outcome VARCHAR(20) NOT NULL,
  reason_category VARCHAR(100),
  detail TEXT,
  lessons TEXT,
  extra JSONB DEFAULT '{}',
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kb_folders (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  parent_id BIGINT REFERENCES kb_folders(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kb_files (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  folder_id BIGINT NOT NULL REFERENCES kb_folders(id) ON DELETE CASCADE,
  file_name VARCHAR(300) NOT NULL,
  uri TEXT NOT NULL,
  mime VARCHAR(100),
  size_bytes BIGINT,
  uploader_id BIGINT NOT NULL REFERENCES users(id),
  coze_document_id VARCHAR(64),
  coze_dataset_id VARCHAR(64),
  coze_sync_status VARCHAR(20),
  coze_sync_error TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kb_qa_sessions (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  user_id BIGINT NOT NULL REFERENCES users(id),
  title VARCHAR(200),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kb_qa_messages (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES kb_qa_sessions(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  sources_json JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 客户/商机 AI 助手对话
CREATE TABLE IF NOT EXISTS context_chat_sessions (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  user_id BIGINT NOT NULL REFERENCES users(id),
  customer_id BIGINT REFERENCES customers(id) ON DELETE CASCADE,
  opportunity_id BIGINT REFERENCES opportunities(id) ON DELETE CASCADE,
  title VARCHAR(200),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS context_chat_messages (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES context_chat_sessions(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  usage_json JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_context_chat_sessions_scope
  ON context_chat_sessions (company_id, user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_context_chat_messages_session
  ON context_chat_messages (session_id, id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT,
  actor_id BIGINT,
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(50),
  target_id VARCHAR(50),
  summary TEXT,
  ip VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_env (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_tags (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  name VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (company_id, name)
);

-- 商机报价（多版本 + 审批）
CREATE TABLE IF NOT EXISTS quotes (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  opportunity_id BIGINT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  owner_id BIGINT NOT NULL REFERENCES users(id),
  version INT NOT NULL DEFAULT 1,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  title VARCHAR(200),
  currency VARCHAR(8) NOT NULL DEFAULT 'CNY',
  list_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  max_discount_pct NUMERIC(8, 2) NOT NULL DEFAULT 0,
  valid_until DATE,
  note TEXT,
  reject_reason TEXT,
  approver_id BIGINT REFERENCES users(id),
  submitted_at TIMESTAMPTZ,
  decided_at TIMESTAMPTZ,
  parent_quote_id BIGINT REFERENCES quotes(id) ON DELETE SET NULL,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_quotes_company ON quotes(company_id);
CREATE INDEX IF NOT EXISTS idx_quotes_opportunity ON quotes(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(company_id, status);
CREATE INDEX IF NOT EXISTS idx_quotes_approver ON quotes(approver_id, status);

CREATE TABLE IF NOT EXISTS quote_items (
  id BIGSERIAL PRIMARY KEY,
  quote_id BIGINT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  name VARCHAR(300) NOT NULL,
  spec VARCHAR(300),
  qty NUMERIC(14, 4) NOT NULL DEFAULT 1,
  unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  discount_pct NUMERIC(8, 2) NOT NULL DEFAULT 0,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items(quote_id);
