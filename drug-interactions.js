/* 基于公开现行说明书整理的高风险相互作用规则；不替代完整处方审核。 */
(() => {
  "use strict";

  const CHECKED_AT = "2026-08-26";
  const source = (label, url) => Object.freeze({ status: "verified-label", label, url, checkedAt: CHECKED_AT });
  const FDA_ENTRESTO = source("FDA：Entresto 现行说明书（2024）", "https://www.accessdata.fda.gov/drugsatfda_docs/label/2024/207620s025%2C218591s000lbl.pdf");
  const FDA_RITONAVIR = source("FDA：Norvir（利托那韦）现行说明书（2026）", "https://www.accessdata.fda.gov/drugsatfda_docs/label/2026/209512s010lbl.pdf");
  const FDA_ESOMEPRAZOLE = source("FDA：含艾司奥美拉唑制剂说明书", "https://www.accessdata.fda.gov/drugsatfda_docs/label/2020/022511s025lbl.pdf");
  const FDA_RIVAROXABAN = source("FDA：Xarelto（利伐沙班）说明书", "https://www.accessdata.fda.gov/drugsatfda_docs/label/2019/022406s033%2C202439s033lbl.pdf");
  const FDA_MORPHINE = source("FDA：Duramorph（吗啡）现行说明书（2026）", "https://www.accessdata.fda.gov/drugsatfda_docs/label/2026/018565s035lbl.pdf");
  const FDA_LEVOTHYROXINE = source("FDA：Levo-T（左甲状腺素）说明书", "https://www.accessdata.fda.gov/drugsatfda_docs/label/2017/021342s023lbl.pdf");
  const FDA_SILDENAFIL = source("FDA：Revatio（西地那非）说明书", "https://www.accessdata.fda.gov/drugsatfda_docs/label/2018/021845s018lbl.pdf");
  const DAILYMED_SPIRONOLACTONE = source("DailyMed：螺内酯现行说明书", "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=753bbc6f-2e50-49c1-b5bf-18f8411a1e8e&version=109");
  const DAILYMED_CLOPIDOGREL = source("DailyMed：氯吡格雷说明书（相互作用 7.2）", "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=5cdca9bd-7042-142a-e053-2991aa0a9ca6");
  const DAILYMED_LEVOFLOXACIN = source("DailyMed：左氧氟沙星说明书（相互作用 7.1 / QT 警示）", "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=5045f807-4f08-7436-e054-00144ff88e88");

  const GROUPS = Object.freeze({
    acei: { any: ["贝那普利", "培哚普利", "依那普利", "卡托普利", "雷米普利", "赖诺普利", "福辛普利"] },
    arb: { any: ["缬沙坦", "氯沙坦", "阿利沙坦", "奥美沙坦", "厄贝沙坦", "替米沙坦", "坎地沙坦"] },
    arni: { any: ["沙库巴曲"] },
    raas: { any: ["贝那普利", "培哚普利", "依那普利", "卡托普利", "雷米普利", "赖诺普利", "福辛普利", "缬沙坦", "氯沙坦", "阿利沙坦", "奥美沙坦", "厄贝沙坦", "替米沙坦", "坎地沙坦", "沙库巴曲"] },
    potassium: { any: ["螺内酯", "氯化钾", "阿米洛利", "氨苯蝶啶"] },
    spironolactone: { any: ["螺内酯"] },
    potassiumSupplement: { any: ["氯化钾", "枸橼酸钾", "补钾"] },
    ritonavir: { any: ["利托那韦"] },
    simvastatin: { any: ["辛伐他汀", "洛伐他汀"] },
    antiarrhythmicRitonavirContra: { any: ["胺碘酮", "决奈达隆", "氟卡尼", "普罗帕酮", "奎尼丁"] },
    inhaledSteroid: { any: ["布地奈德", "氟替卡松", "莫米松", "曲安奈德"] },
    clopidogrel: { any: ["氯吡格雷"] },
    omeprazole: { any: ["奥美拉唑", "艾司奥美拉唑"] },
    rivaroxaban: { any: ["利伐沙班"] },
    antiplatelet: { any: ["阿司匹林", "氯吡格雷", "替格瑞洛", "普拉格雷"] },
    systemicNsaid: {
      any: ["布洛芬", "双氯芬酸", "吲哚美辛", "塞来昔布", "依托考昔", "洛索洛芬", "萘普生", "新癀片"],
      exclude: ["乳膏", "乳胶剂", "凝胶", "滴眼"]
    },
    opioid: { any: ["吗啡", "可待因", "羟考酮", "芬太尼", "曲马多", "哌替啶"] },
    cnsDepressant: { any: ["苯巴比妥", "地西泮", "咪达唑仑", "阿普唑仑", "氯硝西泮", "劳拉西泮", "唑吡坦", "佐匹克隆", "右佐匹克隆", "普瑞巴林", "加巴喷丁"] },
    levothyroxine: { any: ["左甲状腺素"] },
    calciumIron: { any: ["碳酸钙", "葡萄糖酸钙", "乳酸钙", "硫酸亚铁", "富马酸亚铁", "琥珀酸亚铁"] },
    nitrate: { any: ["硝酸甘油", "单硝酸异山梨酯", "硝酸异山梨酯"] },
    pde5: { any: ["西地那非", "他达拉非", "伐地那非", "阿伐那非"] },
    oralLevofloxacin: { any: ["左氧氟沙星"], exclude: ["滴眼", "眼用", "滴耳", "注射", "氯化钠", "乳膏", "凝胶"] },
    systemicLevofloxacin: { any: ["左氧氟沙星"], exclude: ["滴眼", "眼用", "滴耳", "乳膏", "凝胶"] },
    multivalentCation: { any: ["碳酸钙", "葡萄糖酸钙", "乳酸钙", "硫酸亚铁", "富马酸亚铁", "琥珀酸亚铁", "铝碳酸镁", "氢氧化铝", "氧化镁"] },
    otherQtProlonging: { any: ["阿奇霉素", "胺碘酮", "索他洛尔", "莫西沙星"] }
  });

  const rules = Object.freeze([
    {
      id: "acei-arni-36h", severity: "禁忌", title: "ACEI 与沙库巴曲类不得同用",
      a: GROUPS.acei, aLabel: "ACE 抑制剂", b: GROUPS.arni, bLabel: "沙库巴曲类",
      mechanism: "脑啡肽酶抑制与 ACE 抑制叠加，显著增加缓激肽相关血管性水肿风险。",
      consequence: "可能发生严重甚至危及气道的血管性水肿。",
      recommendation: "禁止同时使用；从 ACEI 换用沙库巴曲类或反向换药时至少间隔 36 小时。",
      source: FDA_ENTRESTO
    },
    {
      id: "arni-arb-duplicate", severity: "严重", title: "沙库巴曲类与 ARB 重复阻断",
      a: GROUPS.arni, aLabel: "沙库巴曲类", b: GROUPS.arb, bLabel: "ARB",
      mechanism: "沙库巴曲复方本身已含血管紧张素受体阻断成分，再合用 ARB 属重复阻断。",
      consequence: "低血压、高钾和肾功能恶化风险增加。",
      recommendation: "避免联用；核对复方成分并保留单一肾素-血管紧张素系统方案。",
      source: FDA_ENTRESTO
    },
    {
      id: "raas-potassium", severity: "严重", title: "RAAS 阻断药与保钾/补钾药",
      a: GROUPS.raas, aLabel: "ACEI/ARB/沙库巴曲类", b: GROUPS.potassium, bLabel: "保钾利尿剂或钾补充剂",
      mechanism: "两类药物均可升高血钾。",
      consequence: "可能发生严重高钾血症、传导异常或心律失常，肾功能不全者风险更高。",
      recommendation: "仅在明确指征下联用；核对含钾替代盐，基线及调整后复查血钾和肾功能。",
      source: FDA_ENTRESTO
    },
    {
      id: "ritonavir-simvastatin", severity: "禁忌", title: "利托那韦与辛伐他汀/洛伐他汀",
      a: GROUPS.ritonavir, aLabel: "利托那韦", b: GROUPS.simvastatin, bLabel: "辛伐他汀或洛伐他汀",
      mechanism: "利托那韦强烈抑制 CYP3A，使相关他汀暴露显著升高。",
      consequence: "可导致肌病和横纹肌溶解，继发急性肾损伤。",
      recommendation: "禁止联用；按抗病毒方案说明书规定停用并选择不依赖 CYP3A 的替代调脂药。",
      source: FDA_RITONAVIR
    },
    {
      id: "ritonavir-antiarrhythmic", severity: "禁忌", title: "利托那韦与特定抗心律失常药",
      a: GROUPS.ritonavir, aLabel: "利托那韦", b: GROUPS.antiarrhythmicRitonavirContra, bLabel: "特定抗心律失常药",
      mechanism: "利托那韦抑制代谢并显著提高相关抗心律失常药浓度。",
      consequence: "可能诱发严重或致命性心律失常。",
      recommendation: "禁止联用；不得自行停换抗心律失常药，应由医师选择其他抗病毒方案。",
      source: FDA_RITONAVIR
    },
    {
      id: "ritonavir-inhaled-steroid", severity: "严重", title: "利托那韦与 CYP3A 代谢糖皮质激素",
      a: GROUPS.ritonavir, aLabel: "利托那韦", b: GROUPS.inhaledSteroid, bLabel: "布地奈德/氟替卡松等",
      mechanism: "强 CYP3A 抑制可显著增加糖皮质激素全身暴露，即使为吸入或鼻用制剂。",
      consequence: "可能出现库欣综合征和肾上腺抑制。",
      recommendation: "优先选替代抗病毒或受影响较小的激素；必须联用时缩短疗程并监测全身激素效应。",
      source: FDA_RITONAVIR
    },
    {
      id: "clopidogrel-omeprazole", severity: "严重", title: "氯吡格雷与奥美拉唑/艾司奥美拉唑",
      a: GROUPS.clopidogrel, aLabel: "氯吡格雷", b: GROUPS.omeprazole, bLabel: "奥美拉唑或艾司奥美拉唑",
      mechanism: "CYP2C19 抑制减少氯吡格雷活性代谢物形成；错开 12 小时也不能可靠消除影响。",
      consequence: "抗血小板作用下降，可能增加缺血事件风险。",
      recommendation: "避免联用；需要抑酸时由医师评估泮托拉唑等替代方案。",
      source: FDA_ESOMEPRAZOLE
    },
    {
      id: "rivaroxaban-nsaid", severity: "严重", title: "利伐沙班与全身用 NSAID",
      a: GROUPS.rivaroxaban, aLabel: "利伐沙班", b: GROUPS.systemicNsaid, bLabel: "全身用 NSAID（含新癀片中的吲哚美辛）",
      mechanism: "抗凝作用与 NSAID 对血小板/胃肠黏膜的不良影响叠加。",
      consequence: "胃肠道及其他部位出血风险增加，可能发生严重出血。",
      recommendation: "尽量避免；确需联用时使用最低有效剂量和最短疗程，评估胃保护并严密观察出血。",
      source: FDA_RIVAROXABAN
    },
    {
      id: "rivaroxaban-antiplatelet", severity: "严重", title: "利伐沙班与抗血小板药",
      a: GROUPS.rivaroxaban, aLabel: "利伐沙班", b: GROUPS.antiplatelet, bLabel: "抗血小板药",
      mechanism: "抗凝与抗血小板效应叠加。",
      consequence: "出血时间延长，重大出血风险增加。",
      recommendation: "仅限指南支持且明确评估获益大于风险的方案；核对剂量、疗程并监测出血。",
      source: FDA_RIVAROXABAN
    },
    {
      id: "opioid-cns-depressant", severity: "严重", title: "阿片类与镇静/中枢抑制药",
      a: GROUPS.opioid, aLabel: "阿片类", b: GROUPS.cnsDepressant, bLabel: "镇静催眠或其他中枢抑制药",
      mechanism: "中枢抑制和呼吸抑制相加。",
      consequence: "可能导致深度镇静、呼吸抑制、昏迷和死亡。",
      recommendation: "仅在替代方案不足时联用；限制剂量与疗程，评估纳洛酮并严密监测意识和呼吸。",
      source: FDA_MORPHINE
    },
    {
      id: "levothyroxine-calcium-iron", severity: "需监测", title: "左甲状腺素与钙/铁制剂",
      a: GROUPS.levothyroxine, aLabel: "左甲状腺素", b: GROUPS.calciumIron, bLabel: "钙或铁制剂",
      mechanism: "钙或铁可在胃肠道结合左甲状腺素并减少吸收。",
      consequence: "甲状腺素疗效下降，TSH 升高或甲减控制不佳。",
      recommendation: "两药至少间隔 4 小时；开始、停用或调整钙铁制剂后按医嘱复查 TSH。",
      source: FDA_LEVOTHYROXINE
    },
    {
      id: "nitrate-pde5", severity: "禁忌", title: "有机硝酸酯与 PDE5 抑制剂",
      a: GROUPS.nitrate, aLabel: "硝酸酯", b: GROUPS.pde5, bLabel: "PDE5 抑制剂",
      mechanism: "两者共同增强 NO-cGMP 通路，显著放大降压作用。",
      consequence: "可出现危及生命的低血压、晕厥或心肌缺血。",
      recommendation: "禁止联用；急诊需要硝酸酯时必须主动告知最近 PDE5 抑制剂用药时间。",
      source: FDA_SILDENAFIL
    },
    {
      id: "spironolactone-potassium", severity: "严重", title: "螺内酯与补钾药",
      a: GROUPS.spironolactone, aLabel: "螺内酯", b: GROUPS.potassiumSupplement, bLabel: "钾补充剂",
      mechanism: "螺内酯减少钾排泄，补钾会进一步增加钾负荷。",
      consequence: "可能发生严重高钾血症、传导异常和致命性心律失常。",
      recommendation: "通常避免常规联用；如有明确指征，须核对肾功能并密切复查血钾。",
      source: DAILYMED_SPIRONOLACTONE
    },
    {
      id: "clopidogrel-nsaid", severity: "严重", title: "氯吡格雷与全身用 NSAID",
      a: GROUPS.clopidogrel, aLabel: "氯吡格雷", b: GROUPS.systemicNsaid, bLabel: "全身用 NSAID",
      mechanism: "抗血小板作用与 NSAID 对血小板及胃肠黏膜的不良影响叠加。",
      consequence: "胃肠道出血及其他部位出血风险增加。",
      recommendation: "尽量避免；确需联用时采用最低有效剂量和最短疗程，并评估胃保护及出血监测。",
      source: DAILYMED_CLOPIDOGREL
    },
    {
      id: "levofloxacin-multivalent-cation", severity: "需监测", title: "口服左氧氟沙星与多价阳离子制剂",
      a: GROUPS.oralLevofloxacin, aLabel: "口服左氧氟沙星", b: GROUPS.multivalentCation, bLabel: "钙/铁/镁/铝制剂",
      mechanism: "多价阳离子可与口服左氧氟沙星螯合并减少吸收。",
      consequence: "左氧氟沙星暴露下降，可能造成抗感染疗效不足。",
      recommendation: "口服左氧氟沙星应与相关制剂至少间隔 2 小时；注射剂不按吸收相互作用处理。",
      source: DAILYMED_LEVOFLOXACIN
    },
    {
      id: "levofloxacin-qt", severity: "严重", title: "全身用左氧氟沙星与其他 QT 延长药",
      a: GROUPS.systemicLevofloxacin, aLabel: "全身用左氧氟沙星", b: GROUPS.otherQtProlonging, bLabel: "其他 QT 延长药",
      mechanism: "两药对心室复极的影响可能叠加。",
      consequence: "QT 间期延长和尖端扭转型室性心动过速风险增加。",
      recommendation: "优先避免联用；必须联用时评估既往 QT、低钾低镁、心动过缓等风险并按医嘱监测心电图和电解质。",
      source: DAILYMED_LEVOFLOXACIN
    }
  ]);

  const normalize = value => String(value || "").normalize("NFKC").toLowerCase().replace(/[\s·•_\-（）()\[\]【】]/g, "");
  const drugText = drug => normalize([
    drug?.drugName, drug?.rawName, drug?.genericName, drug?.tradeName,
    ...(Array.isArray(drug?.components) ? drug.components : [])
  ].filter(Boolean).join("|"));

  function matchesGroup(drug, group) {
    const text = drugText(drug);
    if (!text) return false;
    if (group.exclude?.some(term => text.includes(normalize(term)))) return false;
    return group.any?.some(term => text.includes(normalize(term))) || false;
  }

  function matchRule(rule, drugA, drugB) {
    if (!drugA || !drugB || drugA.id === drugB.id) return false;
    return (matchesGroup(drugA, rule.a) && matchesGroup(drugB, rule.b))
      || (matchesGroup(drugA, rule.b) && matchesGroup(drugB, rule.a));
  }

  function findMatches(drugA, drugB) {
    return rules.filter(rule => matchRule(rule, drugA, drugB));
  }

  function findRelevant(drug, catalog) {
    const byRule = new Map();
    for (const other of Array.isArray(catalog) ? catalog : []) {
      if (!other || other.id === drug?.id) continue;
      for (const rule of findMatches(drug, other)) {
        if (!byRule.has(rule.id)) byRule.set(rule.id, { rule, partners: [] });
        byRule.get(rule.id).partners.push(other);
      }
    }
    return [...byRule.values()];
  }

  window.DRUG_INTERACTIONS = Object.freeze({ rules, findMatches, findRelevant, matchesGroup });
})();
