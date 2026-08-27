import assert from "node:assert/strict";
import worker, { authenticatedUser, cleanEntityId, cleanEntityType, parseEntityPath, payloadText } from "./src/index.js";

assert.equal(cleanEntityType("note"), "note");
assert.equal(cleanEntityType("patient"), "");
assert.equal(cleanEntityId("note-01"), "note-01");
assert.equal(cleanEntityId("../note"), "");
assert.deepEqual(parseEntityPath("/api/v1/entities/task/task-1"), { entityType: "task", entityId: "task-1" });
assert.equal(parseEntityPath("/api/v1/entities/patient/p-1"), null);
assert.equal(payloadText({ text: "值班交接" }), '{"text":"值班交接"}');
assert.equal(payloadText({ text: "x".repeat(40 * 1024) }), null);
assert.equal(await authenticatedUser({}), null);

const access = {
  async getIdentity() {
    return { user_uuid: "user-a", email: "a@example.test" };
  }
};
assert.deepEqual(await authenticatedUser({ access }), { userId: "user-a", email: "a@example.test" });

const rows = new Map();
function key(values) {
  return values.slice(0, 3).join("|");
}
const DB = {
  prepare(sql) {
    return {
      bind(...values) {
        return {
          async all() {
            const userId = values[0];
            const type = sql.includes("entity_type = ?") ? values[1] : "";
            return {
              results: [...rows.values()].filter((row) => row.user_id === userId && (!type || row.entity_type === type))
            };
          },
          async run() {
            if (sql.includes("INSERT INTO")) {
              const rowKey = key(values);
              if (rows.has(rowKey)) throw new Error("UNIQUE constraint failed");
              rows.set(rowKey, {
                user_id: values[0], entity_type: values[1], entity_id: values[2], payload_json: values[3],
                revision: 1, created_at: values[4], updated_at: values[5]
              });
              return { meta: { changes: 1 } };
            }
            if (sql.includes("UPDATE user_entities")) {
              const rowKey = key([values[2], values[3], values[4]]);
              const row = rows.get(rowKey);
              if (!row || row.revision !== values[5]) return { meta: { changes: 0 } };
              row.payload_json = values[0]; row.updated_at = values[1]; row.revision += 1;
              return { meta: { changes: 1 } };
            }
            if (sql.includes("DELETE FROM")) {
              const rowKey = key(values);
              const row = rows.get(rowKey);
              if (!row || row.revision !== values[3]) return { meta: { changes: 0 } };
              rows.delete(rowKey);
              return { meta: { changes: 1 } };
            }
            throw new Error("Unexpected SQL");
          }
        };
      }
    };
  }
};

const env = { DB, ALLOWED_ORIGINS: "https://app.example.test" };
const ctx = { access };
const unauthenticated = await worker.fetch(new Request("https://sync.example.test/api/v1/me"), env, {});
assert.equal(unauthenticated.status, 403, "未通过 Access 时必须默认拒绝");

const crossOrigin = await worker.fetch(new Request("https://sync.example.test/api/v1/me", {
  headers: { Origin: "https://evil.example" }
}), env, ctx);
assert.equal(crossOrigin.status, 403, "非允许来源必须拒绝");

const create = await worker.fetch(new Request("https://sync.example.test/api/v1/entities/note/note-1", {
  method: "PUT",
  headers: { Origin: "https://app.example.test", "Content-Type": "application/json" },
  body: JSON.stringify({ revision: 0, payload: { text: "仅 user-a 可见" } })
}), env, ctx);
assert.equal(create.status, 201);

const listA = await worker.fetch(new Request("https://sync.example.test/api/v1/entities", {
  headers: { Origin: "https://app.example.test" }
}), env, ctx);
assert.equal((await listA.json()).entities.length, 1);

const listB = await worker.fetch(new Request("https://sync.example.test/api/v1/entities", {
  headers: { Origin: "https://app.example.test" }
}), env, { access: { async getIdentity() { return { user_uuid: "user-b", email: "b@example.test" }; } } });
assert.equal((await listB.json()).entities.length, 0, "另一个用户不能读取 user-a 数据");

const stale = await worker.fetch(new Request("https://sync.example.test/api/v1/entities/note/note-1", {
  method: "PUT",
  headers: { Origin: "https://app.example.test", "Content-Type": "application/json" },
  body: JSON.stringify({ revision: 7, payload: { text: "过期修改" } })
}), env, ctx);
assert.equal(stale.status, 409, "过期版本必须触发冲突");

console.log("User sync Worker isolation and revision tests passed");

