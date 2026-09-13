/* 成分级补充规则；来源是境外说明书参考，不等同于本品中国批准文号说明书。 */
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
  window.MEDICATION_SAFETY = Object.freeze({ interactions: Object.freeze(interactions), contraindications: Object.freeze(contraindications) });
})();
