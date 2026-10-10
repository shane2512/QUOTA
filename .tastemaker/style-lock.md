# QUOTA style lock

Source of truth for the full system: `DESIGN.md`. This file records only the rules later passes must not re-derive.

- **Mood:** premium / technical, night side. Reference: Moto (Awwwards SOTD); the static prototype was removed from the repo once the real site replaced it.
- **Ground:** dark `#0a0b0b`; light paper `#e5e8e6` via the `.light` scope for editorial sections only.
- **Colour carries meaning only:** leaf = verified, signal = slash/violation, amber = pending. No decorative accent.
- **Type:** Archivo expanded (`--f-display`, 600, `font-stretch` 116–118%, uppercase) for every heading tier; Inter Tight body; JetBrains Mono for data, labels, code only. Three families, no more.
- **Scale:** hero title `min(5vw, 8.4vh)`; section heads cap at ~60% of it (`.h2` max 2.6rem); console/docs h1 max 3.2rem.
- **Controls:** pill buttons; primary = bright pill, secondary = dark pill. Hover changes colour/edge only (no scale); press scales 0.98. UI transitions ≤ 200ms.
- **States:** skeletons (`.skel`) while loading, `.state` block when a source is unavailable, `.notice` bars for operator results.
- **Show, don't tell:** a concept gets an artifact (`StopArt`) or an interactive (`Shamir`, demo) before it gets a paragraph. Roles stay in the original layout (`.cast`: four text blocks, 2×2, rule on top), by the owner's choice; boxed cards and a flow diagram were both rejected.
- **Motion:** one authored scene (landing story, Lenis + GSAP scrub); elsewhere reveals only. Transforms and opacity only.
- **Do not:** hover-scale on everything, glows on chrome, gradient text, backdrop blur over WebGL, a fourth font family.
