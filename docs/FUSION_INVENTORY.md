# 两个现有项目盘点

盘点日期：2026-08-26

## 稳定基线与部署

| 模块 | 仓库 | 稳定分支/提交 | 当前部署 |
|---|---|---|---|
| 用药助手 | `tinnxq-alt/primary-medication-assistant` | `main` / `523cc38` | GitHub Pages；联网说明书检索使用 Cloudflare Worker |
| 急救诊疗 | `tinnxq-alt/emergency-care-assistant` | `main` / `8568056`（v0.20） | GitHub Pages 静态 PWA |

两个稳定站点继续独立运行。融合代码只写入 `codex/clinical-assistant-shell-20260826`，不直接修改 `main`。

## 页面与路由

### 用药助手

单页静态应用，使用哈希路由。现有入口包括：

- 首页、分类、搜索、全部药物、详情
- 收藏、笔记、添加药物、缓存管理
- 相互作用、用药禁忌、症状搜索、闪卡

### 急救诊疗

多页面静态 PWA：

- `index.html`：首页
- `emergency.html`：急症入口
- `flows.html`：10 个高频流程
- `drugs.html`：抢救用药与病房药库桥接
- `todo.html`：本机待办

## 数据结构

### 用药助手

- 公共目录：`DRUG_CATALOG`（病房 164 个品规）与按需加载的门诊目录（392 个品规）。
- 主键：稳定 `drug-*` ID；历史删除保留 ID 空位，避免收藏、笔记和缓存错位。
- 主要字段：药品名、通用名、规格、剂型、药物作用分类、药库范围、临床字段、来源和核验状态。
- 个人数据：收藏、笔记、自定义药品、标记、缓存等，使用带前缀的浏览器 `localStorage`。

### 急救诊疗

- 急救流程以 `flow-data.js` 中的对象数组保存。
- 流程药物当前仍是药名字符串，例如 `drugs: ['肾上腺素']`。
- `ward-pharmacy-bridge.js` 能按名称别名匹配用药助手目录并读取药品 ID，但没有把 `drug_id` 固化到流程数据。
- 待办、个人编辑和抢救车修改分别保存在浏览器 `localStorage`。

## 依赖与质量门禁

- 两个前端都不依赖运行时框架，使用原生 HTML、CSS 和 JavaScript。
- 用药助手有药库审计、搜索、分类、相互作用、加载性能等多组 Node.js 检查，并有 GitHub Actions。
- 急救助手使用 `npm test` 执行静态站完整性检查，并有 GitHub Actions。
- 用药助手 Worker 使用 Wrangler 部署到 Cloudflare Workers；前端仍由 GitHub Pages 托管。

## 当前融合风险

1. 急救流程按药名关联，别名和剂型可能造成歧义；必须迁移为 `drug_id`。
2. 两站的个人数据键空间不同，没有账号，也不能跨设备同步。
3. 急救站复制了部分药物展示数据；迁移期间必须明确唯一事实来源。
4. 两个 Service Worker 的作用域和缓存版本独立；正式合站前不能让新缓存覆盖旧站。
5. 临床数据迁移必须保留来源、核验状态、版本和审核记录，不能只迁移显示文本。
