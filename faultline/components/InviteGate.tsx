"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function InviteGate({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    return (
      <Link
        href="/cards"
        className="inline-block rounded-full bg-accent px-8 py-3 text-sm font-semibold text-white transition-all hover:bg-accent/90 hover:shadow-[0_0_20px_rgba(220,38,38,0.3)]"
      >
        Play Plato&apos;s Poker
      </Link>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });

      const data = await res.json();

      if (data.valid) {
        router.refresh();
      } else {
        setError(data.error || "Invalid invite code");
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col items-center gap-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Enter invite code"
          className="rounded-full bg-card-bg border border-white/10 px-5 py-2.5 text-sm text-white placeholder:text-muted outline-none focus:border-accent/50 transition-colors w-56"
          autoFocus
        />
        <button
          type="submit"
          disabled={loading || !code.trim()}
          className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-accent/90 hover:shadow-[0_0_20px_rgba(220,38,38,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "..." : "Enter"}
        </button>
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
    </form>
  );
}
