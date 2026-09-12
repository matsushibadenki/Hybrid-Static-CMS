# Next.js mail adapter

For persistent deduplication across gateway instances, follow
[Shared mail gateway receipts](mail-deduplication.md). The limitations concerning
missing shared receipts below describe the default configuration without
`MAIL_ADAPTER_DATABASE_URL`.

## English

### Signed requests and rotation

Set `MAIL_HTTP_SIGNING_SECRET` on the CMS and the same value in
`MAIL_ADAPTER_SIGNING_SECRET` on Next.js (at least 32 random characters).
Bearer authentication remains required. With an adapter signing secret set,
unsigned requests are rejected. Configure the sender first, then enable required
verification on the receiver. Signatures cover the Unix timestamp, a dot, and the
exact request bytes using HMAC-SHA256. Requests outside a five-minute clock window
are rejected; keep both server clocks synchronized.

To rotate, set the receiver's current secret to the new value and its
`MAIL_ADAPTER_PREVIOUS_SIGNING_SECRET` to the old value, restart it, update the
CMS secret, and restart the CMS. Remove the previous secret after all senders have
switched. Bearer tokens use the same process with `MAIL_ADAPTER_TOKEN`,
`MAIL_ADAPTER_PREVIOUS_TOKEN`, and CMS `MAIL_HTTP_API_TOKEN`.
Previous values remain accepted until explicitly removed. A timestamp window
does not prevent replay within that window; this adapter has no shared replay or
idempotency store and must not be treated as exactly-once delivery.

日本語: CMSの `MAIL_HTTP_SIGNING_SECRET` とNext.jsの
`MAIL_ADAPTER_SIGNING_SECRET` に同じ32文字以上のランダム鍵を設定します。
鍵交換は受信側で新鍵と `MAIL_ADAPTER_PREVIOUS_SIGNING_SECRET` の旧鍵を設定し、
送信側を新鍵に更新後、旧鍵を削除します。Bearerトークンも同様に交換できます。
各変更後は再起動が必要です。時刻差5分を超える要求は拒否しますが、5分以内の
同じ要求の再送を排除する機能ではありません。

简体中文: CMS的 `MAIL_HTTP_SIGNING_SECRET` 与Next.js的
`MAIL_ADAPTER_SIGNING_SECRET` 应使用相同的至少32字符随机密钥。
轮换时先在接收端配置新密钥及 `MAIL_ADAPTER_PREVIOUS_SIGNING_SECRET` 旧密钥，
再更新发送端，最后删除旧密钥。Bearer令牌也支持同样的轮换流程。
修改后需要重启。系统拒绝超过五分钟时间窗口的请求，但不保证窗口内的重放去重。

This optional server-to-server adapter receives the CMS HTTP mail contract and
sends plain-text notifications through Nodemailer and an external SMTP provider.
It is integration code for an existing Next.js App Router application, not a
standalone Next.js website.

1. Install `nodemailer` and the development dependency `@types/nodemailer` in the Next.js application.
2. Place the contents of `src/adapters/nextMail.ts` in `lib/nextMail.ts` in that application. Add `examples/next-mail/app/api/cms-mail/route.ts` at `app/api/cms-mail/route.ts`. Adjust the relative import if the application uses a `src` directory.
3. Configure the variables from `examples/next-mail/.env.example` on the Next.js server. Use a random token of at least 32 characters (for example `openssl rand -hex 32`). Never prefix these variables with `NEXT_PUBLIC_`.
4. Configure the CMS as shown below. Sender and recipient must exactly match the adapter configuration, using one bare email address each.
5. Deploy the Next.js app with a Node.js runtime behind HTTPS. Static export and Edge runtime are not supported. Submit a CMS form to verify delivery using your SMTP provider's delivery logs.

```dotenv
MAIL_DELIVERY_MODE=http
MAIL_HTTP_API_URL=https://mail.example.com/api/cms-mail
MAIL_HTTP_API_TOKEN=<same value as MAIL_ADAPTER_TOKEN>
MAIL_FROM=cms@example.com
MAIL_TO=owner@example.com
```

Port 465 uses implicit TLS; other ports require STARTTLS. Certificate validation
remains enabled. Username and password must be configured together. No mail is
sent during automated tests; a transport substitute verifies the HTTP contract.
Real SMTP delivery must be checked in the deployment environment.

