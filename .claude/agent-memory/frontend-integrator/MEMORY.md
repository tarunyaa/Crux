# Frontend Integrator Memory

## Key Architectural Patterns

### Server/Client Split
- Page files (`app/*/page.tsx`) are async server components — load data, pass via props
- `DialogueClient.tsx` is a thin `'use client'` wrapper that receives serialized Maps and passes to the main view
- Interactive logic lives in hooks (`lib/hooks/`) and client components (`components/`)

### Dialogue Feature Files
- `components/dialogue/DialogueView.tsx` — top-level `'use client'` view; owns the hook
- `components/dialogue/ThreeColumnLayout.tsx` — the layout component (2/3 chat + 1/3 sidebar grid)
- `components/dialogue/MessageThread.tsx` — flat message list
- `components/crux/PlayingCard.tsx` — crux card; exports `PlayingCard` (toggleable) and `PlayingCardExpanded` (always-open)
- `components/crux/CruxRoom.tsx` — message thread for a single crux room
- `components/AgentPolygon.tsx` — reference SVG polygon geometry (`getVertexPositions` function)

### CSS Variables (always use these, never raw Tailwind colors)
- Backgrounds: `bg-background`, `bg-card-bg`, `bg-surface`
- Borders: `border-card-border`
- Text: `text-foreground`, `text-muted`, `text-accent`
- Bg fills: `bg-accent`, `bg-accent-dim`
- SVG inline styles: `var(--accent)`, `var(--danger)`, `var(--card-border)`, `var(--muted)`, `var(--foreground)`, `var(--card-bg)`, `var(--font-sans)`
- Never use: `gray-*`, `blue-*`, `purple-*`, `green-*`

### Compact Chat UI Conventions (confirmed working pattern)
- Avatar size: `w-6 h-6` (24px) for compact chat, `w-4 h-4` (16px) for crux room inline
- Message spacing: `space-y-1.5` (tight), `px-3 py-1` per row
- Name + timestamp in same flex row: `text-xs` name, `text-[10px]` timestamp
- Message text: `text-sm leading-snug`
- Hover highlight on message row: `hover:bg-surface rounded-md transition-colors`

### SSE Hook: `useDialogueStream`
- Returns: `messages`, `cruxCards`, `activeCruxRooms` (Map), `completedRooms` (Map), `isRunning`, `isComplete`, `error`, `start`
- `ActiveCruxRoom`: `{ roomId, question, personas: string[], messages: CruxMessage[], status: 'arguing' | 'complete' }`
- Event types: `message_posted`, `crux_room_spawning`, `crux_message`, `crux_card_posted`, `dialogue_complete`, `error`

### Layout: ThreeColumnLayout.tsx
- 2/3 chat + 1/3 sidebar grid (`lg:grid-cols-3`, chat is `lg:col-span-2`)
- Sidebar: `DialoguePolygon` first, then crux room cards (`space-y-4`)
- Crux card strip: horizontal scroll below grid (`w-64 flex-shrink-0` per card)
- Results section: `isComplete && cruxCards.length > 0`, uses `PlayingCardExpanded` stacked vertically
- Props include `personaIds: string[]` (added Feb 2026)

### DialoguePolygon (defined inline in ThreeColumnLayout.tsx — NOT a separate file)
- SVG 220x220, `outerRadius = size/2 - 40`, avatar radius 12px
- `getVertexPositions(n, cx, cy, radius)` — same as AgentPolygon.tsx
- Edges: active pair → `var(--accent)` sw=2 op=0.8; completed → `var(--card-border)` sw=1 op=0.5; none → op=0.2
- Avatar: SVG `<image>` + `<clipPath id="clip-{id}">` for img; fallback `<circle>` + `<text>` initial
- Active speaker glow: `<circle r={16} fill="var(--accent)" opacity={0.2}` behind avatar
- Pair key: `[a, b].sort().join('::')` for canonical ordering
- Wrap: `rounded-xl border border-card-border bg-surface p-4` + label `text-xs font-semibold uppercase tracking-wider text-accent`

### PlayingCard Patterns
- Suit array `['♠','♥','♦','♣']`, colors `['text-foreground','text-accent','text-accent','text-foreground']`
- Collapsed: card div `rounded-lg border border-card-border bg-card-bg hover:border-accent hover:shadow-[0_0_8px_rgba(220,38,38,0.15)] transition-all cursor-pointer p-3`
  - Top row: suit `text-base font-bold` + type badge (border pill `text-[10px]`) + resolved `ml-auto`
  - Question: `text-xs font-medium text-foreground leading-snug line-clamp-2 mb-2.5`
  - Personas: first-name + position; YES=`text-foreground`, NO=`text-accent`, NUANCED=`text-muted`
- Expanded: `rounded-lg border border-accent bg-card-bg p-3 shadow-[0_0_12px_rgba(220,38,38,0.15)]`
- `ExpandedDetail` is an internal helper shared by both `PlayingCard` and `PlayingCardExpanded`
- `PlayingCardExpanded` — always-expanded, no onClick — call without `onCollapse` prop

### Full-Page Pitch Deck Pattern (whitepaper/page.tsx)
- Use `'use client'` when IntersectionObserver is needed for a fixed slide nav
- Each slide: `<section id="...">` with `min-h-screen flex flex-col justify-center`
- Slide nav: `fixed right-5 top-1/2 -translate-y-1/2 z-40` with dots; `hidden lg:flex flex-col gap-3`
- Active dot: `w-2 h-2 bg-accent rounded-full`; inactive: `w-1.5 h-1.5 bg-muted`
- IntersectionObserver threshold 0.4 — pick entry with highest `intersectionRatio` among intersecting
- Fluid type scale with `text-[clamp(2rem,4vw,3.5rem)]` for responsive headlines
- `card-3d` + `card-inner` + `card-face` classes available for 3D card tilt effect
- Background alternation: `bg-background` → `bg-card-bg` → `bg-surface` across slides
- Section divider pattern: `border-t border-card-border` on each slide after the first
- Eyebrow label: `text-xs font-semibold uppercase tracking-[0.2em] text-accent mb-4`

## Build Notes
- Run from `faultline/` subdirectory: `npm run build`
- Cygwin: use Windows-style `C:/...` paths in `cd`
- Deprecation warning about `middleware` is benign
- Build must be TypeScript-error-free before finishing
- Pre-existing TS error in `lib/dialogue/disagreement-detector.ts` was missing `shortLabel` in return type (fixed: added to the return type annotation on line 124)
