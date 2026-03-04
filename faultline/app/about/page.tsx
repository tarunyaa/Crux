'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Logo from '@/components/Logo'
import SuitIcon from '@/components/SuitIcon'

const SLIDES = [
  { id: 'hero',     label: 'Crux' },
  { id: 'how',      label: 'How It Works' },
  { id: 'output',   label: 'Output' },
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

function Slide({ id, children, className = '' }: { id: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`relative border-t border-card-border ${className}`}>
      <div className="mx-auto max-w-5xl px-8 py-12 w-full">
        {children}
      </div>
    </section>
  )
}

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

export default function AboutPage() {
  const [activeSlide, setActiveSlide] = useState('hero')
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

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section id="hero" className="relative border-t border-card-border">
        <div className="mx-auto max-w-5xl px-8 py-16 md:py-24 w-full">
          <div className="grid md:grid-cols-[1fr_1fr] gap-10 items-center">
            <div>
              <div className="flex items-center gap-3 mb-6">
                <Logo size={28} />
                <span className="text-2xl font-bold">Cr<span className="text-accent">ux</span></span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight leading-tight mb-4">
                The best analysts disagree on the same data.
                <br />
                <span className="text-accent">Nobody maps why.</span>
              </h1>
              <Body className="mb-6 max-w-md">
                Crux builds AI personas from real public voices, runs them through
                adversarial debate, and extracts the few buried assumptions where
                their reasoning actually splits.
              </Body>
              <Link href="/setup"
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent/90 transition-colors">
                Start a Debate
                <span className="text-xs">&#8594;</span>
              </Link>
            </div>
            <div className="w-full rounded-xl border border-card-border bg-card-bg p-5 space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-3">What you do today</p>
              {[
                { n: '01', text: 'Track the best voices across platforms' },
                { n: '02', text: 'Compare competing arguments, filter noise' },
                { n: '03', text: "Figure out what would change each expert's mind" },
                { n: '04', text: 'Synthesise why they actually disagree' },
              ].map(({ n, text }) => (
                <div key={n} className="flex gap-3 items-start">
                  <span className="text-[10px] font-mono text-accent shrink-0 mt-0.5">{n}</span>
                  <span className="text-xs text-muted leading-relaxed">{text}</span>
                </div>
              ))}
              <div className="mt-4 pt-3 border-t border-card-border">
                <p className="text-xs text-accent font-medium">Crux automates this entire workflow.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ───────────────────────────────────────────── */}
      <Slide id="how">
        <Eyebrow>How It Works</Eyebrow>
        <Headline>Four layers, one <span className="text-accent">output</span></Headline>

        <div className="grid md:grid-cols-2 gap-3 mb-8">
          {[
            { suit: '♠', suitClass: 'text-foreground/30', num: '01', title: 'Real Personas',
              desc: 'Each agent is built from scraped tweets, essays, and public writing. Their beliefs are extracted from what they actually said — not invented.' },
            { suit: '♥', suitClass: 'text-accent',        num: '02', title: 'Adversarial Debate',
              desc: 'Agents argue from their real positions with explicit confidence levels and conditions for changing their mind.' },
            { suit: '♦', suitClass: 'text-accent',        num: '03', title: 'Crux Extraction',
              desc: 'The system identifies the minimal set of assumptions driving the disagreement and what evidence would resolve each one.' },
            { suit: '♣', suitClass: 'text-foreground/30', num: '04', title: 'Belief Revision',
              desc: 'Agents update beliefs only when confronted with real arguments — never from social pressure or being outnumbered.' },
          ].map((layer) => (
            <div key={layer.num} className="flex gap-3 items-start rounded-xl border border-card-border bg-card-bg px-4 py-4">
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

        <div className="grid md:grid-cols-4 gap-2">
          {[
            { suit: '♠', label: 'Time Horizon',        desc: 'Short-term vs long-term framing' },
            { suit: '♥', label: 'Evidential Standard',  desc: 'What counts as proof' },
            { suit: '♦', label: 'Value Weighting',      desc: 'How tradeoffs are scored' },
            { suit: '♣', label: 'Factual Premise',      desc: 'A disputed background fact' },
          ].map(({ suit, label, desc }) => (
            <div key={label} className="rounded-lg border border-card-border bg-card-bg px-3 py-2.5 flex items-start gap-2">
              <span className="text-accent text-sm shrink-0 mt-0.5">{suit}</span>
              <div>
                <div className="text-[11px] font-medium text-foreground">{label}</div>
                <div className="text-[10px] text-muted">{desc}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted mt-2 text-center">Disagreements almost always reduce to one of these four axes.</p>
      </Slide>

      {/* ── Output ─────────────────────────────────────────────────── */}
      <Slide id="output">
        <Eyebrow>Output</Eyebrow>
        <Headline>What you <span className="text-accent">get</span></Headline>

        <div className="grid md:grid-cols-3 gap-4 mt-6">
          <div className="card-3d w-full">
            <div className="card-inner card-face rounded-xl p-5 card-shadow border border-card-border">
              <div className="flex justify-between text-xs font-bold mb-4">
                <span className="text-accent">&#9830;</span>
                <span className="text-[10px] uppercase tracking-widest text-muted">Crux Card</span>
                <span className="text-accent rotate-180 inline-block">&#9830;</span>
              </div>
              <div className="space-y-3">
                <div className="border-t border-card-border pt-3">
                  <div className="text-[10px] uppercase tracking-widest text-accent mb-1">The Crux</div>
                  <div className="text-sm text-foreground leading-snug">Whether tech deflation offsets monetary expansion</div>
                </div>
                <div className="border-t border-card-border pt-3">
                  <div className="text-[10px] uppercase tracking-widest text-accent mb-1">Fault Line</div>
                  <div className="text-sm text-foreground/70 leading-snug">Values — innovation advocates vs macro hedgers</div>
                </div>
                <div className="border-t border-card-border pt-3">
                  <div className="text-[10px] uppercase tracking-widest text-accent mb-1">Flip Condition</div>
                  <div className="text-sm text-foreground/70 leading-snug">CPI sustained below 2% for 12 months</div>
                </div>
              </div>
              <div className="flex justify-between text-xs font-bold mt-4">
                <span className="text-accent rotate-180 inline-block">&#9830;</span>
                <span className="text-accent">&#9830;</span>
              </div>
            </div>
          </div>

          <div className="card-3d w-full">
            <div className="card-inner card-face rounded-xl p-5 card-shadow border border-card-border">
              <div className="flex justify-between text-xs font-bold mb-4">
                <span className="text-accent">&#9824;</span>
                <span className="text-[10px] uppercase tracking-widest text-muted">Crux Card</span>
                <span className="text-accent rotate-180 inline-block">&#9824;</span>
              </div>
              <div className="space-y-3">
                <div className="border-t border-card-border pt-3">
                  <div className="text-[10px] uppercase tracking-widest text-accent mb-1">The Crux</div>
                  <div className="text-sm text-foreground leading-snug">Whether AI productivity gains reach the real economy</div>
                </div>
                <div className="border-t border-card-border pt-3">
                  <div className="text-[10px] uppercase tracking-widest text-accent mb-1">Fault Line</div>
                  <div className="text-sm text-foreground/70 leading-snug">Assumptions — GDP growth vs wage growth as the measure</div>
                </div>
                <div className="border-t border-card-border pt-3">
                  <div className="text-[10px] uppercase tracking-widest text-accent mb-1">Flip Condition</div>
                  <div className="text-sm text-foreground/70 leading-snug">Real median wages rise &gt;2% YoY for 4 quarters</div>
                </div>
              </div>
              <div className="flex justify-between text-xs font-bold mt-4">
                <span className="text-accent rotate-180 inline-block">&#9824;</span>
                <span className="text-accent">&#9824;</span>
              </div>
            </div>
          </div>

          <div className="card-3d w-full">
            <div className="card-inner card-face rounded-xl p-5 card-shadow border border-card-border">
              <div className="flex justify-between text-xs font-bold mb-4">
                <span className="text-accent">&#9829;</span>
                <span className="text-[10px] uppercase tracking-widest text-muted">Crux Card</span>
                <span className="text-accent rotate-180 inline-block">&#9829;</span>
              </div>
              <div className="space-y-3">
                <div className="border-t border-card-border pt-3">
                  <div className="text-[10px] uppercase tracking-widest text-accent mb-1">The Crux</div>
                  <div className="text-sm text-foreground leading-snug">Whether memory supply growth is demand-driven or speculative</div>
                </div>
                <div className="border-t border-card-border pt-3">
                  <div className="text-[10px] uppercase tracking-widest text-accent mb-1">Fault Line</div>
                  <div className="text-sm text-foreground/70 leading-snug">Epistemology — forward bookings vs historical cycle patterns</div>
                </div>
                <div className="border-t border-card-border pt-3">
                  <div className="text-[10px] uppercase tracking-widest text-accent mb-1">Flip Condition</div>
                  <div className="text-sm text-foreground/70 leading-snug">HBM utilization drops below 80% for two consecutive quarters</div>
                </div>
              </div>
              <div className="flex justify-between text-xs font-bold mt-4">
                <span className="text-accent rotate-180 inline-block">&#9829;</span>
                <span className="text-accent">&#9829;</span>
              </div>
            </div>
          </div>
        </div>
        <p className="text-[10px] text-muted mt-3 text-center">Illustrative examples</p>
      </Slide>

      {/* ── Footer CTA ─────────────────────────────────────────────── */}
      <section className="border-t border-card-border">
        <div className="mx-auto max-w-5xl px-8 py-12 w-full flex flex-col items-center gap-6">
          <div className="flex items-center gap-2">
            <Logo size={18} />
            <span className="text-sm font-bold">Cr<span className="text-accent">ux</span></span>
          </div>
          <Link href="/setup"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent/90 transition-colors">
            Start a Debate
            <span className="text-xs">&#8594;</span>
          </Link>
          <div className="flex items-center gap-1.5">
            <SuitIcon suit="spade" className="text-[10px] opacity-30" />
            <SuitIcon suit="heart" className="text-[10px]" />
            <SuitIcon suit="diamond" className="text-[10px]" />
            <SuitIcon suit="club" className="text-[10px] opacity-30" />
          </div>
        </div>
      </section>
    </>
  )
}
