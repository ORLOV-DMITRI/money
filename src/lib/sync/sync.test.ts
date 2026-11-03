import { afterEach, describe, expect, it } from "vitest";
import { MoneyDB } from "@/lib/db/db";
import { detId } from "@/lib/ids";
import { FakeRemote } from "./fake-remote";
import { SyncEngine } from "./engine";
import { fromServer, toServer } from "./mapping";

const USER = "aaaaaaaa-0000-4000-8000-000000000001";
let n = 0;
const open: MoneyDB[] = [];
function device(remote: FakeRemote) {
  const db = new MoneyDB(`device-${++n}-${Date.now()}`);
  open.push(db);
  return { db, engine: new SyncEngine(db, remote, USER) };
}
afterEach(async () => {
  for (const db of open.splice(0)) await db.delete();
});

const tx = (over: Record<string, unknown> = {}) => ({ type: "expense" as const, amount: 120_000, date: "2026-11-03", note: "Кофе", tags: ["утро"], createdAt: 1, updatedAt: 1, ...over });

describe("очередь изменений (outbox)", () => {
  it("каждая запись, правка и удаление попадают в очередь; id выдаётся сам", async () => {
    const { db } = device(new FakeRemote());
    const id = await db.transactions.add(tx());
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await db._outbox.get(`transactions:${id}`)).toBeDefined();
    await db._outbox.clear();
    await db.transactions.update(id, { amount: 1 });
    expect(await db._outbox.count()).toBe(1);
    await db._outbox.clear();
    await db.transactions.where("type").equals("expense").delete();
    expect(await db._outbox.get(`transactions:${id}`)).toBeDefined();
    await db._outbox.clear();
    await db.transactions.add(tx());
    await db.transactions.clear();
    expect(await db._outbox.count()).toBe(1);
  });
  it("локальные настройки в очередь не попадают", async () => {
    const { db } = device(new FakeRemote());
    await db.settings.put({ key: "x", value: 1 });
    expect(await db._outbox.count()).toBe(0);
  });
});

describe("маппинг", () => {
  it("camelCase ↔ snake_case, зарезервированные имена, null ↔ отсутствие поля", () => {
    const s = toServer({ id: "1", categoryId: "c", limit: 5, order: 2, interval: 3, deadline: undefined }, USER);
    expect(s).toEqual({ user_id: USER, deleted_at: null, id: "1", category_id: "c", limit_amount: 5, sort_order: 2, every_n: 3, deadline: null });
    expect(fromServer({ ...s, synced_at: "x" })).toEqual({ id: "1", categoryId: "c", limit: 5, order: 2, interval: 3 });
  });
});

describe("синхронизация двух устройств", () => {
  it("операция с компьютера появляется на планшете, без эха в очереди", async () => {
    const remote = new FakeRemote();
    const pc = device(remote);
    const tab = device(remote);
    const id = await pc.db.transactions.add(tx());
    expect(await pc.engine.sync()).toEqual({ pushed: 1, pulled: 1 });
    expect(await pc.db._outbox.count()).toBe(0);
    await tab.engine.sync();
    expect(await tab.db.transactions.get(id)).toMatchObject({ amount: 120_000, note: "Кофе", tags: ["утро"] });
    expect(await tab.db._outbox.count()).toBe(0);
  });

  it("удаление доезжает до другого устройства", async () => {
    const remote = new FakeRemote();
    const pc = device(remote);
    const tab = device(remote);
    const id = await pc.db.transactions.add(tx());
    await pc.engine.sync();
    await tab.engine.sync();
    await tab.db.transactions.delete(id);
    await tab.engine.sync();
    expect(remote.live("transactions")).toHaveLength(0);
    await pc.engine.sync();
    expect(await pc.db.transactions.get(id)).toBeUndefined();
  });

  it("неотправленная локальная правка не затирается при pull; затем побеждает (last-write-wins)", async () => {
    const remote = new FakeRemote();
    const pc = device(remote);
    const tab = device(remote);
    const id = await pc.db.transactions.add(tx());
    await pc.engine.sync();
    await tab.engine.sync();
    await tab.db.transactions.update(id, { amount: 200_000 });
    await tab.engine.sync(); // сервер: 2000 ₸
    await pc.db.transactions.update(id, { amount: 300_000 }); // офлайн-правка на ПК
    await pc.engine.pull();
    expect((await pc.db.transactions.get(id))!.amount).toBe(300_000);
    await pc.engine.sync();
    await tab.engine.sync();
    expect((await tab.db.transactions.get(id))!.amount).toBe(300_000);
  });

  it("регулярный платёж, созданный на двух устройствах, не задваивается", async () => {
    const remote = new FakeRemote();
    const pc = device(remote);
    const tab = device(remote);
    const id = detId("recurring", "rent", "2026-11-07");
    await pc.db.transactions.put({ ...tx({ note: "Аренда", amount: 18_000_000 }), id });
    await tab.db.transactions.put({ ...tx({ note: "Аренда", amount: 18_000_000 }), id });
    await pc.engine.sync();
    await tab.engine.sync();
    await pc.engine.sync();
    expect(remote.live("transactions")).toHaveLength(1);
    expect(await pc.db.transactions.count()).toBe(1);
    expect(await tab.db.transactions.count()).toBe(1);
  });

  it("сбой сети: очередь сохраняется и уходит со следующей попытки", async () => {
    const remote = new FakeRemote();
    const pc = device(remote);
    await pc.db.transactions.add(tx());
    remote.beforeUpsert = () => {
      throw new Error("offline");
    };
    await expect(pc.engine.sync()).rejects.toThrow("offline");
    expect(await pc.db._outbox.count()).toBe(1);
    remote.beforeUpsert = undefined;
    await pc.engine.sync();
    expect(await pc.db._outbox.count()).toBe(0);
    expect(remote.live("transactions")).toHaveLength(1);
  });

  it("правка во время отправки не теряется: запись остаётся в очереди", async () => {
    const remote = new FakeRemote();
    const pc = device(remote);
    const id = await pc.db.transactions.add(tx());
    remote.beforeUpsert = async () => {
      remote.beforeUpsert = undefined;
      await pc.db.transactions.update(id, { amount: 999 });
    };
    await pc.engine.push();
    expect(await pc.db._outbox.count()).toBe(1);
    await pc.engine.push();
    expect(remote.live("transactions")[0].amount).toBe(999);
  });

  it("курсор: повторный pull не тянет всё заново, но перекрытие не ломает данные", async () => {
    const remote = new FakeRemote();
    const pc = device(remote);
    const tab = device(remote);
    for (let i = 0; i < 3; i++) await pc.db.transactions.add(tx({ amount: 100 + i }));
    await pc.engine.sync();
    expect(await tab.engine.pull()).toBe(3);
    expect(await tab.db.transactions.count()).toBe(3);
    expect(await tab.db._outbox.count()).toBe(0);
  });
});
