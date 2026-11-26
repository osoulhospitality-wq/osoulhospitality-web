-- SQLite reference fixture for data-contract and recovery tests.
-- In production, derive identity and tenant from the authenticated server context.
PRAGMA foreign_keys=ON;

CREATE TABLE knowledge_record (
    tenant_id TEXT NOT NULL,
    record_id TEXT NOT NULL,
    version INTEGER NOT NULL CHECK(version > 0),
    site_id TEXT,
    category TEXT NOT NULL,
    source_uri TEXT NOT NULL,
    source_at TEXT NOT NULL,
    purpose TEXT NOT NULL,
    steward_role TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('draft','approved','withdrawn')),
    sensitivity INTEGER NOT NULL CHECK(sensitivity BETWEEN 0 AND 3),
    effective_at TEXT NOT NULL,
    effective_until TEXT,
    review_due TEXT NOT NULL,
    retention_class TEXT NOT NULL,
    disposition_at TEXT,
    hold_ref TEXT,
    approved_by TEXT,
    evidence_ref TEXT,
    checksum TEXT NOT NULL CHECK(length(checksum)=64),
    body TEXT NOT NULL,
    PRIMARY KEY (tenant_id,record_id,version),
    CHECK (status='draft' OR (approved_by IS NOT NULL AND evidence_ref IS NOT NULL)),
    CHECK (effective_until IS NULL OR effective_until > effective_at),
    CHECK (review_due >= effective_at)
);
CREATE INDEX knowledge_active ON knowledge_record(tenant_id,category,site_id,record_id,version DESC);
CREATE TABLE record_role (
    tenant_id TEXT NOT NULL,
    record_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    role TEXT NOT NULL,
    PRIMARY KEY (tenant_id,record_id,version,role),
    FOREIGN KEY (tenant_id,record_id,version) REFERENCES knowledge_record(tenant_id,record_id,version)
);
CREATE TABLE trusted_actor_site (
    actor_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    site_id TEXT NOT NULL,
    role TEXT NOT NULL,
    clearance INTEGER NOT NULL CHECK(clearance BETWEEN 0 AND 3),
    PRIMARY KEY(actor_id,tenant_id,site_id,role)
);

