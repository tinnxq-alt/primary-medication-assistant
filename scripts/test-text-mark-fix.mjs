import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../mark-notebook-ui.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../text-mark-fix.css", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const serviceWorker = fs.readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");

assert.match(source, /mark\.start/);
assert.match(source, /mark\.end/);
assert.match(source, /data-text-mark-id/);
assert.match(source, /data-direct-mark-type/);
assert.match(source, /data-direct-delete-mark/);
assert.match(source, /positionMenu\(menu, info\.anchorRect\)/, "新增标记操作条必须定位在选中文字旁边");
assert.match(source, /getClientRects\(\)/, "选区定位必须读取真实文字矩形");
assert.match(source, /visualViewport/, "手机端浮动菜单应适配可视视口");
assert.match(source, /renderDetailMarks\(\)/, "新增或删除标记后应原地重绘详情字段");
assert.doesNotMatch(source, /location\.reload\(/, "文本标记新增和删除不得整页 reload");
assert.doesNotMatch(source, /window\.scrollTo\(\{ top: 0/, "文本标记逻辑不得主动回到页面顶部");
assert.match(source, /localMarksSignature/, "笔记本标记同步必须避免 MutationObserver 重复重绘");
assert.match(source, /groupNotebookSection\("文本标记", "marks"\)/);
assert.match(source, /groupNotebookSection\("全部药品笔记", "notes"\)/);
assert.match(source, /selectionchange/);
assert.match(source, /touchend/);
assert.match(css, /#markToolbar[\s\S]*display:\s*none\s*!important/, "旧的底部标记条必须隐藏");
assert.match(css, /\.mark-selection-menu,[\s\S]*position:\s*fixed/, "新标记条必须使用浮动定位");
assert.match(html, /text-mark-fix\.css/);
assert.match(html, /mark-notebook-ui\.js/);
assert.doesNotMatch(html, /src="text-mark-fix\.js"/);
assert.doesNotMatch(html, /src="notebook-delete-fix\.js"/);
const cacheVersion = serviceWorker.match(/primary-medication(?:-pro)?-v(\d+)/);
assert.ok(cacheVersion && Number(cacheVersion[1]) >= 34, "PWA 缓存版本不得低于 v34");
assert.match(serviceWorker, /mark-notebook-ui\.js/);
assert.match(serviceWorker, /text-mark-fix\.css/);

console.log("文本标记已支持选区旁即时操作、精确定位、无刷新新增删除和同药分组");
