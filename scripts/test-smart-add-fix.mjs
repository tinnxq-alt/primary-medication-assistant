import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("smart-add-fix.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");
const serviceWorker = fs.readFileSync("service-worker.js", "utf8");
const workerCore = fs.readFileSync("worker/src/index-v3.js", "utf8");
const workerAdapter = fs.readFileSync("worker/src/index-v8.js", "utf8");
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

assert.match(wrangler, /"main"\s*:\s*"src\/index-v8\.js"/, "Wrangler 必须部署可信来源发现 v8");
assert.match(workerAdapter, /quickAction\("content"/, "真实搜索页和说明书页必须通过 Browser content 获取渲染 HTML");
assert.match(workerAdapter, /-NULL-b0-ci0-c0-m0-bm0-otc0-fd0-p0/, "39 第一通道应优先使用实测规范化搜索结果页");
assert.match(workerAdapter, /extract39SearchLinks/, "不得再假定 39 候选只能是根目录数字 ID，应按药名文本提取站内详情链接");
assert.match(workerAdapter, /extract39ManualLink/, "通用 39 详情页应继续寻找真实“详细说明书”链接");
assert.match(workerAdapter, /siteRestrictedRss/, "39 站内搜索无结果时应使用站点限定来源发现，而非泛搜索");
assert.match(workerAdapter, /site:.*药品 说明书/, "站点限定搜索必须携带药名与说明书约束");
assert.match(workerAdapter, /TRUSTED_HOSTS/, "搜索结果必须经过可信医药域名白名单");
assert.match(workerAdapter, /yaopinnet\.com/, "可信来源应包含药源网补充发现");
assert.match(workerAdapter, /trusted-source-discovery-v8/, "响应必须标记可信来源发现模式");
assert.doesNotMatch(workerAdapter, /calculator\.net/, "生产逻辑不得为噪声站点设置任何特殊通路");

assert.match(workerCore, /!candidate\.drugName \|\| !candidate\.clinical\.indication \|\| !candidate\.clinical\.dosage/, "缺少药名、适应症或用法用量的网页不得成为候选");
assert.match(workerCore, /generatesClinicalKnowledge:\s*false/, "必须明确不生成临床知识");
assert.doesNotMatch(workerCore, /env\.AI\.run|generateCandidateDetail|selected-candidate-detail/, "不得让语言模型凭药名生成临床资料");
assert.match(workerCore, /格鲁肽/, "GLP-1 类名称必须归入降糖药规则");

console.log("添加药物：可信医药来源发现 + 真实说明书原文抽取 + 自动填充检查通过");
