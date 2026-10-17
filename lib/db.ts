import { neon } from '@neondatabase/serverless';
import type { Doc } from './types';
import { defaultDoc, normalizeDoc } from './setlist';
import { siteConfig } from '@/site.config';

// Single-row store: the whole { lists, currentId } document lives in one JSONB cell.
// Table is namespaced so it can safely share a Neon database with other apps.
const ROW_ID = 'main';

// Identifiers can't be bound as query parameters, so the configured name is validated
// and spliced in. Set it in site.config.ts.
const TABLE = siteConfig.table;
if (!/^[a-z_][a-z0-9_]*$/i.test(TABLE)) throw new Error(`invalid table name: ${TABLE}`);

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return neon(url);
}

async function ensureTable() {
  const sql = db();
  await sql(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id text PRIMARY KEY,
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export async function getDoc(): Promise<Doc> {
  await ensureTable();
  const sql = db();
  const rows = (await sql(`SELECT data FROM ${TABLE} WHERE id = $1`, [ROW_ID])) as { data: Doc }[];
  // normalizeDoc backfills slugs on rows written before slugs existed.
  if (rows.length) return normalizeDoc(rows[0].data);

  // Seed on first read.
  const doc = defaultDoc();
  await sql(
    `INSERT INTO ${TABLE} (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO NOTHING`,
    [ROW_ID, JSON.stringify(doc)],
  );
  return doc;
}

export async function saveDoc(input: Doc): Promise<void> {
  const doc = normalizeDoc(input);
  await ensureTable();
  const sql = db();
  await sql(
    `INSERT INTO ${TABLE} (id, data, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [ROW_ID, JSON.stringify(doc)],
  );
}
