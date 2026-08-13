# Particle System Integration with Cards & Triggers

## Overview

The particle system integrates with the card animation system through:
1. **Particle morphing triggers** — Each card triggers particle state changes
2. **Scroll-based card animations** — GSAP ScrollTrigger per card
3. **Tab switching coordination** — Re-initialization of both systems on tab change
4. **Gradient background system** — Particles layer above gradients

---

## Card System Integration

### What Was Added to Cards

#### 1. **data-cardid Attribute** (HTML)
Every work card now has a unique ID:
```html
<article class="post-card" data-cardid="mobile">
  <!-- Card content -->
</article>
```

**Cards and their IDs:**
- `mobile` → Mobile phone shape particles
- `note` → Document/note shape particles
- `clapper` → Clapper board shape particles
- `diamond` → Diamond gemstone shape particles
- `globe` → Spherical globe shape particles
- `game` → Game controller shape particles
- `defi` → No particle mapping (legacy)

#### 2. **Metadata in window.projectMetaArray** (JavaScript)
Each card's metadata is collected in `main.js`:

```javascript
window.projectMetaArray = [
  {
    cardId: 'mobile',
    title: 'Mobile Phone Project',
    gradientCss: 'linear-gradient(...)',
    // ... other metadata
  },
  // ... more cards
];
```

**Metadata captured:**
- `cardId` — Unique identifier (matches HTML data-cardid)
- `title` — Project name
- `gradientCss` — Background gradient for card
- `gradientBg` — Fallback gradient property

### Where Metadata is Created

**File**: `/assets/js/main.js`
**Lines**: ~3440-3600

```javascript
// Parse card metadata
const meta = {
  cardId: card.getAttribute('data-cardid'),
  title: card.querySelector('.post-card-title')?.textContent,
  gradientCss: getGradient(card),
  // ... other properties
};

// Store in global array
window.projectMetaArray.push(meta);

// Apply data attribute for triggering
card.setAttribute('data-cardid', meta.cardId);
```

---

## Particle Trigger System

### 1. **Viewport-Based Morphing Triggers** (particle-morph.hbs)

Registered in `particle-morph.hbs` lines 260-280:

```javascript
// Mapping of card IDs to particle shapes
const cardIdToState = {
  'mobile': 'mobile',
  'note': 'note',
  'clapper': 'clapper',
  'diamond': 'diamond',
  'globe': 'globe',
  'game': 'game'
};

// For each card in projectMetaArray
window.projectMetaArray.forEach((cardMeta, cardIdx) => {
  const cardId = cardMeta.cardId;
  const morphState = cardIdToState[cardId];
  
  if (morphState) {
    const cardElement = document.querySelector(`[data-cardid="${cardId}"]`);
    
    if (cardElement) {
      // Create IntersectionObserver for this card
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Card entered viewport → morph to card's shape
            system.handleTriggerAction({ 
              action: 'morph', 
              state: morphState, 
              duration: 1000 
            });
          } else {
            // Card left viewport → morph back to dispersed
            system.handleTriggerAction({ 
              action: 'morph', 
              state: 'dispersed', 
              duration: 1000 
            });
          }
        });
      }, { threshold: 0.1 });
      
      observer.observe(cardElement);
    }
  }
});
```

**Trigger Logic:**
- Card enters viewport (10% visible) → Morph particles to card's shape
- Card leaves viewport → Morph back to dispersed
- Smooth 1-second transition between shapes
- Independent per card (each card has its own observer)

### 2. **Card Animation Triggers** (card-animations.js)

Each card also gets scroll-based GSAP animations:

```javascript
// For each card in active tab
cards.forEach((card, index) => {
  const content = card.querySelector('.post-card-content');
  const image = card.querySelector('.post-card-image');
  
  // Create independent ScrollTrigger per card
  const tl = gsap.timeline({
    paused: true,  // Don't play automatically
    scrollTrigger: {
      trigger: card,
      start: 'top 100%',  // Trigger when card enters viewport
      end: 'bottom 10%',
      scrub: false,
      once: true,  // Only fire once
      onEnter: () => {
        console.log(`Card ${index} entered → animate`);
        tl.play();  // Play animation only on enter
      }
    }
  });
  
  // Animation: slide in from right (0.6s) + image stagger (0.6s)
  tl.fromTo(
    content,
    { x: 200 + '%', opacity: 1 },
    { x: 0, opacity: 1, duration: 0.6, ease: 'power4.out' },
    0
  )
  .fromTo(
    image,
    { x: 200 + '%', opacity: 1 },
    { x: 0, opacity: 1, duration: 0.6, ease: 'power4.out' },
    0.2  // Stagger: image starts 0.2s after content
  );
});
```

