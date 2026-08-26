import assert from "node:assert/strict";
import fs from "node:fs";

const ui = fs.readFileSync("smart-add-fix.js", "utf8");
const freeUi = fs.readFileSync("free-smart-source-v11.js", "utf8");
const classification = fs.readFileSync("drug-classification.js", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");
const serviceWorker = fs.readFileSync("service-worker.js", "utf8");
const worker = fs.readFileSync("worker/src/index-v12.js", "utf8");
const sourceIndex = fs.readFileSync("worker/src/free-source-index.js", "utf8");
const core = fs.readFileSync("worker/src/index-v3.js", "utf8");
const wrangler = fs.readFileSync("worker/wrangler.jsonc", "utf8");

assert.match(ui, /function exactDuplicate\(/, "添加药物必须保留本地重复检测");
assert.match(ui, /chineseCount\(query\) < 2/, "两个汉字片段即可识别");
assert.match(ui, /remoteInstructionCandidates\(query\)/, "必须调用说明书候选接口");
assert.match(ui, /input\.addEventListener\("input"/, "输入药名后必须自动触发防抖联网检索");
assert.match(ui, /run\(\{ automatic: true \}\)/, "自动检索必须复用安全的说明书检索流程");
assert.match(ui, /}, 500\);/, "输入停顿 500ms 后应开始联网检索");
assert.match(ui, /ensureClassificationCatalog\(node\)/, "检索门诊药时必须先加载门诊药库分类");
assert.match(ui, /classifyCandidate\(candidate, selectedPharmacyScope/, "联网候选必须按目标药库分类");
assert.match(ui, /result\.candidates\.length === 1/, "唯一完整候选应自动填充");
assert.match(ui, /查看原说明书/, "候选必须可查看来源");
assert.match(ui, /选择并自动填充/, "用户选择候选后才自动填充");
assert.match(ui, /candidate\.clinical\?\.indication/, "自动填充包含适应症");
assert.match(ui, /candidate\.clinical\?\.dosage/, "自动填充包含用法用量");
assert.match(ui, /classification\.therapeuticClass/, "说明书候选必须独立填入药物作用分类");
assert.match(ui, /classification\.category/, "说明书候选必须独立填入药品分类");
assert.doesNotMatch(ui, /remoteCandidateDetail|\/v1\/drugs\/detail/, "前端不得调用 AI 生成临床详情");

assert.match(freeUi, /\/v1\/drugs\/parse-source/, "索引未命中时必须支持粘贴可信说明书链接");
assert.match(freeUi, /TRUSTED_HOSTS/, "粘贴链接前端必须限制可信域名");
assert.match(freeUi, /candidate\.clinical\?\.indication/, "粘贴说明书自动填充必须包含适应症");
assert.match(freeUi, /candidate\.clinical\?\.dosage/, "粘贴说明书自动填充必须包含用法用量");
assert.match(freeUi, /sourceStatus", "needs-review"/, "网页原文自动填充仍须标记待复核");
assert.match(freeUi, /classification\.therapeuticClass/, "粘贴说明书也必须独立填入药物作用分类");
assert.match(freeUi, /ensureClassificationCatalog\(form\)/, "粘贴说明书填充也必须加载目标药库分类");

assert.match(classification, /Object\.freeze\(\["西药", "中成药"\]\)/, "药品分类选项必须是药品属性，不得混入作用分类");
assert.match(classification, /function classifyCandidate\(/, "所有添加入口必须复用统一分类器");
assert.doesNotMatch(app, /therapeuticClass:\s*normalizeDrugCategory/, "主应用不得再用药品分类填充作用分类");
assert.match(app, /name="therapeuticClass" list="therapeuticClassOptions"/, "添加药物的作用分类必须可从列表选择");
assert.match(app, /可选择或自行填写/, "作用分类列表必须保留人工修正能力");
assert.ok(html.indexOf('src="drug-classification.js"') < html.indexOf('src="app.js"'), "分类器必须先于主应用加载");
assert.match(serviceWorker, /\.\/drug-classification\.js/, "离线缓存必须包含统一分类器");

assert.match(wrangler, /"main"\s*:\s*"src\/index-v12\.js"/, "必须部署 v12");
assert.doesNotMatch(wrangler, /OPENAI_SEARCH_MODEL|"ai"\s*:/, "v12 生产配置不得依赖 OpenAI 或 Workers AI");
assert.match(worker, /findIndexedSources/, "v12 必须优先查询本地可信说明书索引");
assert.match(worker, /trustedDiscovery/, "索引未命中时必须自动进行可信域名联网检索");
assert.match(worker, /parseTrustedSource/, "临床字段必须从真实说明书页解析");
assert.match(worker, /manual-trusted-source-v12/, "必须支持用户粘贴可信来源直读");
assert.match(worker, /MAX_BODY_BYTES/, "请求正文必须有限制");
assert.match(worker, /application\/json/, "请求必须校验 JSON 内容类型");
assert.match(worker, /requiresPaidApi:\s*false/, "v12 必须明确无需收费 API");
assert.match(worker, /usesOpenAI:\s*false/, "v12 必须明确不使用 OpenAI");
assert.match(worker, /generatesClinicalKnowledge:\s*false/, "v12 必须明确不生成临床知识");
assert.match(worker, /classificationSchema:\s*"separate-category-therapeutic-class-v1"/, "Worker 必须声明药品分类与作用分类已分离");
assert.match(worker, /Promise\.all\(attemptedUrls\.map/, "可信说明书直读必须并发执行");
assert.match(worker, /globalThis\.caches\?\.default/, "重复联网检索必须使用边缘缓存");
assert.match(worker, /searchOptimization:\s*SEARCH_CACHE_SCHEMA/, "Worker 必须暴露检索优化契约");
assert.doesNotMatch(worker, /api\.openai\.com|web_search|env\.AI\.run/, "v12 运行代码不得调用 OpenAI、Web Search 或 Workers AI");
assert.match(sourceIndex, /司美格鲁肽注射液/, "免费来源索引必须包含司美格鲁肽验收条目");
assert.match(sourceIndex, /https:\/\/ypk\.39\.net\/2310025\/manual\//, "司美格鲁肽必须绑定真实 39 说明书 URL");

assert.match(core, /!candidate\.drugName \|\| !candidate\.clinical\.indication \|\| !candidate\.clinical\.dosage/, "说明书缺少关键字段不得成为候选");
assert.match(core, /generatesClinicalKnowledge:\s*false/, "必须明确不生成临床知识");
assert.doesNotMatch(core, /env\.AI\.run|generateCandidateDetail|selected-candidate-detail/, "不得让模型凭药名生成临床资料");
assert.match(core, /格鲁肽/, "格鲁肽分类规则必须保持为降糖药");

console.log("添加药物 v12：可信索引优先 + 未命中自动联网 + 说明书原文填充安全检查通过");
