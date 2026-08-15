# 智能全网检索 Worker

此 Cloudflare Worker 在服务器端调用 OpenAI Responses API 的 `web_search`，避免把 API 密钥暴露在 GitHub Pages 前端。它只向指定网页来源开放，限制每个 IP 每分钟 5 次请求，并过滤没有本次检索来源或不含中文临床内容的候选。

## 首次部署

需要先安装 Node.js 20 或更高版本，然后在本目录执行：

```bash
npm install
npx wrangler login
npx wrangler secret put OPENAI_API_KEY
npm run deploy
```

输入密钥时只在 Wrangler 的安全提示中粘贴，不要把密钥写进聊天、网页、代码、`.env` 或 GitHub 仓库。

部署成功后复制终端显示的 `https://…workers.dev` 地址。在网站打开“缓存管理” → “智能检索服务”，粘贴地址，依次点击“保存地址”和“测试连接”。连接成功后，在“添加药物”页输入中文药名并点击“智能检索”。

## 本地检查

```bash
npm run check
npm test
npm run dev
```

本地网站默认可从 `http://localhost:8000` 或 `http://127.0.0.1:8000` 调用 Worker。生产环境默认只允许 `https://tinnxq-alt.github.io`；如更换 Pages 域名，请同步修改 `wrangler.jsonc` 的 `ALLOWED_ORIGINS` 后重新部署。

## 安全规则

- 检索结果永远是“待复核”候选，必须逐项核对批准文号、规格、厂家和具体厂家现行说明书。
- Worker 要求模型实际调用全网搜索，并优先药监部门、生产企业和医疗机构中文来源。
- 无法与本次搜索来源对应的候选会被丢弃；英文临床字段会被清空。
- `OPENAI_API_KEY` 是 Cloudflare 加密密钥，不属于普通环境变量，也不得提交到 Git。
