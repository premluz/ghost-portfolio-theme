# Posts-Tabs-Grid-Lab Section Setup

## Overview
A separate 3-column grid section for experimental/lab projects created from the existing posts-tabs-grid but without tabs and filtering only experimental posts.

**Key features:**
- ✅ 3-column grid layout (no tabs)
- ✅ Only shows projects tagged with `experimental`
- ✅ Uses `post-card-grid` component for consistent styling
- ✅ Responsive: 3 cols (desktop), 2 cols (tablet), 1 col (mobile)
- ✅ Includes particle morph trigger (disperse at 75% viewport entry)
- ✅ Unique class names (posts-tabs-grid-lab-*) to avoid conflicts

## Files Created

### Partials
- **`partials/posts-tabs-grid-lab.hbs`** — Main section markup
  - Pulls posts filtered to: `featured:true+tag:hash-work+tag:experimental`
  - Renders using `post-card-grid` component
  - Includes inline script for particle system morphing on scroll entry

### Styles
- **`assets/css/posts-tabs-grid-lab.css`** — Styling for lab grid section
  - `.posts-tabs-grid-lab-section` — Main section wrapper with padding
  - `.posts-tabs-grid-lab-wrapper` — Content container with padding
  - `.posts-grid-lab-cards` — 3-column grid layout
  - Grid card styling inherited from post-card-grid component
  - Responsive breakpoints (1440px, 1024px, 768px, 480px)

### Registrations
- **`default.hbs`** (line 103) — CSS file loaded
- **`index.hbs`** (line 40) — Partial included after posts-tabs-grid

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

- **Desktop (> 1024px):** 3 columns, 6rem gap
- **Tablet (768px-1024px):** 2 columns, 3rem gap
- **Mobile (< 768px):** 1 column, 2rem gap
- **Extra small (< 480px):** 1 column
- Section padding: responsive (200px desktop → 60px mobile)

## Sections Order on Home Page

```
1. Hero
2. Logos ribbon
3. Operating model
4. Posts-tabs (Featured/Experimental tabs) ← Main work section with tabs
5. Posts-tabs-grid (Grid view of all featured posts)
6. Posts-tabs-grid-lab ← NEW: 3-column grid for experimental projects only
7. Profile
8. Post-cards-lab (Alternative experimental grid with different styling)
9. Testimonials
```

## CSS Class Reference

| Class | Purpose |
|-------|---------|
| `.posts-tabs-grid-lab-section` | Main section wrapper |
| `.posts-tabs-grid-lab-wrapper` | Content container |
| `.posts-grid-lab-cards` | 3-column grid container |
| `.grid-card` | Individual card (from post-card-grid component) |

## Particle System Integration

The section includes inline JavaScript that triggers the particle system when scrolling into view:
- **Trigger:** `top 75%` of viewport
- **Morph:** `disperse` shape
- **Duration:** 400ms

This matches the particle triggers on other grid sections (posts-tabs-grid, posts-cards-lab).

## Customization

### Change grid columns
Edit `posts-tabs-grid-lab.css`:
```css
.posts-grid-lab-cards {
  grid-template-columns: repeat(3, 1fr); /* Change 3 to desired column count */
}

/* Tablet: 2 columns */
@media (max-width: 1024px) {
  .posts-grid-lab-cards {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* Mobile: 1 column */
@media (max-width: 768px) {
  .posts-grid-lab-cards {
    grid-template-columns: 1fr;
  }
}
```

### Change section spacing
Edit `posts-tabs-grid-lab.css`:
```css
.posts-tabs-grid-lab-section {
  padding: 200px 0; /* Adjust spacing */
}
```

### Change gap between cards
Edit `posts-tabs-grid-lab.css`:
```css
.posts-grid-lab-cards {
  gap: 6rem; /* Adjust spacing */
}
```

## Testing Checklist

- [ ] Create 3+ test posts tagged with `#work` + `experimental`
- [ ] Set posts to `featured: true`
- [ ] Verify posts appear in lab grid (3 columns on desktop)
- [ ] Test responsive layout (2 columns on tablet, 1 on mobile)
- [ ] Verify card animations trigger on scroll (card-reveal)
- [ ] Confirm particle morph triggers when scrolling into section (disperse at 75%)
- [ ] Verify lab section doesn't interfere with posts-tabs-grid section
- [ ] Check card styling consistency with posts-tabs-grid

## Troubleshooting

**Lab posts not showing:**
- Check post has `featured: true` set
- Check post has both `#work` and `experimental` tags
- Run `ghost start` from `/ghost2` directory to clear cache

**Grid not displaying correctly:**
- Check browser console for CSS errors
- Verify `.posts-grid-lab-cards` has `display: grid` applied
- Inspect grid template in DevTools

**Particle morphing not triggering:**
- Verify `window.particleSystem` exists (check browser console)
- Check that `gpu-morph-controller.js` is loaded
- Verify ScrollTrigger is initialized
- Check browser console for JavaScript errors

**Styling conflicts:**
- Verify unique `.posts-tabs-grid-lab-*` and `.posts-grid-lab-*` class names are used
- Check CSS file is loaded in default.hbs
- Inspect in DevTools to confirm grid rules apply
- Ensure no CSS media query overrides from other stylesheets

## Difference from posts-cards-lab

| Aspect | posts-tabs-grid-lab | posts-cards-lab |
|--------|----------------------|-----------------|
| **Source** | Duplicate of posts-tabs-grid | Duplicate of posts-cards-grid |
| **Component** | `post-card-grid` | `post-card` |
| **Tabs** | None (simplified) | None (simplified) |
| **Columns** | 3 (desktop) | 3 (desktop) |
| **Gap** | 6rem (responsive) | `var(--space-lg)` (responsive) |
| **Class prefix** | `.posts-tabs-grid-lab-*` | `.lab-*` |
| **Purpose** | Grid view of experimental projects | Card-based alternative experimental view |

## Files Summary

- **posts-tabs-grid-lab.hbs** — 50 lines
- **posts-tabs-grid-lab.css** — 141 lines
- No JavaScript files needed (uses inline script in partial)
- No new components needed (reuses post-card-grid)
