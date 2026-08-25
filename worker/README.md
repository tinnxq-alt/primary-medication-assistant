# 新药智能识别 Worker

此 Cloudflare Worker 为“基层用药助手 Pro”的联网说明书读取服务。当前生产目标入口为 `src/index-v12.js`。

## v12：可信来源混合检索

v12 不依赖 OpenAI API。主流程为：

1. 用户输入药名片段；
2. Worker 先查询项目内置的 259 条可信说明书 URL 索引；
3. 命中后优先通过受限 HTTPS 请求直接读取具体说明书网页；只有动态页面无法解析时才使用 Cloudflare Browser Run `content` Quick Action 兜底，以降低延迟和限流概率；
4. 适应症、用法用量、不良反应、注意事项、规格、厂家等字段只从真实来源网页原文解析；
5. 索引未命中或页面无法解析时，自动执行 39药品通站内检索和限定可信域名的联网检索，再解析发现的真实说明书页面；
6. 网页端仍允许粘贴 39药品通或药源网的具体 HTTPS 说明书链接；
7. 缺失字段保持缺失，不调用模型知识补写。
8. 候选中的 `category` 仅表示药品属性（`西药`/`中成药`），`therapeuticClass` 独立表示药物作用分类；响应通过 `classificationSchema=separate-category-therapeutic-class-v1` 声明该契约。

当前免费索引由病房和门诊已核验资料自动生成，包含 259 个去重来源条目；可通过维护脚本随目录更新重新生成。

## 接口

- `GET /health`：返回 v12 混合可信来源模式状态及分类契约版本；`requiresPaidApi=false`、`usesOpenAI=false`。
- `POST /v1/drugs/search`：按药名片段先查询本地可信来源索引，未取得候选时自动联网发现并解析真实说明书。
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

v12 的 `wrangler.jsonc` 不配置 Workers AI binding，也不配置 OpenAI 搜索模型。此前创建的 `OPENAI_API_KEY` 不参与 v12 运行。

## 自动部署验收

`Deploy source-grounded medication Worker` 会：

1. 安装依赖并运行 Worker 检查与测试；
2. 部署 v12；
3. 检查 `/health` 必须为 `hybrid-source-discovery-v12`、`requiresPaidApi=false`、`usesOpenAI=false`，并已启用可信域名联网发现；
4. 用“司美”执行真实 smoke test；
5. 要求返回司美格鲁肽、`西药` 属性、`降糖药` 作用分类、可信来源，以及非空适应症和用法用量；
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
