import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = process.env.YAOPINNET_OUTPUT || "/tmp/yaopinnet-monographs.json";
const CONCURRENCY = Math.max(1, Math.min(10, Number(process.env.YAOPINNET_CONCURRENCY) || 8));
const LETTERS = "abcdefghjklmnpqrstwxyz".split("");
const SECTIONS = ["huayao1", "zhongyao1"];

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
    .replace(/[\s·•_\-（）()\[\]【】]/g, "");
}

function lookupKeys(value) {
  const raw = String(value || "").normalize("NFKC");
  const variants = new Set([raw]);
  variants.add(raw.replace(/\((?:泰诺|无糖型|胶囊型|笔芯)\)$/i, ""));
  variants.add(raw.replace(/\((?:i|ii|iii|iv|Ⅰ|Ⅱ|Ⅲ|Ⅳ)\)$/i, match => match.toUpperCase()));
  return [...variants].map(normalize).filter(Boolean);
}

async function fetchText(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; PrimaryMedicationAssistant/1.0; clinical-data-verification)" },
        signal: AbortSignal.timeout(20_000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      if (text.length < 500) throw new Error(`响应正文异常短（${text.length} 字符）`);
      return text;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError;
}

async function mapConcurrent(items, mapper, concurrency = CONCURRENCY) {
  const results = new Array(items.length);
  let cursor = 0;
  let completed = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
      completed += 1;
      process.stderr.write(`\r${completed}/${items.length}   `);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  process.stderr.write("\n");
  return results;
}

function parseIndex(html) {
  const entries = [];
  for (const match of html.matchAll(/<li><a\s+href=['"]([^'"]+)['"]>([\s\S]*?)<\/a><\/li>/gi)) {
    const name = decodeHtml(match[2]);
    if (name && /^\/(?:hua|zhong)yao\//.test(match[1])) entries.push({ name, path: match[1] });
  }
  const pages = [...html.matchAll(/\/(?:hua|zhong)yao1\/[a-z](\d+)\.htm/gi)].map(match => Number(match[1]));
  return { entries, maxPage: Math.max(1, ...pages) };
}

function extractSection(html, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<li\\s+class="smsli">\\s*【${escaped}】([\\s\\S]*?)</li>`, "i");
  return decodeHtml(html.match(pattern)?.[1]);
}

function parseManual(html, entry) {
  const nameBlock = extractSection(html, "药品名称");
  const genericName = String(nameBlock.match(/通用名称[：:]\s*([^\n]+)/)?.[1] || entry.name).trim();
  const indication = extractSection(html, "适应症") || extractSection(html, "功能主治");
  return {
    genericName,
    sourceSpecification: extractSection(html, "规格"),
    clinical: {
      indication,
      dosage: extractSection(html, "用法用量"),
      adverseReactions: extractSection(html, "不良反应"),
      precautions: extractSection(html, "注意事项")
    },
    source: {
      label: `药源网：${genericName}说明书`,
      url: `https://www.yaopinnet.com${entry.path}`
    }
  };
}

function isNonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0 && value.trim() !== "暂无数据";
}

globalThis.window = { addEventListener() {}, dispatchEvent() {} };
await import(pathToFileURL(path.join(ROOT, "outpatient-clinical-hydration.js")).href);
await import(pathToFileURL(path.join(ROOT, "outpatient-drugs.js")).href);
await import(pathToFileURL(path.join(ROOT, "outpatient-web-verification.js")).href);
const labels = JSON.parse(fs.readFileSync(path.join(ROOT, "chinese-drug-labels.json"), "utf8"));
const hydrated = window.applyOutpatientClinicalReferences(window.OUTPATIENT_DRUG_CATALOG, labels).catalog;
const missing = hydrated.filter(drug => !drug.clinical);
const unique = [...new Map(missing.map(drug => [drug.drugName, drug])).values()];

const firstPageRequests = SECTIONS.flatMap(section => LETTERS.map(letter => ({ section, letter, page: 1 })));
const firstPages = await mapConcurrent(firstPageRequests, async request => {
  const url = `https://www.yaopinnet.com/${request.section}/${request.letter}1.htm`;
  return { ...request, html: await fetchText(url) };
});
const remainingPageGroups = await mapConcurrent(firstPages, async firstPage => {
  const pages = [];
  for (let page = 2; page <= 60; page += 1) {
    const url = `https://www.yaopinnet.com/${firstPage.section}/${firstPage.letter}${page}.htm`;
    let html;
    try {
      html = await fetchText(url);
    } catch (error) {
      if (/HTTP 404/.test(error.message)) break;
      throw error;
    }
    const parsed = parseIndex(html);
    if (!parsed.entries.length) break;
    pages.push({ section: firstPage.section, letter: firstPage.letter, page, html });
  }
  return pages;
});
const remainingPages = remainingPageGroups.flat();
const indexEntries = [...firstPages, ...remainingPages].flatMap(item => parseIndex(item.html).entries);
const index = new Map();
for (const entry of indexEntries) {
  for (const key of lookupKeys(entry.name)) {
    if (!index.has(key)) index.set(key, []);
    if (!index.get(key).some(item => item.path === entry.path)) index.get(key).push(entry);
  }
}

const resolved = unique.map(drug => {
  const candidates = lookupKeys(drug.drugName).flatMap(key => index.get(key) || []);
  const deduped = [...new Map(candidates.map(entry => [entry.path, entry])).values()];
  return { drug, candidates: deduped };
});
const manualRequests = resolved.flatMap(({ drug, candidates }) => candidates.slice(0, 3).map(entry => ({ drug, entry })));
const manuals = await mapConcurrent(manualRequests, async request => {
  try {
    const html = await fetchText(`https://www.yaopinnet.com${request.entry.path}`);
    return { ...request, ...parseManual(html, request.entry) };
  } catch (error) {
    return { ...request, error: error.message };
  }
});
const manualsByName = new Map();
for (const manual of manuals) {
  if (!manualsByName.has(manual.drug.drugName)) manualsByName.set(manual.drug.drugName, []);
  manualsByName.get(manual.drug.drugName).push(manual);
}

const results = unique.map(drug => {
  const candidates = manualsByName.get(drug.drugName) || [];
  const scored = candidates.map(candidate => ({
    ...candidate,
    score: Object.values(candidate.clinical || {}).filter(isNonEmpty).length
  })).sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return { ...drug, status: "not-found" };
  const missingFields = Object.entries(best.clinical).filter(([, value]) => !isNonEmpty(value)).map(([key]) => key);
  return {
    ...drug,
    status: missingFields.length ? "incomplete" : "matched",
    source: best.source,
    sourceSpecification: best.sourceSpecification,
    clinical: best.clinical,
    missingFields,
    candidatesChecked: scored.length
  };
});

const counts = results.reduce((acc, result) => {
  acc[result.status] = (acc[result.status] || 0) + 1;
  return acc;
}, {});
fs.writeFileSync(OUTPUT, `${JSON.stringify({ generatedAt: new Date().toISOString(), indexEntryCount: indexEntries.length, counts, results }, null, 2)}\n`);
console.log(JSON.stringify({ output: OUTPUT, indexEntryCount: indexEntries.length, counts }));
