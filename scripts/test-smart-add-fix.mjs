import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("smart-add-fix.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");
const serviceWorker = fs.readFileSync("service-worker.js", "utf8");
const workerSource = fs.readFileSync("worker/src/index.js", "utf8");
const payload = JSON.parse(fs.readFileSync("chinese-drug-labels.json", "utf8"));

assert.match(source, /function exactDuplicate\(/, "添加药物必须先做本地重复检测");
assert.match(source, /customDrugs/, "重复检测必须包含用户已添加药物");
assert.match(source, /chineseCount\(query\) < 2/, "输入两个汉字片段即可识别，无需完整药名");
assert.match(source, /candidateCount:\s*3/, "候选阶段应一次请求 3 个候选");
assert.match(source, /\/v1\/drugs\/search/, "第一阶段必须走轻量候选接口");
assert.match(source, /\/v1\/drugs\/detail/, "选择候选后才生成完整资料");
assert.match(source, /remoteCandidateDetail\(candidate\)/, "点击候选后必须补齐所选药物资料");
assert.match(source, /选择并自动填充/, "候选按钮应明确选择后自动填充");
assert.match(source, /来源：/, "候选卡片必须显示来源");
assert.match(source, /Cloudflare Workers AI（AI 生成）/, "前端必须明确标注 AI 来源");
assert.doesNotMatch(source, /fill\(result\.candidates\[0\]/, "生成候选后不得未经选择就自动填第 1 项");
assert.match(source, /warmWorker\(\)/, "进入添加页应预热 Worker");
assert.match(source, /\/health/, "Worker 预热必须使用轻量 health 接口");
assert.match(source, /无需输入药物全称/, "页面说明必须明确支持药名片段");
assert.match(source, /stopImmediatePropagation\(\)/, "新链路必须阻止 app.js 旧识别逻辑重复执行");
assert.doesNotMatch(source, /scrollIntoView|window\.scrollTo|location\.reload/, "智能识别不得引发页面跳动或刷新");

assert.ok(html.includes('src="smart-add-fix.js"'), "页面必须加载新药智能识别脚本");
assert.ok(html.indexOf('src="app.js"') < html.indexOf('src="smart-add-fix.js"'), "智能识别脚本必须在主应用之后加载");
assert.match(html, /rel="preconnect"[^>]+primary-medication-smart-search\.tinnxq\.workers\.dev/, "页面应预连接 Worker");
assert.ok(serviceWorker.includes('"./smart-add-fix.js"'), "PWA 必须缓存智能识别脚本");
assert.ok(Number(serviceWorker.match(/primary-medication-v(\d+)/)?.[1] || 0) >= 39, "PWA 缓存版本必须至少 v39");

assert.match(workerSource, /mode:\s*"partial-name-fast-candidates"/, "Worker 第一阶段必须明确为药名片段候选模式");
assert.match(workerSource, /mode:\s*"selected-candidate-detail"/, "Worker 第二阶段必须只生成所选候选资料");
assert.match(workerSource, /minItems:\s*3/, "候选阶段应返回 3 个候选");
assert.match(workerSource, /maxItems:\s*3/, "候选阶段固定 3 个以优化速度");
assert.match(workerSource, /max_tokens:\s*420/, "候选阶段必须限制短输出以提高检索速度");
assert.match(workerSource, /max_tokens:\s*650/, "详情阶段只生成一个候选的临床资料");
assert.match(workerSource, /不要求完整药名/, "Worker 必须理解输入可能只是药名片段");
assert.match(workerSource, /sourceTitle/, "Worker 必须写入 AI 来源");
assert.match(workerSource, /Cloudflare Workers AI/, "来源必须明确标记为 Cloudflare Workers AI");
assert.doesNotMatch(workerSource, /fetchCatalog|CATALOG_URL/, "Worker 不应下载或扫描远程药品库");

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync("drug-lookup.js", "utf8"), context);
const { normalize, normalizeTradeNameAliases } = context.window.DRUG_LOOKUP;
const aliases = normalizeTradeNameAliases(payload.tradeNameAliases);
assert.ok(payload.drugs.some(drug => [drug.drugName, drug.genericName].some(name => normalize(name).includes(normalize("阿卡")))), "阿卡片段应能匹配已收录阿卡波糖");
const tradeAlias = aliases.find(alias => normalize(alias.tradeName) === normalize("络活喜"));
assert.equal(tradeAlias?.genericName, "苯磺酸氨氯地平", "商品名仍应映射到现有通用名用于重复检测");

console.log("添加药物：药名片段、多候选、两阶段快速填充与来源标注检查通过");
