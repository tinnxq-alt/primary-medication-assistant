(() => {
  "use strict";

  const normalize = value => String(value ?? "").normalize("NFKC").toLowerCase().replace(/[\s()（）【】\[\]·•:：,，/\-_]/g, "");

  const editDistance = (left, right) => {
    const a = [...normalize(left)];
    const b = [...normalize(right)];
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 0; i < a.length; i += 1) {
      const current = [i + 1];
      for (let j = 0; j < b.length; j += 1) {
        current[j + 1] = Math.min(current[j] + 1, previous[j + 1] + 1, previous[j] + (a[i] === b[j] ? 0 : 1));
      }
      previous = current;
    }
    return previous[b.length] ?? a.length;
  };

  const fuzzyDistance = (query, value) => {
    const q = normalize(query);
    const name = normalize(value);
    if (!q || !name) return Infinity;
    const comparable = name.length > q.length ? name.slice(0, q.length) : name;
    if (Math.abs(comparable.length - q.length) > 1) return Infinity;
    return editDistance(q, comparable);
  };

  const resolveQuery = (query, drugs = []) => {
    const q = normalize(query);
    if (q.length < 4) return { query, corrected: false, correctedQuery: "", matchedDrug: null };
    const matches = [];
    for (const drug of Array.isArray(drugs) ? drugs : []) {
      for (const value of [drug?.drugName, drug?.genericName, drug?.tradeName, drug?.rawName]) {
        const name = normalize(value);
        if (!name) continue;
        const distance = fuzzyDistance(q, name);
        if (distance <= 1) matches.push({ drug, value, distance });
      }
    }
    matches.sort((a, b) => a.distance - b.distance);
    const best = matches[0];
    const uniqueDrugIds = new Set(matches.filter(item => item.distance === best?.distance).map(item => item.drug?.id || item.drug?.drugName));
    if (!best || best.distance !== 1 || uniqueDrugIds.size !== 1) return { query, corrected: false, correctedQuery: "", matchedDrug: null };
    return { query, corrected: true, correctedQuery: best.value, matchedDrug: best.drug };
  };

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
    if (q.length >= 4 && primary.some(name => fuzzyDistance(q, name) === 1)) return 500;

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
    editDistance,
    matchScore,
    normalize,
    normalizeTradeNameAliases,
    rankDrugs,
    resolveQuery,
    tradeNameAliasForDrug
  });
})();