**Animation Details:**
- Content slides in from right (200%) → center (0)
- Image slides in with 0.2s delay
- Both take 0.6s total
- Only triggers when card enters viewport
- `once: true` prevents re-triggering on scroll back

---

## Tab Switching Coordination

### When User Switches Tabs

**File**: `/assets/js/main.js`
**Lines**: ~1883-1898

```javascript
// Tab button click handler
tabButtons.forEach(button => {
  button.addEventListener('click', () => {
    // ... tab content switch code ...
    
    // Re-initialize card animations (200ms after DOM update)
    setTimeout(() => {
      // Kill all existing GSAP card animation timelines
      gsap.globalTimeline.getChildren().forEach(tl => {
        if (tl.vars && tl.vars.id && tl.vars.id.includes('card')) {
          tl.kill();
        }
      });
      
      // Create new CardAnimations instance for new tab's cards
      new window.CardAnimations();
      console.log('[tabs] Re-initialized card animations for tab');
      
      // RE-REGISTER PARTICLE TRIGGERS for new cards
      if (window.reinitializeParticleTriggers) {
        window.reinitializeParticleTriggers();
        console.log('[tabs] Re-initialized particle triggers for tab');
      }
    }, 200);
  });
});
```

**What Happens on Tab Switch:**

1. **DOM Updates** — New cards appear, old cards hide
2. **Kill Old Timelines** — Remove GSAP animations from previous tab
3. **Reinitialize CardAnimations** — Create new scroll triggers for current tab's cards
4. **Reinitialize Particle Triggers** — Register new IntersectionObserver for current tab's cards
5. **ScrollTrigger.refresh()** — Recalculate all trigger positions

### Particle Trigger Re-initialization

**File**: `/partials/particle-morph.hbs`
**Lines**: ~311-312

```javascript
// Expose for re-initialization on tab switch
window.reinitializeParticleTriggers = setupCardTriggers;
```

When called, it:
1. Reads `window.projectMetaArray` (already populated)
2. Finds DOM elements with matching `data-cardid` attributes
3. Registers new IntersectionObserver for each visible card
4. Maps cardId → particle state for morphing

---

## Trigger Flow Diagram

```
User scrolls page
        ↓
Card enters viewport (10% visible)
        ↓
IntersectionObserver fires
        ↓
        ├─→ Card Animation Trigger (GSAP)
        │   └─→ Content/Image slide in animation
        │
        └─→ Particle Morph Trigger
            └─→ Particles morph to card's shape (400ms transition)

Card leaves viewport
        ↓
IntersectionObserver fires again
        ↓
        ├─→ Card Animation (continues, already visible)
        │
        └─→ Particle Morph Trigger
            └─→ Particles morph back to dispersed (500ms transition)
```

---

## Configuration Parameters

### In particle-morph.hbs (line 120-121)

```javascript
const system = new window.ParticleMorphSystem(container, {
  particleCount: 2000,      // Number of particles
  morphDuration: 500        // Morph transition time (ms)
});
```

**Current values**: 2000 particles
**Actual morph timings** (see particle-morph.hbs for code):
  - Initial helix (time-based): **600ms** (line 198)
  - Card morphs: **400ms** (line 157 + main.js line 2380)
  - Scroll-based helix & dispersed: **500ms** (lines 292, 297)
**For production**: Consider 4000-6000 particles for better coverage

### Morph Duration Reference

```javascript
// particle-morph.hbs line 157
const morphDuration = 400;  // Used for all card triggers

// particle-morph.hbs line 198
system.handleTriggerAction({ action: 'morph', state: 'helix', duration: 600 });  // Initial helix

// particle-morph.hbs lines 292, 297
system.morphTo('helix', 500);       // Scroll-based helix
system.morphTo('dispersed', 500);   // Return to dispersed
```

### In card-animations.js (line 35)

```javascript
cardStaggerDelay: 0.6,  // NOT USED for card sequencing
                        // Cards animate independently now
```

---

## Event Flow & Timing

### On Page Load

1. **particle-morph.hbs loads** (line 16 onwards)
2. **Waits for all modules** (lines 37-105)
3. **Creates ParticleMorphSystem** (line 119-122)
4. **Initializes modules async** (line 125)
5. **Starts with dispersed state** (line 132)
6. **Refreshes ScrollTrigger** (line 138, 100ms delay)
7. **Registers helix trigger** (line 187-202)
8. **Waits for projectMetaArray** (line 214-234)
9. **Registers card triggers** (line 260-281)

