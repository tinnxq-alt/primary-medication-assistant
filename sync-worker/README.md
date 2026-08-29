# 基层临床助手个人数据同步服务（staging）

这是与现有两个正式站点完全隔离的 Cloudflare Worker 草稿。公共药品和急救数据仍随静态站发布；这里只有收藏、笔记、待办和设置等个人数据。

## 当前认证路径

- 首选免银行卡试点：GitHub OAuth Web Flow + PKCE。
- OAuth `state` 一次性使用，10 分钟过期；登录会话使用随机不透明 Cookie，12 小时过期。
- Cookie 带 `HttpOnly`、`Secure`、`SameSite=Lax`，数据库只保存其 SHA-256 摘要。
- 每次登录都重新调用 GitHub `/user` 核验身份；只接受配置中的稳定 GitHub 数字用户 ID。
- 只完成身份识别，不申请仓库、邮箱等 scope；临时 GitHub access token 在读取身份后立即吊销，绝不写入 D1。
- 服务端将个人数据固定写入 `github:<numeric-id>` 命名空间，客户端不能传入 `user_id`。
- Cloudflare Access 身份路径仍保留，可在将来完成 Zero Trust 审批后平滑启用。

## staging 配置

公开变量：

- `ALLOWED_ORIGINS`
- `ALLOWED_GITHUB_USER_IDS`
- `GITHUB_CALLBACK_URL`
- `GITHUB_CLIENT_ID`（创建 OAuth App 后填写）

机密变量：

- `GITHUB_CLIENT_SECRET`，只能通过 Worker Secret 保存，禁止提交到仓库。

OAuth App 固定回调地址：

`https://clinical-assistant-user-sync-staging.tinnxq.workers.dev/auth/github/callback`

在 OAuth App 尚未创建、数据库迁移尚未应用、Secret 尚未写入前，不发布这版代码；当前 staging 继续保持“未认证即拒绝”。

## 数据迁移和验证

1. 先在 staging D1 应用 `0002_github_oauth_sessions.sql`。
2. 创建只用于 staging 的 GitHub OAuth App，关闭 callback wildcard。
3. 写入 `GITHUB_CLIENT_ID` 与 `GITHUB_CLIENT_SECRET`。
4. 本地运行 `npm test`，发布前执行 Wrangler dry-run。
5. 用白名单账号演练登录、退出、过期会话、跨用户隔离、导出和恢复。

## 回退

不合并草稿 PR、不发布 Worker 即不会影响线上。若 staging 登录试点需要撤回，删除 OAuth App 授权、清除 `oauth_states` / `user_sessions`、恢复上一 Worker 版本即可；`user_entities` 与两个正式站点均无需改动。

