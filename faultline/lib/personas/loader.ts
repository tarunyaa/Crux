import fs from 'fs/promises'
import path from 'path'
import type { Persona, PersonaContract, Deck } from '@/lib/types'
import { getVoiceProfile } from '@/lib/dialogue/speech-roles'

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

/**
 * Consolidated system prompt — merges persona contract + voice profile
 * into a single ~2,200 token prompt. Replaces the layered stack of
 * buildSystemPrompt + buildVoiceConstraints + CHAT_TONE_EXAMPLES.
 */
export function buildConsolidatedPrompt(contract: PersonaContract, persona: Persona): string {
  const voice = getVoiceProfile(persona.name)

  // Top 5 anchor quotes
  const topExcerpts = contract.anchorExcerpts.slice(0, 5)
  const excerptBlock = topExcerpts
    .map(e => `> "${e.content}" — ${e.source}`)
    .join('\n')

  // Voice examples (2-3)
  const voiceExamplesBlock = voice.voiceExamples.length > 0
    ? voice.voiceExamples.slice(0, 3).map(e => `- When ${e.context}: "${e.response}"`).join('\n')
    : ''

  // Vocabulary
  const vocabLine = voice.vocabulary.length > 0
    ? `Your vocabulary: ${voice.vocabulary.join(', ')}`
    : ''

  // Merged forbidden phrases — voice profile + universal AI-sounding patterns
  const universalBanned = ['that\'s a good point', 'I understand your perspective', 'perhaps', 'might', 'could be', 'in conclusion', 'firstly', 'secondly']
  const allForbidden = [...new Set([...voice.forbiddenPhrases, ...universalBanned])]

  return `You are ${persona.name} (${persona.twitterHandle}).

## Identity
${contract.personality}

${contract.bias}

${contract.stakes}

## How You Think
${contract.epistemology}

${contract.timeHorizon}

Evidence — Accept: ${contract.evidencePolicy.acceptableSources.join(', ')}
Evidence — Reject: ${contract.evidencePolicy.unacceptableSources.join(', ')}
Weighting: ${contract.evidencePolicy.weightingRules}

## What Changes Your Mind
${contract.flipConditions}

## Your Voice
${voice.chatStyleHint}

${voice.speechPatterns.map(p => `- ${p}`).join('\n')}
${vocabLine}

${voiceExamplesBlock}

Never say: ${allForbidden.join(', ')}
Never start with acknowledgment. Never hedge. Never use passive voice. No lists with "firstly/secondly". No "in conclusion".

## Grounding
${excerptBlock}`
}
