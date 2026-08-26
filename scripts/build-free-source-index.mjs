import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "worker/src/free-source-index.js");
const TRUSTED_HOSTS = new Set(["ypk.39.net", "yaopinnet.com", "www.yaopinnet.com"]);
const SEEDS = [
  { drugName: "司美格鲁肽注射液", aliases: ["司美", "司美格鲁肽", "诺和泰", "Ozempic", "Semaglutide"], urls: ["https://ypk.39.net/2310025/manual/", "https://www.yaopinnet.com/huayao/hy7378h.htm"] },
  { drugName: "阿卡波糖片", aliases: ["阿卡波糖", "拜唐苹", "Acarbose"], urls: ["https://ypk.39.net/498311/manual/"] },
  { drugName: "阿奇霉素片", aliases: ["阿奇霉素", "希舒美", "Azithromycin"], urls: ["https://ypk.39.net/500249/manual/"] },
  { drugName: "孟鲁司特钠片", aliases: ["孟鲁司特", "孟鲁", "顺尔宁", "Montelukast"], urls: ["https://ypk.39.net/2029378/manual/"] }
];

function trustedUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") return "";
    const host = url.hostname.toLowerCase();
    if (TRUSTED_HOSTS.has(host) || host === "nmpa.gov.cn" || host.endsWith(".nmpa.gov.cn") || host === "cde.org.cn" || host.endsWith(".cde.org.cn")) return url.href;
  } catch {}
  return "";
}

const entries = new Map();
function add(drugName, aliases, urls) {
  const name = String(drugName || "").trim();
  if (!name) return;
  if (!entries.has(name)) entries.set(name, { drugName: name, aliases: new Set(), urls: new Set() });
  const entry = entries.get(name);
  for (const alias of aliases || []) if (String(alias || "").trim()) entry.aliases.add(String(alias).trim());
  for (const url of urls || []) {
    const trusted = trustedUrl(url);
    if (trusted) entry.urls.add(trusted);
  }
}

for (const seed of SEEDS) add(seed.drugName, seed.aliases, seed.urls);
const labels = JSON.parse(fs.readFileSync(path.join(ROOT, "chinese-drug-labels.json"), "utf8"));
for (const drug of labels.drugs || []) add(drug.drugName, [drug.genericName, drug.tradeName], [drug.source?.url]);
for (const alias of labels.tradeNameAliases || []) add(alias.drugName, [alias.tradeName, alias.genericName], [alias.source?.url]);

globalThis.window = { addEventListener() {}, dispatchEvent() {} };
await import(pathToFileURL(path.join(ROOT, "outpatient-clinical-supplement.js")).href);
await import(pathToFileURL(path.join(ROOT, "outpatient-clinical-hydration.js")).href);
await import(pathToFileURL(path.join(ROOT, "outpatient-drugs.js")).href);
await import(pathToFileURL(path.join(ROOT, "outpatient-web-verification.js")).href);
const outpatient = window.applyOutpatientClinicalCoverage(window.OUTPATIENT_DRUG_CATALOG, labels).catalog;
for (const drug of outpatient) {
  add(drug.drugName, [drug.genericName, drug.tradeName, drug.rawName], [drug.source?.url, drug.clinical?.source?.url]);
}

const serializable = [...entries.values()]
  .map(entry => ({ drugName: entry.drugName, aliases: [...entry.aliases], urls: [...entry.urls].slice(0, 5) }))
  .filter(entry => entry.urls.length)
  .sort((a, b) => a.drugName.localeCompare(b.drugName, "zh-CN"));

const output = `/* 此文件由 scripts/build-free-source-index.mjs 生成，请勿手工编辑。 */
const FREE_SOURCE_INDEX = Object.freeze(${JSON.stringify(serializable, null, 2)}.map(entry => Object.freeze({
  ...entry,
  aliases: Object.freeze(entry.aliases),
  urls: Object.freeze(entry.urls)
})));

function normalizeSourceKey(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\\s()（）【】\\[\\]〖〗·•:：,，/\\\\_\\-\"'“”‘’]/g, "");
}

function editDistance(left, right) {
  const a = [...normalizeSourceKey(left)];
  const b = [...normalizeSourceKey(right)];
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 0; i < a.length; i += 1) {
    const current = [i + 1];
    for (let j = 0; j < b.length; j += 1) {
      current[j + 1] = Math.min(
        current[j] + 1,
        previous[j + 1] + 1,
        previous[j] + (a[i] === b[j] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[b.length];
}

function findIndexedSources(query, limit = 6) {
  const q = normalizeSourceKey(query);
  if (!q) return [];
  const matches = [];
  for (const entry of FREE_SOURCE_INDEX) {
    const keys = [entry.drugName, ...entry.aliases].map(value => ({ raw: value, normalized: normalizeSourceKey(value) })).filter(item => item.normalized);
    const exact = keys.find(item => item.normalized.includes(q) || q.includes(item.normalized));
    const fuzzy = !exact && q.length >= 4
      ? keys.map(item => ({ ...item, distance: editDistance(q, item.normalized) })).filter(item => item.distance <= 1).sort((a, b) => a.distance - b.distance)[0]
      : null;
    if (!exact && !fuzzy) continue;
    matches.push({
      entry,
      matchedKey: (exact || fuzzy).raw,
      matchType: exact ? "exact" : "fuzzy-one-edit",
      score: exact ? (normalizeSourceKey(exact.raw) === q ? 1000 : 800) : 600
    });
  }
  matches.sort((a, b) => b.score - a.score || a.entry.drugName.localeCompare(b.entry.drugName, "zh-CN"));
  const results = [];
  const seen = new Set();
  for (const match of matches) {
    const { entry } = match;
    for (const url of entry.urls) {
      if (!url || seen.has(url)) continue;
      seen.add(url);
      results.push({ drugName: entry.drugName, url, matchedKey: match.matchedKey, matchType: match.matchType, score: match.score });
      if (results.length >= limit) return results;
    }
  }
  return results;
}

export { FREE_SOURCE_INDEX, editDistance, findIndexedSources, normalizeSourceKey };
`;

fs.writeFileSync(OUTPUT, output);
console.log(JSON.stringify({ output: OUTPUT, entries: serializable.length }, null, 2));
