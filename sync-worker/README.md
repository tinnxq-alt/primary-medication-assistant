# 个人数据同步服务（草稿）

这是独立于现有智能检索 Worker 的非生产骨架。它只保存收藏、笔记、待办和设置；公共药品及急救资料仍随前端版本只读发布。

## 安全边界

- Cloudflare Access 必须保护整个 Worker；没有 `ctx.access` 的请求默认拒绝。
- `user_id` 只取 Access 返回的 `user_uuid`，客户端不能提交或覆盖。
- D1 不保存邮箱；`/api/v1/me` 只把当前会话的邮箱返回给本人。
- 所有 SQL 使用参数绑定，所有记录查询同时限定 `user_id`。
- 不允许把患者姓名、身份证号、手机号、住院号或病历内容写入收藏、笔记和待办。
- 当前只用于本地和草稿验证，未创建远程 D1、未部署、未改变线上站点。

## 本地验证

1. 复制 `wrangler.example.jsonc` 为 `wrangler.jsonc`。
2. 安装依赖后执行 `npm test` 和 `npm run check`。
3. 创建本地 D1 并应用 `migrations/0001_user_entities.sql`。

真正上线前还要完成：Access 允许名单、D1 远程库、数据保留/删除规则、备份恢复演练、前端首次迁移确认和临床机构的数据合规审批。

