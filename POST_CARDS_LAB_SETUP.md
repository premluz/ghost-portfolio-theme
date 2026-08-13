# Post-Cards-Lab Section Setup

## Overview
A clean grid section for experimental/lab projects that exists **separate from** the featured/experimental tabs in the Work section.

**Key features:**
- ✅ Simple 3-column grid layout
- ✅ Only shows projects tagged with "experimental"
- ✅ Unique class names (lab-* prefix) to avoid CSS conflicts
- ✅ Responsive: 3 cols (desktop), 2 cols (tablet), 1 col (mobile)

## Files Created

### Partials
- **`partials/post-cards-lab.hbs`** — Main section markup
  - Custom fields for heading and subheading
  - Statement container (matching hero/profile pattern)
  - Post grid pulling only `experimental` tagged projects
  - Carousel controls and JavaScript

### Styles
- **`assets/css/post-cards-lab.css`** — Styling for lab section
  - `.lab-statement-container` — Heading area
  - `.lab-cards-grid` — Grid layout
  - `.lab-carousel-track` — Scrollable track
  - `.lab-carousel-controls` — Arrow buttons
  - Responsive breakpoints (1024px, 768px, 480px)

### Registrations
- **`default.hbs`** (line 92) — CSS file loaded
- **`index.hbs`** (line 47) — Partial included after profile section

## Post Tags Required

For projects to appear in the lab section, they must have:

1. **`featured: true`** (post publication setting)
2. **`#work`** tag (hashtag for filtering)
3. **`experimental`** tag (marks as experimental)

**Example post tags:**
```
Tags: #work, experimental
Featured: ✓ (checked)
```

### Tag Setup in Ghost

If "experimental" tag doesn't exist:
1. Go to Ghost Admin › Tags
2. Click "New tag"
3. Name: `experimental`
4. Slug: `experimental`
5. Save

## Grid Layout

- **Desktop (> 1024px):** 3 columns
- **Tablet (768px-1024px):** 2 columns
- **Mobile (< 768px):** 1 column
- Gap between cards: `var(--space-lg)` (responsive)
- Cards use standard `.post-card` component

## Sections Order on Home Page

```
1. Hero
2. Logos ribbon
3. Operating model
4. Posts-tabs (Featured/Experimental tabs) ← This is the main work section
5. Profile
6. Post-cards-lab ← NEW: Standalone experimental section
7. Testimonials
```

## CSS Class Reference

| Class | Purpose |
|-------|---------|
| `.post-cards-lab-section` | Main section wrapper |
| `.lab-cards-grid` | 3-column grid container |

## Animations

- **Cards**: Use same `.post-card` component as posts-tabs (inherits animation rules from card-animations.js)

## Customization

### Change grid columns
Edit `post-cards-lab.css`:
```css
.lab-cards-grid {
  grid-template-columns: repeat(3, 1fr); /* Change 3 to desired column count */
}

/* Tablet: 2 columns */
@media (max-width: 1024px) {
  .lab-cards-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* Mobile: 1 column */
@media (max-width: 768px) {
  .lab-cards-grid {
    grid-template-columns: 1fr;
  }
}
```

### Change section spacing
Edit `post-cards-lab.css`:
```css
.post-cards-lab-section {
  padding: var(--space-3xl) var(--content-padding); /* Adjust spacing */
}
```

### Change heading animation
Edit `post-cards-lab.hbs`:
```html
<h2 class="lab-statement-heading serif" data-animate="word">
  {{!-- Change data-animate to: "letter", "fade", or remove for manual control --}}
</h2>
```

## Testing Checklist

- [ ] Create 3+ test posts tagged with `#work` + `experimental`
- [ ] Set posts to `featured: true`
- [ ] Verify posts appear in lab grid (3 columns on desktop)
- [ ] Test responsive layout (2 columns on tablet, 1 on mobile)
- [ ] Verify card animations trigger on scroll
- [ ] Confirm lab section doesn't interfere with posts-tabs
- [ ] Check card styling consistency with main work section

## Troubleshooting

**Lab posts not showing:**
- Check post has `featured: true` set
- Check post has both `#work` and `experimental` tags
- Run `ghost restart` to clear cache

**Grid not displaying correctly:**
- Check browser console for CSS errors
- Verify `.lab-cards-grid` has `display: grid` applied
- Inspect grid template in DevTools

**Styling conflicts:**
- Verify unique `.lab-*` class names are used
- Check CSS file is loaded in default.hbs
- Inspect in DevTools to confirm grid rules apply
