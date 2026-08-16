# 免费中文核验 Worker

此 Cloudflare Worker 运行在 Workers Free 计划，不调用 OpenAI 或其他收费 API，也不需要 API 密钥。

输入中文药名后，服务会：

- 从项目维护的 `chinese-drug-labels.json` 中查找带明确中文来源的已核验资料；
- 返回国家药监局查询、国家药监局站内搜索和全网中文搜索入口；
- 仅允许网站域名和本地开发地址跨域调用；
- 把所有导入内容继续标记为“待复核”。

免费模式不会抓取、拼接或猜测任意网页中的适应症、剂量、不良反应和注意事项。项目核验库没有记录时，用户必须打开来源链接并人工录入。这样可避免收费，也避免把搜索摘要误当成现行说明书。

## GitHub Actions 自动部署

仓库只需要两个 GitHub Actions secrets：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

合并包含 `.github/workflows/deploy-worker.yml` 的 Pull Request 后，只要 `worker/` 发生修改，GitHub Actions 就会检查并部署 Worker。无需创建 `OPENAI_API_KEY`。

部署成功后复制 `https://primary-medication-smart-search.你的账号.workers.dev` 地址，打开网站“缓存管理” → “免费中文检索服务”，粘贴地址，依次点击“保存地址”和“测试连接”。

## 本地检查

```bash
npm ci
npm run check
npm test
npm run dev
```

生产环境默认只允许 `https://tinnxq-alt.github.io`；如更换 Pages 域名，请同步修改 `wrangler.jsonc` 的 `ALLOWED_ORIGINS`。

## 安全边界

- 自动填充仅来自项目核验库，并保留直接中文来源链接。
- 全网搜索入口只用于人工查找，不会自动导入网页摘要。
- 必须核对批准文号、规格、厂家和对应厂家的现行说明书。
- 本服务不用于诊断、处方推荐、相互作用判断或用药决策。
