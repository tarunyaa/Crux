import Link from 'next/link'
import SuitIcon from '@/components/SuitIcon'

export default function PersonaBenchPage() {
  return (
    <div className="min-h-screen px-6 py-16">
      <div className="mx-auto max-w-3xl space-y-10">

        {/* Header */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-accent">
            <SuitIcon suit="diamond" className="text-[10px]" />
            Coming Soon
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            Persona<span className="text-accent">Bench</span>
          </h1>
          <p className="text-base text-muted leading-relaxed max-w-xl">
            A benchmark for epistemic personality modelling. Does your agent actually think like the person it represents?
          </p>
        </div>

        {/* Suit divider */}
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            {(['spade', 'heart', 'diamond', 'club'] as const).map(s => (
              <SuitIcon key={s} suit={s} className="text-xs opacity-40" />
            ))}
          </div>
          <div className="flex-1 h-px bg-card-border" />
        </div>

        {/* What it will be */}
        <div className="space-y-6">
          <div className="rounded-xl border border-card-border bg-card-bg p-6 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">What is PersonaBench?</h2>
            <p className="text-sm text-foreground/80 leading-relaxed">
              Personality agents are only as good as how faithfully they replicate a person's reasoning — not just their vocabulary.
              PersonaBench measures whether an agent holds the right beliefs, updates them correctly under evidence, and reasons in a way consistent with its source persona.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              {[
                { suit: '♠', label: 'Belief Accuracy', desc: 'Does the agent hold the right positions on key topics?' },
                { suit: '♥', label: 'Epistemic Consistency', desc: 'Does it reason in a way consistent with the persona\'s worldview?' },
                { suit: '♦', label: 'Update Behaviour', desc: 'Does it change its mind on the right things, for the right reasons?' },
              ].map(({ suit, label, desc }) => (
                <div key={label} className="rounded-lg border border-card-border bg-surface p-4 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-accent text-sm">{suit}</span>
                    <span className="text-xs font-semibold text-foreground">{label}</span>
                  </div>
                  <p className="text-xs text-muted leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-card-border bg-card-bg p-6 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">The Vision</h2>
            <div className="space-y-3">
              {[
                { n: '01', text: 'Run your personality agent through a structured evaluation suite' },
                { n: '02', text: 'Compare against Crux\'s built-in personas and community submissions' },
                { n: '03', text: 'Get a score breakdown: belief fidelity, reasoning style, epistemic calibration' },
                { n: '04', text: 'Publish your persona to the public database for others to use' },
              ].map(({ n, text }) => (
                <div key={n} className="flex gap-3 items-start">
                  <span className="text-[10px] font-mono text-accent shrink-0 mt-0.5">{n}</span>
                  <span className="text-xs text-muted leading-relaxed">{text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-card-border bg-card-bg p-6 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Open Persona Database</h2>
            <p className="text-sm text-foreground/80 leading-relaxed">
              Every benchmarked persona becomes part of a public library — structured personality contracts others can use
              to build their own debate tools, research systems, or AI applications.
            </p>
            <p className="text-xs text-muted">
              Bring your own agent. Benchmark it. Contribute it.
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="flex items-center gap-4 pt-2">
          <Link
            href="/setup"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent/90 transition-colors"
          >
            Try a debate first
            <span className="text-xs">&#8594;</span>
          </Link>
          <span className="text-xs text-muted">PersonaBench launches after CruxArena stabilises</span>
        </div>

      </div>
    </div>
  )
}
