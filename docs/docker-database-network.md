# Docker database name resolution

`getaddrinfo ENOTFOUND postgres` means the application cannot resolve the database
service name. It happens before SQL migrations execute. Check that both app and
postgres belong to the same Compose network and that the database has the
`postgres` network alias. A running container can still be disconnected from its
network.

Inspect only the relevant containers' network settings with `docker inspect`.
If the database has no networks, reconnect it to its existing project network:

```sh
docker network connect --alias postgres <project-network> <postgres-container>
docker start <app-container>
```

Use the actual names shown by Docker. Do not attach unrelated databases, change
the database volume, or run `docker compose down -v` as a network repair.
The development Compose file now waits for PostgreSQL health before starting
the application. This handles startup readiness but cannot prevent manual network
disconnection. Use `docker compose up -d` with the original project configuration
for subsequent starts.

日本語: このエラーはDBのサービス名を解決できない状態です。同じComposeネットワーク
への接続と `postgres` エイリアスを確認してください。DBボリュームの削除は不要です。
ヘルスチェックは起動待機用で、切断されたネットワーク自体を復旧する機能ではありません。

简体中文: 此错误表示无法解析数据库服务名。请确认两个容器连接到同一Compose网络，
且数据库具有 `postgres` 别名。无需删除数据库卷。健康检查只负责启动等待，不能恢复
已断开的网络连接。
