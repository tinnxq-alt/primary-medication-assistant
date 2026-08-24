import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = process.env.OUTPATIENT_MONOGRAPH_OUTPUT || "/tmp/outpatient-monographs.json";
const CONCURRENCY = Math.max(1, Math.min(8, Number(process.env.OUTPATIENT_MONOGRAPH_CONCURRENCY) || 6));
const INPUT = process.env.OUTPATIENT_MONOGRAPH_INPUT || "";
const PLACEHOLDER = /^(?:暂无数据|详见说明书|请仔细阅读说明书并遵医嘱使用)[。！!\s]*$/;
const FIELDS = {
  indication: "适应症",
  dosage: "用法用量",
  adverseReactions: "不良反应",
  precautions: "注意事项"
};

function decodeHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\r/g, "")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[（(][^）)]*(?:商品名|牌|®|™)?[^）)]*[）)]/g, "")
    .replace(/[\s·•_\-（）()\[\]【】]/g, "");
}

function activeNumbers(value) {
  return new Set(String(value || "").normalize("NFKC").toLowerCase().split("*")[0].match(/\d+(?:\.\d+)?/g) || []);
}

async function fetchText(url, attempts = 6, minimumLength = 20_000) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; PrimaryMedicationAssistant/1.0; clinical-data-verification)" },
        signal: AbortSignal.timeout(20_000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      if (text.length < minimumLength) throw new Error(`响应正文异常短（${text.length} 字符）`);
      return text;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 1_000));
    }
  }
  throw lastError;
}

function searchCandidates(html, targetName) {
  const candidates = [];
  const pattern = /<a\s+href="https:\/\/ypk\.39\.net\/(\d+)\/">[\s\S]*?<p\s+class="commonly-drug-title">([\s\S]*?)<\/p>/gi;
  for (const match of html.matchAll(pattern)) {
    const title = decodeHtml(match[2]);
    if (!normalize(title).startsWith(normalize(targetName))) continue;
    if (!candidates.some(candidate => candidate.id === match[1])) candidates.push({ id: match[1], title });
  }
  return candidates.slice(0, 8);
}

function extractField(html, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<p\\s+class="drug-explain-tit">\\s*【${escaped}】\\s*</p>\\s*<p\\s+class="drug-explain-txt">([\\s\\S]*?)</p>`, "i");
  return decodeHtml(html.match(pattern)?.[1]);
}

function parseManual(html, id) {
  const drugNameBlock = extractField(html, "药品名称");
  const genericName = String(drugNameBlock.match(/通用名称[：:]\s*([^\n]+)/)?.[1] || "").trim();
  const specification = extractField(html, "规格");
  const clinical = Object.fromEntries(Object.entries(FIELDS).map(([key, label]) => [key, extractField(html, label)]));
  return {
    id,
    url: `https://ypk.39.net/${id}/manual/`,
    genericName,
    specification,
    clinical
  };
}

function usableField(value) {
  const text = String(value || "").trim();
  return text.length >= 2 && !PLACEHOLDER.test(text);
}

function scoreCandidate(target, candidate) {
  const targetName = normalize(target.drugName);
  const candidateName = normalize(candidate.genericName);
  if (!candidateName || candidateName !== targetName) return -Infinity;
  let score = 100;
  for (const field of Object.keys(FIELDS)) score += usableField(candidate.clinical[field]) ? 20 : -40;
  const targetNumbers = activeNumbers(target.specification);
  const candidateNumbers = activeNumbers(candidate.specification);
  for (const number of targetNumbers) if (candidateNumbers.has(number)) score += 3;
  return score;
}

async function resolveDrug(drug) {
  const searchNames = [...new Set([
    drug.drugName,
    String(drug.drugName).normalize("NFKC").replace(/\((?:泰诺|无糖型|胶囊型|笔芯)\)$/i, ""),
    String(drug.drugName).normalize("NFKC").replace(/\((?:i|ii|iii|iv|Ⅰ|Ⅱ|Ⅲ|Ⅳ)\)$/i, "")
  ].filter(Boolean))];
  let searchUrl = "";
  try {
    let candidates = [];
    for (const searchName of searchNames) {
      searchUrl = `https://ypk.39.net/search/${encodeURIComponent(searchName)}`;
      const searchHtml = await fetchText(searchUrl);
      candidates = searchCandidates(searchHtml, drug.drugName);
      if (!candidates.length && searchName !== drug.drugName) candidates = searchCandidates(searchHtml, searchName);
      if (candidates.length) break;
    }
    if (!candidates.length) return { ...drug, status: "not-found", searchUrl };
    const parsed = [];
    for (const candidate of candidates) {
      try {
        const manual = parseManual(await fetchText(`https://ypk.39.net/${candidate.id}/manual/`), candidate.id);
        parsed.push({ ...manual, title: candidate.title, score: scoreCandidate(drug, manual) });
        if (parsed.at(-1).score >= 180) break;
      } catch (error) {
        parsed.push({ id: candidate.id, title: candidate.title, score: -Infinity, error: error.message });
      }
    }
    parsed.sort((a, b) => b.score - a.score);
    const best = parsed[0];
    if (!best || !Number.isFinite(best.score)) return { ...drug, status: "name-mismatch", searchUrl, candidates: parsed };
    const missingFields = Object.keys(FIELDS).filter(field => !usableField(best.clinical[field]));
    return {
      ...drug,
      status: missingFields.length ? "incomplete" : "matched",
      searchUrl,
      source: { label: `39药品通：${best.title}详细说明书`, url: best.url },
      sourceSpecification: best.specification,
      clinical: best.clinical,
      missingFields,
      candidatesChecked: parsed.length
    };
  } catch (error) {
    return { ...drug, status: "error", searchUrl, error: error.message };
  }
}

globalThis.window = { addEventListener() {}, dispatchEvent() {} };
await import(pathToFileURL(path.join(ROOT, "outpatient-clinical-hydration.js")).href);
await import(pathToFileURL(path.join(ROOT, "outpatient-drugs.js")).href);
await import(pathToFileURL(path.join(ROOT, "outpatient-web-verification.js")).href);
const labels = JSON.parse(fs.readFileSync(path.join(ROOT, "chinese-drug-labels.json"), "utf8"));
const hydrated = window.applyOutpatientClinicalReferences(window.OUTPATIENT_DRUG_CATALOG, labels).catalog;
const missing = hydrated.filter(drug => !drug.clinical);
const priorResults = INPUT && fs.existsSync(INPUT) ? JSON.parse(fs.readFileSync(INPUT, "utf8")).results || [] : [];
const alreadyMatched = new Set(priorResults.filter(result => result.status === "matched").map(result => result.drugName));
const unique = [...new Map(missing.map(drug => [drug.drugName, drug])).values()].filter(drug => !alreadyMatched.has(drug.drugName));
const results = new Array(unique.length);
let cursor = 0;
let completed = 0;

async function worker() {
  while (cursor < unique.length) {
    const index = cursor++;
    results[index] = await resolveDrug(unique[index]);
    completed += 1;
    const counts = results.filter(Boolean).reduce((acc, result) => {
      acc[result.status] = (acc[result.status] || 0) + 1;
      return acc;
    }, {});
    process.stderr.write(`\r${completed}/${unique.length} ${JSON.stringify(counts)}   `);
    fs.writeFileSync(OUTPUT, `${JSON.stringify({ generatedAt: new Date().toISOString(), results: results.filter(Boolean) }, null, 2)}\n`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
process.stderr.write("\n");
fs.writeFileSync(OUTPUT, `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`);
console.log(OUTPUT);
