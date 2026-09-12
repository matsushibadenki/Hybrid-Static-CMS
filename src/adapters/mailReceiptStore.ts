import postgres from "postgres";

export interface MailReceiptStore {
  claim(id: string, hash: string): Promise<"claimed" | "sent" | "blocked">;
  complete(id: string): Promise<void>;
}

// This database belongs to the gateway, and need not be the CMS database.
export function createPostgresMailReceiptStore(databaseUrl: string): MailReceiptStore {
  const db = postgres(databaseUrl, { max: 3, connect_timeout: 5, idle_timeout: 20 });
  return {
    async claim(id, hash) {
      const inserted = await db`insert into mail_delivery_receipts (delivery_id, payload_hash)
        values (${id}, ${hash}) on conflict (delivery_id) do nothing returning delivery_id`;
      if (inserted.length) return "claimed";
      const rows = await db`select payload_hash, status from mail_delivery_receipts where delivery_id = ${id}`;
      return rows[0]?.payload_hash === hash && rows[0]?.status === "sent" ? "sent" : "blocked";
    },
    async complete(id) {
      await db`update mail_delivery_receipts set status = 'sent', updated_at = now() where delivery_id = ${id}`;
    },
  };
}
