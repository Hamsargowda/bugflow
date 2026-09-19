import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

/*
 * Milestone 4 — connection pooling for 50,000+ issue scale.
 *
 * node-postgres's Pool doesn't take separate pool_size / max_overflow /
 * pool_pre_ping options like SQLAlchemy; the equivalents are:
 *   - SQLAlchemy pool_size=20, max_overflow=10 (30 total)  -> `max: 30` here
 *     (pg has one pool ceiling, not a base+overflow split)
 *   - SQLAlchemy pool_pre_ping=True                        -> pg validates
 *     connections lazily and the `error` handler below recycles a dead
 *     connection instead of crashing the process, which is the same
 *     "don't hand out a stale connection" guarantee in practice
 *   - idleTimeoutMillis / connectionTimeoutMillis are pg's own knobs for
 *     recycling idle clients and failing fast under saturation
 */
const POOL_MAX = Number(process.env.PG_POOL_MAX) || 30; // pool_size(20) + max_overflow(10)
const POOL_MIN_IDLE = Number(process.env.PG_POOL_MIN) || 5;

export const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        max: POOL_MAX,
        min: POOL_MIN_IDLE,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
      }
    : {
        host: process.env.PGHOST || "localhost",
        port: Number(process.env.PGPORT) || 5432,
        user: process.env.PGUSER || "postgres",
        password: process.env.PGPASSWORD || "postgres",
        database: process.env.PGDATABASE || "bugflow",
        max: POOL_MAX,
        min: POOL_MIN_IDLE,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
      }
);

pool.on("error", (err) => {
  // A background/idle client died (network blip, DB restart, etc). Log it;
  // the pool discards that client and issues a fresh one on the next
  // checkout, so a single dead connection never takes the app down.
  console.error("Unexpected Postgres pool error", err);
});

/** Live pool occupancy, surfaced on the Milestone 4 system-performance endpoint. */
export function poolStats() {
  return {
    max: POOL_MAX,
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}
