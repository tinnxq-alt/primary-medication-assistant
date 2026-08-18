# 新药智能识别 Worker

此 Cloudflare Worker 为“基层用药助手 Pro”的联网说明书检索服务。当前生产入口为 `src/index-v10.js`。

## 当前工作方式

“添加药物”仍只用于药库尚未收录的新药；网页端先在本机病房药库、门诊药库、自定义药和商品名别名中做重复检测。确认未收录后，Worker 才联网寻找真实药品说明书来源。

v10 的流程为：

1. OpenAI Responses API 的 `web_search` **只负责发现真实药品页面 URL**；当前仅允许 39 药品通（`ypk.39.net`）和药源网（`yaopinnet.com`）。
2. 搜索模型输出的医学正文不会进入药库。
3. Worker 再通过 Cloudflare Browser 读取具体说明书网页原文。
4. 适应症、用法用量、不良反应、注意事项、规格、厂家等字段只从真实来源网页解析。
5. 候选必须至少包含药名、适应症和用法用量；缺失字段不猜测、不由模型补写。
6. 39 药品通产品页会规范化到详细说明书 `/manual/` 页面；非可信域名和评论、购买、资讯等页面会被过滤。
7. 返回结果保持 `sourceGrounded: true`、`generatesClinicalKnowledge: false`，并提供原说明书来源 URL 供人工核对。

如果没有配置 `OPENAI_API_KEY`，Worker 会安全降级到 v9 的 Browser 站点限定来源发现方案；不会因为缺少 Key 而让 AI 直接生成临床资料。

## GitHub Actions 自动部署

仓库使用以下 GitHub Actions secrets：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `OPENAI_API_KEY`（启用 v10 OpenAI Web Search 来源发现）

只要 `worker/` 或部署工作流发生修改，`Deploy source-grounded medication Worker` 会自动：

1. 安装依赖并运行 Worker 检查与测试；
2. 部署到 Cloudflare Workers；
3. 若存在 `OPENAI_API_KEY`，将其同步到 Worker secret storage；
4. 等待新 Worker 版本生效并检查 `/health`；
5. v10 激活后用“司美”执行真实 smoke test。

真实 smoke 只有在同时满足以下条件时才通过：

- `discovery = openai-web-search-source-v10`；
- 候选药名包含“司美格鲁肽”；
- 分类为“降糖药”；
- 来源来自 39 药品通或药源网真实 HTTPS 页面；
- 适应症与用法用量均从来源网页原文解析且非空；
- `sourceGrounded = true`；
- `generatesClinicalKnowledge = false`。

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
- Web Search 只承担来源发现，不承担临床知识生成。
- 临床字段必须来自可追溯的具体说明书网页；缺失字段保持缺失，不按常识补写。
- 保存或用于临床参考前，仍应按药盒、批准文号和对应品种现行说明书复核。
