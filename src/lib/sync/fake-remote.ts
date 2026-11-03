import type { SyncedTable } from "@/lib/db/db";
import type { ServerRow } from "./mapping";
import type { Remote } from "./remote";

/** Сервер в памяти для тестов: ведёт себя как Postgres-схема (PK user_id+id, synced_at, мягкое удаление). */
export class FakeRemote implements Remote {
  rows = new Map<string, Map<string, ServerRow>>();
  private clock = Date.parse("2026-11-03T00:00:00Z");
  /** перехватчик для имитации сбоев/гонок */
  beforeUpsert?: (table: SyncedTable, rows: ServerRow[]) => Promise<void> | void;

  private tick() {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }
  table(t: SyncedTable) {
    if (!this.rows.has(t)) this.rows.set(t, new Map());
    return this.rows.get(t)!;
  }
  async upsert(table: SyncedTable, rows: ServerRow[]) {
    await this.beforeUpsert?.(table, rows);
    for (const r of rows) this.table(table).set(`${r.user_id}:${r.id}`, { ...structuredClone(r), synced_at: this.tick() });
  }
  async markDeleted(table: SyncedTable, ids: string[]) {
    for (const [k, r] of this.table(table)) if (ids.includes(r.id)) this.table(table).set(k, { ...r, deleted_at: this.tick(), synced_at: this.tick() });
  }
  async pullSince(table: SyncedTable, since: string | null) {
    return [...this.table(table).values()].filter((r) => !since || r.synced_at! > since).map((r) => structuredClone(r));
  }
  live(table: SyncedTable) {
    return [...this.table(table).values()].filter((r) => !r.deleted_at);
  }
}
