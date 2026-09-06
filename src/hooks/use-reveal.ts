import { useEffect } from "react";

/**
 * Adds data-visible="true" to every [data-reveal] element once it scrolls into
 * view. One shared IntersectionObserver — no scroll handlers, no re-renders.
 */
export function useReveal(deps: unknown[] = []) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!("IntersectionObserver" in window)) {
      nodes.forEach((n) => n.setAttribute("data-visible", "true"));
      return;
    }
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
    return () => io.disconnect();
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
