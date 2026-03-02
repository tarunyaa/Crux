import fs from 'fs/promises'
import path from 'path'
import type { Persona, PersonaContract, Deck, BeliefGraph, CorpusExcerpt } from '@/lib/types'
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

export async function hasBeliefGraph(personaId: string): Promise<boolean> {
  const filePath = path.join(SEED_DIR, 'beliefs', `${personaId}.json`)
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
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

export async function loadCorpus(personaId: string): Promise<CorpusExcerpt[]> {
  const filePath = path.join(SEED_DIR, 'corpus', `${personaId}.json`)
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    const entries = JSON.parse(raw) as Array<{ id: string; content: string; source: string; date?: string; platform: string }>
    return entries.map(e => ({
      id: e.id,
      content: e.content,
      source: e.source,
      date: e.date,
      platform: e.platform as 'twitter' | 'substack',
    }))
  } catch {
    return []
  }
}

export async function loadContracts(personaIds: string[]): Promise<Map<string, PersonaContract>> {
  const entries = await Promise.all(
    personaIds.map(async id => [id, await loadContract(id)] as const)
  )
  return new Map(entries)
}

/**
 * Consolidated system prompt — merges persona contract + voice profile
 * into a single prompt. Primary system prompt for all dialogue generation.
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
