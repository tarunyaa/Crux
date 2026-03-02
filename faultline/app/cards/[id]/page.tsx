import Link from "next/link";
import { getPersona, loadContract, loadBeliefGraph } from "@/lib/personas/loader";
import { notFound } from "next/navigation";
import type { PersonaContract } from "@/lib/types";
import HexAvatar from "@/components/HexAvatar";
import SuitIcon from "@/components/SuitIcon";
import { BeliefGraphSection } from "@/components/belief-graph/BeliefGraphSection";

interface CardDetailPageProps {
  params: Promise<{ id: string }>;
}

function firstSentence(text: string): string {
  const match = text.match(/^.+?[.!?](?:\s|$)/);
  return match ? match[0].trim() : text.slice(0, 120) + (text.length > 120 ? "..." : "");
}

const DIMENSIONS: { key: keyof PersonaContract; label: string; suit: 'spade' | 'heart' | 'diamond' | 'club' }[] = [
  { key: "personality", label: "Personality", suit: "spade" },
  { key: "bias", label: "Bias & Blind Spots", suit: "heart" },
  { key: "stakes", label: "Stakes & Incentives", suit: "diamond" },
  { key: "epistemology", label: "Epistemology", suit: "club" },
  { key: "timeHorizon", label: "Time Horizon", suit: "spade" },
  { key: "flipConditions", label: "Flip Conditions", suit: "heart" },
];

export default async function CardDetailPage({ params }: CardDetailPageProps) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);
  const persona = await getPersona(decodedId);

  if (!persona) {
    notFound();
  }

  let contract: PersonaContract | null = null;
  try {
    contract = await loadContract(decodedId);
  } catch {
    // Contract not available
  }

  const beliefGraph = await loadBeliefGraph(decodedId);

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-2xl space-y-8 animate-fade-in">
        <Link href="/cards" className="text-muted hover:text-foreground text-sm transition-colors">
          &larr; Decks
        </Link>

        <div className="rounded-xl border border-card-border bg-card-bg p-8 space-y-6 card-shadow">
          {/* Header */}
          <div className="flex items-center gap-5">
            <HexAvatar
              src={persona.twitterPicture || undefined}
              alt={persona.name}
              size={72}
              fallbackInitial={persona.name.charAt(0)}
            />
            <div>
              <h1 className="text-2xl font-bold">{persona.name}</h1>
              {persona.twitterHandle && (
                <p className="text-muted text-sm">{persona.twitterHandle}</p>
              )}
            </div>
          </div>

          {/* Contract dimensions */}
          {contract ? (
            <div className="space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
                Contract Dimensions
              </h2>
              {DIMENSIONS.map(({ key, label, suit }) => {
                const value = contract[key];
                if (typeof value !== "string") return null;
                return (
                  <div key={key} className="space-y-1">
                    <h3 className="text-sm font-medium text-accent flex items-center gap-1.5">
                      <SuitIcon suit={suit} className="text-xs" />
                      {label}
                    </h3>
                    <p className="text-sm text-foreground/80">
                      {firstSentence(value)}
                    </p>
                  </div>
                );
              })}

              {/* Anchor excerpts */}
              {contract.anchorExcerpts.length > 0 && (
                <div className="space-y-2 pt-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Anchor Quotes ({contract.anchorExcerpts.length})
                  </h3>
                  {contract.anchorExcerpts.slice(0, 3).map((excerpt) => (
                    <blockquote
                      key={excerpt.id}
                      className="border-l-2 border-accent pl-3 text-sm text-foreground/70 italic"
                    >
                      &ldquo;{excerpt.content.slice(0, 150)}
                      {excerpt.content.length > 150 ? "..." : ""}&rdquo;
                      <span className="block text-xs text-muted mt-1 not-italic">
                        — {excerpt.source}
                      </span>
                    </blockquote>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted text-sm">
              No contract data available for this persona.
            </p>
          )}
        </div>

        {/* Belief Graph */}
        {beliefGraph && beliefGraph.nodes.length > 0 && (
          <div className="rounded-xl border border-card-border bg-card-bg p-8 card-shadow">
            <BeliefGraphSection graph={beliefGraph} />
          </div>
        )}
      </div>
    </div>
  );
}
