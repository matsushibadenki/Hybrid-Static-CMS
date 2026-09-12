# Shared mail gateway receipts

## English

Apply CMS migration `039_mail_delivery_ids.sql`. Automatic retries now send a
stable `deliveryId` in the HTTP JSON body, covered by the existing HMAC signature.
An operator-reviewed retry generates a new ID and intentionally permits another send.

In the Next.js gateway, install `postgres` in addition to Nodemailer. Place both
`src/adapters/nextMail.ts` and `src/adapters/mailReceiptStore.ts` in the same `lib`
directory. Apply `examples/next-mail/receipts.sql` to a PostgreSQL database owned
by the gateway and set `MAIL_ADAPTER_DATABASE_URL` on every gateway instance to
that database. The gateway runtime needs SELECT, INSERT and UPDATE permissions
on `mail_delivery_receipts`; schema setup is performed separately. Use TLS for
remote database connections according to your database provider's configuration.
The gateway does not need access to the CMS database. Ordinary VPS workers still
communicate with the Cloud-side gateway over HTTPS.

Deploy the CMS update first, then enable gateway receipts. Gateways with receipts
enabled reject requests without a UUID delivery ID. With the variable unset,
legacy delivery remains available and has no shared deduplication.

The first request commits a processing receipt before sending. A matching sent
receipt returns 204 without sending. A changed payload, concurrent in-progress
request, or ambiguous previous attempt returns 409; the CMS marks it for review.
Database failures before claiming return 503 without sending. Send failures after
claiming stay blocked: check provider logs before using operator-reviewed retry.
This can sacrifice automatic recovery to avoid duplicate sends. It does not
guarantee exactly-once inbox delivery because SMTP and database commits are separate.

Receipts contain only UUIDs, payload hashes, status and timestamps. Do not delete
receipts while an old delivery ID could be retried; no automatic expiry is configured.
Back up this database separately. Restoring an older receipt backup can lose
deduplication history. If form labels or sender settings change between attempts,
the resulting payload conflict requires operator review.

## 日本語

CMSにマイグレーション039を適用し、ゲートウェイ側で `receipts.sql` を専用DBに
適用します。Next.jsに `postgres` を追加し、2つのアダプターファイルを同じlib内へ
配置して `MAIL_ADAPTER_DATABASE_URL` を設定してください。
自動再試行は同じ配信IDを使い、管理者による再送予約だけ新IDになります。
送信済みは再送せず成功を返し、処理中・内容変更・結果不明は409で要確認になります。
重複防止記録は自動削除しません。専用DBもバックアップしてください。
SMTP受理とDB記録は別処理のため、完全な1回配信保証ではありません。

## 简体中文

在CMS应用迁移039，在网关专用数据库执行 `receipts.sql`。Next.js需安装 `postgres`，
将两个适配器文件放在同一lib目录，并设置 `MAIL_ADAPTER_DATABASE_URL`。
自动重试保持相同投递ID，管理员明确安排重发时才生成新ID。
已发送记录直接返回成功；处理中、内容冲突及结果不明返回409并要求人工确认。
记录不会自动过期，请备份网关数据库。SMTP接受与数据库提交是独立操作，不能保证
收件箱恰好收到一次。
