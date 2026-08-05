# Design — tokenmaxxx

A locked design system for this app. Every page redesign reads this file before
emitting code. Do not regenerate per page — extend or amend this file when the
system needs to grow.

## Genre

modern-minimal (Cobalt register — dev-tool instrument panel, cool-white ground,
one electric cobalt signal, code/data as the hero).

## Macrostructure family

- Marketing pages: **Workbench** — the dashboard-as-guided-tour shape. Hero is a
  split diptych (statement left · live data panel right); feature copy renders
  as a hairline tabular spec sheet; the install band is the page's one dark
  graphite beat.
- App pages: **instrument-panel** — hairline tab strip, stat-led overview, the
  live ticker as the one dark graphite band, tabular mono numbers. No enrichment.

## Theme

Cobalt. Cool engineered paper, never `#fff`; ink is cool charcoal, never `#000`.
One electric cobalt signal (< 5 % of any viewport). Hairlines define every
surface — no boxed-card nesting, no drop shadows beyond a single barely-there
lift on data cards. Tight technical radii: 6 px controls, 10 px data cards.

- `--color-paper`      oklch(98.5% 0.004 250)
- `--color-paper-2`    oklch(95.8% 0.006 250)
- `--color-paper-3`    oklch(93%   0.008 250)
- `--color-ink`        oklch(24%   0.020 258)
- `--color-ink-2`      oklch(34%   0.018 257)
- `--color-neutral`    oklch(48%   0.016 255)
- `--color-muted`      oklch(41%   0.018 255)
- `--color-rule`       oklch(89%   0.010 250)
- `--color-rule-2`     oklch(78%   0.014 250)
- `--color-accent`     oklch(58%   0.20  256)
- `--color-accent-ink` oklch(99%   0.004 250)
- `--color-focus`      oklch(52%   0.19  256)
- `--color-graphite`   oklch(22%   0.016 260)
- `--color-graphite-2` oklch(28%   0.018 260)
- `--color-on-dark`       oklch(94%   0.006 260)
- `--color-on-dark-muted` oklch(72%   0.010 260)
- `--color-ok`         oklch(55%   0.13  150)
- `--color-warn`       oklch(58%   0.14  70)
- `--color-error`      oklch(55%   0.20  25)

Semantic status colours (`ok`/`warn`/`error`) are functional signals only, used
sparingly beside text/icons — never as decorative flood.

## Typography

- Display: Space Grotesk, weight 500/600, roman. Tight tracking (−0.02em).
- Body: Inter, weight 400/500.
- Mono: JetBrains Mono, weight 400/500 — labels, data, code, kbd hints.
  UPPERCASE + 0.06em tracking on eyebrows/meta/status.
- Display tracking: −0.02em to −0.035em
- Type scale anchor: `--text-display` = clamp(2.5rem, 5vw + 0.5rem, 4.75rem)
- Column-bound hero display: `--text-display-hero` = clamp(2.1rem, 3.1vw + 1rem, 3.25rem), balanced wrap (`text-wrap: balance`) so no single-word line

No italic headers anywhere. No serif anywhere. No gradient text.

## Spacing

4-point named scale, defined in `tokens.css`. Pages use named tokens
(`var(--space-md)`), never raw values.

## Motion

- Easings: `--ease-out` cubic-bezier(0.16, 1, 0.3, 1); `--ease-in`
  cubic-bezier(0.7, 0, 0.84, 0); `--ease-in-out` cubic-bezier(0.65, 0, 0.35, 1).
- Reveal pattern: one orchestrated entrance on the landing (fade + 10 px rise,
  IntersectionObserver, once). Dashboard is composed — no scroll reveals.
- Reduced-motion fallback: opacity-only, ≤ 150 ms, everything visible.

## Microinteractions stance

- Silent success. No celebratory toasts. Copy button label flips to "Copied".
- Hover delay 800 ms · focus delay 0 ms on tooltips.
- Buttons press via translateY(1px), 100 ms in / 150 ms out. CTA hover lift
  translateY(−1.5px), 200 ms. Focus rings appear instantly (2 px, cobalt,
  ≥ 3:1), never animated.
- Tab switch: underline slides 250 ms ease-out; content crossfades ≤ 150 ms.
- Live ticker flashes on a new event: border-colour only, 700 ms.

## CTA voice

- Primary CTA: solid cobalt fill, `--color-accent-ink` text, 6 px radius.
  Copy names the destination ("Self-host it", "Open dashboard").
- Secondary CTA: hairline rule border, ink text, transparent fill, 6 px radius.

## Per-page allowances

- Marketing pages MAY use Tier-A CSS art (the hero data panel is hand-built,
  sample data labelled) — never fake browser/IDE chrome.
- App pages MUST NOT use enrichment — function carries the page.

## What pages MUST share

