export type PersonKind = "employee" | "collaborator";
export type UserKind = "operator" | PersonKind;

export interface Stmt {
  bind(...values: unknown[]): Stmt;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<unknown>;
}

export interface Db {
  prepare(sql: string): Stmt;
  exec?(sql: string): Promise<unknown>;
}

export interface StoredObject {
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  size: number;
  httpMetadata?: { contentType?: string };
}

export interface Bucket {
  put(
    key: string,
    value: Uint8Array | ArrayBuffer | string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<StoredObject | null>;
}

export interface Env {
  DB: Db;
  FILES: Bucket;
  ENVIRONMENT: string;
  WEB_ORIGIN: string;
  CONSENT_VERSION: string;
  EMAIL_FROM: string;
  SESSION_PEPPER?: string;
  ESIGN_WEBHOOK_SECRET?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  SEED?: string;
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
}

export type Actor = {
  id: string;
  name: string;
  kind: UserKind;
  email: string;
  roles: string[];
  status: string;
};

export type Ctx = {
  db: Db;
  bucket: Bucket;
  env: Env;
  actor: Actor | null;
  ip: string | null;
  ua: string | null;
  now: () => string;
};

export type Upload = {
  bytes: Uint8Array;
  filename: string;
  contentType: string;
};

export type UserRow = {
  id: string;
  kind: UserKind;
  name: string;
  email: string;
  designated_email: string;
  phone: string | null;
  password_hash: string;
  status: string;
  id_number_masked: string | null;
  id_number_hash: string | null;
  identity_status: string;
  settlement_flag: string | null;
  platform_agreed_at: string | null;
  created_at: string;
  disabled_at: string | null;
};

export type ContractRow = {
  id: string;
  person_id: string;
  person_kind: PersonKind;
  template_id: string;
  contract_kind: "labor" | "service";
  title: string;
  body: string;
  status: string;
  provider: string | null;
  provider_contract_id: string | null;
  evidence_no: string | null;
  file_id: string | null;
  silent_confirm_agreed: number;
  silent_confirm_days: number | null;
  designated_email: string;
  created_at: string;
  signed_at: string | null;
  terminated_at: string | null;
  termination_reason: string | null;
};

export type TaskRow = {
  id: string;
  person_id: string;
  person_kind: PersonKind;
  contract_id: string;
  issuer_id: string;
  title: string;
  what_to_do: string;
  what_to_deliver: string;
  how_paid: string;
  when_settles: string;
  amount_cents: number;
  acceptance_due_days: number;
  status: string;
  created_at: string;
};

export type StatementRow = {
  id: string;
  task_id: string;
  person_id: string;
  person_kind: PersonKind;
  statement_kind: "wage_slip" | "service_fee";
  version: number;
  amount_cents: number;
  period_label: string;
  note: string | null;
  file_id: string;
  status: string;
  created_by: string;
  created_at: string;
};
