"use client";
import { useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/* One reveal for the page: elements marked data-rise lift in once, from a visible default. */
export default function Rise() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = gsap.context(() => {
      ScrollTrigger.batch("[data-rise]", {
        start: "top 88%", once: true,
        onEnter: (els) => gsap.fromTo(els, { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 0.9, ease: "expo.out", stagger: 0.08, clearProps: "transform" }),
      });
    });
    return () => ctx.revert();
  }, []);
  return null;
}
