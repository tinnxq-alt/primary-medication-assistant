# 个人数据同步服务（草稿）

这是独立于现有智能检索 Worker 的非生产骨架。它只保存收藏、笔记、待办和设置；公共药品及急救资料仍随前端版本只读发布。

## 安全边界

- Cloudflare Access 必须保护整个 Worker；没有 `ctx.access` 的请求默认拒绝。
- `user_id` 只取 Access 返回的 `user_uuid`，客户端不能提交或覆盖。
- D1 不保存邮箱；`/api/v1/me` 只把当前会话的邮箱返回给本人。
- 所有 SQL 使用参数绑定，所有记录查询同时限定 `user_id`。
- 不允许把患者姓名、身份证号、手机号、住院号或病历内容写入收藏、笔记和待办。
- 当前只用于草稿验证；已创建独立的远程测试 D1，但未部署 Worker、未配置 Access，也未改变线上站点。

## 测试环境状态

- D1 名称：`clinical-assistant-user-data-staging`
- D1 ID：`ec476fa1-d463-4697-a5b8-5b3044657d4c`
- 已应用 `0001_user_entities.sql`，并确认 `user_entities` 表及索引存在。
- 测试库目前不含真实用户数据；不要写入患者身份、病历或诊疗记录。
- `wrangler.staging.jsonc` 只绑定这一个独立测试库，不接触现有 Workers 或现有 D1。

## 本地验证

1. 复制 `wrangler.example.jsonc` 为 `wrangler.jsonc`。
2. 安装依赖后执行 `npm test` 和 `npm run check`。
3. 创建本地 D1 并应用 `migrations/0001_user_entities.sql`。

真正上线前还要完成：Access 允许名单、测试 Worker 部署、数据保留/删除规则、备份恢复演练、前端首次迁移确认和临床机构的数据合规审批。

