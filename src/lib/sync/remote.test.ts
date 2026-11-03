import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SupabaseRemote } from "./remote";

const USER = "aaaaaaaa-0000-4000-8000-000000000001";

/** Записывает HTTP-запросы supabase-js и отвечает заготовками — проверяем, что уходит на PostgREST */
function recorder(responses: unknown[][] = []) {
  const calls: { method: string; url: URL; body: unknown; headers: Headers }[] = [];
  const fetchMock = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    calls.push({ method: init?.method ?? "GET", url, body: init?.body ? JSON.parse(String(init.body)) : undefined, headers: new Headers(init?.headers) });
    const data = responses.shift() ?? [];
    return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
  };
  const sb = createClient("https://example.supabase.co", "sb_publishable_test", { global: { fetch: fetchMock as typeof fetch }, auth: { persistSession: false } });
  return { calls, remote: new SupabaseRemote(sb, USER) };
}

describe("SupabaseRemote → PostgREST", () => {
  it("upsert: таблица в snake_case и конфликт по (user_id, id)", async () => {
    const { calls, remote } = recorder();
    await remote.upsert("purchaseItems", [{ id: "1", user_id: USER, total: 5 }]);
    const c = calls[0];
    expect(c.method).toBe("POST");
    expect(c.url.pathname).toBe("/rest/v1/purchase_items");
    expect(c.url.searchParams.get("on_conflict")).toBe("user_id,id");
    expect(c.headers.get("prefer")).toContain("resolution=merge-duplicates");
    expect(c.body).toEqual([{ id: "1", user_id: USER, total: 5 }]);
  });

  it("мягкое удаление: PATCH deleted_at только своих строк", async () => {
    const { calls, remote } = recorder();
    await remote.markDeleted("transactions", ["a", "b"]);
    const c = calls[0];
    expect(c.method).toBe("PATCH");
    expect(c.url.searchParams.get("user_id")).toBe(`eq.${USER}`);
    expect(c.url.searchParams.get("id")).toBe("in.(a,b)");
    expect(Object.keys(c.body as object)).toEqual(["deleted_at"]);
  });

  it("pull: фильтр по курсору, сортировка и постраничная загрузка", async () => {
    const page = Array.from({ length: 1000 }, (_, i) => ({ id: String(i), synced_at: "2026-11-03T00:00:00Z" }));
    const { calls, remote } = recorder([page, [{ id: "last", synced_at: "2026-11-03T00:00:01Z" }]]);
    const rows = await remote.pullSince("transactions", "2026-11-02T23:58:00.000Z");
    expect(rows).toHaveLength(1001);
    expect(calls).toHaveLength(2);
    const c = calls[0];
    expect(c.url.searchParams.get("synced_at")).toBe("gt.2026-11-02T23:58:00.000Z");
    expect(c.url.searchParams.get("order")).toBe("synced_at.asc,id.asc");
    expect([c.url.searchParams.get("offset"), c.url.searchParams.get("limit")]).toEqual(["0", "1000"]);
    expect([calls[1].url.searchParams.get("offset"), calls[1].url.searchParams.get("limit")]).toEqual(["1000", "1000"]);
  });

  it("первый pull без курсора тянет всё", async () => {
    const { calls, remote } = recorder();
    await remote.pullSince("goals", null);
    expect(calls[0].url.searchParams.has("synced_at")).toBe(false);
  });
});
