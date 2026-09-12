# Form mail outbox

## Operator review

Owners and administrators can review failed or uncertain deliveries in Background
jobs. Check the provider logs, tick the confirmation box, then choose **Queue
another attempt** or **Confirm delivered**. Retry resets the six-attempt budget;
confirmation marks the message sent without sending anything. Queued, running,
and sent entries cannot be changed this way. Concurrent duplicate clicks change
the record only once. The state change and operator audit entry commit together.

日本語: 所有者・管理者はバックグラウンドジョブで失敗・要確認の配信を確認できます。
配信ログの確認欄を選択し「再送を予約」または「配信済みとして確認」を押します。
再送は試行回数をリセットし、確認はメールを送らず状態のみ変更します。操作は監査ログに残ります。

简体中文: 所有者和管理员可在后台任务中处理失败或待确认的邮件。检查服务商日志后，
勾选确认框并选择安排重试或确认为已投递。重试重置尝试次数；确认不会发送邮件。
操作与审计记录在同一事务中保存。

Run `bun run migrate` through `038_mail_outbox.sql` before deploying this version.
When mail notifications are configured, each form submission and its unique mail
reservation are committed together. The visitor no longer waits for delivery.
The scheduler processes one message per interval. Failures retry with exponential
backoff up to six attempts; disabled or unavailable delivery also waits and retries.
Messages submitted while notifications are disabled are not queued retroactively.

Open Background jobs / Mail delivery queue to inspect status. The queue stores a
submission reference, not an additional copy of personal data. Deleting the form
submission also removes its queue entry. At delivery time the current form labels,
sender, recipient, and transport configuration are used. Keep the scheduler running.

Running entries older than 15 minutes become `uncertain` and are not automatically
resent. Check provider/MTA logs before any manual database intervention. A successful
transport response is acceptance, not guaranteed inbox delivery. A timeout after
remote acceptance can still duplicate mail on retry: this is not exactly-once
delivery. Enable [shared gateway receipts](mail-deduplication.md) to suppress
repeated HTTP deliveries across gateway instances. Use the operator review controls
above for guided redelivery; an explicit retry generates a fresh delivery ID.

## 日本語

マイグレーション038を適用してください。通知設定がある場合、フォーム保存とメール
予約を同時に確定し、スケジューラーが最大6回まで再試行します。配信状況は
「バックグラウンドジョブ」の「メール配信キュー」で確認できます。15分以上実行中の
予約は「配信結果の確認が必要」となり、自動再送しません。送信先などは実行時の設定を
使用します。通信断による重複送信の可能性は残るため、再送判断には配信ログの確認が必要です。

## 简体中文

请先应用迁移038。启用通知时，表单数据与邮件预约在同一事务中保存，调度程序最多
尝试六次。可在后台任务的邮件投递队列查看状态。运行超过15分钟的记录将标记为
需要确认，不会自动重发。发送时使用当前收件人等设置。连接中断后重试仍可能重复投递，
请依据服务商日志确认投递结果。
