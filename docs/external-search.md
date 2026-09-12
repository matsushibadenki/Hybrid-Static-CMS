# External search adapter

## English

Set `SEARCH_API_URL` to an HTTPS endpoint and `SEARCH_API_TOKEN` to its server-side
bearer token, then restart the CMS. With either unset, PostgreSQL search remains
active. The endpoint receives POST JSON:

```json
{"version":1,"query":"tokyo","limit":20,"status":"published"}
```

Return ranked candidates, at most 100 entries, in a response no larger than 64 KiB:

```json
{"items":[{"type":"post","id":42},{"type":"page","id":7}]}
```

Types are `post` or `page`; IDs are positive safe integers matching the CMS.
Duplicate candidates are removed. Provider titles, URLs and total counts are not
trusted. The CMS fetches current titles and slugs from PostgreSQL and excludes
deleted or unpublished candidates. `total` is the number of verified returned
results, not the provider's global hit count. Rank order is retained; scores are
reported as zero because provider score scales differ. Empty responses are valid
and do not trigger fallback.

Timeouts (three seconds), HTTP errors, invalid JSON and invalid candidates fall back
to PostgreSQL search. Redirects are prohibited. Only published combined-content
search uses the adapter; searches including drafts and the separate post/page list
filters remain local. Query text is sent to your configured service, so select a
provider consistent with your site's privacy policy.

This adapter is a provider-neutral query bridge, not an indexer. Populate your
index through the published posts/pages APIs, preserving IDs and types. Existing
signed publishing webhooks can trigger your worker to refresh its index. Worker
processes communicate with the CMS over HTTPS; they do not need direct database
access. Provider-specific schema mapping, full index rebuilds and synchronization
are separate deployment work and remain on the roadmap.

## 日本語

`SEARCH_API_URL` にHTTPSエンドポイント、`SEARCH_API_TOKEN` に認証トークンを
設定して再起動します。外部サービスは上記JSON形式で投稿・固定ページのIDを順位順に
返します。CMSが最新の公開状態とタイトルを照合し、削除済み・非公開の結果を除外します。
障害時はPostgreSQL検索へ戻り、下書きを含む検索は常にDB内で処理します。
検索語は設定先サービスへ送られます。検索インデックスの構築・同期は別途必要です。
`total` は確認済みの返却件数であり、外部サービスの全ヒット数ではありません。

## 简体中文

配置HTTPS地址 `SEARCH_API_URL` 和令牌 `SEARCH_API_TOKEN` 后重启。
外部服务按上述JSON格式返回排序后的文章或页面ID。CMS从数据库读取最新标题与公开
状态，排除已删除或未公开内容。服务异常时回退至PostgreSQL，含草稿的搜索始终在本地执行。
查询词会发送到配置的服务。索引建立与同步需另行配置。`total` 表示已验证的返回结果数，
不是外部服务的全部命中数。
