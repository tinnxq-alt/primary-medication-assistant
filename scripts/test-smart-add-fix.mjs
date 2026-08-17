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
assert.match(source, /candidateCount:\s*3/, "前端应一次请求多个候选而不是多次调用 AI");
assert.match(source, /warmWorker\(\)/, "进入添加页应预热 Worker");
assert.match(source, /\/health/, "Worker 预热必须使用轻量 health 接口");
assert.doesNotMatch(source, /fill\(result\.candidates\[0\]/, "生成候选后不得未经选择就自动填入第 1 项");
assert.match(source, /data-new-drug-use/, "候选必须提供可选择操作");
assert.match(source, /选择并填充/, "候选按钮应明确为选择后自动填充");
assert.match(source, /来源：/, "候选卡片必须显示来源");
assert.match(source, /Cloudflare Workers AI（模型生成，未核验）/, "前端必须给 AI 候选标注来源与未核验属性");
assert.match(source, /已生成 \$\{result\.candidates\.length\} 个候选/, "生成后应提示用户从多个候选中选择");
assert.match(source, /发现相似条目/, "相似药只提示，不得直接当作重复药阻断");
assert.match(source, /无需重复添加/, "完全同名或已知商品名必须阻止重复添加");
assert.match(source, /stopImmediatePropagation\(\)/, "新链路必须阻止 app.js 旧识别逻辑重复执行");
assert.doesNotMatch(source, /localCandidates\(/, "添加新药不应再把已收录药作为自动填充候选");
assert.doesNotMatch(source, /scrollIntoView|window\.scrollTo|location\.reload/, "智能识别不得引发页面跳动或刷新");

assert.ok(html.includes('src="smart-add-fix.js"'), "页面必须加载新药智能识别脚本");
assert.ok(html.indexOf('src="app.js"') < html.indexOf('src="smart-add-fix.js"'), "修复脚本必须在主应用之后加载");
assert.match(html, /rel="preconnect"[^>]+primary-medication-smart-search\.tinnxq\.workers\.dev/, "页面应预连接 Worker 以减少首次请求延迟");
assert.ok(serviceWorker.includes('"./smart-add-fix.js"'), "PWA 必须缓存智能识别脚本");
assert.ok(Number(serviceWorker.match(/primary-medication-v(\d+)/)?.[1] || 0) >= 38, "PWA 缓存版本必须至少 v38");

assert.match(workerSource, /mode:\s*"new-drug-ai-candidates"/, "Worker 必须明确为多候选模式");
assert.match(workerSource, /minItems:\s*3/, "Worker 结构化输出至少应生成 3 个候选");
assert.match(workerSource, /maxItems:\s*5/, "Worker 结构化输出最多应生成 5 个候选");
assert.match(workerSource, /max_tokens:\s*1400/, "多候选应控制单次输出长度，避免明显拖慢速度");
assert.match(workerSource, /90 个汉字以内/, "每个候选的临床字段应保持精简");
assert.match(workerSource, /sourceTitle/, "Worker 必须为候选写入来源");
assert.match(workerSource, /Cloudflare Workers AI/, "来源必须明确标记为 Cloudflare Workers AI");
assert.doesNotMatch(workerSource, /fetchCatalog|CATALOG_URL/, "新药 Worker 不应下载或扫描远程核验库");
assert.match(workerSource, /elapsedMs/, "Worker 应返回耗时便于后续性能观察");

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync("drug-lookup.js", "utf8"), context);
const { normalize, normalizeTradeNameAliases } = context.window.DRUG_LOOKUP;
const aliases = normalizeTradeNameAliases(payload.tradeNameAliases);

assert.ok(payload.drugs.some(drug => [drug.drugName, drug.genericName].some(name => normalize(name) === normalize("阿卡波糖"))), "阿卡波糖应可被本地重复检测识别为已收录药");
const tradeAlias = aliases.find(alias => normalize(alias.tradeName) === normalize("络活喜"));
assert.equal(tradeAlias?.genericName, "苯磺酸氨氯地平", "已知商品名应映射到现有通用名用于重复检测");

console.log("添加药物：多候选选择、来源标注、重复检测与快速单次 AI 链路检查通过");