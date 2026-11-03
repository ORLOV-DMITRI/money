import type { SupabaseClient } from "@supabase/supabase-js";
import type { SyncedTable } from "@/lib/db/db";
import { SERVER_TABLE, type ServerRow } from "./mapping";

/** То, что движку синхронизации нужно от сервера. Реальная реализация — Supabase, в тестах — в памяти. */
export interface Remote {
  upsert(table: SyncedTable, rows: ServerRow[]): Promise<void>;
  markDeleted(table: SyncedTable, ids: string[]): Promise<void>;
  /** Все строки (включая мягко удалённые), изменённые после since; since = null — все */
  pullSince(table: SyncedTable, since: string | null): Promise<ServerRow[]>;
}

const PAGE = 1000;

export class SupabaseRemote implements Remote {
  constructor(
    private sb: SupabaseClient,
    private userId: string,
  ) {}

  async upsert(table: SyncedTable, rows: ServerRow[]) {
    const { error } = await this.sb.from(SERVER_TABLE[table]).upsert(rows, { onConflict: "user_id,id" });
    if (error) throw new Error(`${table}: ${error.message}`);
  }

  async markDeleted(table: SyncedTable, ids: string[]) {
    const { error } = await this.sb
      .from(SERVER_TABLE[table])
      .update({ deleted_at: new Date().toISOString() })
      .eq("user_id", this.userId)
      .in("id", ids);
    if (error) throw new Error(`${table}: ${error.message}`);
  }

  async pullSince(table: SyncedTable, since: string | null) {
    const out: ServerRow[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = this.sb.from(SERVER_TABLE[table]).select("*").eq("user_id", this.userId);
      if (since) q = q.gt("synced_at", since);
      const { data, error } = await q.order("synced_at").order("id").range(from, from + PAGE - 1);
      if (error) throw new Error(`${table}: ${error.message}`);
      out.push(...((data ?? []) as ServerRow[]));
      if (!data || data.length < PAGE) break;
    }
    return out;
  }
}
