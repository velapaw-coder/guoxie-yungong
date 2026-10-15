PRAGMA foreign_keys = ON;

CREATE TABLE enterprise (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  credit_code TEXT NOT NULL,
  address TEXT NOT NULL,
  legal_rep TEXT NOT NULL,
  hr_email TEXT NOT NULL,
  project_email TEXT NOT NULL,
  finance_email TEXT NOT NULL,
  privacy_email TEXT NOT NULL,
  complaint_phone TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('operator', 'employee', 'collaborator')),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  designated_email TEXT NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  id_number_masked TEXT,
  id_number_hash TEXT,
  identity_status TEXT NOT NULL DEFAULT 'none' CHECK (identity_status IN ('none', 'pending', 'verified', 'failed')),
  settlement_flag TEXT CHECK (settlement_flag IN ('settled', 'pending_settlement')),
  platform_agreed_at TEXT,
  created_at TEXT NOT NULL,
  disabled_at TEXT
);

CREATE TRIGGER users_kind_immutable
BEFORE UPDATE OF kind ON users
BEGIN
  SELECT RAISE(ABORT, '人员类型一经确定不可更改');
END;

CREATE TABLE user_roles (
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('admin', 'issuer', 'acceptor', 'payment_maker', 'payment_checker', 'privacy_officer', 'auditor')),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE consents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  document_version TEXT NOT NULL,
  id_number_agreed INTEGER NOT NULL,
  face_agreed INTEGER NOT NULL,
  face_alternative TEXT,
  bank_agreed INTEGER NOT NULL,
  third_party_agreed INTEGER NOT NULL,
  agreed_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT
);

CREATE TABLE identity_verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,
  provider_ref TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('three_factor', 'offline')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'verified', 'failed')),
  created_at TEXT NOT NULL,
  verified_at TEXT
);

CREATE TABLE contract_templates (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('labor', 'service', 'privacy', 'platform')),
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE files (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  uploaded_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE contracts (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES users(id),
  person_kind TEXT NOT NULL CHECK (person_kind IN ('employee', 'collaborator')),
  template_id TEXT NOT NULL REFERENCES contract_templates(id),
  contract_kind TEXT NOT NULL CHECK (contract_kind IN ('labor', 'service')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('signing', 'signed', 'terminated')),
  provider TEXT,
  provider_contract_id TEXT,
  evidence_no TEXT,
  file_id TEXT REFERENCES files(id),
  silent_confirm_agreed INTEGER NOT NULL DEFAULT 0,
  silent_confirm_days INTEGER,
  designated_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  signed_at TEXT,
  terminated_at TEXT,
  termination_reason TEXT
);

CREATE TRIGGER contracts_kind_match
BEFORE INSERT ON contracts
BEGIN
  SELECT CASE
    WHEN (SELECT kind FROM users WHERE id = NEW.person_id) != NEW.person_kind
      THEN RAISE(ABORT, '合同人员类型与账号类型不一致')
    WHEN NEW.person_kind = 'employee' AND NEW.contract_kind != 'labor'
      THEN RAISE(ABORT, '劳动员工只能签署劳动合同')
    WHEN NEW.person_kind = 'collaborator' AND NEW.contract_kind != 'service'
      THEN RAISE(ABORT, '项目合作方只能签署服务协议')
    WHEN NEW.person_kind = 'employee' AND NEW.silent_confirm_agreed != 0
      THEN RAISE(ABORT, '劳动合同不适用沉默视为确认')
    WHEN NEW.silent_confirm_agreed = 1 AND (NEW.silent_confirm_days IS NULL OR NEW.silent_confirm_days < 1)
      THEN RAISE(ABORT, '约定沉默确认时必须写明天数')
  END;
END;

CREATE TRIGGER contracts_kind_immutable
BEFORE UPDATE OF person_kind, contract_kind ON contracts
BEGIN
  SELECT RAISE(ABORT, '合同类型不可更改');
END;

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES users(id),
  person_kind TEXT NOT NULL CHECK (person_kind IN ('employee', 'collaborator')),
  contract_id TEXT NOT NULL REFERENCES contracts(id),
  issuer_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  what_to_do TEXT NOT NULL,
  what_to_deliver TEXT NOT NULL,
  how_paid TEXT NOT NULL,
  when_settles TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  acceptance_due_days INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL CHECK (status IN ('open', 'delivered', 'rejected', 'accepted', 'closed')),
  created_at TEXT NOT NULL
);

