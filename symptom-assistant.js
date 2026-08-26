/* 症状仅用于检索药库中已有说明书资料；不生成诊断或处方。 */
(() => {
  "use strict";

  const normalize = value => String(value || "").normalize("NFKC").toLowerCase().replace(/\s+/g, "");
  const includesAny = (text, terms) => terms.some(term => text.includes(normalize(term)));
  const emergencySources = Object.freeze([
    { label: "CDC：呼吸道疾病急症警示", url: "https://www.cdc.gov/respiratory-viruses/about/index.html" },
    { label: "美国卒中协会：卒中 B.E.F.A.S.T.", url: "https://www.stroke.org/en/about-stroke/stroke-symptoms" },
    { label: "美国卒中协会：心梗警示症状", url: "https://www.stroke.org/en/health-topics/heart-attack/warning-signs-of-a-heart-attack" },
    { label: "NHS：严重过敏反应", url: "https://www.nhs.uk/conditions/allergies/" },
    { label: "NHS：呕血", url: "https://www.nhs.uk/symptoms/vomiting-blood/" }
  ]);

  const redFlagRules = Object.freeze([
    { id: "cardiac", label: "胸痛并伴大汗、压榨感或放射痛", test: text => /(胸痛|胸闷|心前区)/.test(text) && /(大汗|冷汗|压榨|放射|左臂|下颌)/.test(text) },
    { id: "breathing", label: "明显呼吸困难、发绀或无法完整说话", test: text => /(呼吸困难|喘不上气|不能呼吸|口唇发紫|嘴唇发紫|发绀|说不出完整句|无法完整说话)/.test(text) },
    { id: "stroke", label: "突发面歪、单侧无力或言语不清", test: text => /(口角歪|面歪|脸歪|一侧无力|单侧无力|言语不清|说话含糊|突然失语)/.test(text) },
    { id: "bleeding", label: "呕血、咖啡渣样呕吐或黑便", test: text => /(呕血|吐血|咖啡渣样|黑便|柏油样便)/.test(text) },
    { id: "anaphylaxis", label: "咽喉或舌肿胀、窒息感", test: text => /(喉头水肿|喉咙肿|咽喉肿|舌头肿|舌肿|窒息)/.test(text) },
    { id: "neurologic", label: "意识不清、昏迷或抽搐", test: text => /(意识不清|叫不醒|昏迷|抽搐|惊厥)/.test(text) },
    { id: "abdomen", label: "持续或剧烈腹痛", test: text => /(持续|剧烈|难以忍受).{0,4}(腹痛|肚子痛)|(腹痛|肚子痛).{0,4}(持续|剧烈|难以忍受)/.test(text) }
  ]);

  const concepts = Object.freeze([
    { id: "fever-pain", label: "发热或疼痛", symptoms: ["发热", "发烧", "头痛", "牙痛", "关节痛", "肌肉痛", "痛经"], indications: ["发热", "解热", "头痛", "牙痛", "关节痛", "肌肉痛", "痛经", "疼痛"], drugHints: ["解热", "镇痛", "抗炎", "布洛芬", "对乙酰氨基酚", "吲哚美辛", "塞来昔布", "洛索洛芬", "双氯芬酸", "萘普生"], drugExcludes: ["乳膏", "凝胶", "贴膏", "乳胶剂"] },
    { id: "cough-sputum", label: "咳嗽、咳痰", symptoms: ["咳嗽", "咳痰", "有痰", "痰多"], indications: ["咳嗽", "祛痰", "痰液", "咳痰"], drugHints: ["止咳", "祛痰", "氨溴索", "乙酰半胱氨酸", "右美沙芬", "愈创", "复方甘草", "苏黄", "金荞麦"] },
    { id: "wheeze-asthma", label: "喘息或既往哮喘", symptoms: ["喘息", "哮喘", "气喘"], indications: ["哮喘", "支气管痉挛", "喘息"], drugHints: ["平喘", "支气管扩张", "哮喘", "沙丁胺醇", "特布他林", "异丙托溴铵", "布地奈德", "孟鲁司特"] },
    { id: "allergic-rhinitis", label: "过敏性鼻炎", symptoms: ["过敏性鼻炎", "鼻痒", "打喷嚏", "流清鼻涕"], indications: ["过敏性鼻炎", "鼻炎", "喷嚏", "鼻痒"], drugHints: ["抗组胺", "抗过敏", "鼻用", "氯雷他定", "西替利嗪", "咪唑斯汀", "孟鲁司特", "糠酸莫米松"] },
    { id: "reflux", label: "反酸、烧心", symptoms: ["反酸", "烧心", "胃灼热", "胃酸"], indications: ["胃食管反流", "反流性食管炎", "胃酸", "烧心", "酸相关"], drugHints: ["抑酸", "抗酸", "质子泵", "胃黏膜", "拉唑", "铝碳酸镁", "法莫替丁"] },
    { id: "constipation", label: "便秘", symptoms: ["便秘", "大便干", "排便困难"], indications: ["便秘", "排便困难"], drugHints: ["泻药", "通便", "乳果糖", "聚乙二醇", "开塞露", "麻仁", "便通"] },
    { id: "diarrhea", label: "腹泻", symptoms: ["腹泻", "拉肚子", "稀便"], indications: ["腹泻", "急性非感染性腹泻"], drugHints: ["止泻", "蒙脱石", "洛哌丁胺", "益生菌", "双歧杆菌"] },
    { id: "nausea", label: "恶心、呕吐", symptoms: ["恶心", "呕吐", "想吐"], indications: ["恶心", "呕吐", "止吐"], drugHints: ["止吐", "促胃动力", "甲氧氯普胺", "昂丹司琼", "多潘立酮"] },
    { id: "insomnia", label: "失眠", symptoms: ["失眠", "睡不着", "入睡困难", "早醒"], indications: ["失眠", "入睡困难", "睡眠障碍"], drugHints: ["镇静", "催眠", "睡眠", "唑吡坦", "佐匹克隆", "艾司唑仑", "阿普唑仑"] },
    { id: "itch-rash", label: "瘙痒或皮疹", symptoms: ["瘙痒", "皮疹", "风团", "荨麻疹"], indications: ["瘙痒", "荨麻疹", "过敏性皮肤病", "皮疹"], drugHints: ["抗过敏", "抗组胺", "皮肤", "糖皮质激素", "氯雷他定", "西替利嗪", "咪唑斯汀", "炉甘石"], drugExcludes: ["注射"] }
  ]);

  const antiInfectivePattern = /抗菌|抗感染|抗病毒|抗真菌|抗生素|头孢|青霉素|喹诺酮|大环内酯|阿奇霉素|左氧氟沙星|奥司他韦/;
  const isAntiInfective = drug => antiInfectivePattern.test([drug?.drugName, drug?.therapeuticClass, drug?.category].filter(Boolean).join("|"));

  function analyze(query, catalog = [], limit = 12) {
    const text = normalize(query);
    if (!text) return { query: "", redFlags: [], concepts: [], candidates: [], sources: emergencySources };
    const redFlags = redFlagRules.filter(rule => rule.test(text)).map(rule => ({ id: rule.id, label: rule.label }));
    const matchedConcepts = concepts.filter(concept => includesAny(text, concept.symptoms));
    if (redFlags.length || !matchedConcepts.length) return { query, redFlags, concepts: matchedConcepts, candidates: [], sources: emergencySources };

    const candidates = [];
    const seen = new Set();
    for (const drug of Array.isArray(catalog) ? catalog : []) {
      if (!drug?.id || seen.has(drug.id) || isAntiInfective(drug)) continue;
      const indication = normalize(drug.clinical?.indication);
      if (!indication) continue;
      const drugIdentity = normalize([drug.drugName, drug.therapeuticClass].filter(Boolean).join("|"));
      const matches = matchedConcepts.filter(concept => includesAny(indication, concept.indications)
        && includesAny(drugIdentity, concept.drugHints)
        && !(concept.drugExcludes && includesAny(drugIdentity, concept.drugExcludes)));
      if (!matches.length) continue;
      seen.add(drug.id);
      candidates.push({ drug, reasons: matches.map(item => item.label), score: matches.length * 100 + Math.min(indication.length, 80) });
    }
    candidates.sort((a, b) => b.score - a.score || String(a.drug.drugName).localeCompare(String(b.drug.drugName), "zh-CN"));
    return { query, redFlags, concepts: matchedConcepts, candidates: candidates.slice(0, Math.max(1, Number(limit) || 12)), sources: emergencySources };
  }

  window.SYMPTOM_ASSISTANT = Object.freeze({ analyze, concepts, emergencySources, isAntiInfective, redFlagRules });
})();
