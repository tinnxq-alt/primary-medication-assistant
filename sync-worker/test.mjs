import assert from "node:assert/strict";
import worker, {
  authenticatedUser,
  cleanEntityId,
  cleanEntityType,
  completeGitHubLogin,
  parseEntityPath,
  payloadText,
  sessionCookie,
  sha256,
  startGitHubLogin
} from "./src/index.js";

assert.equal(cleanEntityType("note"), "note");
assert.equal(cleanEntityType("patient"), "");
assert.equal(cleanEntityId("note-01"), "note-01");
assert.equal(cleanEntityId("../note"), "");
assert.deepEqual(parseEntityPath("/api/v1/entities/task/task-1"), { entityType: "task", entityId: "task-1" });
assert.equal(parseEntityPath("/api/v1/entities/patient/p-1"), null);
assert.equal(payloadText({ text: "值班交接" }), '{"text":"值班交接"}');
assert.equal(payloadText({ text: "x".repeat(40 * 1024) }), null);
assert.match(sessionCookie("opaque"), /HttpOnly; Secure; SameSite=Lax/u);

function createDb() {
  const entities = new Map();
  const states = new Map();
  const sessions = new Map();
  const entityKey = (values) => values.slice(0, 3).join("|");
  return {
    entities,
    states,
    sessions,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              if (sql.includes("DELETE FROM oauth_states")) {
                const row = states.get(values[0]);
                if (!row || row.expires_at <= values[1]) return null;
                states.delete(values[0]);
                return { code_verifier: row.code_verifier, return_to: row.return_to };
              }
              if (sql.includes("FROM user_sessions")) {
                const row = sessions.get(values[0]);
                return row && row.expires_at > values[1] ? row : null;
              }
              throw new Error(`Unexpected first SQL: ${sql}`);
            },
            async all() {
              const userId = values[0];
              const type = sql.includes("entity_type = ?") ? values[1] : "";
              return { results: [...entities.values()].filter((row) => row.user_id === userId && (!type || row.entity_type === type)) };
            },
            async run() {
              if (sql.includes("INSERT INTO oauth_states")) {
                states.set(values[0], { code_verifier: values[1], return_to: values[2], expires_at: values[3], created_at: values[4] });
                return { meta: { changes: 1 } };
              }
              if (sql.includes("INSERT INTO user_sessions")) {
                sessions.set(values[0], { user_id: values[1], expires_at: values[2], created_at: values[3], last_seen_at: values[4] });
                return { meta: { changes: 1 } };
              }
              if (sql.includes("DELETE FROM user_sessions")) {
                return { meta: { changes: sessions.delete(values[0]) ? 1 : 0 } };
              }
              if (sql.includes("INSERT INTO user_entities")) {
                const rowKey = entityKey(values);
                if (entities.has(rowKey)) throw new Error("UNIQUE constraint failed");
                entities.set(rowKey, { user_id: values[0], entity_type: values[1], entity_id: values[2], payload_json: values[3], revision: 1, created_at: values[4], updated_at: values[5] });
                return { meta: { changes: 1 } };
              }
              if (sql.includes("UPDATE user_entities")) {
                const rowKey = entityKey([values[2], values[3], values[4]]);
                const row = entities.get(rowKey);
                if (!row || row.revision !== values[5]) return { meta: { changes: 0 } };
                row.payload_json = values[0]; row.updated_at = values[1]; row.revision += 1;
                return { meta: { changes: 1 } };
              }
              if (sql.includes("DELETE FROM user_entities")) {
                const rowKey = entityKey(values);
                const row = entities.get(rowKey);
                if (!row || row.revision !== values[3]) return { meta: { changes: 0 } };
                entities.delete(rowKey);
                return { meta: { changes: 1 } };
              }
              throw new Error(`Unexpected run SQL: ${sql}`);
            }
          };
        }
      };
    }
  };
}

const DB = createDb();
const env = {
  DB,
  ALLOWED_ORIGINS: "https://app.example.test",
  ALLOWED_GITHUB_USER_IDS: "316177058",
  GITHUB_CLIENT_ID: "client-id",
  GITHUB_CLIENT_SECRET: "client-secret",
  GITHUB_CALLBACK_URL: "https://sync.example.test/auth/github/callback"
};

assert.equal(await authenticatedUser({}, new Request("https://sync.example.test"), env), null);
const access = { async getIdentity() { return { user_uuid: "access-user", email: "ignored@example.test" }; } };
assert.deepEqual(await authenticatedUser({ access }, new Request("https://sync.example.test"), env), { userId: "access-user", provider: "cloudflare-access" });

const start = await startGitHubLogin(new Request("https://sync.example.test/auth/github/start?return_to=https%3A%2F%2Fapp.example.test%2F%23%2Fprofile"), env, 1_800_000_000_000);
assert.equal(start.status, 302);
const authorize = new URL(start.headers.get("location"));
assert.equal(authorize.origin, "https://github.com");
assert.equal(authorize.pathname, "/login/oauth/authorize");
assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
assert.equal(authorize.searchParams.has("scope"), false, "身份登录不索取仓库或邮箱权限");
const state = authorize.searchParams.get("state");
assert.ok(DB.states.has(await sha256(state)));

