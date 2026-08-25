(() => {
  "use strict";

  const CATEGORY_IDS = Object.freeze(["西药", "中成药"]);
  const LEGACY_BROAD_CLASSES = new Set([
    "心血管", "降压药", "降糖药", "调脂药", "抗凝抗血小板", "抗感染药",
    "呼吸系统", "消化系统", "神经精神", "镇痛抗炎", "泌尿系统", "内分泌",
    "皮肤外用", "维生素矿物质", "中成药", "其他"
  ]);
  const UNKNOWN_CLASSES = new Set(["", "其他", "未分类", "作用待分类"]);

  const clean = value => String(value || "").normalize("NFKC").trim();
  const normalizeName = value => clean(value).toLowerCase().replace(/[\s()（）【】\[\]·•\-_]/g, "");

  function catalogForScope(scope) {
    if (scope === "outpatient") {
      return Array.isArray(window.OUTPATIENT_DRUG_CATALOG) ? window.OUTPATIENT_DRUG_CATALOG : [];
    }
    return Array.isArray(window.DRUG_CATALOG) ? window.DRUG_CATALOG : [];
  }

  function catalogClassification(candidate, preferredPharmacyScope = "") {
    const names = [candidate?.drugName, candidate?.genericName]
      .map(normalizeName)
      .filter(Boolean);
    if (!names.length) return null;
    const preferred = preferredPharmacyScope === "outpatient" ? "outpatient" : "ward";
    const other = preferred === "outpatient" ? "ward" : "outpatient";
    const knownDrugs = [...catalogForScope(preferred), ...catalogForScope(other)];
    return knownDrugs.find(drug => [drug.drugName, drug.genericName]
      .map(normalizeName)
      .filter(Boolean)
      .some(name => names.includes(name))) || null;
  }

  function normalizeCategory(category, drugName = "", approvalNumber = "", sourceUrl = "", indication = "") {
    const value = clean(category);
    if (CATEGORY_IDS.includes(value)) return value;

    const approval = clean(approvalNumber).toUpperCase();
    const url = clean(sourceUrl).toLowerCase();
    const text = `${value} ${clean(drugName)} ${clean(indication)}`;
    if (/国药准字\s*Z/i.test(approval)) return "中成药";
    if (/国药准字\s*[A-Y]/i.test(approval)) return "西药";
    if (/\/zhongyao\//.test(url)) return "中成药";
    if (/\/huayao\//.test(url)) return "西药";
    if (/中成药|中药制剂|中药饮片/.test(text)) return "中成药";
    if (/西药|化学药|生物制品/.test(text)) return "西药";
    if (/清热解毒|活血化瘀|益气|补肾|疏肝|健脾|通络|祛风|养血|滋阴|温阳|扶正|散寒|消肿止痛/.test(text)) return "中成药";

    // 本项目目录的药品属性只有“西药/中成药”。无法确认中药特征时按西药归类，
    // 同时保留表单可编辑和来源待复核状态。
    return "西药";
  }

  function inferTherapeuticClass(drugName = "", indication = "", category = "") {
    const name = clean(drugName);
    const text = `${name} ${clean(indication)}`;

    if (normalizeCategory(category, name, "", "", indication) === "中成药") {
      if (/骨伤|跌打|扭伤|风湿|关节|筋骨/.test(text)) return "骨伤科用药";
      if (/眼|结膜|角膜/.test(text)) return "眼科用药（中）";
      if (/口腔|咽|喉|鼻/.test(text)) return "耳鼻喉/口腔用药";
      if (/皮肤|湿疹|瘙痒|疮|癣/.test(text)) return "外科用药（中）";
      return "内科用药（中）";
    }

    if (/胰岛素/.test(text)) return "胰岛素";
    if (/二甲双胍|阿卡波糖|伏格列波糖|米格列醇|格列|列净|列汀|格鲁肽|艾塞那肽|利司那肽|替尔泊肽|吡格列酮|罗格列酮|瑞格列奈|那格列奈|2型糖尿病|降血糖/.test(text)) return "降糖药";
    if (/阿司匹林|氯吡格雷|替格瑞洛|普拉格雷|吲哚布芬/.test(text)) return "抗血小板药";
    if (/华法林|利伐沙班|阿哌沙班|依度沙班|达比加群|肝素|依诺肝素/.test(text)) return "抗凝药";
    if (/他汀|依折麦布|非诺贝特|苯扎贝特|依洛尤单抗|阿利西尤单抗|高胆固醇血症|血脂/.test(text)) return "调脂药";
    if (/沙坦|普利|地平|美托洛尔|比索洛尔|卡维地洛|拉贝洛尔|阿罗洛尔|氢氯噻嗪|吲达帕胺|多沙唑嗪|特拉唑嗪/.test(text)) return "抗高血压药";
    if (/头孢/.test(text)) return "头孢菌素类";
    if (/阿奇霉素|克拉霉素|红霉素|罗红霉素/.test(text)) return "大环内酯类";
    if (/沙星/.test(text)) return "喹诺酮类";
    if (/硝唑/.test(text)) return "硝基咪唑类";
    if (/特比萘芬|氟康唑|伊曲康唑|酮康唑|咪康唑|联苯苄唑|抗真菌/.test(text)) return "抗真菌药";
    if (/奥司他韦|玛巴洛沙韦|玛舒拉沙韦|阿昔洛韦|伐昔洛韦|更昔洛韦|替诺福韦|恩替卡韦|抗病毒/.test(text)) return "抗病毒药";
    if (/西林|霉素|抗菌|细菌感染/.test(text)) return "抗菌药";
    if (/孟鲁司特|沙丁胺醇|布地奈德|噻托溴铵|福莫特罗|沙美特罗|氨茶碱|茶碱|哮喘/.test(text)) return "平喘药";
    if (/氨溴索|溴己新|乙酰半胱氨酸|羧甲司坦|祛痰/.test(text)) return "祛痰药";
    if (/拉唑|凯普拉生|抑酸|胃食管反流|消化性溃疡/.test(text)) return "抑酸药";
    if (/莫沙必利|多潘立酮/.test(text)) return "促胃肠动力药";
    if (/乳果糖|开塞露|泻药|便秘/.test(text)) return "泻药/通便药";
    if (/蒙脱石|洛哌丁胺|小檗碱|止泻/.test(text)) return "止泻药";
    if (/氯米帕明|米氮平|舍曲林|帕罗西汀|氟西汀|西酞普兰|文拉法辛|度洛西汀|曲唑酮|阿戈美拉汀|抑郁症|强迫症/.test(text)) return "抗抑郁药";
    if (/氯丙嗪|奥氮平|喹硫平|利培酮|阿立哌唑|抗精神病/.test(text)) return "抗精神病药";
    if (/唑仑|唑吡坦|佐匹克隆|镇静|失眠|焦虑/.test(text)) return "镇静催眠/抗焦虑药";
    if (/丙戊酸|左乙拉西坦|癫痫/.test(text)) return "抗癫痫药";
    if (/普瑞巴林|加巴喷丁|神经病理性疼痛/.test(text)) return "神经病理性疼痛";
    if (/布洛芬|双氯芬|洛索洛芬|吲哚美辛|萘普生|塞来昔布|依托考昔|对乙酰氨基酚/.test(text)) return "解热镇痛抗炎药";
    if (/吗啡|羟考酮|芬太尼|曲马多/.test(text)) return "阿片类镇痛药";
    if (/坦索罗辛|非那雄胺|度他雄胺|前列腺增生/.test(text)) return "良性前列腺增生用药";
    if (/非布司他|苯溴马隆|降尿酸|痛风/.test(text)) return "降尿酸药";
    if (/呋塞米|螺内酯|利尿/.test(text)) return "利尿药";
    if (/左甲状腺素|甲巯咪唑|丙硫氧嘧啶|甲状腺/.test(text)) return "甲状腺激素类";
    if (/地塞米松|泼尼松|甲泼尼龙|糖皮质激素/.test(text)) return "糖皮质激素";
    if (/骨化醇|阿仑膦酸|骨代谢/.test(text)) return "骨代谢用药";
    if (/维生素|叶酸/.test(text)) return "维生素";
    if (/碳酸钙|氯化钾|葡萄糖酸钙|硫酸亚铁|矿物质/.test(text)) return "矿物质类";
    if (/硝酸甘油|单硝酸异山梨酯|硝酸异山梨酯|曲美他嗪|心绞痛/.test(text)) return "抗心绞痛药";
    if (/胺碘酮|心律失常/.test(text)) return "抗心律失常药";
    if (/地高辛|毛花苷|心力衰竭|强心/.test(text)) return "抗心力衰竭药";
    if (/乳膏|软膏|凝胶|贴膏|搽剂|皮肤/.test(text)) return "皮肤科用药";
    return "作用待分类";
  }

  function normalizeTherapeuticClass(therapeuticClass, drugName = "", indication = "", category = "") {
    const value = clean(therapeuticClass);
    const inferred = inferTherapeuticClass(drugName, indication, category);
    if (LEGACY_BROAD_CLASSES.has(value)) return inferred !== "作用待分类" ? inferred : (UNKNOWN_CLASSES.has(value) ? "作用待分类" : value);
    return UNKNOWN_CLASSES.has(value) ? inferred : value;
  }

  function classifyCandidate(candidate = {}, preferredPharmacyScope = "") {
    const known = catalogClassification(candidate, preferredPharmacyScope);
    const sourceUrl = candidate.source?.url || candidate.sourceUrl || "";
    const indication = candidate.clinical?.indication || candidate.indications || "";
    const approvalNumber = candidate.approvalNumber || "";
    const rawCategory = known?.category || candidate.category || "";
    const category = normalizeCategory(rawCategory, candidate.drugName, approvalNumber, sourceUrl, indication);
    const legacyTherapeuticClass = CATEGORY_IDS.includes(clean(candidate.category)) ? "" : candidate.category;
    const rawTherapeuticClass = known?.therapeuticClass || candidate.therapeuticClass || legacyTherapeuticClass || "";
    return {
      category,
      therapeuticClass: normalizeTherapeuticClass(rawTherapeuticClass, candidate.drugName, indication, category)
    };
  }

  window.DRUG_CLASSIFICATION = Object.freeze({
    categories: CATEGORY_IDS,
    classifyCandidate,
    normalizeCategory,
    normalizeTherapeuticClass
  });
})();
