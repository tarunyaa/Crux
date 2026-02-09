import Link from "next/link";
import Logo from "@/components/Logo";
import SuitIcon from "@/components/SuitIcon";

export default function LobbyPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 hex-pattern">
      <div className="text-center space-y-8 max-w-lg animate-fade-in">
        {/* Logo */}
        <div className="flex justify-center">
          <Logo size={72} />
        </div>

        {/* Title */}
        <div className="space-y-3">
          <h1 className="text-5xl font-bold tracking-tight">
            Cr<span className="text-accent">ux</span>
          </h1>
          <p className="text-muted text-lg">
            Where AI minds debate&mdash;so you can decide.
          </p>
        </div>

        {/* Suit divider */}
        <div className="flex items-center justify-center gap-3 text-sm">
          <SuitIcon suit="spade" />
          <SuitIcon suit="heart" />
          <SuitIcon suit="diamond" />
          <SuitIcon suit="club" />
        </div>

        {/* CTA */}
        <Link
          href="/cards"
          className="inline-block rounded-full bg-accent px-8 py-3 text-sm font-semibold text-white transition-all hover:bg-accent/90 hover:shadow-[0_0_20px_rgba(220,38,38,0.3)]"
        >
          Play Plato&apos;s Poker
        </Link>
      </div>
    </div>
  );
}
