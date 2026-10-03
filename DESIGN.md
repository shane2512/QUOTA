# Design system: QUOTA (platform signage)

## Atmosphere
Daylight transit wayfinding. Light cool concrete ground, hard ink rules, one thick line colour. Sharp 2px corners; circles only for stations and status. Motion is a camera, not decoration.

## Colour
- Ground #e5e9ed, paper #f3f5f7, ink #0d1217, ink-2 #46515c, rule #c2c9d1
- Cobalt #1b4fd8 (the line, primary actions), Signal #e8441f / text #b82d0c (slash, violation only), Leaf #0f9d6b / text #0a6f4c (verified only), Amber #f0ad1b (deposit, pending)
- Dark surfaces (#0d1217) used for the departures board, code, and the verified readout only; the page itself never inverts.

## Type
Archivo Variable (wdth axis): display 800 at 112% width, tracking -0.035em, max 5.6rem; body 100% width. JetBrains Mono Variable for hashes, code, readouts only.

## Components
Buttons: 48px, 1.5px ink border, cobalt fill for primary, -1px press. Tables: mono 12px headers, rule dividers, no cards. Pills: mono, semantic dot. Ticks: segmented quota strips (no filled tracks).

## Motion
One authored moment: the landing camera (GSAP ScrollTrigger scrub, pin, 9 viewports) flying overview, dive, pull up, hop, dive along a code-drawn metro line. Section reveals once, expo-out, from visible default. Reduced motion: linear scrub, no zoom-out dip, no reveals.

## Do not
Eyebrow labels, section numbers, gradient text, glows, card grids, scroll cues, em dashes.