const fetchCalls = [];
const githubFetcher = async (url, options = {}) => {
  fetchCalls.push({ url: String(url), options });
  if (String(url).includes("login/oauth/access_token")) return Response.json({ access_token: "temporary-token" });
  if (String(url) === "https://api.github.com/user") return Response.json({ id: 316177058, login: "tinnxq-alt" });
  if (String(url).includes("/applications/client-id/token")) return new Response(null, { status: 204 });
  throw new Error(`Unexpected fetch: ${url}`);
};
const callbackRequest = new Request(`https://sync.example.test/auth/github/callback?code=one-time-code&state=${encodeURIComponent(state)}`);
const callback = await completeGitHubLogin(callbackRequest, env, githubFetcher, 1_800_000_001_000);
assert.equal(callback.status, 302);
assert.equal(callback.headers.get("location"), "https://app.example.test/#/profile");
assert.match(callback.headers.get("set-cookie"), /^__Host-clinical_session=/u);
assert.equal(fetchCalls.length, 3, "交换令牌、读取身份后必须立即吊销临时令牌");
assert.equal(fetchCalls[2].options.method, "DELETE");

const replay = await completeGitHubLogin(callbackRequest, env, githubFetcher, 1_800_000_001_500);
assert.equal(replay.status, 400, "OAuth state 必须只能使用一次");

const sessionToken = callback.headers.get("set-cookie").match(/^__Host-clinical_session=([^;]+)/u)[1];
const ctx = {};
const apiHeaders = { Origin: "https://app.example.test", Cookie: `__Host-clinical_session=${sessionToken}` };
const me = await worker.fetch(new Request("https://sync.example.test/api/v1/me", { headers: apiHeaders }), env, ctx);
assert.equal(me.status, 200);
assert.deepEqual(await me.json(), { userId: "github:316177058", provider: "github", storageScope: "user:github:316177058" });

const create = await worker.fetch(new Request("https://sync.example.test/api/v1/entities/note/note-1", {
  method: "PUT", headers: { ...apiHeaders, "Content-Type": "application/json" },
  body: JSON.stringify({ revision: 0, payload: { text: "仅登录用户可见" } })
}), env, ctx);
assert.equal(create.status, 201);

const otherToken = "other-session";
DB.sessions.set(await sha256(otherToken), { user_id: "github:999", expires_at: new Date(1_900_000_000_000).toISOString() });
const listOther = await worker.fetch(new Request("https://sync.example.test/api/v1/entities", {
  headers: { Origin: "https://app.example.test", Cookie: `__Host-clinical_session=${otherToken}` }
}), env, ctx);
assert.equal((await listOther.json()).entities.length, 0, "另一个用户不能读取当前用户数据");

const stale = await worker.fetch(new Request("https://sync.example.test/api/v1/entities/note/note-1", {
  method: "PUT", headers: { ...apiHeaders, "Content-Type": "application/json" },
  body: JSON.stringify({ revision: 7, payload: { text: "过期修改" } })
}), env, ctx);
assert.equal(stale.status, 409);

const unlistedDb = createDb();
const unlistedEnv = { ...env, DB: unlistedDb };
const unlistedStart = await startGitHubLogin(new Request("https://sync.example.test/auth/github/start"), unlistedEnv, 1_800_000_000_000);
const unlistedState = new URL(unlistedStart.headers.get("location")).searchParams.get("state");
const unlistedFetcher = async (url) => {
  if (String(url).includes("login/oauth/access_token")) return Response.json({ access_token: "temporary-token-2" });
  if (String(url) === "https://api.github.com/user") return Response.json({ id: 42, login: "wrong-user" });
  return new Response(null, { status: 204 });
};
const denied = await completeGitHubLogin(new Request(`https://sync.example.test/auth/github/callback?code=x&state=${unlistedState}`), unlistedEnv, unlistedFetcher, 1_800_000_001_000);
assert.equal(denied.status, 403, "非白名单 GitHub 数字 ID 必须拒绝");

const expiredToken = "expired-session";
DB.sessions.set(await sha256(expiredToken), { user_id: "github:316177058", expires_at: new Date(1_700_000_000_000).toISOString() });
assert.equal(await authenticatedUser({}, new Request("https://sync.example.test", { headers: { Cookie: `__Host-clinical_session=${expiredToken}` } }), env, 1_800_000_000_000), null);

const crossOrigin = await worker.fetch(new Request("https://sync.example.test/api/v1/me", { headers: { Origin: "https://evil.example", Cookie: `__Host-clinical_session=${sessionToken}` } }), env, ctx);
assert.equal(crossOrigin.status, 403);

console.log("GitHub OAuth, session isolation and revision tests passed");

