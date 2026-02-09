/**
 * Backfill missing twitterPicture URLs in personas.json
 * using the X API v2 user lookup.
 *
 * Usage: npx tsx scripts/backfill-photos.ts
 */

import fs from 'fs/promises'
import path from 'path'
import { TwitterApi } from 'twitter-api-v2'

const PERSONAS_PATH = path.join(__dirname, '..', 'data', 'seed', 'personas.json')

interface PersonaEntry {
  id: string
  name: string
  twitterHandle: string
  twitterPicture: string
  deckIds: string[]
  suite: string | null
  locked: boolean
}

interface PersonasFile {
  decks: unknown[]
  personas: PersonaEntry[]
}

async function main() {
  const token = process.env.X_BEARER_TOKEN
  if (!token) {
    console.error('ERROR: X_BEARER_TOKEN not set in environment')
    process.exit(1)
  }

  const client = new TwitterApi(token)
  const raw = await fs.readFile(PERSONAS_PATH, 'utf-8')
  const data: PersonasFile = JSON.parse(raw)

  const missing = data.personas.filter(
    p => !p.twitterPicture && p.twitterHandle
  )

  if (missing.length === 0) {
    console.log('All personas already have profile photos.')
    return
  }

  console.log(`Found ${missing.length} personas missing photos:\n`)

  let updated = 0

  for (const persona of missing) {
    const handle = persona.twitterHandle.replace('@', '')
    try {
      const user = await client.v2.userByUsername(handle, {
        'user.fields': ['profile_image_url'],
      })

      if (!user.data?.profile_image_url) {
        console.log(`  SKIP  ${persona.name} (@${handle}) — no profile image`)
        continue
      }

      // Twitter returns _normal (48x48) — replace with _400x400 for high-res
      const url = user.data.profile_image_url.replace('_normal', '_400x400')
      persona.twitterPicture = url
      updated++
      console.log(`  OK    ${persona.name} (@${handle})`)

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 200))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`  FAIL  ${persona.name} (@${handle}) — ${msg}`)
    }
  }

  // Write back
  await fs.writeFile(PERSONAS_PATH, JSON.stringify(data, null, 2) + '\n')
  console.log(`\nDone. Updated ${updated}/${missing.length} personas.`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
