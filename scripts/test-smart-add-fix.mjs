import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("smart-add-fix.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");
const serviceWorker = fs.readFileSync("service-worker.js", "utf8");
const workerCore = fs.readFileSync("worker/src/index-v3.js", "utf8");
const workerAdapter = fs.readFileSync("worker/src/index-v9.js", "utf8");
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

assert.match(wrangler, /"main"\s*:\s*"src\/index-v9\.js"/, "Wrangler 必须部署 Browser 站点限定来源发现 v9");
assert.match(workerAdapter, /site:\$\{wantedHost\}/, "搜索必须使用 site: 域名限定，不能恢复泛搜索");
assert.match(workerAdapter, /SEARCH_HOSTS\s*=\s*\["ypk\.39\.net",\s*"yaopinnet\.com"\]/, "来源发现应优先限定 39 药品通与药源网");
assert.match(workerAdapter, /unwrapBingUrl/, "必须解码 Bing 跳转 URL 后再核对真实来源域名");
assert.match(workerAdapter, /extractTrustedLinksFromSearchHtml/, "必须从渲染后的站点限定搜索页提取真实来源链接");
assert.match(workerAdapter, /normalizeTrustedSearchResult/, "每条搜索结果必须经过可信来源过滤");
assert.match(workerAdapter, /canonical39InstructionUrl/, "39 根产品页应规范化到详细说明书 URL");
assert.match(workerAdapter, /parseTrustedSource/, "候选必须继续从真实来源页严格解析临床字段");
assert.match(workerAdapter, /await delay\(220\)/, "说明书页面读取必须串行并留出间隔，避免 Browser 并发 429");
assert.match(workerAdapter, /browser-site-restricted-source-v9/, "响应必须标记 Browser 站点限定来源发现模式");
assert.doesNotMatch(workerAdapter, /calculator\.net|example\.com/, "生产逻辑不得为测试噪声站点设置任何特殊通路");

assert.match(workerCore, /!candidate\.drugName \|\| !candidate\.clinical\.indication \|\| !candidate\.clinical\.dosage/, "缺少药名、适应症或用法用量的网页不得成为候选");
assert.match(workerCore, /generatesClinicalKnowledge:\s*false/, "必须明确不生成临床知识");
assert.doesNotMatch(workerCore, /env\.AI\.run|generateCandidateDetail|selected-candidate-detail/, "不得让语言模型凭药名生成临床资料");
assert.match(workerCore, /格鲁肽/, "GLP-1 类名称必须归入降糖药规则");

console.log("添加药物：Browser 站点限定真实说明书检索 + 原文抽取 + 自动填充检查通过");