CREATE TRIGGER tasks_gates
BEFORE INSERT ON tasks
BEGIN
  SELECT CASE
    WHEN (SELECT kind FROM users WHERE id = NEW.person_id) != NEW.person_kind
      THEN RAISE(ABORT, '人员类型与任务类型不一致')
    WHEN (SELECT status FROM users WHERE id = NEW.person_id) != 'active'
      THEN RAISE(ABORT, '账号已停用')
    WHEN (SELECT identity_status FROM users WHERE id = NEW.person_id) != 'verified'
      THEN RAISE(ABORT, '未完成实名认证，不能发单')
    WHEN NOT EXISTS (
      SELECT 1 FROM consents
      WHERE user_id = NEW.person_id AND id_number_agreed = 1 AND third_party_agreed = 1
    ) THEN RAISE(ABORT, '未完成个人信息单独同意，不能发单')
    WHEN (SELECT status FROM contracts WHERE id = NEW.contract_id) != 'signed'
      THEN RAISE(ABORT, '合同未签署，不能发单')
    WHEN (SELECT person_kind FROM contracts WHERE id = NEW.contract_id) != NEW.person_kind
      THEN RAISE(ABORT, '任务类型与合同类型不一致')
    WHEN (SELECT person_id FROM contracts WHERE id = NEW.contract_id) != NEW.person_id
      THEN RAISE(ABORT, '任务与合同不属于同一人')
  END;
END;

CREATE TABLE deliverables (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  version INTEGER NOT NULL,
  note TEXT NOT NULL,
  file_id TEXT NOT NULL REFERENCES files(id),
  submitted_by TEXT NOT NULL REFERENCES users(id),
  submitted_at TEXT NOT NULL,
  UNIQUE (task_id, version)
);

CREATE TRIGGER deliverables_contract_active
BEFORE INSERT ON deliverables
BEGIN
  SELECT CASE
    WHEN (
      SELECT c.status FROM contracts c
      JOIN tasks t ON t.contract_id = c.id
      WHERE t.id = NEW.task_id
    ) != 'signed'
      THEN RAISE(ABORT, '合同未处于已签署状态，不能提交成果')
  END;
END;

CREATE TABLE acceptances (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  deliverable_id TEXT NOT NULL REFERENCES deliverables(id),
  version INTEGER NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('accepted', 'rejected')),
  reason TEXT,
  reviewer_id TEXT NOT NULL REFERENCES users(id),
  reviewed_at TEXT NOT NULL
);

CREATE TRIGGER acceptances_rules
BEFORE INSERT ON acceptances
BEGIN
  SELECT CASE
    WHEN NEW.reviewer_id = (SELECT issuer_id FROM tasks WHERE id = NEW.task_id)
      THEN RAISE(ABORT, '发单人与验收人不能是同一人')
    WHEN NEW.reviewer_id = (SELECT person_id FROM tasks WHERE id = NEW.task_id)
      THEN RAISE(ABORT, '当事人不能验收自己的成果')
    WHEN NEW.decision = 'rejected' AND (NEW.reason IS NULL OR length(trim(NEW.reason)) = 0)
      THEN RAISE(ABORT, '驳回必须填写原因')
  END;
END;