The adapter returns 204 after SMTP acceptance, 401 for invalid authentication,
403 for an unapproved sender or recipient, 413 for bodies over 64 KiB, 400 for
invalid messages, 415 for an unsupported content type, 502 for SMTP failures, and
503 for missing configuration. Provider details and credentials are not returned.
Only plain-text fields are forwarded; attachments, file paths, and arbitrary
Nodemailer options are excluded. Configure request timeouts and rate limits in
the deployment proxy. Acceptance does not guarantee inbox delivery. A timeout
after SMTP acceptance has an ambiguous result; automatic retries could duplicate
mail. The adapter does not provide an idempotent delivery queue.

## 日本語

### Delivery mode / 配信方式 / 投递方式

`MAIL_ADAPTER_MODE` selects `smtp` (default), `sendmail`, `http`, or `disabled`.
Restart the Next.js process after changing settings. CMS configuration stays the same.
All active modes use the same authentication, fixed addresses, and input validation.

For a VPS with a local MTA, set `MAIL_ADAPTER_MODE=sendmail` and
`MAIL_ADAPTER_SENDMAIL_PATH=/usr/sbin/sendmail` (or its actual absolute path).
Nodemailer invokes it directly with its standard arguments; no shell command or
user-supplied arguments are accepted. Run Next.js as an unprivileged service user
with permission to submit mail. The MTA owns queueing and retries after acceptance.
Use the MTA's queue and service logs to monitor delivery. This mode needs a local
executable and is generally unsuitable for serverless hosts. A stalled MTA can
hold the request open: configure service supervision and a proxy request timeout;
the adapter does not kill a stalled sendmail process or display its queue.

For HTTP delivery, set `MAIL_ADAPTER_MODE=http`, `MAIL_ADAPTER_API_URL`, and
`MAIL_ADAPTER_API_TOKEN`. The endpoint must use HTTPS and accept
`{from,to,subject,text}` with bearer authentication. A successful 2xx response
means acceptance. Provider-specific APIs with different contracts need their own
mapping endpoint; this is not a universal provider SDK. Redirects are rejected,
requests time out after eight seconds, and provider tokens remain on the server.
Do not point this URL back at the same adapter. `disabled` returns 503 without
sending, so a deliberately stopped notification is not reported as delivered.

日本語: `MAIL_ADAPTER_MODE` で `smtp`・`sendmail`・`http`・`disabled` を選び、
変更後にNext.jsを再起動します。sendmailは絶対パスで指定し、一般ユーザー権限で
実行してください。キューと再送はMTA側で管理します。HTTPは上記JSON形式に対応する
HTTPSエンドポイントを指定します。サービス固有の形式には変換処理が必要です。
停止モードは503を返します。sendmailの停止監視と実配信確認は設置環境で行ってください。

简体中文: 使用 `MAIL_ADAPTER_MODE` 选择 `smtp`、`sendmail`、`http` 或 `disabled`，
修改后重启Next.js。sendmail必须使用绝对路径和非特权服务用户，队列及重试由MTA管理。
HTTP端点必须支持上述JSON格式并使用HTTPS，供应商专用格式需要转换接口。
停用模式返回503。请在部署环境监控sendmail进程并验证真实投递。

Reference: [Nodemailer Sendmail transport](https://nodemailer.com/transports/sendmail).

### 設置概要

既存のNext.js App Routerアプリに追加する任意のメール中継機能です。
CMSから認証付きHTTPSで受信し、Nodemailerから外部SMTPへ送信します。
上記の2ファイルを配置し、Next.js側に `.env.example` の設定を入れます。
CMS側は上記の `MAIL_DELIVERY_MODE=http` とURL・共通トークンを設定します。
送信元・宛先は両側で同じメールアドレスを指定してください。
秘密情報には `NEXT_PUBLIC_` を付けないでください。

465番ポートはTLS、その他はSTARTTLS必須です。Node.js実行環境とHTTPSが必要です。
本番SMTPでの到達確認は設置後に行います。タイムアウト時は既に送信されている
可能性があるため、再送前に配信ログを確認してください。

## 简体中文

这是可添加到现有Next.js App Router应用中的可选邮件转发功能。
CMS通过带身份验证的HTTPS发送请求，适配器使用Nodemailer连接外部SMTP。
按上述步骤放置两个文件，并在Next.js服务器设置示例环境变量。
CMS使用 `MAIL_DELIVERY_MODE=http`，配置接口地址和相同的令牌。
两侧的发件人与收件人必须完全一致。秘密变量不得使用 `NEXT_PUBLIC_` 前缀。

465端口使用TLS，其他端口必须支持STARTTLS。部署需要Node.js运行时和HTTPS。
真实SMTP投递应在部署后验证。超时可能发生在邮件已被接受之后，重试前请检查
服务商日志，以避免重复发送。

References: [Next.js Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route),
[Nodemailer SMTP transport](https://nodemailer.com/smtp).
