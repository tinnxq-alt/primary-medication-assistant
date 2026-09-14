# 用药安全修复复核记录

基线：tinnxq-alt/primary-medication-assistant，main 提交 88278a3336c9358f4963a87398fb4b2a28cf87e6。工作副本全部文件按 Git blob SHA 校验与该提交一致。

## 修复范围

1. 首次进入相互作用页未加载门诊库，导致跨库药品不在选择列表；现在完成加载及核验后才允许查询，失败可重试。
2. 口服药吸收规则未排除注射钙剂；现在根据药名、剂型和途径判断，滴眼/外用制剂不套全身规则，直肠用吲哚美辛保留全身风险。
3. 补充艾司唑仑、阿司匹林复方名称及枸橼酸钾匹配；枸橼酸铋钾不按补钾药处理。
4. 修复两个无 ID 输入被视作同一药、修正后的药名仍受 rawName/商品名污染、换药后仍显示旧结果、自定义组合正反向重复、慎用和监测误用禁忌颜色。
5. 单药禁忌与联用规则分开呈现；联用规则可按药名和严重程度筛选，并关联药库内药品。
6. service worker v60 预缓存新增模块，清理时仅清除本应用历史缓存。

## 内容范围与缺口

目录共 556 个品规：病房 164、门诊 392。原引擎有 16 条联用规则，现共 45 条；单药重点规则共 53 条，匹配 113 个品规。

尚未有结构化单药提示的 443 个品规列在 safety-coverage.json 中；interactionRules 只表示匹配规则一侧，不代表完整处方审核。页面可展开已有注意事项，其内容保留原来源和待核验状态，但不被自动升级为结构化禁忌。中成药配伍、全部重复成分、各厂家的妊娠哺乳/儿童/肝肾限制仍需逐品种核验。

本轮扩展涵盖常用降压药、降糖药、抗菌药、镇痛药和部分他汀。特别区分失代偿与稳定慢性心衰、达格列净与其他格列净、氨氯地平与左氨氯地平、静脉钙与口服钙、全身与吸入/局部激素。

新增资料按境外说明书成分级整理，不冒充对应中国厂家已核验；未改写原院内目录、批准文号或临床四字段。已有 16 条规则的原始来源日期保留，本轮不声称完成其全部来源重新核验。

## 验证

- 药库质控、全部 scripts/test-*.mjs 与 3 组 Worker 测试通过。
- 新增真实目录正向/反向匹配、复方、多种剂型排除、无 ID 输入、旧名污染、枸橼酸铋钾负例、规则 ID 和来源、单药禁忌/慎用分离回归。
- Edge 无头浏览器 390 × 844 实测跨库初始加载、搜索、组合命中、换药清空、单药规则、未覆盖提示、自定义重复阻止、失败重试及无横向溢出；无页面 JS 异常。
- 扩展回归验证 13 个真实新增联用组合、全部单药规则真实目录命中，以及途径/成分/病情条件负例。
- 离线预缓存包含新规则；模拟同域多个应用缓存，确认仅删除 primary-medication 旧版本。

## 新增规则来源

