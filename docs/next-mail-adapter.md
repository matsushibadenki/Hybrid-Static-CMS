# Next.js mail adapter

## English

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
