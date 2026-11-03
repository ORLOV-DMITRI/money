import { SYNCED_TABLES, type MoneyDB, type SyncedTable } from "@/lib/db/db";
import { fromServer, toServer, type ServerRow } from "./mapping";
import type { Remote } from "./remote";

export const CURSOR_KEY = "sync:cursor";
/** Перекрытие при pull: транзакции на сервере могут закоммититься не в порядке synced_at */
export const PULL_OVERLAP_MS = 2 * 60_000;
const UPSERT_CHUNK = 500;
const DELETE_CHUNK = 200;

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Синхронизация local-first:
 *  push — отправить всё из очереди _outbox (upsert существующих строк, мягкое удаление пропавших);
 *  pull — забрать изменённое на сервере после курсора и применить, не трогая строки с неотправленными правками.
 * Конфликты: last-write-wins по строке (кто позже отправил).
 */
export class SyncEngine {
  constructor(
    private db: MoneyDB,
    private remote: Remote,
    private userId: string,
  ) {}

  /** Отправляет очередь. Возвращает число отправленных изменений. */
  async push(): Promise<number> {
    const entries = await this.db._outbox.toArray();
    if (!entries.length) return 0;
    for (const table of SYNCED_TABLES) {
      const es = entries.filter((e) => e.table === table);
      if (!es.length) continue;
      const rows = await this.db.table(table).bulkGet(es.map((e) => e.id));
      const upserts: ServerRow[] = [];
      const deletes: string[] = [];
      es.forEach((e, i) => (rows[i] ? upserts.push(toServer(rows[i], this.userId)) : deletes.push(e.id)));
      for (const part of chunks(upserts, UPSERT_CHUNK)) await this.remote.upsert(table, part);
      for (const part of chunks(deletes, DELETE_CHUNK)) await this.remote.markDeleted(table, part);
      // Подтверждаем только то, что не менялось, пока шла отправка
      await this.db.transaction("rw", this.db._outbox, async () => {
        for (const e of es) {
          const cur = await this.db._outbox.get(e.key);
          if (cur?.rev === e.rev) await this.db._outbox.delete(e.key);
        }
      });
    }
    return entries.length;
  }

  /** Забирает изменения с сервера. Возвращает число применённых строк. */
  async pull(): Promise<number> {
    const cursor = (await this.db.settings.get(CURSOR_KEY))?.value as string | undefined;
    const since = cursor ? new Date(Date.parse(cursor) - PULL_OVERLAP_MS).toISOString() : null;
    const changes = new Map<SyncedTable, ServerRow[]>();
    let max = cursor ? Date.parse(cursor) : 0;
    let maxIso = cursor ?? null;
    for (const table of SYNCED_TABLES) {
      const rows = await this.remote.pullSince(table, since);
      changes.set(table, rows);
      for (const r of rows) {
        const t = r.synced_at ? Date.parse(r.synced_at) : 0;
        if (t > max) {
          max = t;
          maxIso = r.synced_at!;
        }
      }
    }

    let applied = 0;
    await this.db.transaction("rw", [...SYNCED_TABLES.map((t) => this.db.table(t)), this.db._outbox], async () => {
      const dirty = new Set((await this.db._outbox.toCollection().primaryKeys()) as string[]);
      for (const table of SYNCED_TABLES) {
        const puts: Record<string, unknown>[] = [];
        const dels: string[] = [];
        for (const r of changes.get(table) ?? []) {
          if (dirty.has(`${table}:${r.id}`)) continue; // локальная правка ещё не отправлена — она главнее
          if (r.deleted_at) dels.push(r.id);
          else puts.push(fromServer(r));
        }
        if (puts.length) await this.db.table(table).bulkPut(puts);
        if (dels.length) await this.db.table(table).bulkDelete(dels);
        // middleware поставил эти строки в очередь — но это не наши изменения, отправлять их не нужно
        const keys = [...puts.map((p) => `${table}:${p.id}`), ...dels.map((id) => `${table}:${id}`)];
        if (keys.length) await this.db._outbox.bulkDelete(keys);
        applied += keys.length;
      }
    });
    if (maxIso && maxIso !== cursor) await this.db.settings.put({ key: CURSOR_KEY, value: maxIso });
    return applied;
  }

  async sync(): Promise<{ pushed: number; pulled: number }> {
    const pushed = await this.push();
    const pulled = await this.pull();
    return { pushed, pulled };
  }
}