### On Card Scroll (Example: Mobile Card)

```
t=0ms:     Card top reaches 100% of viewport height
t=0ms:     IntersectionObserver fires with isIntersecting=true
t=1ms:     Particle morph triggered: dispersed → mobile
t=1ms:     Card animation triggered: content/image slide in
t=500ms:   Particle morph completes (dispersed fully replaced by mobile)
t=600ms:   Card animation completes (content/image fully visible)
```

### On Card Scroll Away

```
t=0ms:     Card top drops below viewport bottom
t=0ms:     IntersectionObserver fires with isIntersecting=false
t=1ms:     Particle morph triggered: mobile → dispersed
t=1ms:     Card stays visually in place (no exit animation)
t=500ms:   Particle morph completes (mobile fully replaced by dispersed)
```

---

## Data Flow Architecture

```
HTML (post-card with data-cardid)
        ↓
main.js (parse metadata)
        ↓
window.projectMetaArray
        ↓
particle-morph.hbs (setupCardTriggers)
        ↓
IntersectionObserver per card
        ↓
        ├─→ system.handleTriggerAction({ action: 'morph', state: cardId })
        │   └─→ ParticleMorphSystem.morphTo(state, 500ms)
        │
        └─→ GSAP ScrollTrigger per card
            └─→ CardAnimations timeline
```

---

## Browser Events & Listeners

### IntersectionObserver (Particle Morphing)

**Created in**: `particle-morph.hbs` lines 161-178

```javascript
const observer = new IntersectionObserver((entries) => {
  if (!observerInitComplete) return;  // Guard: skip initial load callbacks
  
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      // Card entered: trigger morph to card shape
    } else {
      // Card left: trigger morph back to dispersed
    }
  });
}, { threshold: 0.1 });

observer.observe(cardElement);
```

**Listeners per card**: 1 IntersectionObserver
**Total listeners**: 1 per card (6-7 cards visible) = ~7 active observers

### GSAP ScrollTrigger (Card Animations)

**Created in**: `card-animations.js` lines 117-127

```javascript
const tl = gsap.timeline({
  paused: true,
  scrollTrigger: {
    trigger: card,
    start: 'top 100%',
    onEnter: () => tl.play()
  }
});
```

**Listeners per card**: 1 ScrollTrigger (via GSAP)
**Total listeners**: 1 per card (6-7 cards visible) = ~7 active triggers

### Total Event Listeners

- IntersectionObserver: ~7 (particle morphing)
- GSAP ScrollTrigger: ~7 (card animations)
- Window resize: 1 (particle system)
- Window scroll: 1 (GSAP ScrollTrigger manager)
- **Total**: ~16 active listeners

---

## Debugging Tips

### Check if Triggers Registered

```javascript
// In browser console:
console.log('projectMetaArray:', window.projectMetaArray);
console.log('Cards with data-cardid:', document.querySelectorAll('[data-cardid]').length);
```

### Monitor Particle Morphing

```javascript
// Add logging in particle-morph.hbs (line 159):
system.handleTriggerAction = function(action) {
  console.log('[trigger-debug]', action);
  // ... original handler code ...
};
```

### Check Card Animation State

```javascript
// In browser console:
ScrollTrigger.getAll().forEach((trigger, i) => {
  console.log(`Trigger ${i}:`, trigger.trigger.className, trigger);
});
```

---

## Summary of Changes

| Component | Change | Purpose |
|-----------|--------|---------|
| HTML Cards | Added `data-cardid` attribute | Identify cards for triggers |
| main.js | Parse & store metadata in `window.projectMetaArray` | Link cards to particle states |
| particle-morph.hbs | Register IntersectionObserver per card | Trigger particle morphs on scroll |
| card-animations.js | Create GSAP ScrollTrigger per card | Animate card content on scroll |
| main.js (tab handler) | Re-initialize both animation systems | Maintain triggers when tabs change |
| particle-morph.hbs | Export `window.reinitializeParticleTriggers` | Allow re-registration on tab switch |

---

## Performance Notes

- **Total Listeners**: ~16 active (very low overhead)
- **Memory**: ~50KB for trigger objects + GSAP timelines
- **CPU**: Minimal — only active during scroll events
- **Optimization Done**: `once: true` on card animation triggers (only fire once, save memory)
