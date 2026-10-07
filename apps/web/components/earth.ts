/* Earth textures: NASA Black Marble 2016 (night lights) and Blue Marble (day), public domain, self-hosted WebP.
   Versioned names, served with immutable caching (next.config.mjs). Kept apart from globe.ts so the landing can
   preload them without pulling three.js into the first bundle. */
export const EARTH = {
  low: { day: "/earth/day-1k.v1.webp", night: "/earth/night-1k.v1.webp" }, // ~50 KB, draws first
  high: { day: "/earth/day-2k.v1.webp", night: "/earth/night-4k.v1.webp" }, // ~430 KB, swaps in
};
