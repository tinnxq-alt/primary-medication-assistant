# 用药安全修复复核记录

基线：tinnxq-alt/primary-medication-assistant，main 提交 88278a3336c9358f4963a87398fb4b2a28cf87e6。工作副本全部文件按 Git blob SHA 校验与该提交一致。

## 修复范围

1. 首次进入相互作用页未加载门诊库，导致跨库药品不在选择列表；现在完成加载及核验后才允许查询，失败可重试。
2. 口服药吸收规则未排除注射钙剂；现在根据药名、剂型和途径判断，滴眼/外用制剂不套全身规则，直肠用吲哚美辛保留全身风险。
3. 补充艾司唑仑、阿司匹林复方名称及枸橼酸钾匹配；枸橼酸铋钾不按补钾药处理。
4. 修复两个无 ID 输入被视作同一药、修正后的药名仍受 rawName/商品名污染、换药后仍显示旧结果、自定义组合正反向重复、慎用和监测误用禁忌颜色。
5. 单药禁忌与联用规则分开呈现；联用规则可按药名和严重程度筛选，并关联药库内药品。
6. service worker v58 预缓存新增模块，清理时仅清除本应用历史缓存。

## 内容范围与缺口

目录共 556 个品规：病房 164、门诊 392。原引擎实际有 16 条联用规则（旧 README 的 12 组计数过期）；本次新增 10 条，共 26 条。新增 12 条单药重点规则，匹配 23 个品规。

单药提示尚未覆盖的 533 个品规列在 safety-coverage.json 中；interactionRules 只表示该药匹配规则一侧，不代表完整相互作用审核。中成药配伍、全部重复成分、妊娠哺乳/儿童/肝肾功能条件及个别厂家差异仍须逐品种补充核验。页面明确展示此状态，不把未匹配解释为安全。

新增资料按境外说明书成分级整理，不冒充对应中国厂家已核验；未改写原院内目录、批准文号或临床四字段。已有 16 条规则的原始来源日期保留，本轮不声称完成其全部来源重新核验。

## 验证

- 药库质控、全部 scripts/test-*.mjs 与 3 组 Worker 测试通过。
- 新增真实目录正向/反向匹配、复方、多种剂型排除、无 ID 输入、旧名污染、枸橼酸铋钾负例、规则 ID 和来源、单药禁忌/慎用分离回归。
- Edge 无头浏览器 390 × 844 实测跨库初始加载、搜索、组合命中、换药清空、单药规则、未覆盖提示、自定义重复阻止、失败重试及无横向溢出；无页面 JS 异常。
- 离线预缓存包含新规则；模拟同域多个应用缓存，确认仅删除 primary-medication 旧版本。

## 本次新增规则来源（查阅 2026-09-13）

- [DailyMed：瑞格列奈 §7（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=3b150917-e2fd-4366-af83-ebc1d7297ca9)
- [DailyMed：地高辛 §4、5、7（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=5b2d10d0-6e9d-4c39-a025-6b2f30ff6243)
- [DailyMed：螺内酯 §4、5、7（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ffd1ed7a-b6a4-4240-e053-6394a90a7db1)
- [DailyMed：舍曲林 §4、5、7（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=2dac437f-b5ef-42dd-aa0b-1f4b9b45ef43)
- [DailyMed：阿仑膦酸钠 §2、4、7（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=b63421af-ec03-1de7-e053-2a95a90abec6)
- [DailyMed：吡格列酮 §4、5（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=266c81ff-e877-6b00-e063-6394a90a50ac)
- [DailyMed：左氧氟沙星 血糖警示（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=fc165a6d-24b0-4753-a7ac-94a134dca0d3)
- [DailyMed：二甲双胍 禁忌及肾功能（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=8749ceb8-183a-4f7d-adb7-088480d3a873)
- [DailyMed：吗啡口服片 §4、5（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=300b6afd-bac8-32ca-e063-6294a90a12a7)
- [DailyMed：利伐沙班 §4（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=3e95389b-0a93-4560-98c5-02637fb2600f)
- [DailyMed：左甲状腺素 禁忌（境外说明书参考）](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=fca88c97-5cd4-4834-ba87-deb5bd637788)
