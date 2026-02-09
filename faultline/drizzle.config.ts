import { config } from 'dotenv'
config({ path: '.env.local' })
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  out: './drizzle',
  schema: './lib/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://faultline:faultline@localhost:5432/faultline',
  },
})
