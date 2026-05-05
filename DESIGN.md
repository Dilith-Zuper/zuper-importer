# Zuper Internal Tools — Design Language

This document defines the visual and interaction language for all internal tools built on this stack. Follow it so every tool feels like it came from the same place.

---

## Principles

- **Warm, not cold.** Off-white backgrounds, warm gray borders. Never pure white pages or stark gray.
- **Flat with weight.** No shadows on cards. Use border weight, color fills, and left/top accents to create hierarchy instead.
- **Orange is action.** Orange-500 is the only primary interactive color. Everything else defers to it.
- **Big text, tight pages.** Page headings are extrabold and large. Content is constrained to a readable max-width.
- **No emojis.** Use inline SVG icons only.

---

## Color Palette

### Surfaces
| Token | Hex | Use |
|-------|-----|-----|
| Page background | `#FAF9F7` | `min-h-screen bg-[#FAF9F7]` |
| Card / panel | `#FFFFFF` | All cards, inputs, modals |
| Subtle alternate | `#F5F3F0` | Alternating rows, section headers |
| Border | `#E5E2DC` | All card and input borders |

### Text
| Token | Class | Use |
|-------|-------|-----|
| Primary | `text-[#1A1A1A]` | Headings, important values |
| Body | `text-gray-500` | Descriptions, helper text |
| Muted | `text-gray-400` | Timestamps, counts, secondary labels |
| Disabled | `text-gray-300` | Placeholder text |

### Brand / Primary
| Token | Class | Use |
|-------|-------|-----|
| Primary | `text-orange-500` / `bg-orange-500` | `#F97316` — CTAs, active states, progress |
| Primary hover | `bg-orange-600` | Hover on primary buttons |
| Primary light | `bg-orange-50` | Selected card backgrounds, badges |
| Primary text on light | `text-orange-600` | Badge text on orange-50 |
| Primary dark | `text-orange-700` | Bold text on selected cards |

### Semantic
| State | Background | Text | Badge bg | Badge text |
|-------|-----------|------|----------|-----------|
| Success | `bg-green-500` | `text-green-600` | `bg-green-50` | `text-green-700` |
| Error | `bg-red-500` | `text-red-600` | `bg-red-50` | `text-red-600` |
| Warning | — | `text-amber-600` | `bg-amber-50` | `text-amber-700` |
| Info | — | `text-blue-700` | `bg-blue-50` | `text-blue-700` |
| Pending | — | `text-gray-400` | — | — |

### Dark surfaces
| Token | Hex | Use |
|-------|-----|-----|
| Dark background | `#1A1A1A` | Toasts, dark panels, guide footer |
| Terminal background | `#1C1917` | Log terminals, code blocks |
| Terminal success | `text-orange-400` | Success lines in terminals |
| Terminal error | `text-red-400` | Error lines in terminals |

---

## Typography

### Scale
| Role | Class | Example use |
|------|-------|-------------|
| Hero heading | `text-[36px] font-extrabold text-[#1A1A1A] leading-tight` | Page H1 |
| Large heading | `text-[32px] font-extrabold text-[#1A1A1A] leading-tight` | Step headings |
| XL number | `text-[40px] font-extrabold text-[#1A1A1A] leading-tight` | Completion screens |
| Section heading | `text-[17px] font-extrabold text-[#1A1A1A] leading-snug` | Panel titles |
| Card title | `text-lg font-bold text-gray-900` | Card headers |
| Body | `text-sm text-gray-500 leading-relaxed` | Descriptions |
| Small | `text-xs text-gray-400` | Counts, timestamps, hints |
| Eyebrow / label | `text-[11px] font-bold uppercase tracking-widest text-gray-400` | Section labels |
| Field label | `text-xs font-semibold text-gray-500 uppercase tracking-wide` | Input labels |
| Badge | `text-xs font-semibold` | Pill badges |
| Mono / terminal | `font-[family-name:var(--font-geist-mono)] text-xs` | Logs, code |

### Rules
- Headings are always sentence case, never all-caps.
- Labels above inputs are `UPPERCASE` with `tracking-wide` — the only place all-caps is used.
- Large numbers always use `.toLocaleString()` (e.g. `1,234` not `1234`).
- Forward navigation buttons always end with ` →`. Back links start with `← `.

---

## Spacing & Layout

### Page layout
```
min-h-screen bg-[#FAF9F7]
  header h-16 bg-white border-b border-[#E5E2DC]
    max-w-[760px] mx-auto px-6
  main max-w-[760px] mx-auto px-6 py-12
    space-y-6 or space-y-8
```

### Max widths
| Context | Class |
|---------|-------|
| Main content | `max-w-[760px]` |
| Narrow forms (connect, done screens) | `max-w-md` |
| Slide-in panel | `w-80` (320px) |

