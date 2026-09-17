import { getDb } from '@/storage/database/db';
import { wecomTemplateCardEvents } from '@/storage/database/shared/schema';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { ensureProjectEnv } from '@/lib/env';

let tableReady = false;

function getDatabaseUrl(): string {
  ensureProjectEnv();
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  return url.replace(/([?&])channel_binding=[^&]*&?/g, '$1').replace(/[?&]$/, '');
}

async function ensureTable(): Promise<void> {
  if (tableReady) return;

  const pool = new Pool({
    connectionString: getDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
    max: 1,
  });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wecom_template_card_events (
        task_id varchar(128) PRIMARY KEY,
        event_key varchar(128) NOT NULL,
        from_user varchar(128) NOT NULL,
        replace_text varchar(64) NOT NULL,
        response_code varchar(256),
        agent_id integer,
        status varchar(32) NOT NULL DEFAULT 'done',
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS wecom_template_card_events_created_at_idx
        ON wecom_template_card_events (created_at);
    `);
    tableReady = true;
  } finally {
    await pool.end();
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '23505'
  );
}

export type ClaimTemplateCardTaskInput = {
  taskId: string;
  eventKey: string;
  fromUser: string;
  replaceText: string;
  responseCode?: string;
  agentId?: number;
};

/**
 * First writer for a TaskId wins. Concurrent/duplicate clicks get "duplicate".
 */
export async function tryClaimTemplateCardTask(
  input: ClaimTemplateCardTaskInput
): Promise<'claimed' | 'duplicate'> {
  await ensureTable();
  const db = getDb();

  try {
    await db.insert(wecomTemplateCardEvents).values({
      task_id: input.taskId,
      event_key: input.eventKey,
      from_user: input.fromUser,
      replace_text: input.replaceText,
      response_code: input.responseCode ?? null,
      agent_id: input.agentId ?? null,
      status: 'processing',
    });
    return 'claimed';
  } catch (err) {
    if (isUniqueViolation(err)) {
      return 'duplicate';
    }
    throw err;
  }
}

export async function markTemplateCardTaskDone(taskId: string): Promise<void> {
  const db = getDb();
  await db
    .update(wecomTemplateCardEvents)
    .set({ status: 'done' })
    .where(eq(wecomTemplateCardEvents.task_id, taskId));
}

/** Allow a later click/retry if WeCom card update failed after claim. */
export async function releaseTemplateCardTask(taskId: string): Promise<void> {
  const db = getDb();
  await db
    .delete(wecomTemplateCardEvents)
    .where(eq(wecomTemplateCardEvents.task_id, taskId));
}
