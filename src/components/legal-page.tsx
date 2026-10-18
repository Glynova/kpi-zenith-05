import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { BrandIdentity } from "@/components/brand-logo";

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

/**
 * Shared layout for public legal pages (/terms, /privacy).
 * Dark navy scene + gold accents, matching the landing page branding.
 */
export function LegalPage({
  title,
  effectiveDate,
  version,
  intro,
  sections,
}: {
  title: string;
  effectiveDate: string;
  version: string;
  intro: ReactNode;
  sections: LegalSection[];
}) {
  return (
    <div className="brand-navy-scene min-h-screen overflow-x-clip">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[oklch(0.13_0.03_264)]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-4 sm:px-6">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <BrandIdentity inverse />
          </Link>
          <Link
            to="/auth"
            className="shrink-0 rounded-lg px-3 py-2 text-sm text-white/65 transition-colors hover:text-white"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-14 sm:px-6 sm:py-20">
        <p className="text-[11px] uppercase tracking-[0.24em] text-gold">Legal</p>
        <h1 className="mt-4 font-display text-3xl font-semibold text-white sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 text-xs text-white/45">
          Version {version} · Effective {effectiveDate}
        </p>

        <div className="mt-8 space-y-4 text-sm leading-relaxed text-white/65 sm:text-base">
          {intro}
        </div>

        <nav
          aria-label="On this page"
          className="glass-panel mt-10 grid gap-1.5 p-5 sm:grid-cols-2"
        >
          {sections.map((s, i) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-lg px-2 py-1.5 text-sm text-white/60 transition-colors hover:bg-white/5 hover:text-white"
            >
              {i + 1}. {s.title}
            </a>
          ))}
        </nav>

        <div className="mt-12 space-y-10">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <h2 className="font-display text-xl font-semibold text-white sm:text-2xl">
                {i + 1}. {s.title}
              </h2>
              <div className="mt-4 space-y-4 text-sm leading-relaxed text-white/65 sm:text-base">
                {s.body}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-14 flex flex-wrap gap-4 border-t border-white/10 pt-8 text-sm">
          <Link to="/terms" className="text-white/60 hover:text-white">
            Terms of Service
          </Link>
          <Link to="/privacy" className="text-white/60 hover:text-white">
            Data Privacy Policy
          </Link>
          <Link to="/pricing" className="text-white/60 hover:text-white">
            Pricing
          </Link>
        </div>
      </main>

      <footer className="border-t border-white/8 px-5 py-10 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <p className="text-xs text-white/40">
            © {new Date().getFullYear()} Daraven ERP. Smarter Decisions. Better Performance.
          </p>
        </div>
      </footer>
    </div>
  );
}

/** Visually flagged placeholder for details the owner must complete. */
export function Placeholder({ children }: { children: ReactNode }) {
  return (
    <span className="rounded border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[0.85em] font-medium text-gold">
      [Owner to complete: {children}]
    </span>
  );
}
