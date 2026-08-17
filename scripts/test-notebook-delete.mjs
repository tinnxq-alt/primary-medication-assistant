import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const unified = fs.readFileSync(new URL("../mark-notebook-ui.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const worker = fs.readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");

assert.match(app, /\[data-delete-note\]/, "普通笔记删除应继续由主应用状态处理");
assert.match(app, /\[data-delete-mark\]/, "文本标记删除应继续由主应用状态处理");
assert.match(app, /confirmModal\("确认删除这条笔记？"/);
assert.match(app, /confirmModal\("确认删除这条文本标记？"/);
assert.match(unified, /groupNotebookSection\("全部药品笔记", "notes"\)/);
assert.match(unified, /groupNotebookSection\("文本标记", "marks"\)/);
assert.doesNotMatch(html, /src="notebook-delete-fix\.js"/, "不得再加载会整页 reload 的旧删除补丁");
assert.ok(html.indexOf('src="notebook-scroll-fix.js"') < html.indexOf('src="mark-notebook-ui.js"'), "滚动保护应先于统一标记层加载");
assert.doesNotMatch(worker, /"\.\/notebook-delete-fix\.js"/);
assert.match(worker, /"\.\/mark-notebook-ui\.js"/);
const cacheVersion = worker.match(/primary-medication-v(\d+)/);
assert.ok(cacheVersion && Number(cacheVersion[1]) >= 33, "PWA 缓存版本不得低于 v33");

console.log("笔记本删除由主状态处理且不再依赖 reload 补丁");