### Card padding
| Size | Class | Use |
|------|-------|-----|
| Standard | `p-5` | Most cards |
| Generous | `p-6` | Stats card, featured card |
| Tight | `p-4` | Compact cards, list items |
| Input container | `px-5 py-4` | Form field containers |

### Vertical rhythm
| Context | Class |
|---------|-------|
| Page sections | `space-y-8` |
| Card sections | `space-y-6` |
| Component groups | `space-y-4` |
| Tight list items | `space-y-3` or `space-y-2` |
| Inside components | `space-y-1` or `gap-1` |

---

## Border Radius

| Element | Class |
|---------|-------|
| Cards, panels, modals | `rounded-2xl` |
| Inputs, dropdowns, inner sections | `rounded-xl` |
| Tabs, smaller components | `rounded-lg` |
| Buttons (CTA) | `rounded-full` |
| Badges, pills | `rounded-full` |
| Step circles, avatars | `rounded-full` |

---

## Cards

### Standard card
```tsx
<div className="bg-white rounded-2xl border border-[#E5E2DC] p-5">
```

### Selectable card (unselected → selected)
```tsx
// Unselected
"border-2 border-[#E5E2DC] bg-white hover:border-gray-300"
// Selected
"border-2 border-orange-400 bg-orange-50"
```

### Stat card with top accent
```tsx
<div className="bg-white rounded-2xl border-t-4 border-green-400 border border-[#E5E2DC] p-4">
  <p className="text-3xl font-bold text-green-600">{value}</p>
  <p className="text-xs text-gray-500 mt-1 font-medium">{label}</p>
</div>
```
Accent colors: green (success), gray (neutral), red (error), orange (active).

### Callout / info box
```tsx
// Info
<div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-2xl px-5 py-4">
// Success
<div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4">
// Error
<div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
```

---

## Buttons

### Primary CTA (full width, pill)
```tsx
<button className="w-full h-12 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-full transition-colors text-base">
  Continue →
</button>
```

### Secondary / ghost (full width, pill)
```tsx
<button className="w-full h-12 border border-[#E5E2DC] text-gray-600 font-semibold rounded-full hover:bg-gray-50 transition-colors text-base">
  ← Back
</button>
```

### Destructive outline
```tsx
<button className="w-full h-11 border border-red-300 text-red-600 font-semibold rounded-full hover:bg-red-50 transition-colors text-sm">
```

### Text link
```tsx
<button className="text-xs font-medium text-gray-400 hover:text-orange-500 transition-colors underline underline-offset-2">
```

### Loading state (inside primary)
```tsx
{loading ? (
  <>
    <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
    Loading…
  </>
) : 'Submit →'}
```

### Small action button (inline)
```tsx
<button className="text-xs text-orange-500 hover:text-orange-600 font-semibold">
```

---

## Form Inputs

### Container-label pattern (preferred)
The label and input live inside one rounded card. The whole card highlights on focus.
```tsx
<div className="bg-white rounded-2xl border border-[#E5E2DC] px-5 py-4 space-y-1 focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100 transition-all">
  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
    Field Name
  </label>
  <input
    className="w-full text-[#1A1A1A] text-base placeholder-gray-300 focus:outline-none bg-transparent"
    placeholder="hint…"
  />
</div>
```

### Inline search input
```tsx
<input className="w-full bg-white border border-[#E5E2DC] rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-orange-400 transition-all" />
```

### Compact search (inside a card)
```tsx
<input className="w-full pl-9 pr-3 py-2 text-sm bg-[#FAF9F7] border border-[#E5E2DC] rounded-lg focus:outline-none focus:border-orange-400" />
```

---

## Badges & Pills

```tsx
// Active / primary
<span className="bg-orange-50 text-orange-600 text-xs font-semibold px-2.5 py-1 rounded-full">
// Success
<span className="bg-green-50 text-green-700 text-xs font-semibold px-2.5 py-1 rounded-full">
// Error
<span className="bg-red-50 text-red-600 text-xs font-semibold px-2.5 py-1 rounded-full">
// Neutral
<span className="bg-gray-100 text-gray-500 text-xs font-semibold px-2 py-0.5 rounded-full">
// Step badge (eyebrow style)
<span className="text-[10px] font-bold uppercase tracking-widest text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full">
```

---

## Tabs

```tsx
<div className="flex gap-1 bg-[#F5F3F0] rounded-xl p-1">
  <button className="flex-1 py-2 text-sm font-semibold rounded-lg transition-all bg-white text-orange-600 shadow-sm">
    Active tab
  </button>
  <button className="flex-1 py-2 text-sm font-semibold rounded-lg transition-all text-gray-500 hover:text-gray-700">
    Inactive tab
  </button>
</div>
```

---

## Progress & Status

