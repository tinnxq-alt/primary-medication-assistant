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
      return name.length >= 2 && (name === q || q.includes(name));
    });
  };

  const aliasTargetsDrug = (alias, drug) => normalize(alias.drugName) === normalize(drug.drugName)
    && normalize(alias.genericName) === normalize(drug.genericName || drug.drugName);

  const tradeNameAliasForDrug = (query, drug, aliases = []) => aliasesMatchingQuery(query, aliases)
    .find(alias => aliasTargetsDrug(alias, drug));

  const directlyMatchesDrug = (query, drug) => {
    const q = normalize(query);
    if (!q) return false;
    return [drug.drugName, drug.rawName, drug.genericName, drug.tradeName].some(value => {
      const name = normalize(value);
      return name && (name.includes(q) || (name.length >= 2 && q.includes(name)));
    });
  };

  window.DRUG_LOOKUP = Object.freeze({
    aliasesMatchingQuery,
    directlyMatchesDrug,
    normalize,
    normalizeTradeNameAliases,
    tradeNameAliasForDrug
  });
})();
