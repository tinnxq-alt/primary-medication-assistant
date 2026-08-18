const FREE_SOURCE_INDEX = Object.freeze([
  Object.freeze({
    drugName: "司美格鲁肽注射液",
    aliases: ["司美", "司美格鲁肽", "诺和泰", "Ozempic", "Semaglutide"],
    urls: [
      "https://ypk.39.net/2310025/manual/",
      "https://www.yaopinnet.com/huayao/hy7378h.htm"
    ]
  }),
  Object.freeze({
    drugName: "阿卡波糖片",
    aliases: ["阿卡波糖", "拜唐苹", "Acarbose"],
    urls: ["https://ypk.39.net/498311/manual/"]
  }),
  Object.freeze({
    drugName: "阿奇霉素片",
    aliases: ["阿奇霉素", "希舒美", "Azithromycin"],
    urls: ["https://ypk.39.net/500249/manual/"]
  }),
  Object.freeze({
    drugName: "孟鲁司特钠片",
    aliases: ["孟鲁司特", "孟鲁", "顺尔宁", "Montelukast"],
    urls: ["https://ypk.39.net/2029378/manual/"]
  })
]);

function normalizeSourceKey(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s()（）【】\[\]〖〗·•:：,，/\\_\-"'“”‘’]/g, "");
}

function findIndexedSources(query, limit = 6) {
  const q = normalizeSourceKey(query);
  if (!q) return [];
  const results = [];
  const seen = new Set();

  for (const entry of FREE_SOURCE_INDEX) {
    const keys = [entry.drugName, ...entry.aliases].map(normalizeSourceKey).filter(Boolean);
    const matched = keys.some(key => key.includes(q) || q.includes(key));
    if (!matched) continue;
    for (const url of entry.urls) {
      if (!url || seen.has(url)) continue;
      seen.add(url);
      results.push({ drugName: entry.drugName, url });
      if (results.length >= limit) return results;
    }
  }
  return results;
}

export { FREE_SOURCE_INDEX, findIndexedSources, normalizeSourceKey };
