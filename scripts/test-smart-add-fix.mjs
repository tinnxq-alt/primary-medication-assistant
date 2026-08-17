import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("smart-add-fix.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");
const serviceWorker = fs.readFileSync("service-worker.js", "utf8");
const workerSource = fs.readFileSync("worker/src/index-v2.js", "utf8");
const wrangler = fs.readFileSync("worker/wrangler.jsonc", "utf8");

assert.match(source, /function exactDuplicate\(/, "添加药物必须保留本地重复检测");
assert.match(source, /chineseCount\(query\) < 2/, "输入两个汉字片段即可联网检索，无需完整药名");
assert.match(source, /remoteInstructionCandidates\(query\)/, "添加药物必须调用联网说明书检索链路");
assert.match(source, /\/v1\/drugs\/search/, "前端必须请求联网说明书搜索接口");
assert.match(source, /查看原说明书/, "候选必须提供原始说明书来源链接");
assert.match(source, /网页原文摘录/, "候选必须明确说明内容来自网页原文");
assert.match(source, /选择并自动填充/, "用户选择候选后才自动填充");
assert.match(source, /candidate\.clinical\?\.indication/, "自动填充必须包含适应症");
assert.match(source, /candidate\.clinical\?\.dosage/, "自动填充必须包含用法用量");
assert.match(source, /candidate\.clinical\?\.adverseReactions/, "自动填充应包含来源页中的不良反应");
assert.match(source, /candidate\.clinical\?\.precautions/, "自动填充应包含来源页中的注意事项");
assert.doesNotMatch(source, /remoteCandidateDetail|\/v1\/drugs\/detail|生成资料中/, "前端不得再调用 AI 生成临床资料接口");
assert.doesNotMatch(source, /scrollIntoView|window\.scrollTo|location\.reload/, "智能识别不得导致页面跳动或刷新");
assert.match(source, /缺失字段不会猜测补写/, "页面必须说明不会猜测缺失资料");

assert.ok(html.includes('src="smart-add-fix.js"'), "页面必须加载联网说明书识别脚本");
assert.ok(serviceWorker.includes('"./smart-add-fix.js"'), "PWA 必须缓存智能识别脚本");
assert.ok(Number(serviceWorker.match(/primary-medication-v(\d+)/)?.[1] || 0) >= 40, "联网说明书版本 PWA 缓存不得低于 v40");

assert.match(wrangler, /"main"\s*:\s*"src\/index-v2\.js"/, "Wrangler 必须部署 Browser Links Worker 入口");
assert.match(wrangler, /"browser"\s*:\s*\{/, "Worker 必须配置 Browser Run binding 执行网页检索");
assert.match(wrangler, /"binding"\s*:\s*"BROWSER"/, "Browser Run binding 名称必须为 BROWSER");
assert.match(workerSource, /quickAction\("links"/, "Worker 应使用 Browser Run Links 模式发现真实搜索结果外链");
assert.match(workerSource, /unwrapBingUrl/, "Worker 必须解码 Bing 跟踪链接到真实来源 URL");
assert.match(workerSource, /bing\.com\/search/, "全网说明书发现应使用搜索引擎结果页");
assert.match(workerSource, /fetchSourcePage/, "发现候选链接后必须读取实际来源网页");
assert.match(workerSource, /parseInstructionPage/, "候选字段必须从来源网页解析");
assert.match(workerSource, /extractSection/, "适应症等临床字段必须按说明书栏目抽取");
assert.match(workerSource, /!candidate\.drugName \|\| !candidate\.clinical\.indication \|\| !candidate\.clinical\.dosage/, "缺少药名、适应症或用法用量的网页不得成为候选");
assert.match(workerSource, /mode:\s*"web-instruction-source-extraction-v2"/, "Worker 必须标记为 Browser Links 联网说明书原文抽取模式");
assert.match(workerSource, /generatesClinicalKnowledge:\s*false/, "健康检查必须明确不生成临床知识");
assert.doesNotMatch(workerSource, /env\.AI\.run|generateCandidateDetail|selected-candidate-detail/, "Worker 不得让语言模型凭药名生成临床资料");
assert.match(workerSource, /2型糖尿病\|降血糖/, "分类规则应利用来源中的糖尿病信息防止降糖药误判");
assert.match(workerSource, /格鲁肽/, "GLP-1 类名称必须归入降糖药规则");
assert.match(workerSource, /safePublicUrl/, "来源抓取必须限制为安全公网 HTTPS URL");
assert.match(workerSource, /localhost/, "来源抓取必须阻止本机地址以避免开放代理风险");

console.log("添加药物：Browser Links 发现真实说明书、来源原文抽取与自动填充检查通过");
