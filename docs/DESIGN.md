# Design system

The look is warm and editorial: a cream page, large tight headlines, hairline rules instead of
boxes, tan tag pills, and plenty of room. Every page is built from the same tokens and primitives so
a new page or a changed flow looks like the rest without extra work.

The tokens and primitives live in `apps/web/src/styles/theme.css`, loaded after `global.css`. Page
styles live in `apps/web/src/styles/pages/<page>.css` and are imported by their page component.

## Rules

1. **Shared foundation.** Reuse the colour, radius and spacing tokens below. Use the shared type
   classes for page and section titles; component-specific type can adapt within that scale. Add
   reusable styles to `theme.css`, rather than appending another override to `global.css`.
2. **One h1 per page**, then h2 and h3 in order. Section titles use `.h2`, small titles `.h3`.
3. **Hairlines, not shadows.** Separate things with a 1px `--line` rule. A shadow is only for a
   layer that floats (menu, dialog, picker).
4. **Colour has a job.** Ink black is the primary action. Tan (`.tag`) labels a category. Green,
   amber and red appear only for results (pass, warn, fail). Yellow lives only in the logo mark.
5. **Space is part of the design.** Sections are `var(--section-gap)` apart, blocks inside a section
   `var(--block-gap)`. Do not squeeze to fit more on screen.
6. **Light theme only.** The footer is a dark band by design; nothing else is dark.
7. **Inter for text, JetBrains Mono for code and hashes.** Icons are Lucide, through
   `components/Icons.tsx`.
8. **Readable at every size.** 360px to 1920px, no horizontal scroll, no text under 12px, tap targets
   at least 40px high on touch. `pnpm ui:audit` checks overflow, text size and a 36px minimum target;
   the design aims for 40px or more.
9. **Honest copy.** Simulated results say so. Never write "safe", "certified", "secure" or
   "guaranteed". No em dashes.
10. **Motion is quiet.** 160 to 240ms, `var(--ease)`, and it stops under `prefers-reduced-motion`.

## Tokens

| Token                                             | Value                   | Use                                  |
| ------------------------------------------------- | ----------------------- | ------------------------------------ |
| `--bg`                                            | `#f9f8f4`               | Page background                      |
| `--surface`, `--surface-2`, `--surface-3`         | cream steps             | Cards, hover rows, pressed states    |
| `--line`, `--line-strong`                         | hairlines               | Rules, card borders, control borders |
| `--text`, `--text-2`, `--text-3`                  | ink, body, quiet        | Headings, paragraphs, captions       |
| `--ink`, `--paper`                                | near black, cream       | Primary button, dark band            |
| `--tag-bg`, `--tag-text`, `--tag-line`            | tan, brown              | The `.tag` pill                      |
| `--pass`, `--warn`, `--fail` (+ `-soft`, `-line`) | green, amber, red       | Results only                         |
| `--r-sm` 8, `--r-md` 12, `--r-lg` 16, `--r-xl` 24 | radii                   | Chips, controls, cards, hero panels  |
| `--max`, `--gutter`                               | 1240px, 20 to 64px      | Page width and side margins          |
| `--section-gap`, `--block-gap`                    | 88 to 168px, 40 to 72px | Vertical rhythm                      |
| `--header-h`                                      | 76px                    | Sticky header height                 |

## Type

| Class             | Size                                      | Use                         |
| ----------------- | ----------------------------------------- | --------------------------- |
| `.h1`, `.display` | 40 to 92px, weight 600, tracking -0.045em | The page title, once        |
| `.h2`             | 32 to 60px                                | Section titles              |
| `.h3`             | 20 to 24px                                | Item titles                 |
| `.lead`           | 17 to 21px, `--text-2`                    | The paragraph under a title |
| `.eyebrow`        | 12.5px, uppercase, tracked                | A small label above a title |
| body              | 17px (16px on phones)                     | Everything else             |

## Primitives

| Class                                                    | What it is                                                             |
| -------------------------------------------------------- | ---------------------------------------------------------------------- |
| `PageIntro` from `Primitives.tsx`                        | Shared page heading, category tag and lead paragraph                   |
| `.container`                                             | Centered column at `--max` with the side gutters                       |
| `.page`                                                  | Page wrapper with the top padding                                      |
| `.section`, `.section-rule`                              | A section at `--section-gap`; the second adds a hairline chapter break |
| `.split`, `.split-label`                                 | Label on the left, content on the right; one column under 900px        |
| `.tag`                                                   | Tan pill label ("Article", "TL;DR", "Modeled")                         |
| `.chip`, `.chip-pass/-warn/-fail`                        | Small outlined status pill                                             |
| `.btn .btn-primary/-secondary/-ghost`, `.btn-sm/-md/-lg` | Buttons. Use `Button` and `LinkButton` from `Primitives.tsx`           |
| `.link-arrow`                                            | Underlined text link with an arrow                                     |
| `.card`                                                  | Hairline-bordered surface                                              |
| `.callout`                                               | Bordered note with a tag on top                                        |
| `.rows`, `.row-link`                                     | Hairline list; a row can be a link that shifts on hover                |
| `.stat-row`                                              | Big numbers with a quiet caption (`dl > div > dt + dd`)                |

## A new page

```tsx
<div className="page page-example">
  <PageIntro
    className="container"
    label="Category"
    title="The page title"
    body="One sentence on what this page is for."
  />

  <section className="container section section-rule" aria-labelledby="part-title">
    <div className="split">
      <div className="split-label">
        <p className="eyebrow">Part one</p>
        <h2 className="h2" id="part-title">
          Section title
        </h2>
      </div>
      <div>{/* rows, cards, a callout */}</div>
    </div>
  </section>
</div>
```

Then add `styles/pages/example.css` for anything the primitives do not cover, using tokens only.

## Checking a change

```bash
pnpm ui:shots                 # full-page screenshots in artifacts/shots/<tag>/
pnpm ui:audit                 # every route at 7 widths: overflow, text size, tap targets, errors
pnpm ui:flows                 # alternate screens and saved-run dialogs, with a mocked wallet API
pnpm verify                   # the full gate
```

Look at the screenshots at 1440, 768 and 390 wide before calling a page done. A new route also goes
into `ROUTES` in `scripts/ui-audit.ts` and `scripts/ui-shots.ts`.
