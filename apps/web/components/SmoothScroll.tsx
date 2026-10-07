"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

let lenis: Lenis | null = null;

/* One smooth-scroll loop for the whole site. Lenis eases wheel input; GSAP's ticker drives it, so ScrollTrigger
   scenes read the same smoothed position on the same frame (scenes then scrub with no extra lag of their own).
   Touch keeps native scrolling; reduced motion keeps native scrolling everywhere. */
export default function SmoothScroll() {
  const path = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    lenis = new Lenis({
      lerp: 0.1,
      wheelMultiplier: 1,
      anchors: { offset: -88 },
      allowNestedScroll: true, // tables, logs and dialogs keep their own scrolling
      prevent: (node) => !!node.closest("[data-lenis-prevent], [role='dialog']"),
    });
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (t: number) => lenis?.raf(t * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => { gsap.ticker.remove(tick); lenis?.destroy(); lenis = null; };
  }, []);

  // a new page has a new height. Next already scrolls (or restores) natively and Lenis follows native scrolls; re-measure only.
  useEffect(() => { lenis?.resize(); }, [path]);

  return null;
}
