import { config } from "./config";
import { sql } from "./db";

type SchedulerLock = {
  release: () => Promise<void>;
};

// Session-scoped advisory locks keep work exclusive across app containers without schema state.
export async function tryAcquireSchedulerLock(): Promise<SchedulerLock | null> {
  const connection = await sql.reserve();
  try {
    const rows = await connection<{ acquired: boolean }[]>`
      select pg_try_advisory_lock(hashtextextended(${config.schedulerLockName}, 0)) as acquired
    `;
    if (rows[0]?.acquired !== true) {
      connection.release();
      return null;
    }

    return {
      async release() {
        try {
          await connection`select pg_advisory_unlock(hashtextextended(${config.schedulerLockName}, 0))`;
        } finally {
          connection.release();
        }
      },
    };
  } catch (error) {
    connection.release();
    throw error;
  }
}
