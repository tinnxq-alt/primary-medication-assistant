# 免费中文智能检索 Worker

此 Cloudflare Worker 运行在 Workers Free 计划，使用 Workers AI 免费额度，不调用 OpenAI 或其他收费 API，也不需要 OpenAI 密钥。

输入中文药名后，服务会：

- 从项目维护的 `chinese-drug-labels.json` 中查找带明确中文来源的已核验资料；
- 没有核验资料时，使用 `@cf/meta/llama-3.1-8b-instruct-fast` 生成中文“未核验草稿”；
- AI 固定返回 8 个字段：`drugName`、`tradeName`、`category`、`indications`、`specification`、`dosage`、`adverseReactions`、`precautions`；
- `category` 只能使用项目定义的分类 ID；适应症和用法用量为保存时必填字段；
- 自动填入后所有字段均可编辑并可直接保存；
- 返回国家药监局查询、国家药监局站内搜索和全网中文搜索入口；
- 仅允许网站域名和本地开发地址跨域调用；
- 将 AI 生成内容始终标记为“未核验草稿”。

核验资料与 AI 草稿严格区分。AI 草稿可直接保存，但不能视为现行说明书、处方依据或用药决策依据。Workers AI 当日免费额度用完时，生成会暂时停止，不会自动产生费用；此时仍可使用中文搜索入口手动补充。

## GitHub Actions 自动部署

仓库只需要两个 GitHub Actions secrets：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

合并包含 `.github/workflows/deploy-worker.yml` 的 Pull Request 后，只要 `worker/` 发生修改，GitHub Actions 就会检查并部署 Worker。无需创建 `OPENAI_API_KEY`。

`wrangler.jsonc` 已配置 `AI` binding，Actions 部署时会自动绑定 Workers AI。部署成功后复制 `https://primary-medication-smart-search.你的账号.workers.dev` 地址，打开网站“缓存管理” → “免费中文检索服务”，粘贴地址，依次点击“保存地址”和“测试连接”。

## 本地检查

```bash
npm ci
npm run check
npm test
npm run dev
```

生产环境默认只允许 `https://tinnxq-alt.github.io`；如更换 Pages 域名，请同步修改 `wrangler.jsonc` 的 `ALLOWED_ORIGINS`。

## 安全边界

- 有核验资料时优先返回并保留直接中文来源链接。
- 无核验资料时生成低可信度、可编辑的未核验草稿，不伪造批准文号或来源链接。
- 全网搜索入口只用于人工查找，不会把搜索摘要伪装成说明书。
- 本服务不用于诊断、处方推荐、相互作用判断或用药决策。
