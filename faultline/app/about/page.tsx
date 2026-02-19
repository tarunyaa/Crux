'use client'

import { useEffect, useRef, useState } from 'react'
import Logo from '@/components/Logo'
import SuitIcon from '@/components/SuitIcon'

const SLIDES = [
  { id: 'problem',      label: 'The Problem',     suit: 'heart'   as const },
  { id: 'what',         label: 'What is Crux?',   suit: 'diamond' as const },
  { id: 'practice',     label: 'In Practice',     suit: 'club'    as const },
  { id: 'moltbook',     label: 'Moltbook',        suit: 'spade'   as const },
  { id: 'hypothesis',   label: 'Hypothesis',      suit: 'heart'   as const },
  { id: 'architecture', label: 'Architecture',    suit: 'diamond' as const },
  { id: 'epistemic',    label: 'Epistemic Stack', suit: 'club'    as const },
  { id: 'benchmarks',   label: 'Benchmarks',      suit: 'spade'   as const },
  { id: 'literature',   label: 'Literature',      suit: 'heart'   as const },
]

function SlideNav({ active }: { active: string }) {
  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  return (
    <nav className="fixed right-5 top-1/2 -translate-y-1/2 z-40 flex-col gap-2.5 hidden lg:flex">
      {SLIDES.map(({ id, label }) => {
        const isActive = active === id
        return (
          <button key={id} onClick={() => scrollTo(id)} title={label}
            className="group flex items-center justify-end gap-2 outline-none">
            <span className={`text-[10px] uppercase tracking-wider transition-all duration-200 ${isActive ? 'opacity-100 text-accent' : 'opacity-0 group-hover:opacity-50 text-muted'}`}>
              {label}
            </span>
            <span className={`block rounded-full transition-all duration-200 ${isActive ? 'w-2 h-2 bg-accent' : 'w-1.5 h-1.5 bg-muted/40 group-hover:bg-muted'}`} />
          </button>
        )
      })}
    </nav>
  )
}

function Slide({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <section id={id} className="relative border-t border-card-border">
      <div className="mx-auto max-w-5xl px-8 py-12 w-full">
        {children}
      </div>
    </section>
  )
}

