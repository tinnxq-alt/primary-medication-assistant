import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../mark-notebook-ui.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const serviceWorker = fs.readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");

assert.match(source, /mark\.start/);
assert.match(source, /mark\.end/);
assert.match(source, /data-text-mark-id/);
assert.match(source, /data-direct-mark-type/);
assert.match(source, /data-direct-delete-mark/);
assert.match(source, /mark-group-card/);
assert.match(source, /note-group-card/);
assert.match(source, /groupNotebookSection\("文本标记", "marks"\)/);
assert.match(source, /groupNotebookSection\("全部药品笔记", "notes"\)/);
assert.match(source, /selectionchange/);
assert.match(source, /touchend/);
assert.match(source, /view-restore/);
assert.doesNotMatch(source, /window\.scrollTo\(\{ top: 0/);
assert.match(html, /text-mark-fix\.css/);
assert.match(html, /mark-notebook-ui\.js/);
assert.doesNotMatch(html, /src="text-mark-fix\.js"/);
assert.doesNotMatch(html, /src="notebook-delete-fix\.js"/);
const cacheVersion = serviceWorker.match(/primary-medication(?:-pro)?-v(\d+)/);
assert.ok(cacheVersion && Number(cacheVersion[1]) >= 33, "PWA 缓存版本不得低于 v33");
assert.match(serviceWorker, /mark-notebook-ui\.js/);
assert.match(serviceWorker, /text-mark-fix\.css/);

console.log("文本标记直接选择、精确定位、点击删除和同药分组契约检查通过");
