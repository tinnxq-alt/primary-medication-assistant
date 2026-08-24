import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const marks = fs.readFileSync(new URL("../mark-notebook-ui.js", import.meta.url), "utf8");

assert.match(app, /const recordPharmacyId = record =>/, "必须为旧笔记和标记推断所属药库");
assert.match(app, /recordBelongsToPharmacy\(note, pharmacyId\)/, "笔记本必须按当前药库过滤笔记");
assert.match(app, /recordBelongsToPharmacy\(mark, pharmacyId\)/, "笔记本必须按当前药库过滤文本标记");
assert.match(app, /pharmacyId: pharmacyScope, content: notes/, "添加药物时的备注必须保存目标药库");
assert.match(app, /pharmacyId, content, updatedAt/, "详情页新增笔记必须显式保存药库");
assert.match(app, /data-notebook-section="notes"/, "笔记区必须暴露稳定的分库分组标记");
assert.match(app, /data-notebook-section="marks"/, "文本标记区必须暴露稳定的分库分组标记");
assert.match(app, /id="editDrugBtn"/, "全部药品详情均应显示编辑按钮");
assert.doesNotMatch(app, /drug\.isCustom \? '<button class="btn secondary" id="edit/, "编辑入口不得只对自定义药开放");
for (const field of [
  "tradeName", "pharmacyScope", "therapeuticClass", "insuranceClass", "marketingAuthorizationHolder",
  "approvalNumber", "indication", "dosage", "adverseReactions", "precautions", "interactionNotes", "contraindications",
  "sourceLabel", "sourceUrl", "sourceCheckedAt"
]) assert.match(app, new RegExp(`name=["']${field}["']`), `详情编辑缺少 ${field}`);
assert.match(app, /status: "needs-review"/, "本机编辑后必须自动降级为待复核状态");
assert.match(app, /restoreDrugFields/, "内置药的本机修改必须可恢复");

assert.match(marks, /pharmacyId: recordPharmacyId/, "直接文本标记必须记录所属药库");
assert.match(marks, /filter\(mark => recordPharmacyId\(mark\) === pharmacyId\)/, "统一标记层不得把另一药库标记重新注入笔记本");
assert.match(marks, /node\.dataset\.notebookSection === kind/, "分组逻辑必须适配病房/门诊动态标题");

console.log("分库笔记与全字段编辑静态契约检查通过");
