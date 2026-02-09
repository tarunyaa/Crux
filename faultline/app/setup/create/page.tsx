import Link from "next/link";
import SuitIcon from "@/components/SuitIcon";
import CreateDeckClient from "@/components/CreateDeckClient";

export default function CreateDeckPage() {
  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5 mb-1">
              <SuitIcon suit="diamond" className="text-xs" />
              Create Deck
            </span>
            <h1 className="text-3xl font-bold tracking-tight">Build a New Deck</h1>
          </div>
          <Link href="/setup" className="text-muted hover:text-foreground text-sm transition-colors">
            &larr; Debate
          </Link>
        </div>

        <CreateDeckClient />
      </div>
    </div>
  );
}
