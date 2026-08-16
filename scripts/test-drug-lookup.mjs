import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, "drug-lookup.js"), "utf8"), context);

const { directlyMatchesDrug, normalize, normalizeTradeNameAliases, tradeNameAliasForDrug } = context.window.DRUG_LOOKUP;
const payload = JSON.parse(fs.readFileSync(path.join(root, "chinese-drug-labels.json"), "utf8"));
const aliases = normalizeTradeNameAliases(payload.tradeNameAliases);

assert.equal(normalize("优思灵Ｒ（笔芯）"), "优思灵r笔芯");
assert.equal(directlyMatchesDrug("阿卡波糖", payload.drugs.find(drug => drug.drugName === "阿卡波糖片")), true);

const queryOverrides = new Map([
  ["络活喜", "络活喜 5mg"],
  ["优思灵R", "优思灵Ｒ"]
]);

for (const expectedAlias of aliases) {
  const query = queryOverrides.get(expectedAlias.tradeName) || expectedAlias.tradeName;
  const drug = payload.drugs.find(item => item.drugName === expectedAlias.drugName && item.genericName === expectedAlias.genericName);
  assert.ok(drug, `${expectedAlias.drugName} 应存在于核验库`);
  const alias = tradeNameAliasForDrug(query, drug, aliases);
  assert.equal(alias?.tradeName, expectedAlias.tradeName, `${query} 应识别商品名 ${expectedAlias.tradeName}`);
  const autoFill = {
    drugName: drug.genericName || drug.drugName,
    tradeName: alias?.tradeName || drug.tradeName || "",
    specification: alias ? "" : drug.specification || ""
  };
  assert.equal(autoFill.drugName, expectedAlias.genericName);
  assert.equal(autoFill.tradeName, expectedAlias.tradeName);
  assert.equal(autoFill.specification, "", "商品名识别不得套用目录中的其他厂家包装规格");
  assert.ok(alias.source?.url.startsWith("https://"));
}

const wrongDrug = payload.drugs.find(drug => drug.drugName === "阿司匹林肠溶片");
assert.equal(tradeNameAliasForDrug("络活喜", wrongDrug, aliases), undefined, "商品名不得映射到错误通用名");

console.log(`前端药名识别测试通过｜通用名 1 例｜商品名 ${aliases.length} 例`);
