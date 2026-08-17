import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("smart-add-fix.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");
const serviceWorker = fs.readFileSync("service-worker.js", "utf8");
const workerCore = fs.readFileSync("worker/src/index-v3.js", "utf8");
const workerFallback = fs.readFileSync("worker/src/index-v5.js", "utf8");
const workerAdapter = fs.readFileSync("worker/src/index-v7.js", "utf8");
const wrangler = fs.readFileSync("worker/wrangler.jsonc", "utf8");

assert.match(source, /function exactDuplicate\(/, "添加药物必须保留本地重复检测");
assert.match(source, /chineseCount\(query\) < 2/, "输入两个汉字片段即可联网检索，无需完整药名");
assert.match(source, /remoteInstructionCandidates\(query\)/, "添加药物必须调用联网说明书检索链路");
assert.match(source, /查看原说明书/, "候选必须提供原始说明书来源链接");
assert.match(source, /网页原文摘录/, "候选必须明确说明内容来自网页原文");
assert.match(source, /选择并自动填充/, "用户选择候选后才自动填充");
assert.match(source, /candidate\.clinical\?\.indication/, "自动填充必须包含适应症");
assert.match(source, /candidate\.clinical\?\.dosage/, "自动填充必须包含用法用量");
assert.match(source, /candidate\.clinical\?\.adverseReactions/, "自动填充应包含来源页中的不良反应");
assert.match(source, /candidate\.clinical\?\.precautions/, "自动填充应包含来源页中的注意事项");
assert.doesNotMatch(source, /remoteCandidateDetail|\/v1\/drugs\/detail|生成资料中/, "前端不得再调用 AI 生成临床资料接口");
assert.match(source, /缺失字段不会猜测补写/, "页面必须说明不会猜测缺失资料");

assert.ok(html.includes('src="smart-add-fix.js"'), "页面必须加载联网说明书识别脚本");
assert.ok(serviceWorker.includes('"./smart-add-fix.js"'), "PWA 必须缓存智能识别脚本");
assert.ok(Number(serviceWorker.match(/primary-medication-v(\d+)/)?.[1] || 0) >= 40, "联网说明书版本 PWA 缓存不得低于 v40");

assert.match(wrangler, /"main"\s*:\s*"src\/index-v7\.js"/, "Wrangler 必须部署浏览器渲染直连适配层");
assert.match(workerAdapter, /quickAction\("content"/, "39 搜索页和说明书页必须通过 Browser content 获取渲染 HTML");
assert.match(workerAdapter, /https:\/\/ypk\.39\.net\/search\//, "第一通道必须直接打开 39 药品通搜索页");
assert.match(workerAdapter, /search39ManualLinks/, "渲染后的搜索页必须提取真实 manual URL");
assert.match(workerAdapter, /parseInstructionPage/, "渲染后的说明书仍必须通过严格原文解析器");
assert.match(workerAdapter, /direct-39-browser-content/, "成功响应应标记为 39 浏览器渲染直连");
assert.match(workerAdapter, /fallbackWorker\.fetch/, "直连失败后仍保留全网搜索降级通道");

assert.match(workerFallback, /payload\?\.success && typeof payload\.result === "string"/, "Browser content 通用降级必须正确从 JSON result 解包 HTML");
assert.match(workerCore, /!candidate\.drugName \|\| !candidate\.clinical\.indication \|\| !candidate\.clinical\.dosage/, "缺少药名、适应症或用法用量的网页不得成为候选");
assert.match(workerCore, /generatesClinicalKnowledge:\s*false/, "必须明确不生成临床知识");
assert.doesNotMatch(workerCore, /env\.AI\.run|generateCandidateDetail|selected-candidate-detail/, "不得让语言模型凭药名生成临床资料");
assert.match(workerCore, /格鲁肽/, "GLP-1 类名称必须归入降糖药规则");

console.log("添加药物：Browser content 渲染真实说明书 + 原文抽取 + 自动填充检查通过");
