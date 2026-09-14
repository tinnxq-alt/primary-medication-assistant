/* 重点安全规则；国内产品、监管转载与境外参考分别标注，不代表全药库完整审核。 */
(() => {
  "use strict";
  const source = (label, setid) => Object.freeze({ status: "verified-label", label: `DailyMed：${label}（境外说明书参考）`, url: `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setid}`, checkedAt: "2026-09-13" });
  const S = {
    digoxin: source("地高辛 §4、5、7", "5b2d10d0-6e9d-4c39-a025-6b2f30ff6243"),
    metformin: source("二甲双胍 禁忌及肾功能", "8749ceb8-183a-4f7d-adb7-088480d3a873"),
    repaglinide: source("瑞格列奈 §7", "3b150917-e2fd-4366-af83-ebc1d7297ca9"),
    sertraline: source("舍曲林 §4、5、7", "2dac437f-b5ef-42dd-aa0b-1f4b9b45ef43"),
    spironolactone: source("螺内酯 §4、5、7", "ffd1ed7a-b6a4-4240-e053-6394a90a7db1"),
    alendronate: source("阿仑膦酸钠 §2、4、7", "b63421af-ec03-1de7-e053-2a95a90abec6"),
    pioglitazone: source("吡格列酮 §4、5", "266c81ff-e877-6b00-e063-6394a90a50ac"),
    levofloxacin: source("左氧氟沙星 血糖警示", "fc165a6d-24b0-4753-a7ac-94a134dca0d3"),
    morphine: source("吗啡口服片 §4、5", "300b6afd-bac8-32ca-e063-6294a90a12a7"),
    rivaroxaban: source("利伐沙班 §4", "3e95389b-0a93-4560-98c5-02637fb2600f"),
    thyroxine: source("左甲状腺素 禁忌", "fca88c97-5cd4-4834-ba87-deb5bd637788")
  };
  const group = (any, route = "systemic") => ({ any: any.split("|"), route });
  const G = {
    digoxin: group("地高辛"), beta: group("美托洛尔|比索洛尔|普萘洛尔|阿替洛尔"),
    digoxinInhibitor: group("普罗帕酮|利托那韦|胺碘酮|维拉帕米"),
    repaglinide: group("瑞格列奈"), clopidogrel: group("氯吡格雷"),
    sertraline: group("舍曲林"), bleeding: group("阿司匹林|氯吡格雷|利伐沙班|布洛芬|双氯芬酸|吲哚美辛|萘普生|洛索洛芬|塞来昔布|依托考昔|新癀片|铝镁匹林"),
    spironolactone: group("螺内酯"), nsaid: group("布洛芬|双氯芬酸|吲哚美辛|萘普生|洛索洛芬|塞来昔布|依托考昔|新癀片"),
    aspirin: group("阿司匹林|铝镁匹林"), alendronate: group("阿仑膦酸", "oral"),
    cation: group("碳酸钙|葡萄糖酸钙|乳酸钙|硫酸亚铁|富马酸亚铁|琥珀酸亚铁|铝碳酸镁|硫糖铝|氢氧化铝|氧化镁", "oral"),
    pioglitazone: group("吡格列酮"), insulin: group("胰岛素"),
    levofloxacin: group("左氧氟沙星"), glucoseLowering: group("胰岛素|二甲双胍|格列美脲|格列吡嗪|格列齐特|格列喹酮|瑞格列奈"),
    metformin: group("二甲双胍"), morphine: group("吗啡", "oral"),
    rivaroxaban: group("利伐沙班"), thyroxine: group("左甲状腺素", "oral")
  };
  const pair = (id, severity, title, a, b, mechanism, consequence, recommendation, evidence) => Object.freeze({ id, severity, title, a: G[a], b: G[b], mechanism, consequence, recommendation, source: S[evidence] });
  const interactions = [
    pair("repaglinide-clopidogrel", "严重", "瑞格列奈（含复方）与氯吡格雷", "repaglinide", "clopidogrel", "氯吡格雷可抑制瑞格列奈代谢。", "瑞格列奈暴露增加，低血糖风险升高。", "避免联用；不能避免时由医师按说明书调整瑞格列奈并加强血糖监测。", "repaglinide"),
    pair("digoxin-inhibitors", "严重", "地高辛与升高其暴露的药物", "digoxin", "digoxinInhibitor", "相关药物可降低地高辛清除或增加吸收。", "可发生地高辛中毒及心律失常。", "联用前后复核剂量、肾功能、地高辛浓度及心电图。", "digoxin"),
    pair("digoxin-beta", "需监测", "地高辛与 β 受体阻滞剂", "digoxin", "beta", "对房室传导的抑制可能叠加。", "心动过缓或房室传导阻滞。", "有明确指征时可联用；监测心率、心电图，出现晕厥或明显心动过缓及时就医。", "digoxin"),
    pair("digoxin-spironolactone-assay", "需监测", "螺内酯可能干扰地高辛检测", "digoxin", "spironolactone", "螺内酯及代谢物可干扰部分地高辛免疫测定。", "检测值可能偏高，影响剂量判断；真实暴露变化仍不确定。", "告知检验科合并用药，结合症状及不受干扰的检测方法评估。", "spironolactone"),
    pair("sertraline-bleeding", "需监测", "舍曲林与影响止血的药物", "sertraline", "bleeding", "对止血功能的影响叠加。", "出血风险增加。", "核对出血史及其他药物，监测瘀斑、黑便等；不要自行停用抗栓药。", "sertraline"),
    pair("spironolactone-nsaid", "需监测", "螺内酯与全身用 NSAID", "spironolactone", "nsaid", "NSAID 可减弱利尿效果并增加高钾风险。", "降压或利尿效果下降、高钾血症。", "评估联用必要性，监测血钾、肾功能、血压及液体潴留。", "spironolactone"),
    pair("spironolactone-aspirin", "需监测", "螺内酯与阿司匹林", "spironolactone", "aspirin", "阿司匹林可能减弱螺内酯效果。", "利尿疗效可能下降。", "观察疗效；由医师评估剂量，不因该提示自行停用抗血小板治疗。", "spironolactone"),
    pair("alendronate-cations", "需监测", "阿仑膦酸钠与口服钙/铁/抗酸药", "alendronate", "cation", "同时口服可降低阿仑膦酸吸收。", "治疗效果下降。", "晨起空腹以白水服阿仑膦酸，至少 30 分钟后再服其他口服药，并遵守直立要求。", "alendronate"),
    pair("pioglitazone-insulin", "需监测", "吡格列酮（含复方）与胰岛素", "pioglitazone", "insulin", "联用更易发生液体潴留及低血糖。", "水肿、心衰加重或低血糖。", "监测体重、水肿、呼吸困难及血糖，由医师调整方案。", "pioglitazone"),
    pair("levofloxacin-glucose", "需监测", "全身用左氧氟沙星与降糖药", "levofloxacin", "glucoseLowering", "氟喹诺酮可影响血糖调节。", "可能出现低血糖或高血糖。", "治疗期间加强血糖监测；发生低血糖及时处理并由医师评估停换抗菌药。", "levofloxacin")
  ];
  const single = (id, key, severity, title, condition, recommendation, evidence) => Object.freeze({ id, group: G[key], severity, title, mechanism: condition, consequence: "使用前须结合患者情况及本品说明书核对。", recommendation, source: S[evidence] });
  const contraindications = [
    single("metformin-renal", "metformin", "禁忌", "二甲双胍：严重肾功能不全", "eGFR < 30 mL/min/1.73 m²。", "禁用；复方中含二甲双胍时同样需要检查此限制。", "metformin"),
    single("metformin-acidosis", "metformin", "禁忌", "二甲双胍：代谢性酸中毒", "急性或慢性代谢性酸中毒，包括糖尿病酮症酸中毒。", "禁用，及时处理原发病及酸中毒。", "metformin"),
    single("metformin-initiation", "metformin", "慎用", "二甲双胍：eGFR 30–45 不建议新启用", "肾功能下降会增加药物蓄积风险；此项与 eGFR < 30 的禁忌不同。", "不建议新启用；已用药者由医师评估继续治疗的获益风险并监测肾功能。", "metformin"),
    single("digoxin-vf", "digoxin", "禁忌", "地高辛：心室颤动", "存在心室颤动。", "禁用地高辛。", "digoxin"),
    single("digoxin-risk", "digoxin", "慎用", "地高辛：肾功能不全或电解质紊乱", "肾功能不全、低钾、低镁等增加中毒风险。", "核对肾功能、电解质、剂量及浓度；不能把此提示理解为一律禁用。", "digoxin"),
    single("spironolactone-contra", "spironolactone", "禁忌", "螺内酯：高钾血症或 Addison 病", "已存在高钾血症或 Addison 病。", "禁用；另须检查是否合用依普利酮。", "spironolactone"),
    single("alendronate-contra", "alendronate", "禁忌", "阿仑膦酸钠：食管、直立能力及低钙限制", "食管排空延迟（如狭窄、贲门失弛缓），不能坐直/站立至少 30 分钟，或低钙血症。", "存在任一情况时禁用；低钙须先纠正。", "alendronate"),
    single("pioglitazone-hf", "pioglitazone", "禁忌", "吡格列酮：NYHA III/IV 级心衰不得启用", "已确诊 NYHA III 或 IV 级心力衰竭。", "不得新启用；其他有症状心衰也不推荐使用，交由医师评估。", "pioglitazone"),
    single("morphine-contra", "morphine", "禁忌", "口服吗啡：明显呼吸抑制或胃肠梗阻", "明显呼吸抑制，或已知/疑似胃肠道梗阻（包括麻痹性肠梗阻）。", "禁用；急性或重症哮喘在缺少监护/复苏条件时亦禁用。", "morphine"),
    single("rivaroxaban-bleeding", "rivaroxaban", "禁忌", "利伐沙班：活动性病理性出血", "存在活动性病理性出血。", "禁用并及时评估出血；其他情形不要自行中断抗凝。", "rivaroxaban"),
    single("thyroxine-adrenal", "thyroxine", "禁忌", "左甲状腺素：未纠正的肾上腺功能不全", "可能诱发急性肾上腺危象。", "先纠正肾上腺功能不全，再由医师评估甲状腺激素治疗。", "thyroxine"),
    single("sertraline-maoi", "sertraline", "禁忌", "舍曲林：MAOI 或匹莫齐特相关禁忌", "正在使用或停用 MAOI 未满 14 天（含利奈唑胺、静脉亚甲蓝），或合用匹莫齐特。", "禁用相关组合；即使另一药不在本药库中也须主动核对。", "sertraline")
  ];
  const source20260914 = (label, setid) => Object.freeze({ ...source(label, setid), checkedAt: "2026-09-14" });
  Object.assign(S, {
    acei: source20260914("依那普利及 ACEI 类警示", "63187a94-9ac7-4320-ac70-0631e08c2b8d"),
    arb: source20260914("氯沙坦及 RAS 类警示", "df4f55f0-fb11-4f6f-a7ed-127b50f955fc"),
    metoprolol: source20260914("酒石酸美托洛尔 禁忌", "a401fe31-d51a-49d9-a062-c9d22088db56"),
    metoprololSuccinate: source20260914("琥珀酸美托洛尔缓释片 禁忌", "151079c5-6360-45ed-8118-885543d6a4ad"),
    amlodipine: source20260914("氨氯地平 低血压及主动脉瓣狭窄警示", "b6f298ba-2d7e-4a3c-9edb-8b60aba716d6"),
    atorvastatin: source20260914("阿托伐他汀 禁忌", "a60cc18b-0631-4cf0-b021-9f52224ece65"),
    rosuvastatin: source20260914("瑞舒伐他汀 禁忌", "325a5d0e-9a72-4015-9fcd-1655fb504cee"),
    bisoprolol: source20260914("比索洛尔 禁忌及心衰警示", "83e4b4e5-9130-44c8-abab-fcd0db5d8c49"),
    furosemide: source20260914("呋塞米 禁忌及电解质警示", "e9be5c3b-4b18-7ad2-e053-2995a90a4a8b"),
    hctz: source20260914("氢氯噻嗪 禁忌及地高辛相互作用", "01ad3531-5ed9-434c-b7d5-02d72aa82e46"),
    acarbose: source20260914("阿卡波糖 禁忌及相互作用", "067c0adc-7322-489d-9baa-1d061b37be36"),
    glimepiride: source20260914("格列美脲及磺脲类低血糖警示", "0003458f-352a-46fa-9d99-230daa76ae29"),
    humanInsulin: source20260914("人胰岛素 低血糖禁忌", "456e226e-e7b0-4850-b649-3d9e5533893c"),
    dapagliflozin: source20260914("达格列净 §2.4、5", "01f90c94-71cb-4a1f-81ff-8004b850529b"),
    ceftriaxone: source20260914("头孢曲松 新生儿与静脉钙限制", "467f49f7-1a35-49c1-88aa-acc2f27adc2b"),
    azithromycin: source20260914("阿奇霉素 §4", "25bc2e78-9d0d-41c6-a55e-a267d4457967"),
    metronidazole: source20260914("甲硝唑 禁忌与酒精", "f3ef765c-b531-4aaa-a86d-e32b7254ca48"),
    ibuprofen: source20260914("布洛芬 过敏、消化道及 NSAID 警示", "e07d989d-1b0e-4cc1-abf2-93c8b208a29a"),
    simvastatin: source20260914("辛伐他汀 剂量限制及肌病风险", "30fe2447-4dd3-43e6-bac5-0f754ab77c3a"),
    clopidogrel: source20260914("氯吡格雷 活动性出血禁忌", "5da7468b-b829-4624-b84d-84bdebf61a0d"),
    levoTendon: source20260914("左氧氟沙星 肌腱及重症肌无力警示", "f780bb91-483a-d1a6-e053-6294a90ab74b"),
    nsaidPregnancy: Object.freeze({ status: "verified-regulator", label: "FDA：NSAID 妊娠约 20 周及以后风险通告（境外监管参考）", url: "https://www.fda.gov/drugs/drug-safety-and-availability/fda-recommends-avoiding-use-nsaids-pregnancy-20-weeks-or-later-because-they-can-result-low-amniotic", checkedAt: "2026-09-14" })
  });
  Object.assign(G, {
    acei: group("贝那普利|培哚普利|依那普利|卡托普利|雷米普利|赖诺普利|福辛普利"),
    enalapril: group("依那普利"),
    arb: group("缬沙坦|氯沙坦|阿利沙坦|奥美沙坦|厄贝沙坦|替米沙坦|坎地沙坦|美阿沙坦|阿齐沙坦"),
    metoprololTartrate: group("酒石酸美托洛尔", "oral"), bisoprolol: group("比索洛尔"),
    metoprololSuccinate: group("琥珀酸美托洛尔", "oral"), atorvastatin: group("阿托伐他汀"), rosuvastatin: group("瑞舒伐他汀"),
    furosemide: group("呋塞米"), hctz: group("氢氯噻嗪"),
    acarbose: group("阿卡波糖", "oral"), acarboseHypoglycemia: group("胰岛素|格列美脲|格列吡嗪|格列齐特|格列喹酮"), sulfonylurea: group("格列美脲|格列吡嗪|格列齐特|格列喹酮"),
    glimepiride: group("格列美脲"), humanInsulin: group("人胰岛素"),
    dapagliflozin: group("达格列净"), secretagogueInsulin: group("胰岛素|格列美脲|格列吡嗪|格列齐特|格列喹酮|瑞格列奈"),
    ceftriaxone: group("头孢曲松", "injection"), azithromycin: group("阿奇霉素"),
    metronidazoleOral: group("甲硝唑", "oral"), ibuprofen: group("布洛芬", "oral"),
    systemicSteroid: { ...group("地塞米松|泼尼松|泼尼松龙|甲泼尼龙|氢化可的松|曲安奈德"), routes: ["oral", "injection"] },
    simvastatin: group("辛伐他汀"), amlodipine: { ...group("氨氯地平"), exclude: ["左氨氯地平"] }, fenofibrate: group("非诺贝特")
  });
  interactions.push(
    pair("acei-nsaid-renal", "需监测", "ACEI 与全身用 NSAID：肾功能风险", "acei", "nsaid", "NSAID 可能减弱降压作用并影响肾灌注。", "肾功能恶化，尤其在老年、脱水或同时使用利尿剂时。", "核对联用必要性，监测肾功能、血钾与血压；脱水时及时评估。", "acei"),
    pair("arb-nsaid-renal", "需监测", "ARB 成分与全身用 NSAID：肾功能风险", "arb", "nsaid", "对肾血流调节的影响叠加。", "急性肾损伤及降压效果减弱；合并利尿剂、脱水者风险更高。", "避免自行叠加止痛药，复核容量状态、肾功能和血钾。", "arb"),
    pair("acei-arb-dual", "严重", "ACEI 与 ARB 成分：双重 RAS 阻断", "acei", "arb", "抑制同一调节系统的作用叠加。", "低血压、高钾、晕厥及肾功能损害增加。", "通常避免联用；沙库巴曲复方另须遵守 ACEI 换药间隔禁忌。", "arb"),
    pair("furosemide-digoxin", "需监测", "呋塞米与地高辛：低钾相关毒性", "furosemide", "digoxin", "利尿所致低钾可增加心肌对地高辛的敏感性。", "心律失常或地高辛毒性风险增加。", "有指征时可联用，监测血钾、血镁、肾功能及地高辛相关症状。", "furosemide"),
    pair("hctz-digoxin", "需监测", "氢氯噻嗪（含复方）与地高辛", "hctz", "digoxin", "低钾可增强洋地黄的心脏毒性。", "心律失常风险升高。", "监测电解质，出现乏力、恶心、心律异常及时评估。", "hctz"),
    pair("acarbose-digoxin", "需监测", "阿卡波糖与地高辛", "acarbose", "digoxin", "阿卡波糖可改变地高辛的生物利用度。", "地高辛暴露及疗效可能改变。", "联用或停用时复核地高辛浓度和临床反应，由医师决定是否调量。", "acarbose"),
    pair("acarbose-hypoglycemia", "需监测", "阿卡波糖与胰岛素/磺脲类", "acarbose", "acarboseHypoglycemia", "合用其他降糖治疗可增加低血糖风险。", "低血糖；蔗糖分解受抑制，纠正低血糖可能延迟。", "监测血糖；发生低血糖优先使用葡萄糖，不能以蔗糖替代。", "acarbose"),
    pair("sulfonylurea-beta", "需监测", "磺脲类与 β 受体阻滞剂", "sulfonylurea", "beta", "β 阻滞剂可能掩盖部分低血糖预警症状。", "低血糖不易及时识别。", "加强血糖监测，不以有无心悸或心动过速判断是否低血糖。", "glimepiride"),
    pair("dapagliflozin-insulin", "需监测", "达格列净（含复方）与胰岛素/促泌剂", "dapagliflozin", "secretagogueInsulin", "联合降糖作用增加。", "低血糖风险增加。", "监测血糖，由医师调整胰岛素或促泌剂；不要自行大幅减停胰岛素。", "dapagliflozin"),
    pair("dapagliflozin-loop", "需监测", "达格列净与呋塞米：容量不足", "dapagliflozin", "furosemide", "利尿及容量减少作用可能叠加。", "脱水、低血压及肾功能变化。", "开始或调整时复核容量状态、血压和肾功能；按指征个体化调整。", "dapagliflozin"),
    pair("levofloxacin-systemic-steroid", "严重", "全身用左氧氟沙星与全身用激素", "levofloxacin", "systemicSteroid", "糖皮质激素可进一步增加氟喹诺酮相关肌腱损伤风险。", "肌腱炎或肌腱断裂，老年或肾功能不全者尤其需注意。", "评估替代方案；出现肌腱疼痛、肿胀应停用左氧氟沙星、减少活动并及时就医。", "levoTendon"),
    pair("simvastatin-amlodipine", "需监测", "辛伐他汀与氨氯地平：剂量限制", "simvastatin", "amlodipine", "联用可增加辛伐他汀暴露。", "肌病及横纹肌溶解风险增加。", "该境外说明书要求辛伐他汀不超过 20 mg/日；本品剂量限制须再按中国说明书核对。", "simvastatin"),
    pair("simvastatin-fenofibrate", "需监测", "辛伐他汀与非诺贝特", "simvastatin", "fenofibrate", "两药均可能引起肌病。", "肌病或横纹肌溶解风险增加。", "仅在获益明确时联用，出现肌痛、无力或深色尿及时就医并评估 CK、肾功能。", "simvastatin")
  );
  contraindications.push(
    single("metoprolol-succinate-contra", "metoprololSuccinate", "禁忌", "琥珀酸美托洛尔：严重心动过缓或失代偿", "严重心动过缓、Ⅱ/Ⅲ度房室阻滞、心源性休克、失代偿心衰或无永久起搏器的病窦综合征。", "存在相应情况时禁用；稳定慢性心衰可有适应症，长期用药不应自行骤停。", "metoprololSuccinate"),
    single("amlodipine-hypotension", "amlodipine", "慎用", "氨氯地平：严重主动脉瓣狭窄或低血压", "严重主动脉瓣狭窄、易发生症状性低血压。", "谨慎评估并监测血压；含氨氯地平复方亦须检查其他降压成分。", "amlodipine"),
    single("atorvastatin-liver", "atorvastatin", "禁忌", "阿托伐他汀：急性肝衰竭或失代偿肝硬化", "急性肝衰竭或失代偿肝硬化。", "禁用；一般脂肪肝不自动等同于本条禁忌，其他肝病依本品说明书评估。", "atorvastatin"),
    single("rosuvastatin-liver", "rosuvastatin", "禁忌", "瑞舒伐他汀：急性肝衰竭或失代偿肝硬化", "急性肝衰竭或失代偿肝硬化。", "禁用；肾功能限制及剂量另按本品说明书核对，复方不能忽略本成分。", "rosuvastatin"),
    single("acei-pregnancy", "acei", "严重", "ACEI：妊娠胎儿毒性警示", "妊娠期间使用作用于 RAS 的药物可能损害胎儿。", "备孕及时换药评估；发现妊娠应尽快联系医师停换本药。禁用范围按本品中国说明书核对。", "acei"),
    single("enalapril-angioedema", "enalapril", "禁忌", "依那普利：相关血管性水肿病史", "既往 ACEI 相关血管性水肿，或遗传性/特发性血管性水肿。", "禁用；含依那普利复方同样需核对。", "acei"),
    single("arb-pregnancy", "arb", "严重", "ARB 成分：妊娠胎儿毒性警示", "妊娠期，尤其妊娠中后期。", "备孕及时评估替代方案；发现妊娠应尽快联系医师停换，含 ARB 的复方也需核对。", "arb"),
    single("metoprolol-contra", "metoprololTartrate", "禁忌", "酒石酸美托洛尔：严重心动过缓或失代偿", "严重心动过缓、Ⅱ/Ⅲ度房室阻滞、无起搏器的病窦综合征、心源性休克或失代偿心衰。", "存在相应情况时禁用；稳定期心衰不能一概按此禁忌处理，长期用药勿自行骤停。", "metoprolol"),
    single("bisoprolol-conduction", "bisoprolol", "禁忌", "比索洛尔：明显心动过缓或传导阻滞", "明显窦性心动过缓、Ⅱ/Ⅲ度房室传导阻滞或心源性休克。", "禁用并评估循环状态；起搏器等特殊情况须专科复核。", "bisoprolol"),
    single("bisoprolol-hf", "bisoprolol", "严重", "比索洛尔：急性失代偿心衰需专科评估", "急性心衰或循环不稳定；境内外心衰适应症表述可能不同。", "不能直接新启用或加量；稳定慢性心衰可有治疗指征，勿将所有心衰一概列为禁忌。", "bisoprolol"),
    single("furosemide-anuria", "furosemide", "禁忌", "呋塞米：无尿", "无尿。", "禁用，并明确肾功能及梗阻等原因。", "furosemide"),
    single("furosemide-depletion", "furosemide", "慎用", "呋塞米：容量与电解质不足", "脱水、低血压、低钾或低镁等。", "先评估容量和电解质，监测肾功能及治疗反应，避免过度利尿。", "furosemide"),
    single("hctz-anuria", "hctz", "禁忌", "氢氯噻嗪：无尿", "无尿，含氢氯噻嗪复方同样需核对。", "禁用；不能仅因复方名中含降压成分而忽略利尿剂限制。", "hctz"),
    single("acarbose-gut", "acarbose", "禁忌", "阿卡波糖：肠道疾病与梗阻风险", "炎症性肠病、结肠溃疡、部分肠梗阻或梗阻倾向等。", "禁用；存在严重消化吸收障碍时核对完整说明书。", "acarbose"),
    single("acarbose-dka-liver", "acarbose", "禁忌", "阿卡波糖：酮症酸中毒或肝硬化", "糖尿病酮症酸中毒或肝硬化。", "禁用，不能依靠本药处理酮症酸中毒。", "acarbose"),
    single("sulfonylurea-low-glucose", "sulfonylurea", "慎用", "磺脲类：严重低血糖风险", "高龄、肝肾功能受损、进食不足或联合其他降糖药时。", "核对剂量、进食和肝肾功能，增加血糖监测。不同磺脲药的具体禁忌须逐品核对。", "glimepiride"),
    single("glimepiride-allergy", "glimepiride", "禁忌", "格列美脲：相关过敏史", "对格列美脲、本品成分或说明书所列磺酰胺衍生物过敏。", "禁用；不把这条特定说明书禁忌泛化到所有含磺酰胺结构的药物。", "glimepiride"),
    single("human-insulin-low-glucose", "humanInsulin", "禁忌", "人胰岛素：正在发生低血糖", "当前正在低血糖发作。", "先处理低血糖，再由医师评估胰岛素时机和剂量；不等于长期停用胰岛素。", "humanInsulin"),
    single("dapagliflozin-ketoacidosis", "dapagliflozin", "严重", "达格列净：酮症酸中毒警示", "出现恶心、呕吐、腹痛或呼吸困难，尤其在感染、禁食、脱水或减停胰岛素后。", "即使血糖不高也须评估酮症酸中毒，怀疑时停药并立即就医。", "dapagliflozin"),
    single("dapagliflozin-surgery", "dapagliflozin", "慎用", "达格列净：手术或长时间禁食", "计划手术或需要长时间禁食的操作。", "该说明书建议尽可能提前至少 3 天暂停；临床稳定并恢复进食后再评估恢复用药。其他格列净不能照搬。", "dapagliflozin"),
    single("ceftriaxone-neonatal", "ceftriaxone", "禁忌", "头孢曲松：特定新生儿禁忌", "高胆红素血症新生儿；或 ≤28 天且需要/预计需要静脉含钙治疗的新生儿。", "禁用；早产儿另须核对胎龄及出生后年龄。口服钙不等同于静脉钙。", "ceftriaxone"),
    single("ceftriaxone-calcium", "ceftriaxone", "严重", "头孢曲松：静脉含钙溶液配伍限制", "计划与含钙静脉溶液混合或同时输注。", "禁止混合或同时经 Y 型接口输注；非新生儿序贯给药需充分冲管并按说明书执行。", "ceftriaxone"),
    single("azithromycin-liver", "azithromycin", "禁忌", "阿奇霉素：既往相关肝损害", "曾因阿奇霉素发生胆汁淤积性黄疸或肝功能异常。", "禁用；一般肝病不自动等同于这一特定病史。", "azithromycin"),
    single("azithromycin-allergy", "azithromycin", "禁忌", "阿奇霉素：大环内酯类相关过敏", "对阿奇霉素、红霉素、大环内酯或酮内酯类药物过敏。", "禁用并核对过敏反应类型。", "azithromycin"),
    single("metronidazole-alcohol", "metronidazoleOral", "禁忌", "口服甲硝唑：酒精及双硫仑限制", "正在使用酒精/含丙二醇产品，或过去 2 周内使用过双硫仑。", "用药期间及停药后至少 3 天避免酒精/含丙二醇产品；近 2 周用过双硫仑者禁用。", "metronidazole"),
    single("ibuprofen-allergy", "ibuprofen", "禁忌", "口服布洛芬：阿司匹林/NSAID 相关过敏", "服阿司匹林或其他 NSAID 后发生过哮喘、荨麻疹或过敏样反应。", "禁用；不要仅依据既往能否耐受另一种止痛药判断安全。", "ibuprofen"),
    single("ibuprofen-cabg", "ibuprofen", "禁忌", "口服布洛芬：冠脉搭桥手术相关用药", "用于冠状动脉旁路移植术（CABG）围手术期疼痛。", "禁用，选择其他围手术期镇痛方案。", "ibuprofen"),
    single("nsaid-pregnancy", "nsaid", "严重", "全身用非阿司匹林 NSAID：孕周相关风险", "妊娠约 20 周及以后；约 30 周及以后还涉及胎儿动脉导管风险。", "20–30 周仅在医师认为必要时短期最低有效剂量，30 周及以后避免使用；不能套用于医嘱低剂量阿司匹林。", "nsaidPregnancy"),
    single("clopidogrel-active-bleeding", "clopidogrel", "禁忌", "氯吡格雷：活动性病理性出血", "正在发生消化道溃疡出血、颅内出血等活动性病理性出血。", "禁用并处理出血；无此情形时不应自行停用既定抗血小板治疗。", "clopidogrel"),
    single("levofloxacin-mg", "levofloxacin", "严重", "全身用左氧氟沙星：重症肌无力", "既往有重症肌无力。", "应避免使用，可能加重肌无力及呼吸风险。", "levoTendon"),
    single("simvastatin-myopathy", "simvastatin", "慎用", "辛伐他汀：肌病高风险因素", "高龄、未控制甲减、肾功能不全、高剂量或合并相关相互作用药物。", "核对剂量与联用药；出现无法解释的肌痛、无力或深色尿及时就医。", "simvastatin")
  );

  const domestic = (label, url, status = "verified-cn-label") => Object.freeze({ label, url, status, checkedAt: "2026-09-14" });
  Object.assign(S, {
    tyc: domestic("上海强生：酚麻美敏片说明书（2021-03-19 修订，国内产品参考）", "https://www.xian-janssen.com.cn/sites/default/files/PDF/tyc_0.pdf"),
    zhenju: domestic("珍菊降压片：2013 年第 20 号监管修订公告（转载，非厂家逐批核验）", "https://www.pharnexcloud.com/data/zcfg_d28d3f387758af41548507f2541c3b21.html", "regulator-reprint"),
    benzbromarone: domestic("中国食品药品网转载：苯溴马隆 2020 年第 150 号说明书修订公告", "https://m.cnpharm.com/c/2020-12-30/770078.shtml", "regulator-reprint")
  });
  Object.assign(G, {
    tyc: { exactNames: ["酚麻美敏片"], route: "oral" },
    zhenju: { exactNames: ["珍菊降压片"], route: "oral" },
    benzbromarone: group("苯溴马隆", "oral"),
    acetaminophen: group("对乙酰氨基酚", "oral"),
    sedatives: group("阿普唑仑|艾司唑仑|氯硝西泮|佐匹克隆|唑吡坦|吗啡|苯巴比妥"),
    digitalis: group("地高辛|去乙酰毛花苷")
  });
  // 仅扩展已核验通用名，不根据商品名、旧名称或类似字样猜测复方成分。
  const ingredientAliases = Object.freeze([
    Object.freeze({ names: ["珍菊降压片"], ingredients: ["氢氯噻嗪", "可乐定", "芦丁"], source: S.zhenju }),
    Object.freeze({ names: ["酚麻美敏片"], ingredients: ["对乙酰氨基酚", "伪麻黄碱", "右美沙芬", "氯苯那敏"], source: S.tyc })
  ]);
  interactions.push(
    pair("duplicate-hctz", "需监测", "重复成分：氢氯噻嗪（含珍菊降压片）", "hctz", "hctz", "两个品规含相同利尿成分。", "总剂量可能重复，增加低血压及电解质紊乱风险。", "由医师核算总量并确认是否有意组合；不要自行停药。", "zhenju"),
    pair("duplicate-acetaminophen", "严重", "重复成分：对乙酰氨基酚", "acetaminophen", "acetaminophen", "不同品规中的同一解热镇痛成分叠加。", "过量可能损伤肝脏。", "避免自行叠加，核对全部复方成分与总量；误服过量即使无症状也应就医。", "tyc"),
    pair("tyc-nsaid", "严重", "酚麻美敏片与全身用 NSAID", "tyc", "nsaid", "解热镇痛作用及毒性可能叠加。", "肝肾损伤风险增加。", "避免自行合用，由医师或药师评估替代方案。", "tyc"),
    pair("tyc-sedatives", "需监测", "酚麻美敏片与镇静药", "tyc", "sedatives", "氯苯那敏可增强中枢抑制作用。", "嗜睡及反应能力下降。", "联用前咨询医生，避免饮酒及驾驶。", "tyc"),
    pair("tyc-digitalis", "严重", "酚麻美敏片与洋地黄苷类", "tyc", "digitalis", "国内说明书列为不宜并用。", "需重新评估组合。", "请医师或药师调整感冒用药，不要自行停用心脏治疗药。", "tyc"),
    pair("zhenju-beta-withdrawal", "严重", "珍菊降压片与 β 受体阻滞剂：撤药风险", "zhenju", "beta", "β 阻滞剂可加重可乐定撤药反应。", "突然停药可能引起血压反跳。", "不要自行减停任一药物；由医生安排停药顺序及渐减方案。", "zhenju")
  );
  contraindications.push(
    single("tyc-organ", "tyc", "禁忌", "酚麻美敏片：严重肝肾功能不全", "存在严重肝或肾功能不全。", "禁用；较轻损害也需医师评估。", "tyc"),
    single("tyc-maoi", "tyc", "禁忌", "酚麻美敏片：MAOI 换药间隔", "正在使用 MAOI 或停用未满 14 天。", "禁用，核对药库外用药。", "tyc"),
    single("tyc-antihypertensive", "tyc", "严重", "酚麻美敏片：正在服用降压药", "国内说明书注意事项要求服用降压药者勿服本品。", "请医生选择替代感冒药，不要停用降压药来服本品。", "tyc"),
    single("tyc-special", "tyc", "慎用", "酚麻美敏片：孕哺期及儿童", "孕期、哺乳期或未满 12 岁。", "孕哺期须评估获益风险；儿童用量咨询医师或药师，不能套用成人剂量。", "tyc"),
    single("tyc-allergy", "tyc", "禁忌", "酚麻美敏片：成分过敏", "对本品过敏。", "禁用；服药后出现皮疹等过敏征象须停药并就医。", "tyc"),
    single("zhenju-pregnancy", "zhenju", "禁忌", "珍菊降压片：孕期及哺乳期", "妊娠或哺乳期。", "禁用，联系医生更换治疗。", "zhenju"),
    single("zhenju-allergy", "zhenju", "禁忌", "珍菊降压片：成分或磺胺类过敏", "对本品、组方成分或磺胺类药物过敏。", "禁用；不能按纯中药忽略过敏史。", "zhenju"),
    single("zhenju-withdrawal", "zhenju", "慎用", "珍菊降压片：不可突然停药", "含可乐定，骤停可能发生撤药反应。", "在医师指导下渐减，并监测血压。", "zhenju"),
    single("benzbromarone-allergy", "benzbromarone", "禁忌", "苯溴马隆：成分或辅料过敏", "对本品或辅料过敏。", "禁用。", "benzbromarone"),
    single("benzbromarone-liver", "benzbromarone", "慎用", "苯溴马隆：肝损伤风险", "近期肝病、持续转氨酶升高、黄疸或酗酒。", "监测肝肾功能，避免合用潜在肝毒性药；出现疑似肝损伤症状应停药并及时就医。", "benzbromarone")
  );
  window.MEDICATION_SAFETY = Object.freeze({ interactions: Object.freeze(interactions), contraindications: Object.freeze(contraindications), ingredientAliases });
})();