### Progress bar
```tsx
<div className="h-3 bg-[#E5E2DC] rounded-full overflow-hidden">
  <div className="h-full bg-orange-500 transition-all duration-500 rounded-full" style={{ width: `${pct}%` }} />
</div>
```

### Step indicator (wizard)
- Done: `w-8 h-8 rounded-full bg-orange-500 text-white` + checkmark SVG
- Active: `w-8 h-8 rounded-full bg-white border-2 border-orange-500 text-orange-500`
- Future: `w-8 h-8 rounded-full bg-white border-2 border-gray-200 text-gray-300`
- Connector: `flex-1 h-px mx-2 bg-orange-400` (done) / `bg-gray-200` (pending)

### Checklist item (pending / running / pass / fail)
```tsx
// Running — left orange accent border
<div className="flex items-center gap-4 bg-white rounded-xl border border-l-[3px] border-l-orange-400 border-[#E5E2DC] px-5 py-4">
```
Icons: empty circle (pending), spinning orange ring (running), green filled + checkmark (pass), red filled + X (fail).

### Spinners
```tsx
// Full page
<div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
// Inline (on dark button)
<span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
```

---

## Animations & Transitions

| Effect | Class |
|--------|-------|
| Color / bg transitions | `transition-colors` |
| All properties | `transition-all` |
| Progress bar fill | `transition-all duration-500` |
| Slide-in panel | `translate-x-full` → `translate-x-0`, `duration-300 ease-in-out` |
| Toast | opacity + translate-y, `duration-300` |
| Fade backdrop | `transition-opacity duration-300` |
| Chevron rotate | `transition-transform duration-200` |

---

## Icons

- All icons are **inline SVG only**. No icon library.
- Use `stroke` (not `fill`) for UI icons: `strokeWidth={1.5}` or `2`.
- Always include `strokeLinecap="round" strokeLinejoin="round"`.
- Standard sizes: `12`, `14`, `16`, `18`, `24`, `28` px.
- Color: inherit from parent with `stroke="currentColor"` or `fill="currentColor"`.

Common patterns:
```tsx
// Checkmark
<path d="M1 4.5l3.5 3.5 6.5-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
// X / close
<path d="M2 2l14 14M16 2L2 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
// Chevron down
<path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
// Search
<path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"/>
```

---

## Overlays & Panels

### Slide-in drawer (right side)
```tsx
// Backdrop
<div className="fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 opacity-100" onClick={onClose} />
// Panel
<aside className="fixed top-0 right-0 z-50 h-full w-full sm:w-80 bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-in-out translate-x-0">
```

### Toast (bottom center)
```tsx
<div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1A1A1A] text-white rounded-2xl px-5 py-4 max-w-sm w-[calc(100vw-3rem)] shadow-xl">
```

### Terminal / log pane
```tsx
<div className="bg-[#1C1917] rounded-2xl p-4 h-52 overflow-y-auto font-[family-name:var(--font-geist-mono)] text-xs space-y-0.5">
  <div className="text-orange-400">✓ Success line</div>
  <div className="text-red-400">✗ Error line</div>
  <div className="text-gray-600">Waiting…</div>
</div>
```

---

## Header Pattern

```tsx
<header className="bg-white border-b border-[#E5E2DC] h-16 flex items-center px-6">
  <div className="w-full max-w-[760px] mx-auto flex items-center justify-between">
    {/* Left: logo | divider | app name · current page */}
    <div className="flex items-center gap-3">
      <img src="/zuper-logo.svg" className="h-7 w-auto" />
      <span className="text-[#E5E2DC]">|</span>
      <span className="text-sm font-medium text-gray-500">App Name</span>
      <span className="text-[#E5E2DC]">·</span>
      <span className="text-sm text-gray-400">Current Page</span>
    </div>
    {/* Right: actions + step badge */}
    <div className="flex items-center gap-3">
      <span className="bg-orange-50 text-orange-600 text-xs font-semibold px-3 py-1.5 rounded-full">
        Step N of N
      </span>
    </div>
  </div>
</header>
```

---

## Do / Don't

| Do | Don't |
|----|-------|
| Use `#FAF9F7` as page background | Use `bg-gray-100` or pure white for pages |
| Use `#E5E2DC` for all borders | Use `border-gray-200` or `border-gray-300` |
| Use `rounded-2xl` for cards | Use `rounded-lg` for cards |
| Use `rounded-full` for buttons | Use `rounded-md` for buttons |
| Use inline SVG for icons | Use emoji or icon libraries |
| Write headings in sentence case | Write headings in Title Case or ALL CAPS |
| Use `transition-colors` on interactive elements | Skip transitions |
| Constrain content to `max-w-[760px]` | Let content stretch full width |
| Use orange-500 as the only primary color | Add a second primary color |
| Format large numbers with `toLocaleString()` | Display raw numbers like `1234` |
| Show a spinner inside the button on load | Replace the button with a separate spinner |
