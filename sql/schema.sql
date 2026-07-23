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
  notification_prefs JSONB NOT NULL DEFAULT '{}'::jsonb,
  ui_prefs JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ui_prefs JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash VARCHAR(64) PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  act_as_company_id BIGINT REFERENCES companies(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  ip VARCHAR(100),
  user_agent VARCHAR(500),
  auth_level VARCHAR(20) NOT NULL DEFAULT 'password'
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS security_rate_limits (
  bucket_key VARCHAR(200) PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL,
  hit_count INT NOT NULL DEFAULT 0,
  blocked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_security_rate_limits_updated ON security_rate_limits(updated_at);

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

-- 核心业务查询索引（列表过滤、工作台聚合、owner 范围）
CREATE INDEX IF NOT EXISTS idx_customers_company_pool_status
  ON customers (company_id, pool_status, status);
CREATE INDEX IF NOT EXISTS idx_customers_owner_pool
  ON customers (owner_id, pool_status);
CREATE INDEX IF NOT EXISTS idx_follow_ups_customer_followed
  ON follow_ups (customer_id, followed_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_company_status_due
  ON tasks (company_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_owner_status
  ON tasks (owner_id, status);
CREATE INDEX IF NOT EXISTS idx_opportunities_company_stage
  ON opportunities (company_id, stage);
CREATE INDEX IF NOT EXISTS idx_opportunities_owner_stage
  ON opportunities (owner_id, stage);

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

-- 商机阶段履历：谁、何时、从哪到哪、为何
CREATE TABLE IF NOT EXISTS opportunity_stage_history (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  opportunity_id BIGINT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  actor_id BIGINT REFERENCES users(id),
  from_stage VARCHAR(32),
  to_stage VARCHAR(32) NOT NULL,
  reason TEXT,
  source VARCHAR(32) NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_opp_stage_history_opp_created
  ON opportunity_stage_history (opportunity_id, created_at DESC);

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
ALTER TABLE audit_logs ALTER COLUMN ip TYPE VARCHAR(100);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS request_id UUID;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS session_prefix VARCHAR(16);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS security_event VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_created
  ON audit_logs (company_id, created_at DESC);

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

-- 报价客户确认分享链接（P2）
CREATE TABLE IF NOT EXISTS quote_shares (
  id BIGSERIAL PRIMARY KEY,
  quote_id BIGINT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  token VARCHAR(64) NOT NULL UNIQUE,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ NOT NULL,
  max_views INT NOT NULL DEFAULT 10,
  view_count INT NOT NULL DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  confirmer_name VARCHAR(100),
  confirmer_note TEXT,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_quote_shares_quote ON quote_shares(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_shares_token ON quote_shares(token);
ALTER TABLE quote_shares ADD COLUMN IF NOT EXISTS token_hash VARCHAR(64);
ALTER TABLE quote_shares ALTER COLUMN token DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_quote_shares_token_hash ON quote_shares(token_hash) WHERE token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quote_shares_active
  ON quote_shares(quote_id, status) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS quote_share_views (
  id BIGSERIAL PRIMARY KEY,
  share_id BIGINT NOT NULL REFERENCES quote_shares(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  duration_ms INT
);

CREATE INDEX IF NOT EXISTS idx_quote_share_views_share
  ON quote_share_views(share_id, viewed_at DESC);

CREATE TABLE IF NOT EXISTS report_exports (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by BIGINT NOT NULL REFERENCES users(id),
  owner_id BIGINT REFERENCES users(id),
  period_type VARCHAR(16) NOT NULL,
  period_key VARCHAR(16) NOT NULL,
  scope VARCHAR(16) NOT NULL,
  file_name VARCHAR(300) NOT NULL,
  -- 新流程不落盘；历史下载按 period/owner 现算。旧数据可能仍有路径
  file_path TEXT NOT NULL DEFAULT '',
  file_size BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_report_exports_company_created
  ON report_exports(company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS voice_speakers (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(100) NOT NULL,
  slot_index SMALLINT NOT NULL,
  sample_uri TEXT,
  sample_mime VARCHAR(100),
  sample_file_name VARCHAR(300),
  sample_size_bytes BIGINT,
  provider_speaker_id VARCHAR(200),
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  error_message TEXT,
  meta JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (company_id, slot_index)
);

CREATE INDEX IF NOT EXISTS idx_voice_speakers_company
  ON voice_speakers (company_id, status);

CREATE TABLE IF NOT EXISTS voice_synth_logs (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT REFERENCES companies(id) ON DELETE SET NULL,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  source VARCHAR(16) NOT NULL,
  voice_speaker_id BIGINT REFERENCES voice_speakers(id) ON DELETE SET NULL,
  official_speaker_id VARCHAR(200),
  speaker_label VARCHAR(200),
  icl_model_type SMALLINT,
  status VARCHAR(16) NOT NULL DEFAULT 'success',
  error_message TEXT,
  text_content TEXT NOT NULL DEFAULT '',
  text_char_count INT NOT NULL DEFAULT 0,
  context_text TEXT,
  duration_sec NUMERIC(10, 2),
  audio_bytes INT,
  saved BOOLEAN NOT NULL DEFAULT FALSE,
  saved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_voice_synth_logs_speaker
  ON voice_synth_logs (voice_speaker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_synth_logs_official
  ON voice_synth_logs (official_speaker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_synth_logs_company
  ON voice_synth_logs (company_id, created_at DESC);

-- Public business identifiers are safe to expose in URLs. Internal bigint IDs remain unchanged.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS public_id VARCHAR(24);
UPDATE customers SET public_id = 'CUS' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)) WHERE public_id IS NULL;
ALTER TABLE customers ALTER COLUMN public_id SET DEFAULT ('CUS' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)));
ALTER TABLE customers ALTER COLUMN public_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_public_id ON customers(public_id);

ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS public_id VARCHAR(24);
UPDATE opportunities SET public_id = 'OPP' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)) WHERE public_id IS NULL;
ALTER TABLE opportunities ALTER COLUMN public_id SET DEFAULT ('OPP' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)));
ALTER TABLE opportunities ALTER COLUMN public_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_opportunities_public_id ON opportunities(public_id);

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS public_id VARCHAR(24);
UPDATE quotes SET public_id = 'QUO' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)) WHERE public_id IS NULL;
ALTER TABLE quotes ALTER COLUMN public_id SET DEFAULT ('QUO' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)));
ALTER TABLE quotes ALTER COLUMN public_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_quotes_public_id ON quotes(public_id);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS public_id VARCHAR(24);
UPDATE tasks SET public_id = 'TSK' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)) WHERE public_id IS NULL;
ALTER TABLE tasks ALTER COLUMN public_id SET DEFAULT ('TSK' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)));
ALTER TABLE tasks ALTER COLUMN public_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_public_id ON tasks(public_id);

ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS public_id VARCHAR(24);
UPDATE media_assets SET public_id = 'MED' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)) WHERE public_id IS NULL;
ALTER TABLE media_assets ALTER COLUMN public_id SET DEFAULT ('MED' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)));
ALTER TABLE media_assets ALTER COLUMN public_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_media_assets_public_id ON media_assets(public_id);

ALTER TABLE kb_files ADD COLUMN IF NOT EXISTS public_id VARCHAR(24);
UPDATE kb_files SET public_id = 'KBF' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)) WHERE public_id IS NULL;
ALTER TABLE kb_files ALTER COLUMN public_id SET DEFAULT ('KBF' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)));
ALTER TABLE kb_files ALTER COLUMN public_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_kb_files_public_id ON kb_files(public_id);

ALTER TABLE report_exports ADD COLUMN IF NOT EXISTS public_id VARCHAR(24);
UPDATE report_exports SET public_id = 'RPT' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)) WHERE public_id IS NULL;
ALTER TABLE report_exports ALTER COLUMN public_id SET DEFAULT ('RPT' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)));
ALTER TABLE report_exports ALTER COLUMN public_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_report_exports_public_id ON report_exports(public_id);