- The wordmark: `tokenmaxxx` in Space Grotesk 600, with a cobalt `t` logomark.
- The accent colour and its placement (≤ 5 % per viewport).
- The display + body + mono fonts.
- The CTA voice (6 px radius, solid vs hairline).
- Section-head rhythm: mono UPPERCASE label stacked vertically above content.

## What pages MAY differ on

- Macrostructure within the page-type family.
- Hero archetype (within the family's allowance).
- Enrichment — only on marketing pages, only Tier-A.

## Exports

Drop-in formats for re-using this design system in other projects.

### tokens.css

```css
:root {
  --color-paper:      oklch(98.5% 0.004 250);
  --color-paper-2:    oklch(95.8% 0.006 250);
  --color-paper-3:    oklch(93%   0.008 250);
  --color-ink:        oklch(24%   0.020 258);
  --color-ink-2:      oklch(34%   0.018 257);
  --color-neutral:    oklch(48%   0.016 255);
  --color-muted:      oklch(41%   0.018 255);
  --color-rule:       oklch(89%   0.010 250);
  --color-rule-2:     oklch(78%   0.014 250);
  --color-accent:     oklch(58%   0.20  256);
  --color-accent-ink: oklch(99%   0.004 250);
  --color-focus:      oklch(52%   0.19  256);
  --color-graphite:   oklch(22%   0.016 260);
  --color-graphite-2: oklch(28%   0.018 260);
  --color-ok:         oklch(55%   0.13  150);
  --color-warn:       oklch(58%   0.14  70);
  --color-error:      oklch(55%   0.20  25);

  --font-display: "Space Grotesk", "Inter", system-ui, sans-serif;
  --font-body:    "Inter", system-ui, sans-serif;
  --font-mono:    "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;

  --space-3xs: 0.125rem; --space-2xs: 0.25rem; --space-xs: 0.5rem;
  --space-sm:  0.75rem;  --space-md:  1rem;    --space-lg: 1.5rem;
  --space-xl:  2.5rem;   --space-2xl: 4rem;    --space-3xl: 6rem;

  --text-xs: 0.6875rem; --text-sm: 0.8125rem; --text-base: 1rem;
  --text-md: 1.25rem;   --text-lg: 1.5625rem; --text-xl: 1.9531rem;
  --text-2xl: 2.4414rem; --text-3xl: 3.0518rem;
  --text-display: clamp(2.5rem, 5vw + 0.5rem, 4.75rem);

  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in:  cubic-bezier(0.7, 0, 0.84, 0);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --dur-micro: 120ms; --dur-short: 220ms; --dur-long: 420ms;

  --radius-control: 6px;
  --radius-card:    10px;
  --radius-pill:    999px;
}
```

### Tailwind v4 `@theme`

```css
@theme {
  --color-paper:      oklch(98.5% 0.004 250);
  --color-paper-2:    oklch(95.8% 0.006 250);
  --color-ink:        oklch(24%   0.020 258);
  --color-ink-2:      oklch(34%   0.018 257);
  --color-muted:      oklch(41%   0.018 255);
  --color-rule:       oklch(89%   0.010 250);
  --color-accent:     oklch(58%   0.20  256);
  --color-accent-ink: oklch(99%   0.004 250);
  --color-graphite:   oklch(22%   0.016 260);
  --font-display:     "Space Grotesk", sans-serif;
  --font-body:        "Inter", sans-serif;
  --font-mono:        "JetBrains Mono", monospace;
  --spacing-md:       1rem;
  --text-md:          1.25rem;
  --ease-out:         cubic-bezier(0.16, 1, 0.3, 1);
}
```

### DTCG `tokens.json`

```json
{
  "color": {
    "paper":      { "$value": "oklch(98.5% 0.004 250)", "$type": "color" },
    "ink":        { "$value": "oklch(24%   0.020 258)", "$type": "color" },
    "accent":     { "$value": "oklch(58%   0.20  256)", "$type": "color" },
    "accent-ink": { "$value": "oklch(99%   0.004 250)", "$type": "color" },
    "graphite":   { "$value": "oklch(22%   0.016 260)", "$type": "color" }
  },
  "font": {
    "display": { "$value": "Space Grotesk", "$type": "fontFamily" },
    "body":    { "$value": "Inter",         "$type": "fontFamily" },
    "mono":    { "$value": "JetBrains Mono", "$type": "fontFamily" }
  },
  "space": {
    "md": { "$value": "1rem", "$type": "dimension" }
  }
}
```

### shadcn/ui CSS variables

```css
:root {
  --background:        98.5% 0.004 250;   /* paper */
  --foreground:        24%   0.020 258;   /* ink */
  --primary:           58%   0.20  256;   /* accent */
  --primary-foreground: 99%  0.004 250;   /* accent-ink */
  --muted:             41%   0.018 255;   /* muted */
  --muted-foreground:  48%   0.016 255;   /* neutral */
  --border:            89%   0.010 250;   /* rule */
  --input:             78%   0.014 250;   /* rule-2 */
  --ring:              52%   0.19  256;   /* focus */
  --radius:            6px;
}
```