- [DailyMed：瑞格列奈 §7（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=3b150917-e2fd-4366-af83-ebc1d7297ca9) · 查阅 2026-09-13
- [DailyMed：地高辛 §4、5、7（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=5b2d10d0-6e9d-4c39-a025-6b2f30ff6243) · 查阅 2026-09-13
- [DailyMed：螺内酯 §4、5、7（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ffd1ed7a-b6a4-4240-e053-6394a90a7db1) · 查阅 2026-09-13
- [DailyMed：舍曲林 §4、5、7（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=2dac437f-b5ef-42dd-aa0b-1f4b9b45ef43) · 查阅 2026-09-13
- [DailyMed：阿仑膦酸钠 §2、4、7（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=b63421af-ec03-1de7-e053-2a95a90abec6) · 查阅 2026-09-13
- [DailyMed：吡格列酮 §4、5（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=266c81ff-e877-6b00-e063-6394a90a50ac) · 查阅 2026-09-13
- [DailyMed：左氧氟沙星 血糖警示（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=fc165a6d-24b0-4753-a7ac-94a134dca0d3) · 查阅 2026-09-13
- [DailyMed：依那普利及 ACEI 类警示（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=63187a94-9ac7-4320-ac70-0631e08c2b8d) · 查阅 2026-09-14
- [DailyMed：氯沙坦及 RAS 类警示（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=df4f55f0-fb11-4f6f-a7ed-127b50f955fc) · 查阅 2026-09-14
- [DailyMed：呋塞米 禁忌及电解质警示（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=e9be5c3b-4b18-7ad2-e053-2995a90a4a8b) · 查阅 2026-09-14
- [DailyMed：氢氯噻嗪 禁忌及地高辛相互作用（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=01ad3531-5ed9-434c-b7d5-02d72aa82e46) · 查阅 2026-09-14
- [DailyMed：阿卡波糖 禁忌及相互作用（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=067c0adc-7322-489d-9baa-1d061b37be36) · 查阅 2026-09-14
- [DailyMed：格列美脲及磺脲类低血糖警示（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=0003458f-352a-46fa-9d99-230daa76ae29) · 查阅 2026-09-14
- [DailyMed：达格列净 §2.4、5（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=01f90c94-71cb-4a1f-81ff-8004b850529b) · 查阅 2026-09-14
- [DailyMed：左氧氟沙星 肌腱及重症肌无力警示（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=f780bb91-483a-d1a6-e053-6294a90ab74b) · 查阅 2026-09-14
- [DailyMed：辛伐他汀 剂量限制及肌病风险（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=30fe2447-4dd3-43e6-bac5-0f754ab77c3a) · 查阅 2026-09-14
- [DailyMed：二甲双胍 禁忌及肾功能（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=8749ceb8-183a-4f7d-adb7-088480d3a873) · 查阅 2026-09-13
- [DailyMed：吗啡口服片 §4、5（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=300b6afd-bac8-32ca-e063-6294a90a12a7) · 查阅 2026-09-13
- [DailyMed：利伐沙班 §4（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=3e95389b-0a93-4560-98c5-02637fb2600f) · 查阅 2026-09-13
- [DailyMed：左甲状腺素 禁忌（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=fca88c97-5cd4-4834-ba87-deb5bd637788) · 查阅 2026-09-13
- [DailyMed：琥珀酸美托洛尔缓释片 禁忌（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=151079c5-6360-45ed-8118-885543d6a4ad) · 查阅 2026-09-14
- [DailyMed：氨氯地平 低血压及主动脉瓣狭窄警示（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=b6f298ba-2d7e-4a3c-9edb-8b60aba716d6) · 查阅 2026-09-14
- [DailyMed：阿托伐他汀 禁忌（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=a60cc18b-0631-4cf0-b021-9f52224ece65) · 查阅 2026-09-14
- [DailyMed：瑞舒伐他汀 禁忌（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=325a5d0e-9a72-4015-9fcd-1655fb504cee) · 查阅 2026-09-14
- [DailyMed：酒石酸美托洛尔 禁忌（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=a401fe31-d51a-49d9-a062-c9d22088db56) · 查阅 2026-09-14
- [DailyMed：比索洛尔 禁忌及心衰警示（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=83e4b4e5-9130-44c8-abab-fcd0db5d8c49) · 查阅 2026-09-14
- [DailyMed：人胰岛素 低血糖禁忌（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=456e226e-e7b0-4850-b649-3d9e5533893c) · 查阅 2026-09-14
- [DailyMed：头孢曲松 新生儿与静脉钙限制（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=467f49f7-1a35-49c1-88aa-acc2f27adc2b) · 查阅 2026-09-14
- [DailyMed：阿奇霉素 §4（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=25bc2e78-9d0d-41c6-a55e-a267d4457967) · 查阅 2026-09-14
- [DailyMed：甲硝唑 禁忌与酒精（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=f3ef765c-b531-4aaa-a86d-e32b7254ca48) · 查阅 2026-09-14
- [DailyMed：布洛芬 过敏、消化道及 NSAID 警示（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=e07d989d-1b0e-4cc1-abf2-93c8b208a29a) · 查阅 2026-09-14
- [FDA：NSAID 妊娠约 20 周及以后风险通告（境外监管参考）](https://www.fda.gov/drugs/drug-safety-and-availability/fda-recommends-avoiding-use-nsaids-pregnancy-20-weeks-or-later-because-they-can-result-low-amniotic) · 查阅 2026-09-14
- [DailyMed：氯吡格雷 活动性出血禁忌（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=5da7468b-b829-4624-b84d-84bdebf61a0d) · 查阅 2026-09-14

## 国内资料与复方补充（2026-09-14）

新增 10 条单药提示、6 条联用规则。珍菊降压片映射氢氯噻嗪、可乐定、芦丁；酚麻美敏片映射对乙酰氨基酚、伪麻黄碱、右美沙芬、氯苯那敏。只按通用名及口服剂型匹配；旧名、商品名、其他剂型和未核验复方不参与别名推断。重复成分提示不能代替剂量审核，尚不支持全部成分或整张处方审核。

- [上海强生酚麻美敏片说明书](https://www.xian-janssen.com.cn/sites/default/files/PDF/tyc_0.pdf)：已下载读取全文，版本 2021-03-19；不声称核验所有厂家最新版本。
- [珍菊降压片监管修订公告转载](https://www.pharnexcloud.com/data/zcfg_d28d3f387758af41548507f2541c3b21.html)：2013 年第 20 号；采用修订条款并明确转载状态。
- [中国食品药品网转载苯溴马隆修订公告](https://m.cnpharm.com/c/2020-12-30/770078.shtml)：2020 年第 150 号。

新增 test-domestic-safety.mjs 覆盖真实品规、正反向、结构化成分、括号别名、局部制剂排除、旧名污染及未核验复方负例。
