import assert from "node:assert/strict";
import fs from "node:fs";

const script = fs.readFileSync("notebook-scroll-fix.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");
const worker = fs.readFileSync("service-worker.js", "utf8");

assert.match(script, /currentRoute\(\) === "notebook"/, "滚动保护必须只作用于笔记本页");
assert.match(script, /window\.scrollTo\s*=\s*\(/, "必须拦截笔记本内部重新渲染触发的回顶调用");
assert.match(script, /location\.hash !== lastHash/, "真正切换路由时必须允许正常回到顶部");
assert.match(script, /desiredScrollY/, "必须保存笔记本当前滚动位置");
assert.match(script, /MutationObserver/, "笔记本 DOM 重新分组后必须再次恢复滚动位置");
assert.ok(index.includes('src="notebook-scroll-fix.js"'), "页面必须加载笔记本滚动保护脚本");
assert.ok(index.indexOf('src="notebook-scroll-fix.js"') < index.indexOf('src="mark-notebook-ui.js"'), "滚动保护必须先于统一文本标记层加载");
assert.ok(worker.includes('"./notebook-scroll-fix.js"'), "PWA 离线缓存必须包含笔记本滚动保护脚本");
const cacheVersion = Number(worker.match(/primary-medication-v(\d+)/)?.[1] || 0);
assert.ok(cacheVersion >= 33, "PWA 缓存版本必须至少为 v33");

console.log("Notebook scroll preservation checks passed");
