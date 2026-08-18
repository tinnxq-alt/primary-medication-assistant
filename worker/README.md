# 新药智能识别 Worker

此 Cloudflare Worker 为“基层用药助手 Pro”的联网说明书读取服务。当前生产目标入口为 `src/index-v11.js`。

## v11：零成本主流程

v11 不再依赖 OpenAI API，也不再调用搜索引擎发现药品页面。主流程为：

1. 用户输入药名片段；
2. Worker 先查询项目内置的可信说明书 URL 索引；
3. 命中后，通过 Cloudflare Browser Run `content` Quick Action 直接读取具体说明书网页；
4. 适应症、用法用量、不良反应、注意事项、规格、厂家等字段只从真实来源网页原文解析；
5. 索引未命中时，网页端允许粘贴 39药品通或药源网的具体 HTTPS 说明书链接，再由 Worker 直接解析；
6. 缺失字段保持缺失，不调用模型知识补写。

当前免费索引首批包含：司美格鲁肽注射液、阿卡波糖片、阿奇霉素片、孟鲁司特钠片。索引可以后续持续增加，不需要增加 API 费用。

## 接口

- `GET /health`：返回 v11 免费模式状态；`requiresPaidApi=false`、`usesOpenAI=false`。
- `POST /v1/drugs/search`：按药名片段查询本地可信来源索引并解析真实说明书。
- `POST /v1/drugs/parse-source`：解析用户粘贴的可信说明书 URL；当前只接受 39药品通和药源网 HTTPS 页面。

所有成功候选继续保持：

- `sourceGrounded: true`
- `generatesClinicalKnowledge: false`
- 提供原说明书 URL 供人工核对

## Cloudflare 配置

生产只需要：

- Cloudflare Workers
- Browser Run binding：`BROWSER`
- GitHub Actions secrets：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`

v11 的 `wrangler.jsonc` 不再配置 Workers AI binding，也不再配置 OpenAI 搜索模型。此前创建的 `OPENAI_API_KEY` 不参与 v11 运行。

## 自动部署验收

`Deploy source-grounded medication Worker` 会：

1. 安装依赖并运行 Worker 检查与测试；
2. 部署 v11；
3. 检查 `/health` 必须为 `local-source-index-v11`、`requiresPaidApi=false`、`usesOpenAI=false`；
4. 用“司美”执行真实 smoke test；
5. 要求返回司美格鲁肽、降糖药、可信来源，以及非空适应症和用法用量；
6. 将脱敏后的结果回写 Issue #45。

网站默认使用 `https://primary-medication-smart-search.tinnxq.workers.dev`。

## 本地检查

```bash
npm ci
npm run check
npm test
npm run dev
```

生产环境默认只允许 `https://tinnxq-alt.github.io`；如更换 Pages 域名，请同步修改 `wrangler.jsonc` 的 `ALLOWED_ORIGINS`。

## 安全边界

- 本服务只用于药品资料录入与查询辅助，不用于诊断、处方推荐、相互作用判断或自动用药决策。
- 临床字段必须来自可追溯的具体说明书网页；缺失字段不按常识补写。
- 用户粘贴 URL 经过域名白名单过滤，避免任意 URL 抓取。
- 保存或用于临床参考前，仍应按药盒、批准文号和对应品种现行说明书复核。
