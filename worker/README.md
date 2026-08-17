# 新药智能识别 Worker

此 Cloudflare Worker 运行在 Workers Free 计划，使用 Workers AI 免费额度，不调用 OpenAI 或其他收费 API，也不需要 OpenAI 密钥。

当前职责已经收敛为：**只为“药库尚未收录的新药”生成可编辑录入草稿**。现有药物是否已经收录，由网页在手机本地先完成重复检测；Worker 不再下载或扫描整份 `chinese-drug-labels.json`，从而减少网络请求和等待时间。

输入中文新药名称后，服务会：

- 直接使用 `@cf/meta/llama-3.1-8b-instruct-fast` 生成 1 个中文未核验录入草稿；
- 固定返回 8 个字段：`drugName`、`tradeName`、`category`、`indications`、`specification`、`dosage`、`adverseReactions`、`precautions`；
- `category` 只能使用项目定义的分类 ID；
- 临床字段要求简洁输出，以降低生成时间；不确定的信息要求提示核对现行说明书，而不是伪造细节；
- 所有 AI 内容始终标记为“未核验草稿”，自动填入后仍可修改；
- 返回国家药监局和全网中文搜索入口，供保存前人工核验；
- 返回 `elapsedMs`，便于后续观察生成性能；
- 仅允许网站域名和本地开发地址跨域调用。

网页端的快速流程为：**本地重复检测 → Worker 预热/预连接 → AI 生成新药草稿 → 自动填充表单**。如果完全同名或已知商品名已经存在于药库，则不会调用 AI；相似名称只做提醒，不会直接阻止添加，以免误伤不同剂型或不同品规。

AI 草稿不能视为现行说明书、处方依据或用药决策依据。Workers AI 免费额度用完时，生成会暂时停止，不会自动产生费用；此时仍可直接手动填写表单。

## GitHub Actions 自动部署

仓库只需要两个 GitHub Actions secrets：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

只要 `worker/` 发生修改，GitHub Actions 会检查并部署 Worker。无需创建 `OPENAI_API_KEY`。

`wrangler.jsonc` 已配置 `AI` binding。网站默认使用 `https://primary-medication-smart-search.tinnxq.workers.dev`，也可在“缓存管理” → “免费中文检索服务”中更换或测试地址。

## 本地检查

```bash
npm ci
npm run check
npm test
npm run dev
```

生产环境默认只允许 `https://tinnxq-alt.github.io`；如更换 Pages 域名，请同步修改 `wrangler.jsonc` 的 `ALLOWED_ORIGINS`。

## 安全边界

- 只用于新药资料录入辅助，不用于诊断、处方推荐、相互作用判断或用药决策。
- AI 不伪造批准文号、厂家或来源链接。
- 保存前应按药盒、批准文号和对应品种现行说明书复核。
