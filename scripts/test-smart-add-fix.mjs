import assert from "node:assert/strict";
import fs from "node:fs";

const ui = fs.readFileSync("smart-add-fix.js", "utf8");
const worker = fs.readFileSync("worker/src/index-v10.js", "utf8");
const core = fs.readFileSync("worker/src/index-v3.js", "utf8");
const wrangler = fs.readFileSync("worker/wrangler.jsonc", "utf8");

assert.match(ui, /function exactDuplicate\(/, "添加药物必须保留本地重复检测");
assert.match(ui, /chineseCount\(query\) < 2/, "两个汉字片段即可检索");
assert.match(ui, /remoteInstructionCandidates\(query\)/, "必须调用联网说明书候选接口");
assert.match(ui, /查看原说明书/, "候选必须可查看来源");
assert.match(ui, /选择并自动填充/, "用户选择候选后才自动填充");
assert.match(ui, /candidate\.clinical\?\.indication/, "自动填充包含适应症");
assert.match(ui, /candidate\.clinical\?\.dosage/, "自动填充包含用法用量");
assert.doesNotMatch(ui, /remoteCandidateDetail|\/v1\/drugs\/detail/, "前端不得调用 AI 生成临床详情");

assert.match(wrangler, /"main"\s*:\s*"src\/index-v10\.js"/, "必须部署 v10");
assert.match(worker, /api\.openai\.com\/v1\/responses/, "来源发现使用 Responses API");
assert.match(worker, /type:\s*"web_search"/, "必须启用 Web Search");
assert.match(worker, /allowed_domains:\s*OPENAI_ALLOWED_DOMAINS/, "Web Search 必须限定可信来源域名");
assert.match(worker, /\["ypk\.39\.net",\s*"yaopinnet\.com"\]/, "只允许 39 药品通和药源网进入搜索源");
assert.match(worker, /collectOpenAIWebSources/, "必须读取 Web Search 实际来源 URL");
assert.match(worker, /normalizeSearchSource/, "来源 URL 必须二次过滤");
assert.match(worker, /parseTrustedSource/, "临床字段必须从真实说明书页解析");
assert.match(worker, /不负责生成医学知识/, "搜索模型不得生成医学知识");
assert.match(worker, /store:\s*false/, "搜索请求默认不存储");
assert.match(worker, /openai-web-search-source-v10/, "响应标记 v10");
assert.match(worker, /workerV9\.fetch/, "未配置 API Key 时保留安全降级");

assert.match(core, /!candidate\.drugName \|\| !candidate\.clinical\.indication \|\| !candidate\.clinical\.dosage/, "说明书缺少关键字段不得成为候选");
assert.match(core, /generatesClinicalKnowledge:\s*false/, "必须明确不生成临床知识");
assert.doesNotMatch(core, /env\.AI\.run|generateCandidateDetail|selected-candidate-detail/, "不得让模型凭药名生成临床资料");
assert.match(core, /格鲁肽/, "格鲁肽分类规则必须保持为降糖药");

console.log("添加药物 v10：Web Search 只找来源 + 说明书原文自动填充安全检查通过");
