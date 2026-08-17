import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../notebook-delete-fix.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const worker = fs.readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");

assert.match(source, /currentRoute\(\) !== "notebook"/);
assert.match(source, /\[data-delete-note\]/);
assert.match(source, /\[data-delete-mark\]/);
assert.match(source, /event\.stopImmediatePropagation\(\)/);
assert.match(source, /storageKey:\s*"notes"/);
assert.match(source, /storageKey:\s*"marks"/);
assert.match(source, /data-notebook-delete-confirm/);
assert.match(source, /location\.reload\(\)/);
assert.match(html, /notebook-delete-fix\.js/);
assert.ok(html.indexOf("text-mark-fix.js") < html.indexOf("notebook-delete-fix.js"), "删除修复脚本应在文本标记脚本之后加载");
assert.match(worker, /notebook-delete-fix\.js/);
const cacheVersion = worker.match(/primary-medication-v(\d+)/);
assert.ok(cacheVersion && Number(cacheVersion[1]) >= 30, "PWA 缓存版本不得低于 v30");

console.log("笔记本普通笔记与文本标记删除契约检查通过");
