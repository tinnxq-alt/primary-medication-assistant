import assert from "node:assert/strict";
import fs from "node:fs";

const ui = fs.readFileSync("smart-add-fix.js", "utf8");
const freeUi = fs.readFileSync("free-smart-source-v11.js", "utf8");
const worker = fs.readFileSync("worker/src/index-v11.js", "utf8");
const sourceIndex = fs.readFileSync("worker/src/free-source-index.js", "utf8");
const core = fs.readFileSync("worker/src/index-v3.js", "utf8");
const wrangler = fs.readFileSync("worker/wrangler.jsonc", "utf8");

assert.match(ui, /function exactDuplicate\(/, "添加药物必须保留本地重复检测");
assert.match(ui, /chineseCount\(query\) < 2/, "两个汉字片段即可识别");
assert.match(ui, /remoteInstructionCandidates\(query\)/, "必须调用说明书候选接口");
assert.match(ui, /查看原说明书/, "候选必须可查看来源");
assert.match(ui, /选择并自动填充/, "用户选择候选后才自动填充");
assert.match(ui, /candidate\.clinical\?\.indication/, "自动填充包含适应症");
assert.match(ui, /candidate\.clinical\?\.dosage/, "自动填充包含用法用量");
assert.doesNotMatch(ui, /remoteCandidateDetail|\/v1\/drugs\/detail/, "前端不得调用 AI 生成临床详情");

assert.match(freeUi, /\/v1\/drugs\/parse-source/, "索引未命中时必须支持粘贴可信说明书链接");
assert.match(freeUi, /TRUSTED_HOSTS/, "粘贴链接前端必须限制可信域名");
assert.match(freeUi, /candidate\.clinical\?\.indication/, "粘贴说明书自动填充必须包含适应症");
assert.match(freeUi, /candidate\.clinical\?\.dosage/, "粘贴说明书自动填充必须包含用法用量");

assert.match(wrangler, /"main"\s*:\s*"src\/index-v11\.js"/, "必须部署 v11");
assert.doesNotMatch(wrangler, /OPENAI_SEARCH_MODEL|"ai"\s*:/, "v11 生产配置不得依赖 OpenAI 或 Workers AI");
assert.match(worker, /findIndexedSources/, "v11 必须优先查询本地可信说明书索引");
assert.match(worker, /parseTrustedSource/, "临床字段必须从真实说明书页解析");
assert.match(worker, /manual-trusted-source-v11/, "必须支持用户粘贴可信来源直读");
assert.match(worker, /requiresPaidApi:\s*false/, "v11 必须明确无需收费 API");
assert.match(worker, /usesOpenAI:\s*false/, "v11 必须明确不使用 OpenAI");
assert.match(worker, /generatesClinicalKnowledge:\s*false/, "v11 必须明确不生成临床知识");
assert.doesNotMatch(worker, /api\.openai\.com|web_search|env\.AI\.run/, "v11 运行代码不得调用 OpenAI、Web Search 或 Workers AI");
assert.match(sourceIndex, /司美格鲁肽注射液/, "免费来源索引必须包含司美格鲁肽验收条目");
assert.match(sourceIndex, /https:\/\/ypk\.39\.net\/2310025\/manual\//, "司美格鲁肽必须绑定真实 39 说明书 URL");

assert.match(core, /!candidate\.drugName \|\| !candidate\.clinical\.indication \|\| !candidate\.clinical\.dosage/, "说明书缺少关键字段不得成为候选");
assert.match(core, /generatesClinicalKnowledge:\s*false/, "必须明确不生成临床知识");
assert.doesNotMatch(core, /env\.AI\.run|generateCandidateDetail|selected-candidate-detail/, "不得让模型凭药名生成临床资料");
assert.match(core, /格鲁肽/, "格鲁肽分类规则必须保持为降糖药");

console.log("添加药物 v11：免费可信索引 + 说明书原文自动填充安全检查通过");
