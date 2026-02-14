

# Debate Engine v2 - Frontend

A clean, responsive chat interface for the Debate Engine v2.

## Features

### 🎯 **Chat-First Design**
- **Natural conversation flow** - Messages appear like a real chat
- **Phase markers** - Visual separators for each debate phase
- **Move badges** - Color-coded dialogue moves (CLAIM, CHALLENGE, CONCEDE, etc.)
- **Moderator hints** - Visible steering from the controller
- **Auto-scroll** - Automatically follows new messages
- **Responsive layout** - Works on mobile, tablet, and desktop

### 📊 **Live Insights Sidebar** (Desktop)
- **Argument Graph Stats** - IN/OUT/UNDEC counts, attack relationships
- **Concessions Trail** - Track when speakers concede points
- **Crux Proposals** - See proposed core disagreements
- **Final Results** - Regime, common ground, performance metrics

### 🎨 **Visual Elements**
- **Hex Avatars** - Persona profile pictures
- **Phase Transitions** - Clear visual breaks between debate phases
- **Color-Coded Moves**:
  - 🔵 CLAIM - Blue
  - 🔴 CHALLENGE - Red
  - 🟣 CLARIFY - Purple
  - 🟢 CONCEDE - Green
  - 🟡 REFRAME - Yellow
  - 🟠 PROPOSE_CRUX - Orange

## Usage

### Access the UI
Navigate to `/debate-v2` in your browser:
```
http://localhost:3000/debate-v2
```

### Start a Debate
1. **Enter a topic** - Any controversial statement
2. **Select 2 personas** - Click on persona cards to select
3. **Set max turns** - Adjust debate length (6-100 turns)
4. **Click "Start Debate"** - Watch the conversation unfold

### During the Debate
- **Chat area** shows the live conversation
- **Sidebar** (desktop) shows real-time insights
- **Phase markers** indicate progress through the 4 phases
- **Moderator hints** appear when the controller provides guidance
- **Auto-scroll** can be toggled if you want to review earlier messages

### After Completion
- **Results sidebar** shows final regime, crux, common ground
- **Performance metrics** - Duration, token usage
- **New Debate button** - Start over with different personas/topic

## Debate Phases

### Phase 1: Opening Statements
Each persona states their position (4-6 sentences). The crystallizer extracts initial arguments.

### Phase 2: Free Exchange
Short back-and-forth (2-4 sentences per turn). Natural dialogue with direct responses.

### Phase 3: Crux Seeking
Controller actively steers toward identifying the core disagreement. Agents use PROPOSE_CRUX moves.

### Phase 4: Resolution
Each agent summarizes what they agree on, what they disagree on, and the core unresolved question.

## API

The frontend connects to `/api/debate-v2` which streams Server-Sent Events (SSE):

```typescript
POST /api/debate-v2
{
  "topic": "Bitcoin is a good store of value",
  "personaIds": ["michael-saylor", "arthur-hayes"],
  "maxTurns": 30
}
```

### Events Streamed
- `engine_start` - Debate begins
- `phase_start` - New phase begins
- `phase_transition` - Transition between phases
- `dialogue_turn` - New message from a persona
- `steering` - Moderator provides guidance
- `crystallization` - Dialogue converted to formal arguments
- `graph_updated` - Argument graph statistics updated
- `concession` - Speaker conceded a point
- `crux_proposed` - Core disagreement identified
- `convergence_check` - Progress toward completion
- `engine_complete` - Final results ready
- `engine_error` - Error occurred

## Technical Details

### Components
- `app/debate-v2/page.tsx` - Server component that fetches personas
- `components/DebateV2Client.tsx` - Main client component with chat UI
- `lib/hooks/useDebateV2Stream.ts` - Custom hook for SSE stream handling

### State Management
All state is managed via the `useDebateV2Stream` hook:
- `transcript` - Array of dialogue turns
- `graph` - Current argument graph state
- `concessions` - List of concessions made
- `cruxProposals` - Proposed core disagreements
- `output` - Final debate results (when complete)

### Responsive Design
- **Mobile** - Single column, chat fills screen
- **Tablet** - Single column with collapsible insights
- **Desktop** - Chat (2/3) + Sidebar (1/3)

### Styling
Uses Tailwind CSS with the project's dark theme palette.

## Future Enhancements

- [ ] Argument graph visualization (interactive)
- [ ] Export debate transcript as markdown/PDF
- [ ] Share debate results via link
- [ ] Replay mode with playback controls
- [ ] Mobile-optimized insights (bottom sheet)
- [ ] Real-time typing indicators
- [ ] Debate history/archive
