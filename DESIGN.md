# Design system: QUOTA (night side)

## Atmosphere
Cinematic and quiet. A near-black ground, silver ink, one night-side earth. Pill controls, soft 12px panels. Motion is a camera, not decoration. The landing story is dark; the editorial sections after it sit on light paper; consoles, demo and docs are dark.

## Colour
- Dark ground #0a0b0b, panel #121415, ink #ececeb, ink-2 #a5a9a8, ink-3 #737877, rule #26292b
- Light paper (`.light` scope re-maps the same tokens): ground #e5e8e6, ink #121414, rule #c3c8c6
- Colour only carries meaning: Leaf #3fd39a verified, Signal #ff6a45 slash / violation, Amber #f2b632 pending, soft cobalt #9db6ff for links and focus
- The departures board and code blocks stay dark on either ground.

## Type
Inter Tight (next/font): display and section heads uppercase, weight 500, tracking -0.015em, line-height 0.98. Body 400. JetBrains Mono Variable for hashes, labels, code and readouts only.

## Components
Buttons are pills: primary is the bright pill (light on dark, ink on paper), secondary is a dark pill. Nav is three floating solid pieces (mark, link capsule, primary CTA). Stats sit in quiet panels; tables use mono uppercase headers and hairline rules. Status pills carry a semantic dot.

## Motion
One authored moment: the landing story (GSAP ScrollTrigger, scrub 0.8, 9 viewports, sticky stage). Earth rises under the headline, sinks into the dark; the stake coin appears edge-on as a line of light, turns to show the secret line, then the mark, while a wall of anonymous request tickets wraps around it. Transforms and opacity only; paint work runs on the timeline update; the globe renders only while visible. Reduced motion: no intro, no float, no pointer tilt.

## Do not
Glows on UI chrome, gradient text, card grids for marketing copy, scroll cues, em dashes, backdrop blur over the WebGL canvas.
