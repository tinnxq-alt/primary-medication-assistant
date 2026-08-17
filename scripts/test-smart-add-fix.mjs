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
assert.match(source, /newDrugOnly:\s*true/, "确认未收录后必须进入新药专用 Worker 链路");
assert.match(source, /warmWorker\(\)/, "进入添加页应预热 Worker");
assert.match(source, /\/health/, "Worker 预热必须使用轻量 health 接口");
assert.match(source, /fill\(result\.candidates\[0\], node\)/, "新药候选返回后必须自动填入第 1 项");
assert.match(source, /发现相似条目/, "相似药只提示，不得直接当作重复药阻断");
assert.match(source, /无需重复添加/, "完全同名或已知商品名必须阻止重复添加");
assert.match(source, /stopImmediatePropagation\(\)/, "新链路必须阻止 app.js 旧识别逻辑重复执行");
assert.doesNotMatch(source, /localCandidates\(/, "添加新药不应再把已收录药作为自动填充候选");
assert.doesNotMatch(source, /scrollIntoView|window\.scrollTo|location\.reload/, "智能识别不得引发页面跳动或刷新");

assert.ok(html.includes('src="smart-add-fix.js"'), "页面必须加载新药智能识别脚本");
assert.ok(html.indexOf('src="app.js"') < html.indexOf('src="smart-add-fix.js"'), "修复脚本必须在主应用之后加载");
assert.match(html, /rel="preconnect"[^>]+primary-medication-smart-search\.tinnxq\.workers\.dev/, "页面应预连接 Worker 以减少首次请求延迟");
assert.ok(serviceWorker.includes('"./smart-add-fix.js"'), "PWA 必须缓存智能识别脚本");
assert.ok(Number(serviceWorker.match(/primary-medication-v(\d+)/)?.[1] || 0) >= 37, "PWA 缓存版本必须至少 v37");

assert.match(workerSource, /mode:\s*"new-drug-ai-draft"/, "Worker 必须明确为新药草稿模式");
assert.match(workerSource, /max_tokens:\s*900/, "AI 输出长度应收敛以优化速度");
assert.match(workerSource, /160 个汉字以内/, "临床字段应要求简洁输出以减少生成时间");
assert.doesNotMatch(workerSource, /fetchCatalog|CATALOG_URL/, "新药 Worker 不应再下载或扫描远程核验库");
assert.match(workerSource, /elapsedMs/, "Worker 应返回耗时便于后续性能观察");

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync("drug-lookup.js", "utf8"), context);
const { normalize, normalizeTradeNameAliases } = context.window.DRUG_LOOKUP;
const aliases = normalizeTradeNameAliases(payload.tradeNameAliases);

assert.ok(payload.drugs.some(drug => [drug.drugName, drug.genericName].some(name => normalize(name) === normalize("阿卡波糖"))), "阿卡波糖应可被本地重复检测识别为已收录药");
const tradeAlias = aliases.find(alias => normalize(alias.tradeName) === normalize("络活喜"));
assert.equal(tradeAlias?.genericName, "苯磺酸氨氯地平", "已知商品名应映射到现有通用名用于重复检测");

console.log("添加药物：仅新药智能识别、重复检测、Worker 预热与快速 AI 链路检查通过");
