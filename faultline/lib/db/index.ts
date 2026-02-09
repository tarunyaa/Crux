import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

let _db: PostgresJsDatabase<typeof schema> | null = null

export function getDb() {
  if (!_db) {
    const connectionString =
      process.env.DATABASE_URL ?? 'postgresql://faultline:faultline@localhost:5432/faultline'
    const client = postgres(connectionString)
    _db = drizzle(client, { schema })
  }
  return _db
}

/** @deprecated Use getDb() instead — kept for existing imports */
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop]
  },
})
