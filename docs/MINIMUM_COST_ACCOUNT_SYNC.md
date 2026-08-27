# 账号与个人数据同步：最低成本方案

核算日期：2026-08-27。以下金额均为平台基础费用，不含可选域名、人工审核和机构合规成本。

## 结论

在不超过 50 名授权使用者、访问量较低且不存储患者身份信息的前提下，新增平台最低固定成本为 **0 美元/月**：

| 组件 | 选择 | 免费额度与用途 | 预计月费 |
|---|---|---|---:|
| 登录 | Cloudflare Access + 邮箱一次性验证码 | 免费方案最多 50 名用户 | $0 |
| 同步接口 | Cloudflare Workers Free | 每日 100,000 次请求 | $0 |
| 个人数据 | Cloudflare D1 Free | 每日 500 万行读取、10 万行写入、账户合计 5 GB | $0 |
| 临时地址 | `workers.dev` | 不购买域名也能使用并受 Access 保护 | $0 |
| 现有静态站 | 继续保留现状作为稳定版和回退 | 本阶段不迁移、不部署 | $0 |
| **合计** |  |  | **$0/月** |

官方依据：[Workers 价格](https://developers.cloudflare.com/workers/platform/pricing/)、[Workers 限制](https://developers.cloudflare.com/workers/platform/limits/)、[D1 价格](https://developers.cloudflare.com/d1/platform/pricing/)、[Access 方案](https://www.cloudflare.com/plans/zero-trust-services/)、[邮箱验证码](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/)、[`workers.dev` 路由](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)。

## 用量演算

按 50 名基层医务人员、每人每天 100 次同步请求计算：

- Worker：5,000 次/日，占免费请求额度 5%。
- 即使每次都产生一次写入：5,000 行写入/日，占 D1 免费写入额度 5%。
- 若保存 100,000 条、平均每条约 2 KB 的个人记录，约占 200 MB，低于 5 GB 免费存储总额。

这是容量预算，不是流量承诺。上线后应设置 50%、75%、90% 三档用量告警。免费 D1 超额时请求会报错直到额度重置，不会自动产生意外账单。

## 何时会产生费用

- Workers 需要更高余量时，付费方案最低约 **5 美元/月**，再按超额用量计费。
- Access 超过免费人数范围时，按当前自助价格约 **7 美元/用户/月**；届时应重新比较机构已有 Microsoft/Google 身份系统与 Cloudflare 方案。
- 自定义域名是可选项；继续使用 `workers.dev` 时域名成本为 0。
- 真正处理患者身份、病历或诊疗记录时，不能沿用这份零成本估算，必须另做合规、审计、备份和数据驻留评估。

## 最低成本实施顺序

1. 保留两个现有站点作为稳定回退，不改域名、不部署新代码。
2. 在草稿分支验证独立同步 Worker、D1 表结构和用户隔离测试。
3. 创建一个免费 D1 测试库，并只允许测试邮箱通过 Access。
4. 先让 1—3 个测试账号迁移无患者身份信息的收藏、笔记、待办。
5. 完成备份恢复和跨用户隔离验证后，再决定是否切换统一入口。

Cloudflare 明确说明 Access 会在 Worker 执行前检查请求；Worker 也通过 `ctx.access` 再次失败关闭。由于 Workers Static Assets 的内部路由目前不会把 `ctx.access` 传给用户 Worker，本阶段把同步 API 与静态站保持独立，避免为了省一个服务而削弱身份隔离。[Access 与 `ctx.access` 说明](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)