CREATE TABLE statements (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  person_id TEXT NOT NULL REFERENCES users(id),
  person_kind TEXT NOT NULL CHECK (person_kind IN ('employee', 'collaborator')),
  statement_kind TEXT NOT NULL CHECK (statement_kind IN ('wage_slip', 'service_fee')),
  version INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  period_label TEXT NOT NULL,
  note TEXT,
  file_id TEXT NOT NULL REFERENCES files(id),
  status TEXT NOT NULL CHECK (status IN ('draft', 'sent', 'confirmed', 'objected', 'void')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (task_id, version)
);

CREATE TRIGGER statements_kind_match
BEFORE INSERT ON statements
BEGIN
  SELECT CASE
    WHEN (SELECT status FROM tasks WHERE id = NEW.task_id) != 'accepted'
      THEN RAISE(ABORT, '验收通过后才能上传核算单')
    WHEN (SELECT person_kind FROM tasks WHERE id = NEW.task_id) != NEW.person_kind
      THEN RAISE(ABORT, '核算单类型与任务类型不一致')
    WHEN NEW.person_id != (SELECT person_id FROM tasks WHERE id = NEW.task_id)
      THEN RAISE(ABORT, '核算单与任务不属于同一人')
    WHEN NEW.person_kind = 'employee' AND NEW.statement_kind != 'wage_slip'
      THEN RAISE(ABORT, '劳动员工只能使用工资核算单')
    WHEN NEW.person_kind = 'collaborator' AND NEW.statement_kind != 'service_fee'
      THEN RAISE(ABORT, '项目合作方只能使用服务费核算单')
  END;
END;

CREATE TRIGGER statements_kind_immutable
BEFORE UPDATE OF person_kind, statement_kind ON statements
BEGIN
  SELECT RAISE(ABORT, '核算单类型不可更改');
END;

CREATE TABLE email_messages (
  id TEXT PRIMARY KEY,
  statement_id TEXT REFERENCES statements(id),
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  message_id TEXT NOT NULL,
  attachment_file_id TEXT,
  attachment_sha256 TEXT,
  status TEXT NOT NULL,
  sent_at TEXT,
  provider TEXT NOT NULL
);

CREATE TABLE email_confirmations (
  id TEXT PRIMARY KEY,
  statement_id TEXT NOT NULL REFERENCES statements(id),
  version INTEGER NOT NULL,
  recipient_email TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  message_id TEXT NOT NULL,
  attachment_sha256 TEXT NOT NULL,
  confirm_method TEXT CHECK (confirm_method IN ('email_reply', 'platform_click', 'silence')),
  confirmed_at TEXT,
  receipt_text TEXT,
  ip TEXT,
  user_agent TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent', 'confirmed', 'objected', 'void')),
  token_hash TEXT,
  silence_allowed INTEGER NOT NULL DEFAULT 0,
  silence_deadline_at TEXT,
  objection_text TEXT,
  reminder_sent_at TEXT
);

CREATE TRIGGER email_silence_only_if_agreed
BEFORE UPDATE ON email_confirmations
WHEN NEW.confirm_method = 'silence'
BEGIN
  SELECT CASE
    WHEN OLD.silence_allowed != 1
      THEN RAISE(ABORT, '未事先约定，沉默不构成确认')
    WHEN (SELECT person_kind FROM statements WHERE id = NEW.statement_id) != 'collaborator'
      THEN RAISE(ABORT, '劳动员工的工资核算单不适用沉默确认')
  END;
END;

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  statement_id TEXT NOT NULL REFERENCES statements(id),
  person_id TEXT NOT NULL,
  person_kind TEXT NOT NULL CHECK (person_kind IN ('employee', 'collaborator')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  paid_on TEXT NOT NULL,
  reference_no TEXT NOT NULL,
  voucher_file_id TEXT REFERENCES files(id),
  maker_id TEXT NOT NULL REFERENCES users(id),
  checker_id TEXT REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('pending_check', 'approved', 'rejected')),
  settlement_flag TEXT CHECK (settlement_flag IN ('recorded', 'settled', 'pending_settlement')),
  maker_at TEXT NOT NULL,
  checker_at TEXT,
  checker_note TEXT
);

CREATE TRIGGER payments_rules
BEFORE INSERT ON payments
BEGIN
  SELECT CASE
    WHEN (SELECT status FROM statements WHERE id = NEW.statement_id) != 'confirmed'
      THEN RAISE(ABORT, '核算单尚未确认，不能登记付款')
    WHEN (SELECT amount_cents FROM statements WHERE id = NEW.statement_id) != NEW.amount_cents
      THEN RAISE(ABORT, '登记金额必须与已确认核算单一致')
    WHEN (SELECT person_id FROM statements WHERE id = NEW.statement_id) != NEW.person_id
      THEN RAISE(ABORT, '付款登记与核算单不属于同一人')
    WHEN (SELECT person_kind FROM statements WHERE id = NEW.statement_id) != NEW.person_kind
      THEN RAISE(ABORT, '付款登记类型与核算单类型不一致')
    WHEN NEW.checker_id IS NOT NULL AND NEW.checker_id = NEW.maker_id
      THEN RAISE(ABORT, '复核人与制单人不能是同一人')
  END;
END;

CREATE TRIGGER payments_maker_immutable
BEFORE UPDATE OF maker_id ON payments
BEGIN
  SELECT RAISE(ABORT, '制单人不可更改');
END;

CREATE TRIGGER payments_checker_diff
BEFORE UPDATE ON payments
WHEN NEW.checker_id IS NOT NULL AND NEW.checker_id = NEW.maker_id
BEGIN
  SELECT RAISE(ABORT, '复核人与制单人不能是同一人');
END;

CREATE TABLE requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('access', 'correction', 'deletion', 'complaint')),
  content TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('submitted', 'accepted', 'done', 'rejected')),
  handler_id TEXT,
  resolution TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  actor_name TEXT,
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);

CREATE TRIGGER audit_logs_no_update
BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, '审计日志只允许追加');
END;

CREATE TRIGGER audit_logs_no_delete
BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, '审计日志只允许追加');
END;

CREATE TABLE backups (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT,
  note TEXT
);

CREATE INDEX idx_contracts_person ON contracts(person_id, status);
CREATE INDEX idx_tasks_person ON tasks(person_id, person_kind);
CREATE INDEX idx_statements_person ON statements(person_id, statement_kind);
CREATE INDEX idx_audit_time ON audit_logs(created_at);
CREATE INDEX idx_email_token ON email_confirmations(token_hash);
CREATE INDEX idx_email_silence ON email_confirmations(status, silence_deadline_at);
