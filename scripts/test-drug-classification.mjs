import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../drug-classification.js", import.meta.url), "utf8");
const context = {
  window: {
    DRUG_CATALOG: [{
      drugName: "阿奇霉素片",
      genericName: "阿奇霉素",
      category: "西药",
      therapeuticClass: "抗菌药"
    }],
    OUTPATIENT_DRUG_CATALOG: []
  }
};
vm.createContext(context);
vm.runInContext(source, context);

const classification = context.window.DRUG_CLASSIFICATION;
assert.deepEqual([...classification.categories], ["西药", "中成药"], "药品分类只能表示药品属性");

assert.deepEqual(
  { ...classification.classifyCandidate({
    drugName: "司美格鲁肽注射液",
    approvalNumber: "国药准字SJ20210014",
    category: "降糖药",
    clinical: { indication: "用于成人2型糖尿病患者的血糖控制。" }
  }) },
  { category: "西药", therapeuticClass: "降糖药" },
  "旧接口的作用分类不得再写入药品分类"
);

assert.deepEqual(
  { ...classification.classifyCandidate({
    drugName: "百令胶囊",
    category: "中成药",
    sourceUrl: "https://www.yaopinnet.com/zhongyao/zy37384.htm",
    clinical: { indication: "补肺肾、益精气。" }
  }) },
  { category: "中成药", therapeuticClass: "内科用药（中）" },
  "中成药属性和作用分类必须分开"
);

assert.deepEqual(
  { ...classification.classifyCandidate({
    drugName: "盐酸氯米帕明片",
    category: "其他",
    clinical: { indication: "用于治疗抑郁症及符合说明书条件的强迫症。" }
  }) },
  { category: "西药", therapeuticClass: "抗抑郁药" },
  "无法沿用旧粗分类时应根据药名与适应症识别作用分类"
);

assert.deepEqual(
  { ...classification.classifyCandidate({ drugName: "阿奇霉素片", category: "抗感染药" }) },
  { category: "西药", therapeuticClass: "抗菌药" },
  "本地目录有精确匹配时必须优先复用已核验分类"
);

console.log("添加药物分类：药品属性与药物作用分类分离测试通过");
