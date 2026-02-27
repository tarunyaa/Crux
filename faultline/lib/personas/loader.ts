import fs from 'fs/promises'
import path from 'path'
import type { Persona, PersonaContract, Deck, BeliefGraph } from '@/lib/types'

const SEED_DIR = path.join(process.cwd(), 'data/seed')

interface PersonasFile {
  decks: Deck[]
  personas: Persona[]
}

let _cache: PersonasFile | null = null

async function loadPersonasFile(): Promise<PersonasFile> {
  if (_cache) return _cache
  const raw = await fs.readFile(path.join(SEED_DIR, 'personas.json'), 'utf-8')
  _cache = JSON.parse(raw) as PersonasFile
  return _cache
}

export async function getDecks(): Promise<Deck[]> {
  const data = await loadPersonasFile()
  return data.decks
}

export async function getDeck(idOrSlug: string): Promise<Deck | undefined> {
  const decks = await getDecks()
  return decks.find(d => d.id === idOrSlug || d.slug === idOrSlug)
}

export async function getPersonas(): Promise<Persona[]> {
  const data = await loadPersonasFile()
  return data.personas
}

export async function getPersona(id: string): Promise<Persona | undefined> {
  const personas = await getPersonas()
  return personas.find(p => p.id === id)
}

export async function getPersonasForDeck(deckId: string): Promise<Persona[]> {
  const data = await loadPersonasFile()
  const deck = data.decks.find(d => d.id === deckId || d.slug === deckId)
  if (!deck) return []
  return data.personas.filter(p => deck.personaIds.includes(p.id))
}

export async function loadContract(personaId: string): Promise<PersonaContract> {
  const filePath = path.join(SEED_DIR, 'contracts', `${personaId}.json`)
  const raw = await fs.readFile(filePath, 'utf-8')
  return JSON.parse(raw) as PersonaContract
}

export async function loadBeliefGraph(personaId: string): Promise<BeliefGraph | null> {
  const filePath = path.join(SEED_DIR, 'beliefs', `${personaId}.json`)
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(raw) as BeliefGraph
  } catch {
    return null
  }
}

export async function loadContracts(personaIds: string[]): Promise<Map<string, PersonaContract>> {
  const entries = await Promise.all(
    personaIds.map(async id => [id, await loadContract(id)] as const)
  )
  return new Map(entries)
}

/**
 * Build the system prompt for an agent from its contract.
 * Used by the orchestrator when assembling agent context.
 */
export function buildSystemPrompt(contract: PersonaContract, persona: Persona): string {
  const excerptBlock = contract.anchorExcerpts
    .map(e => `> "${e.content}"\n> — ${e.source} (${e.date})`)
    .join('\n\n')

  return `You are roleplaying as ${persona.name} (${persona.twitterHandle}).

## Personality
${contract.personality}

## Bias & Blind Spots
${contract.bias}

## Stakes & Incentives
${contract.stakes}

## Epistemology
${contract.epistemology}

## Time Horizon
${contract.timeHorizon}

## Flip Conditions
${contract.flipConditions}

## Evidence Policy
- Accept: ${contract.evidencePolicy.acceptableSources.join(', ')}
- Reject: ${contract.evidencePolicy.unacceptableSources.join(', ')}
- Weighting: ${contract.evidencePolicy.weightingRules}

## Anchor Quotes
${excerptBlock}

## Rules
- Stay in character. Argue as ${persona.name} would based on the above profile.
- Ground claims in your anchor quotes and evidence policy when possible.
- If evidence hits one of your flip conditions, acknowledge the shift.
- Be specific and testable — avoid vague hedging.`
}
