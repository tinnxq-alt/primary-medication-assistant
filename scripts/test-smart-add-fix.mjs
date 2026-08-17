import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("smart-add-fix.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");
const serviceWorker = fs.readFileSync("service-worker.js", "utf8");
const workerCore = fs.readFileSync("worker/src/index-v3.js", "utf8");
const workerAdapter = fs.readFileSync("worker/src/index-v5.js", "utf8");
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

assert.match(wrangler, /"main"\s*:\s*"src\/index-v5\.js"/, "Wrangler 必须部署多通道搜索适配层");
assert.match(workerAdapter, /quickAction\("scrape"/, "第一通道使用 Browser scrape 抓 a[href]");
assert.match(workerAdapter, /quickAction\("content"/, "Browser scrape 失败后必须降级到完整 HTML 内容");
assert.match(workerAdapter, /html\.duckduckgo\.com/, "Browser 通道失效后应有独立网页搜索降级通道");
assert.match(workerAdapter, /format", "rss"/, "独立网页搜索仍失败时应保留 Bing RSS 兜底");
assert.match(workerAdapter, /messenger\.com/, "搜索结果必须过滤真实线上出现过的 Messenger 噪声");
assert.match(workerAdapter, /workerV3\.fetch/, "多通道发现后必须复用严格的说明书正文校验核心");

assert.match(workerCore, /药源网 39药品通 丁香园/, "全网搜索继续对常见医药说明书来源加权");
assert.match(workerCore, /fetchSourcePage/, "发现链接后必须读取实际来源网页");
assert.match(workerCore, /parseInstructionPage/, "候选字段必须从来源网页解析");
assert.match(workerCore, /!candidate\.drugName \|\| !candidate\.clinical\.indication \|\| !candidate\.clinical\.dosage/, "缺少药名、适应症或用法用量的网页不得成为候选");
assert.match(workerCore, /generatesClinicalKnowledge:\s*false/, "必须明确不生成临床知识");
assert.doesNotMatch(workerCore, /env\.AI\.run|generateCandidateDetail|selected-candidate-detail/, "不得让语言模型凭药名生成临床资料");
assert.match(workerCore, /格鲁肽/, "GLP-1 类名称必须归入降糖药规则");

console.log("添加药物：多通道全网发现 + 真实说明书原文抽取 + 自动填充检查通过");
