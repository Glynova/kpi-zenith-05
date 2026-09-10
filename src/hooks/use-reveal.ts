import { useEffect, useLayoutEffect } from "react";

/**
 * Adds data-visible="true" to every [data-reveal] element once it scrolls into
 * view. One shared IntersectionObserver — no scroll handlers, no re-renders.
 */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function useReveal(deps: unknown[] = []) {
  // Layout effect: the hidden state is applied before paint, so nothing flashes.
  useIsomorphicLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const revealAll = () => nodes.forEach((n) => n.setAttribute("data-visible", "true"));

    if (!("IntersectionObserver" in window)) {
      revealAll();
      return;
    }
    // Only now is it safe to hide un-revealed content.
    root.classList.add("reveal-ready");

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).setAttribute("data-visible", "true");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
    );
    nodes.forEach((n) => io.observe(n));

    // Safety net: nothing may stay hidden, whatever the observer does.
    const safety = window.setTimeout(revealAll, 1500);
    return () => {
      window.clearTimeout(safety);
      io.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** True when the visitor prefers reduced motion or is on a coarse pointer. */
export function useStaticMotion() {
  if (typeof window === "undefined") return true;
  return (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    !window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );
}
