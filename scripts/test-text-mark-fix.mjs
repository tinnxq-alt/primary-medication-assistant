import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../text-mark-fix.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const serviceWorker = fs.readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");

assert.match(source, /mark\.start === lastSelection\.start/);
assert.match(source, /mark\.end === lastSelection\.end/);
assert.match(source, /data-text-mark-id/);
assert.match(source, /data-delete-text-mark/);
assert.match(source, /note-group-card/);
assert.match(source, /data-note-group-count/);
assert.match(html, /text-mark-fix\.css/);
assert.match(html, /text-mark-fix\.js/);
assert.match(serviceWorker, /primary-medication-pro-v28/);
assert.match(serviceWorker, /text-mark-fix\.js/);
assert.match(serviceWorker, /text-mark-fix\.css/);

console.log("文本标记定位、点击删除、同药笔记分组契约检查通过");
