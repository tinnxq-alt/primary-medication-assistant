import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, "symptom-assistant.js"), "utf8"), context);

const engine = context.window.SYMPTOM_ASSISTANT;
const catalog = [
  { id: "expectorant", drugName: "盐酸氨溴索片", therapeuticClass: "祛痰药", clinical: { indication: "用于痰液黏稠而不易咳出者。" } },
  { id: "antibiotic", drugName: "阿奇霉素片", therapeuticClass: "大环内酯类抗菌药", clinical: { indication: "用于敏感菌所致呼吸道感染。" } },
  { id: "ppi", drugName: "泮托拉唑钠肠溶片", therapeuticClass: "抑酸药", clinical: { indication: "用于胃食管反流病及反流性食管炎。" } },
  { id: "unrelated", drugName: "氯化钾缓释片", therapeuticClass: "电解质补充药", clinical: { indication: "用于预防和治疗低钾血症。" } }
];

const cough = engine.analyze("咳嗽有痰", catalog);
assert.ok(cough.candidates.some(item => item.drug.id === "expectorant"), "咳痰应检索到药库内祛痰资料");
assert.ok(!cough.candidates.some(item => item.drug.id === "antibiotic"), "不得仅凭症状给出抗菌药");
assert.ok(cough.candidates.every(item => catalog.includes(item.drug)), "所有候选必须来自输入药库");

const reflux = engine.analyze("最近反酸烧心", catalog);
assert.deepEqual(Array.from(reflux.candidates, item => item.drug.id), ["ppi"]);

const emergency = engine.analyze("突然胸痛压榨感并伴大汗", catalog);
assert.ok(emergency.redFlags.some(item => item.id === "cardiac"));
assert.equal(emergency.candidates.length, 0, "红旗症状必须阻断常规药物候选");
assert.ok(emergency.sources.every(item => /^https:\/\//.test(item.url)), "红旗规则必须附权威来源");

assert.equal(engine.analyze("看不懂的描述", catalog).candidates.length, 0, "无法识别时不得猜测药物");
console.log("症状药库检索测试通过：红旗分诊、药库限定与抗菌药拦截均有效");
