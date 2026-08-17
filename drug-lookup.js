(() => {
  "use strict";

  const normalize = value => String(value ?? "").normalize("NFKC").toLowerCase().replace(/[\s()（）【】\[\]·•:：,，/\-_]/g, "");

  const normalizeTradeNameAliases = aliases => Array.isArray(aliases)
    ? aliases.filter(alias => alias && alias.tradeName && alias.drugName && alias.genericName)
    : [];

  const aliasesMatchingQuery = (query, aliases = []) => {
    const q = normalize(query);
    if (!q) return [];
    return normalizeTradeNameAliases(aliases).filter(alias => {
      const name = normalize(alias.tradeName);
      return name && (name === q || name.includes(q) || (name.length >= 2 && q.includes(name)));
    });
  };

  const aliasTargetsDrug = (alias, drug) => {
    const drugName = normalize(drug?.drugName);
    const genericName = normalize(drug?.genericName || drug?.drugName);
    return normalize(alias?.drugName) === drugName || normalize(alias?.genericName) === genericName;
  };

  const tradeNameAliasForDrug = (query, drug, aliases = []) => aliasesMatchingQuery(query, aliases)
    .find(alias => aliasTargetsDrug(alias, drug));

  const directlyMatchesDrug = (query, drug) => {
    const q = normalize(query);
    if (!q) return false;
    return [drug?.drugName, drug?.rawName, drug?.genericName, drug?.tradeName].some(value => {
      const name = normalize(value);
      return name && (name.includes(q) || (name.length >= 2 && q.includes(name)));
    });
  };

  const matchScore = (query, drug, aliases = []) => {
    const q = normalize(query);
    if (!q || !drug) return 0;
    const primary = [drug.drugName, drug.genericName, drug.tradeName, drug.rawName]
      .map(normalize).filter(Boolean);
    if (primary.some(name => name === q)) return 1000;
    if (primary.some(name => name.startsWith(q))) return 800;
    if (primary.some(name => name.includes(q))) return 600;

    const aliasMatch = aliasesMatchingQuery(query, aliases).find(alias => aliasTargetsDrug(alias, drug));
    if (aliasMatch) {
      const aliasName = normalize(aliasMatch.tradeName);
      if (aliasName === q) return 900;
      if (aliasName.startsWith(q)) return 750;
      return 550;
    }

    const secondary = [drug.specification, drug.manufacturer, drug.therapeuticClass, drug.category]
      .map(normalize).filter(Boolean);
    if (secondary.some(value => value.includes(q))) return 300;
    return 0;
  };

  const rankDrugs = (query, drugs = [], aliases = [], limit = 20) => (Array.isArray(drugs) ? drugs : [])
    .map((drug, index) => ({ drug, index, score: matchScore(query, drug, aliases) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(1, Number(limit) || 20))
    .map(item => item.drug);

  window.DRUG_LOOKUP = Object.freeze({
    aliasesMatchingQuery,
    directlyMatchesDrug,
    matchScore,
    normalize,
    normalizeTradeNameAliases,
    rankDrugs,
    tradeNameAliasForDrug
  });
})();