// Two-column layout: text left, visual right
function TwoCol({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="grid md:grid-cols-[1fr_1fr] gap-10 items-start">
      <div>{left}</div>
      <div className="flex items-start justify-center">{right}</div>
    </div>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent mb-2">{children}</p>
}

function Headline({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl md:text-2xl font-bold tracking-tight leading-tight mb-4">{children}</h2>
}

function Body({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-sm text-foreground/70 leading-relaxed ${className}`}>{children}</p>
}

// ── SVG: Event flow (what triggers what between layers) ───────────────────────
function ArchDiagram() {
  return (
    <svg viewBox="0 0 320 420" className="w-full" aria-label="Event flow between layers">
      {/* Chat turns */}
      {[
        { y: 0,  label: 'Agent A:  "regulation accelerates innovation…"' },
        { y: 24, label: 'Agent B:  "the evidence suggests the opposite"' },
        { y: 48, label: 'Agent A:  "your core premise is wrong"' },
      ].map(({ y, label }) => (
        <text key={y} x="8" y={y + 14} fill="#5a5a68" fontSize="11">{label}</text>
      ))}

      {/* Trigger event */}
      <rect x="0" y="76" width="320" height="28" rx="5" fill="#1a0a0a" stroke="#dc2626" strokeWidth="1" strokeOpacity="0.7" />
      <text x="160" y="95" textAnchor="middle" fill="#dc2626" fontSize="11" fontWeight="bold">disagreement detected — conf: 0.87</text>

      {/* Arrow */}
      <line x1="160" y1="104" x2="160" y2="126" stroke="#dc2626" strokeWidth="1.5" strokeDasharray="4 3" />
      <polygon points="155,126 165,126 160,136" fill="#dc2626" />

      {/* Crux room */}
      <rect x="0" y="138" width="320" height="140" rx="7" fill="#111113" stroke="#dc2626" strokeWidth="1" strokeDasharray="5 3" />
      <text x="160" y="158" textAnchor="middle" fill="#5a5a68" fontSize="10" fontStyle="italic">crux room spawned</text>
      {[
        { y: 180, step: '1', label: 'steelman each position' },
        { y: 202, step: '2', label: 'diagnose disagreement type' },
        { y: 224, step: '3', label: 'state explicit flip conditions' },
        { y: 246, step: '4', label: 'room locked until all complete' },
      ].map(({ y, step, label }) => (
        <g key={y}>
          <text x="18" y={y} fill="#dc2626" fontSize="11" fontWeight="bold">{step}</text>
          <text x="34" y={y} fill="#5a5a68" fontSize="11">{label}</text>
        </g>
      ))}

      {/* Arrow */}
      <line x1="160" y1="278" x2="160" y2="300" stroke="#1e1e22" strokeWidth="1.5" />
      <polygon points="155,300 165,300 160,310" fill="#1e1e22" />

      {/* Crux card emitted */}
      <rect x="40" y="312" width="240" height="44" rx="7" fill="#111113" stroke="#dc2626" strokeWidth="1" />
      <text x="160" y="331" textAnchor="middle" fill="#dc2626" fontSize="12" fontWeight="bold">crux card emitted</text>
      <text x="160" y="348" textAnchor="middle" fill="#5a5a68" fontSize="10">returned to main channel</text>

      {/* Arrow */}
      <line x1="160" y1="356" x2="160" y2="376" stroke="#1e1e22" strokeWidth="1.5" />
      <polygon points="155,376 165,376 160,386" fill="#1e1e22" />

      {/* Society update */}
      <rect x="0" y="388" width="320" height="30" rx="5" fill="#111113" stroke="#1e1e22" strokeWidth="1" />
      <text x="160" y="407" textAnchor="middle" fill="#5a5a68" fontSize="10">authority scores updated · crux stored in memory</text>
    </svg>
  )
}

// ── SVG: Belief revision gate (vertical) ─────────────────────────────────────
function RevisionDiagram() {
  return (
    <svg viewBox="0 0 200 220" className="w-full max-w-[200px]" aria-label="Belief revision gate">
      <text x="100" y="14" textAnchor="middle" fill="#5a5a68" fontSize="9" fontWeight="bold" textDecoration="uppercase">TRIGGERS REVISION</text>

      {/* Pass items */}
      {[
        { y: 28, label: 'Successful attack', sub: 'undercut / undermine' },
        { y: 84, label: 'Flip condition', sub: 'explicitly satisfied' },
      ].map(({ y, label, sub }) => (
        <g key={label}>
          <rect x="0" y={y} width="180" height="46" rx="6" fill="#0f1a1a" stroke="#dc2626" strokeWidth="1" strokeOpacity="0.6" />
          <text x="10" y={y + 18} fill="#dc2626" fontSize="10" fontWeight="bold">✓</text>
          <text x="26" y={y + 18} fill="#f0f0f0" fontSize="10">{label}</text>
          <text x="26" y={y + 34} fill="#5a5a68" fontSize="8.5">{sub}</text>
        </g>
      ))}

      <line x1="90" y1="146" x2="90" y2="158" stroke="#1e1e22" strokeWidth="1" strokeDasharray="3 2" />
      <text x="100" y="172" textAnchor="middle" fill="#5a5a68" fontSize="9" fontWeight="bold">BLOCKED</text>

      {/* Block item */}
      <rect x="0" y="180" width="180" height="38" rx="6" fill="#111113" stroke="#1e1e22" strokeWidth="1" />
      <text x="10" y="204" fill="#5a5a68" fontSize="10">✗</text>
      <text x="26" y="200" fill="#5a5a68" fontSize="10">Social pressure</text>
      <text x="26" y="213" fill="#5a5a68" fontSize="8.5">being outnumbered</text>
    </svg>
  )
}

// ── SVG: Compression funnel (vertical) ────────────────────────────────────────
function CompressionDiagram() {
  return (
    <svg viewBox="0 0 180 280" className="w-full max-w-[180px]" aria-label="Disagreement compression">
      <text x="90" y="14" textAnchor="middle" fill="#5a5a68" fontSize="9">Diffuse discourse</text>

      {/* Wide bars (many issues) */}
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={10 + i * 3} y={20 + i * 14} width={160 - i * 16} height="10" rx="2" fill="#1e1e22" />
      ))}

      {/* Funnel */}
      <line x1="30" y1="90" x2="70" y2="128" stroke="#1e1e22" strokeWidth="1" />
      <line x1="150" y1="90" x2="110" y2="128" stroke="#1e1e22" strokeWidth="1" />
      <text x="90" y="118" textAnchor="middle" fill="#5a5a68" fontSize="8">crux rooms</text>

      {/* Compressed bars */}
      <rect x="35" y="132" width="110" height="10" rx="2" fill="#1e1e22" />
      <rect x="50" y="148" width="80"  height="10" rx="2" fill="#7f1d1d" stroke="#dc2626" strokeWidth="1" />
      <rect x="60" y="164" width="60"  height="10" rx="2" fill="#1e1e22" />

      <text x="90" y="192" textAnchor="middle" fill="#5a5a68" fontSize="9">Crux axes</text>

      {/* Arrow */}
      <line x1="90" y1="198" x2="90" y2="218" stroke="#dc2626" strokeWidth="1.5" />
      <polygon points="86,218 94,218 90,228" fill="#dc2626" />

      {/* Crux card */}
      <rect x="50" y="232" width="80" height="44" rx="6" fill="#111113" stroke="#dc2626" strokeWidth="1" />
      <text x="90" y="252" textAnchor="middle" fill="#dc2626" fontSize="10" fontWeight="bold">CRUX</text>
      <text x="90" y="266" textAnchor="middle" fill="#5a5a68" fontSize="8">CARD</text>
    </svg>
  )
}

export default function AboutPage() {
  const [activeSlide, setActiveSlide] = useState('problem')
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    const handleIntersect: IntersectionObserverCallback = (entries) => {
      let best: IntersectionObserverEntry | null = null
      for (const entry of entries) {
        if (entry.isIntersecting && (!best || entry.intersectionRatio > best.intersectionRatio)) best = entry
      }
      if (best) setActiveSlide(best.target.id)
    }
    observerRef.current = new IntersectionObserver(handleIntersect, { threshold: 0.3 })
    SLIDES.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) observerRef.current?.observe(el)
    })
    return () => observerRef.current?.disconnect()
  }, [])

  return (
    <>
      <SlideNav active={activeSlide} />

      {/* ── 01 The Problem ───────────────────────────────────────────────────── */}
      <Slide id="problem">
        <TwoCol
          left={
            <>
              <Eyebrow>§ 01 — The Problem</Eyebrow>
              <Headline>The Information <span className="text-accent">Glut</span> Problem</Headline>
              <Body className="mb-4">
                Think tanks and investment banks pay millions per year for research
                platforms that largely present a single analytical perspective. Fund
                managers then spend hours synthesising bull and bear cases from
                fragmented, non-dialogic sources.
              </Body>
              <Body>
                All of this remains{' '}
                <span className="text-foreground font-medium">manual, slow, and expensive</span>.
                There is no system that reliably converts fragmented discourse into a
                clear, testable map of where informed perspectives actually divide — and <em>why</em>.
              </Body>
            </>
          }
          right={
            <div className="w-full rounded-xl border border-card-border bg-card-bg p-5 space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-3">The manual workflow today</p>
              {[
                { n: '01', text: 'Track the best voices across platforms' },
                { n: '02', text: 'Compare competing arguments, filter noise' },
                { n: '03', text: "Identify what would actually change an expert's mind" },
                { n: '04', text: 'Synthesise a coherent map of why perspectives diverge' },
              ].map(({ n, text }) => (
                <div key={n} className="flex gap-3 items-start">
                  <span className="text-[10px] font-mono text-accent shrink-0 mt-0.5">{n}</span>
                  <span className="text-xs text-muted leading-relaxed">{text}</span>
                </div>
              ))}
              <div className="mt-4 pt-3 border-t border-card-border">
                <p className="text-xs text-accent font-medium">No system does this reliably at scale.</p>
              </div>
            </div>
          }
        />
      </Slide>

      {/* ── 02 What is Crux? ─────────────────────────────────────────────────── */}
      <Slide id="what">
        <TwoCol
          left={
            <>
              <Eyebrow>§ 02 — What is Crux?</Eyebrow>
              <Headline>What is <span className="text-accent">Crux</span>?</Headline>
              <Body className="mb-4">
                Crux is a structured argumentation engine that models the internet&rsquo;s
                most influential viewpoints as high-fidelity AI agents and runs them
                through adversarial debate.
              </Body>
              <Body>
                Spin up agents with personas modeled from real-world voices and watch
                them challenge each other. Crux doesn&rsquo;t force consensus. It distills
                the debate into the{' '}
                <span className="text-accent font-medium">crux</span>: the few
                assumptions driving the split, and exactly what evidence or conditions
                would shift each position.
              </Body>
            </>
          }
          right={
            <div className="card-3d w-full max-w-[240px]">
              <div className="card-inner card-face rounded-xl p-5 card-shadow border border-card-border">
                <div className="flex justify-between text-xs font-bold mb-4">
                  <span className="text-accent">♦</span>
                  <span className="text-[10px] uppercase tracking-widest text-muted">Crux Card</span>
                  <span className="text-accent rotate-180 inline-block">♦</span>
                </div>
                <div className="space-y-3">
                  <div className="border-t border-card-border pt-3">
                    <div className="text-[10px] uppercase tracking-widest text-accent mb-1">The Crux</div>
                    <div className="text-xs text-foreground/80 leading-snug">Whether tech deflation offsets monetary expansion</div>
                  </div>
                  <div className="border-t border-card-border pt-3">
                    <div className="text-[10px] uppercase tracking-widest text-accent mb-1">Fault Line</div>
                    <div className="text-xs text-foreground/70 leading-snug">Values — innovation advocates vs macro hedgers</div>
                  </div>
                  <div className="border-t border-card-border pt-3">
                    <div className="text-[10px] uppercase tracking-widest text-accent mb-1">Flip Condition</div>
                    <div className="text-xs text-foreground/70 leading-snug">CPI sustained below 2% for 12 months</div>
                  </div>
                </div>
                <div className="flex justify-between text-xs font-bold mt-4">
                  <span className="text-accent rotate-180 inline-block">♦</span>
                  <span className="text-accent">♦</span>
                </div>
              </div>
            </div>
          }
        />
      </Slide>

      {/* ── 03 In Practice ───────────────────────────────────────────────────── */}
      <Slide id="practice">
        <TwoCol
          left={
            <>
              <Eyebrow>§ 03 — In Practice</Eyebrow>
              <Headline>Real <span className="text-accent">Output</span></Headline>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-3">Key Cruxes</p>
              <div className="space-y-3 mb-6">
                {[
                  { w: 0.85, text: 'Whether tech deflation offsets monetary expansion' },
                  { w: 0.80, text: 'Whether inflation settles at 2% or stays 3%+' },
                  { w: 0.75, text: 'Whether central bank gold purchases are structural or cyclical' },
                ].map(({ w, text }) => (
                  <div key={text}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-foreground/80 leading-snug pr-4">{text}</span>
                      <span className="text-[10px] font-mono text-accent shrink-0">{w.toFixed(2)}</span>
                    </div>
                    <div className="h-px bg-card-border rounded-full overflow-hidden">
                      <div className="h-full bg-accent rounded-full" style={{ width: `${w * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-3">Fault Lines</p>
              <div className="space-y-2">
                {[
                  { type: 'Values',       text: 'Innovation advocates dismiss gold; macro hedgers treat it as essential insurance.' },
                  { type: 'Assumptions',  text: 'Whether productivity gains or monetary factors dominate in asset pricing.' },
                  { type: 'Epistemology', text: 'Whether official CPI accurately reflects inflation experienced by asset holders.' },
                ].map(({ type, text }) => (
                  <div key={type} className="flex gap-2 items-start">
                    <span className="shrink-0 rounded border border-accent/40 px-1.5 py-0.5 text-[10px] font-semibold text-accent uppercase tracking-wide">{type}</span>
                    <span className="text-xs text-muted leading-relaxed">{text}</span>
                  </div>
                ))}
              </div>
            </>
          }
          right={
            <div className="w-full space-y-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-2">Persona Positions</p>
                <div className="rounded-xl border border-card-border bg-card-bg divide-y divide-card-border overflow-hidden">
                  {[
                    { name: 'Cathie Wood',   pos: 'NO',  reason: 'Tech deflation dominates within 12mo' },
                    { name: 'Chamath',       pos: 'NO',  reason: 'CB purchases are temporary, not structural' },
                    { name: 'Michael Burry', pos: 'YES', reason: 'Monetary factors dominate over productivity' },
                    { name: 'R. Kiyosaki',  pos: 'YES', reason: 'Monetary expansion + geopolitical tail risk' },
                    { name: 'A. Damodaran', pos: '—',   reason: 'Insufficient clarity on rate trajectory' },
                  ].map(({ name, pos, reason }) => (
                    <div key={name} className="flex items-start gap-2 px-3 py-2">
                      <span className={`text-[10px] font-bold shrink-0 w-6 mt-0.5 ${pos === 'YES' ? 'text-foreground' : pos === 'NO' ? 'text-accent' : 'text-muted'}`}>{pos}</span>
                      <div>
                        <span className="text-[11px] font-medium text-foreground">{name}</span>
                        <span className="text-muted/60 mx-1 text-[10px]">—</span>
                        <span className="text-[11px] text-muted">{reason}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-2">Resolution Paths</p>
                <div className="space-y-1.5">
                  {[
                    '12-month CPI/PCE — sustained <2% pressures gold; >3% supports it',
                    'Central bank purchase volumes — acceleration vs. decline signals structural vs. cyclical',
                    'Gold vs. tech indices over 12 months — direct empirical test',
                  ].map((path, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <span className="text-accent text-xs shrink-0 mt-0.5">›</span>
                      <span className="text-xs text-muted leading-snug">{path}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          }
        />
      </Slide>

      {/* ── 04 Moltbook ──────────────────────────────────────────────────────── */}
      <Slide id="moltbook">
        <TwoCol
          left={
            <>
              <Eyebrow>§ 04 — Prior Art</Eyebrow>
              <Headline>The Moltbook Lesson</Headline>
              <blockquote className="border-l-2 border-accent pl-4 mb-4">
                <p className="text-lg md:text-xl font-bold text-foreground leading-snug">
                  &ldquo;2.6 million agents. Extensive interaction.{' '}
                  <span className="text-accent">No socialization.</span>&rdquo;
                </p>
              </blockquote>
              <Body>
                Agents interacted extensively, yet each individual agent&rsquo;s semantic drift
                was indistinguishable from noise. The society did not develop shared memory,
                stable epistemic anchors, or durable influence hierarchies.{' '}
                <span className="text-foreground font-medium">Scalability does not equal socialization.</span>
              </Body>
            </>
          }
          right={
            <a
              href="https://arxiv.org/abs/2602.14299"
              target="_blank"
              rel="noopener noreferrer"
              className="group block w-full rounded-xl border border-card-border bg-card-bg hover:border-accent/40 transition-colors duration-200 p-4"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <p className="text-[10px] font-mono text-accent">arXiv:2602.14299</p>
                <span className="text-muted group-hover:text-accent transition-colors text-xs">↗</span>
              </div>
              <p className="text-sm font-semibold text-foreground leading-snug mb-1 group-hover:text-accent transition-colors">
                Does Socialization Emerge in AI Agent Society?
              </p>
              <p className="text-xs text-muted mb-3">Ming Li, Xirui Li, Tianyi Zhou</p>
              <p className="text-xs text-muted/70 leading-relaxed">
                &ldquo;Scale and interaction density alone are insufficient to induce socialization.
                Shared social memory is essential for developing stable agent societies
                and collective consensus.&rdquo;
              </p>
              <div className="mt-3 pt-3 border-t border-card-border grid grid-cols-3 gap-2">
                {[['2.6M', 'agents'], ['0', 'socialization'], ['0', 'shared memory']].map(([val, lbl]) => (
                  <div key={lbl} className="text-center">
                    <div className="text-sm font-bold text-accent">{val}</div>
                    <div className="text-[10px] text-muted">{lbl}</div>
                  </div>
                ))}
              </div>
            </a>
          }
        />
      </Slide>

      {/* ── 04 Hypothesis ────────────────────────────────────────────────────── */}
      <Slide id="hypothesis">
        <TwoCol
          left={
            <>
              <Eyebrow>§ 05 — Hypothesis</Eyebrow>
              <Headline>The Crux <span className="text-accent">Hypothesis</span></Headline>
              <div className="rounded-xl border border-accent/30 bg-card-bg p-4 mb-4 relative overflow-hidden">
                <span className="absolute -right-1 -bottom-1 text-[5rem] font-bold text-accent/[0.04] leading-none select-none pointer-events-none">♠</span>
                <Body className="relative z-10">
                  Structured adversarial debate between high-fidelity AI personas can
                  surface the <span className="text-foreground font-medium">minimal disagreement structure</span> of
                  complex topics more reliably than any single-agent analytical approach.
                </Body>
              </div>
              <Body>
                Unlike Moltbook, Crux introduces explicit adversarial pressure,
                persistent belief states, and structured revision mechanisms designed
                to transform interaction into epistemic movement.
              </Body>
            </>
          }
          right={
            <div className="w-full space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-3">Disagreement is almost always about</p>
              {[
                { suit: '♠', label: 'Time Horizon',       desc: 'Short-term vs long-term framing' },
                { suit: '♥', label: 'Evidential Standard', desc: 'What counts as proof' },
                { suit: '♦', label: 'Value Weighting',     desc: 'How tradeoffs are scored' },
                { suit: '♣', label: 'Factual Premise',     desc: 'A disputed background fact' },
              ].map(({ suit, label, desc }) => (
                <div key={label} className="rounded-lg border border-card-border bg-card-bg px-3 py-2.5 flex items-start gap-3">
                  <span className="text-accent text-sm shrink-0 mt-0.5">{suit}</span>
                  <div>
                    <div className="text-xs font-medium text-foreground">{label}</div>
                    <div className="text-[11px] text-muted">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          }
        />
      </Slide>

      {/* ── 05 Architecture ──────────────────────────────────────────────────── */}
      <Slide id="architecture">
        <TwoCol
          left={
            <>
              <Eyebrow>§ 06 — Architecture</Eyebrow>
              <Headline>How Crux <span className="text-accent">Works</span></Headline>
              <div className="space-y-2">
                {[
                  { suit: '♠', suitClass: 'text-foreground/30', num: '01', title: 'Dialogue Layer',
                    desc: 'Natural group chat with urgency-based turn selection. Each agent carries an explicit belief state of priors, confidence levels, and flip conditions.' },
                  { suit: '♥', suitClass: 'text-accent',        num: '02', title: 'Crux Layer',
                    desc: 'Monitors for disagreement candidates. Spawns a crux room — locked until steelmanning and flip conditions are complete. Outputs a crux card.' },
                  { suit: '♣', suitClass: 'text-foreground/30', num: '03', title: 'Society Layer',
                    desc: 'Arguments that survive repeated challenge accrue epistemic authority. A shared disagreement memory tracks recurring crux structures across sessions.' },
                ].map((layer, i) => (
                  <div key={layer.num} className="flex gap-3 items-start rounded-xl border border-card-border bg-card-bg px-3 py-3">
                    <span className={`text-base mt-0.5 shrink-0 ${layer.suitClass}`}>{layer.suit}</span>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] text-muted font-mono">{layer.num}</span>
                        <span className="text-xs font-semibold text-foreground">{layer.title}</span>
                      </div>
                      <Body>{layer.desc}</Body>
                    </div>
                  </div>
                ))}
              </div>
            </>
          }
          right={
            <div className="rounded-xl border border-card-border bg-card-bg p-5 w-full">
              <ArchDiagram />
            </div>
          }
        />
      </Slide>

      {/* ── 06 Epistemic Stack ───────────────────────────────────────────────── */}
      <Slide id="epistemic">
        <TwoCol
          left={
            <>
              <Eyebrow>§ 07 — Design</Eyebrow>
              <Headline>Built to Avoid Moltbook&rsquo;s <span className="text-accent">Failures</span></Headline>
              <div className="space-y-0">
                {[
                  { n: 1, pitfall: 'Echo Chamber',
                    fix: 'LoRA fine-tunes or prompt-baked weight edits encode distinct priors structurally — divergence is architectural, not instructed.' },
                  { n: 2, pitfall: 'No Persistent Epistemic State',
                    fix: "Each agent carries beliefs, confidence levels, assumptions, and flip conditions — inspired by HumanLM's latent state architecture." },
                  { n: 3, pitfall: 'No Principled Belief Revision',
                    fix: 'AGM-inspired revision operator, triggered only by successful attack or flip condition — never by social pressure or majority vote.' },
                ].map(({ n, pitfall, fix }, i) => (
                  <div key={n} className={`flex gap-3 items-start py-4 ${i > 0 ? 'border-t border-card-border' : ''}`}>
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-accent text-accent text-[10px] font-bold shrink-0 mt-0.5">{n}</span>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="rounded border border-accent/40 px-1.5 py-0.5 text-[10px] font-semibold text-accent uppercase tracking-wide">{pitfall}</span>
                        <span className="text-muted text-[10px]">→ Fix</span>
                      </div>
                      <Body>{fix}</Body>
                    </div>
                  </div>
                ))}
              </div>
            </>
          }
          right={
            <div className="rounded-xl border border-card-border bg-card-bg p-5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-4">Belief revision gate</p>
              <RevisionDiagram />
            </div>
          }
        />
      </Slide>

      {/* ── 07 Benchmarks ────────────────────────────────────────────────────── */}
      <Slide id="benchmarks">
        <TwoCol
          left={
            <>
              <Eyebrow>§ 08 — Metrics</Eyebrow>
              <Headline>Measuring Epistemic <span className="text-accent">Movement</span></Headline>
              <Body className="mb-4">
                Generating debate is necessary but not sufficient. The benchmark suite
                tests whether Crux produces genuine epistemic movement — not just
                plausible-looking argumentation.
              </Body>
              <div className="space-y-2">
                {[
                  { level: 'Society',    suit: '♠', suitClass: 'text-foreground/30',
                    metrics: ['Monotonic disagreement entropy decrease', 'Crux Compression Rate ≥ 0.50', 'Argument graph diameter reduction'] },
                  { level: 'Agent',     suit: '♥', suitClass: 'text-accent',
                    metrics: ['Structural drift exceeds isolation baseline', 'Directional coherence (DC > 0) along crux axes'] },
                  { level: 'Collective', suit: '♦', suitClass: 'text-accent',
                    metrics: ['Argument Survival Centrality (ρ > 0.70)', 'Crux Recurrence Rate vs. random baseline', 'Shared Memory Convergence'] },
                ].map((tier) => (
                  <div key={tier.level} className="rounded-lg border border-card-border bg-card-bg px-3 py-2.5">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-sm ${tier.suitClass}`}>{tier.suit}</span>
                      <span className="text-[11px] font-bold text-foreground uppercase tracking-wider">{tier.level}</span>
                    </div>
                    <ul className="space-y-1">
                      {tier.metrics.map((m) => (
                        <li key={m} className="flex items-start gap-1.5 text-xs text-muted">
                          <span className="text-accent shrink-0">›</span>{m}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          }
          right={
            <div className="rounded-xl border border-card-border bg-card-bg p-5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-4">Disagreement compression</p>
              <CompressionDiagram />
            </div>
          }
        />
      </Slide>

      {/* ── 08 Literature ────────────────────────────────────────────────────── */}
      <Slide id="literature">
        <Eyebrow>§ 09 — Prior Work</Eyebrow>
        <Headline>Standing on the <span className="text-accent">Shoulders</span></Headline>

        <div className="grid md:grid-cols-2 gap-x-12 gap-y-0">
          {[
            { theme: 'Conformity & Anti-Convergence', suit: '♠', suitClass: 'text-foreground/30',
              papers: [
                { name: 'FREE-MAD',                     imp: 'Multi-agent debate degrades to conformity without structural divergence enforcement.' },
                { name: 'Can LLM Agents Really Debate?', imp: 'Majority-pressure override: agents capitulate, not persuade.' },
                { name: 'DEBATE Benchmark',              imp: 'Adversarial framing alone is insufficient — process design matters.' },
              ] },
            { theme: 'Implicit Premises', suit: '♥', suitClass: 'text-accent',
              papers: [
                { name: 'Harvey Ku et al. (ArgMining 2025)', imp: 'Most real disagreements hinge on unstated prior assumptions.' },
                { name: 'ME-RAG',                           imp: 'Multi-evidence RAG surfaces conflicting grounding, enabling premise comparison.' },
                { name: 'R-Debater',                        imp: 'Retrieval-augmented debaters outperform closed-model baselines on factual crux.' },
              ] },
            { theme: 'Sycophancy', suit: '♦', suitClass: 'text-accent',
              papers: [
                { name: 'SMART',               imp: 'Self-monitored revision tokens detect and block social-pressure capitulation.' },
                { name: 'Echoes of Agreement',  imp: 'Sycophancy is positional, not random — persists across multi-turn pressure.' },
              ] },
            { theme: 'Epistemic Architecture', suit: '♣', suitClass: 'text-foreground/30',
              papers: [
                { name: 'HUMANLM',                             imp: 'Belief state as structured object: confidence, assumptions, flip conditions.' },
                { name: 'Consistently Simulating Human Personas', imp: 'Stable persona simulation requires structural encoding, not just prompting.' },
              ] },
            { theme: 'Orchestration', suit: '♠', suitClass: 'text-foreground/30',
              papers: [
                { name: 'ExACT',         imp: 'Turn-taking with epistemic utility maximises information extracted per exchange.' },
                { name: 'Kimura et al.', imp: "Urgency-score mechanism directly applicable to Crux's group-chat dialogue layer." },
                { name: 'J1',            imp: "Provides the training recipe for Crux's epistemic quality judge." },
              ] },
          ].map((group, gi) => (
            <div key={group.theme} className="py-4 border-t border-card-border">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-sm ${group.suitClass}`}>{group.suit}</span>
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground">{group.theme}</h3>
              </div>
              <div className="space-y-1.5 pl-4">
                {group.papers.map((p) => (
                  <div key={p.name} className="flex gap-2 items-start">
                    <span className="text-accent text-xs shrink-0 mt-0.5">&bull;</span>
                    <p className="text-xs">
                      <span className="text-foreground font-medium">{p.name}</span>
                      <span className="text-muted/50 mx-1">—</span>
                      <span className="text-muted">{p.imp}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 pt-6 border-t border-card-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo size={18} />
            <span className="text-sm font-bold">Cr<span className="text-accent">ux</span></span>
          </div>
          <div className="flex items-center gap-1.5">
            <SuitIcon suit="spade" className="text-[10px] opacity-30" />
            <SuitIcon suit="heart" className="text-[10px]" />
            <SuitIcon suit="diamond" className="text-[10px]" />
            <SuitIcon suit="club" className="text-[10px] opacity-30" />
          </div>
        </div>
      </Slide>
    </>
  )
}
