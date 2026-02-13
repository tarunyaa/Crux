import { getPersona } from "@/lib/personas/loader";
import MatchClient from "@/components/MatchClient";
import Link from "next/link";

interface MatchPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ deck?: string; personas?: string; topic?: string; mode?: string; save?: string }>;
}

export default async function MatchPage({ params, searchParams }: MatchPageProps) {
  await params; // consume params (required by Next.js)
  const sp = await searchParams;

  const topic = sp.topic ? decodeURIComponent(sp.topic) : null;
  const mode = sp.mode === 'classical' ? 'classical' : sp.mode === 'graph' ? 'graph' : 'blitz';
  const save = sp.save === '1';
  const personaIdsRaw = sp.personas ?? '';
  const personaIds = personaIdsRaw
    .split(',')
    .map(id => decodeURIComponent(id.trim()))
    .filter(Boolean);

  if (!topic || personaIds.length < 2) {
    return (
      <div className="min-h-screen px-6 py-12">
        <div className="mx-auto max-w-3xl space-y-6 text-center">
          <h1 className="text-3xl font-bold">Invalid Match</h1>
          <p className="text-muted">
            Missing topic or not enough personas selected (need at least 2).
          </p>
          <Link
            href="/setup"
            className="inline-block rounded-full bg-accent px-8 py-3 text-sm font-semibold text-white transition-all hover:bg-accent/90 hover:shadow-[0_0_20px_rgba(220,38,38,0.3)]"
          >
            Return to Debate
          </Link>
        </div>
      </div>
    );
  }

  // Load persona metadata for display
  const personaMetas = await Promise.all(
    personaIds.map(async (id) => {
      const persona = await getPersona(id);
      return {
        id,
        name: persona?.name ?? id,
        picture: persona?.twitterPicture ?? '',
      };
    })
  );

  return (
    <div className="min-h-screen px-6 py-8">
      <div className="mx-auto max-w-6xl">
        <MatchClient
          topic={topic}
          personaIds={personaIds}
          personaMetas={personaMetas}
          mode={mode}
          save={save}
        />
      </div>
    </div>
  );
}
