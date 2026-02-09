import { cookies } from "next/headers";
import Logo from "@/components/Logo";
import SuitIcon from "@/components/SuitIcon";
import InviteGate from "@/components/InviteGate";

export default async function LobbyPage() {
  const isAuthenticated =
    (await cookies()).get("crux-invite")?.value === "valid";

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

        {/* CTA / Invite Gate */}
        <InviteGate isAuthenticated={isAuthenticated} />
      </div>
    </div>
  );
}
