export const createRecordsTable = `
  CREATE TABLE IF NOT EXISTS records (
    kind TEXT NOT NULL,
    record_key TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (kind, record_key)
  )
`;

export const createRecordsKindIndex = "CREATE INDEX IF NOT EXISTS records_kind_idx ON records (kind)";
