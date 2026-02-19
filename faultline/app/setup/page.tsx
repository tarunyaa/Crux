import Link from "next/link";
import { getDecks, getPersonas, loadContract } from "@/lib/personas/loader";
import SetupClient from "@/components/SetupClient";
import SuitIcon from "@/components/SuitIcon";

export default async function SetupPage() {
  const [decks, personas] = await Promise.all([getDecks(), getPersonas()]);

  const personaInfos = await Promise.all(
    personas.map(async (p) => {
      let hasContract = false;
      try {
        await loadContract(p.id);
        hasContract = true;
      } catch {
        // no contract
      }
      return {
        id: p.id,
        name: p.name,
        handle: p.twitterHandle,
        picture: p.twitterPicture,
        hasContract,
      };
    })
  );

  const deckInfos = decks.map((d) => ({
    id: d.id,
    name: d.name,
    personaIds: d.personaIds,
  }));

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5 mb-1">
              <SuitIcon suit="spade" className="text-xs" />
              Debate
            </span>
            <h1 className="text-3xl font-bold tracking-tight">Build Your Hand</h1>
          </div>
          <Link
            href="/setup/create"
            className="rounded-lg border border-card-border bg-surface px-4 py-2 text-sm text-muted hover:text-foreground hover:border-muted transition-colors"
          >
            + Create Deck
          </Link>
        </div>

        <SetupClient decks={deckInfos} personas={personaInfos} />
      </div>
    </div>
  );
}
