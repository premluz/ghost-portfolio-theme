# Thinkingisfree Theme - Documentation

**Theme:** Custom Ghost portfolio with particle animations  
**Status:** Active development with refactoring in progress  
**Last Updated:** June 12, 2026

---

## 📚 Documentation Index

### Core Documentation

| Document | Purpose | Audience |
|----------|---------|----------|
| **[CODEBASE_ANALYSIS.md](./CODEBASE_ANALYSIS.md)** | Comprehensive code review covering scalability, performance, and best practices | Architects, Senior Developers |
| **[PHASE1_COMPLETE.md](./PHASE1_COMPLETE.md)** | Phase 1 completion report (dead code removal, console log cleanup) | All Developers |
| **[assets/js/DEBUG.md](./assets/js/DEBUG.md)** | Debug utility guide and best practices | All Developers |

### Technical Guides

| Document | Topic | Link |
|----------|-------|------|
| **Particle System** | Three.js particle animations with morphing | [particle-morph.hbs](./partials/particle-morph.hbs) |
| **Gradient System** | CSS-based gradient overlays (Canvas gradients disabled) | [gradient-layer.js](./assets/js/gradient-layer.js) |
| **Card Animations** | Scroll-based card entrance animations | [card-animations.js](./assets/js/card-animations.js) |
| **Dispersed Variants** | Alternative particle formation patterns | [DISPERSED_VARIANTS.md](./DISPERSED_VARIANTS.md) |
| **Gradient Systems** | Documentation of gradient architectures | [GRADIENT_SYSTEMS.md](./GRADIENT_SYSTEMS.md) |

---

## 🚀 Quick Start

### Local Development

```bash
# Navigate to Ghost directory
cd /Users/przemek/ghostthemeportfolio/ghost2

# Start Ghost (clears theme cache)
ghost start

# Open browser
open http://localhost:2369
```

### Debugging

**Enable debug output:**
1. Open `assets/js/debug.js`
2. Change `const DEBUG = false;` to `const DEBUG = true;`
3. Reload page
4. Check DevTools console for `[module-name]` prefixed messages

**Disable debug output:**
1. Set `const DEBUG = false;` in debug.js
2. Reload page

See [assets/js/DEBUG.md](./assets/js/DEBUG.md) for detailed guide.

---

## 📂 Project Structure

```
ghost2/content/themes/thinkingisfree/
├── default.hbs                          # Main template
├── index.hbs, post.hbs, etc            # Page templates
│
├── assets/
│   ├── js/
│   │   ├── debug.js                    # Debug utility (NEW)
│   │   ├── main.js                     # Main app (3991 lines → refactor target)
│   │   ├── particle-*.js               # Particle system modules
│   │   ├── card-animations.js          # Card animations
│   │   ├── gradient-layer.js           # CSS gradients
│   │   ├── modal.js, modal-data.js     # Modal system
│   │   └── [other animation modules]
│   │
│   └── css/
│       ├── main.css
│       ├── tokens.css
│       └── [style files]
│
├── partials/
│   ├── particle-morph.hbs              # Particle system initialization
│   ├── navigation.hbs
│   └── [component partials]
│
└── Documentation/
    ├── README.md                        # This file
    ├── CODEBASE_ANALYSIS.md            # Full code audit
    ├── PHASE1_COMPLETE.md              # Refactoring Phase 1
    ├── DISPERSED_VARIANTS.md           # Particle variants
    ├── GRADIENT_SYSTEMS.md             # Gradient documentation
    └── assets/js/DEBUG.md              # Debug utility guide
```

---

## 🔄 Refactoring Status

### Phase 1: Quick Wins ✅ COMPLETE
- [x] Deleted 6 dead code files (28 KB)
- [x] Commented out 150 console.log statements
- [x] Created debug.js utility
- **Status:** Production ready, 5-10% performance improvement

### Phase 2: Architecture (Planned)
- [ ] Split main.js (3991 lines) into modules
- [ ] Create InitializationManager
- [ ] Create ObserverManager
- **Expected:** 40% faster parse, easier debugging

### Phase 3: Performance (Planned)
- [ ] Pause particle animation when out of viewport
- [ ] Promise-based metadata loading
- [ ] Error handling for critical paths
- **Expected:** 20-30% CPU reduction

### Phase 4: Quality (Planned)
- [ ] JSDoc documentation
- [ ] Module README files
- [ ] Unit tests
- **Expected:** Easier maintenance

See [CODEBASE_ANALYSIS.md](./CODEBASE_ANALYSIS.md) for full roadmap.

---

## 🎨 Features

### Particle System
- **Multiple shapes:** Dispersed, Helix, Mobile, Note, Clapper, Diamond, Globe, Game
- **Morphing:** Smooth transitions between states
- **Mobile optimized:** 1500 particles vs 2000 desktop
- **Responsive:** Camera and size scaling on mobile

### Animations
- **Card entrance:** Slide-up animation on scroll
- **Particle morphing:** Particles transform when cards enter viewport
- **Hero/Statement:** Dispersed → Helix morph
- **Gradient fades:** CSS-based gradient overlays

### Performance
- Fixed canvas overlay (non-blocking)
- HDR bloom effects
- Optimized shader rendering
- Debug logging (removable)

---

## 🐛 Known Issues & Solutions

| Issue | Status | Solution |
|-------|--------|----------|
| main.js too large (3991 lines) | Known | Phase 2 refactoring planned |
| Modal data hardcoded (569 lines) | Known | Move to API/data attributes |
| Multiple observer patterns | Known | Centralize in Phase 2 |
| No error handling | Known | Add try/catch in Phase 3 |
| Magic numbers throughout | Known | Extract to CONSTANTS.js |

---

## 📊 Performance Targets

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Main bundle | 147 KB | 40 KB | Phase 2 |
| Parse time (mobile) | ~800ms | ~300ms | Phase 2 |
| Scroll FPS | 50-55 | 60 | Phase 1 ✅ |
| CPU usage (particles) | High | -20% | Phase 3 |
| Memory footprint | ~20 MB | ~10 MB | Phase 2 |

---

## 🛠️ Development Tips

### Console Debugging
```javascript
// In any JS file:
debug('module-name', 'Your message');     // Conditional log
debugWarn('module-name', 'Warning');      // Conditional warning
debugError('module-name', 'Error msg');   // Always shown
```

### Testing Particle Morphing
```javascript
// In browser console:
window.particleSystem.morphTo('mobile', 500);  // Morph to mobile shape
window.particleSystem.morphTo('helix', 500);   // Morph to helix
window.particleSystem.morphTo('dispersed', 500); // Morph to dispersed
```

### Clearing Cache
```bash
# Navigate to ghost directory
cd /Users/przemek/ghostthemeportfolio/ghost2

# Restart Ghost (clears theme cache)
ghost start
```

### Code Style
- Use `const`/`let` (not `var`)
- Wrap console calls in `if (DEBUG)` or use debug.js
- Add comments only for non-obvious WHY (not WHAT)
- Keep functions focused and testable

---

## 📋 Checklist: Adding New Features

- [ ] Use debug.js for logging (not console.log)
- [ ] Add JSDoc comments for public methods
- [ ] Handle errors with try/catch
- [ ] Test on mobile (<768px viewport)
- [ ] Test on desktop (≥1024px viewport)
- [ ] Check no console errors
- [ ] Update relevant documentation
- [ ] Add to this README if major

---

## 🔗 Related Files

### Configuration
- **Ghost config:** `/Users/przemek/ghostthemeportfolio/ghost2/config.development.json`
- **Theme settings:** Configured in Ghost admin panel
- **CSS tokens:** `assets/css/tokens.css`

### Key Templates
- **Main layout:** `default.hbs`
- **Post/article:** `post.hbs`
- **Index/listing:** `index.hbs`
- **Particles init:** `partials/particle-morph.hbs`

### Key Scripts
- **Initialization:** `assets/js/main.js`
- **Particles:** `assets/js/particle-*.js`
- **Animations:** `assets/js/*-animation.js`
- **UI:** `assets/js/modal.js`, `assets/js/gradient-layer.js`

---

## 👥 Team Notes

### Recent Work
- Disabled ScrollTrigger (causing more issues than value)
- Implemented IntersectionObserver for particle morphing
- Added mobile-specific particle scaling
- Removed console logging overhead (Phase 1)

### Next Priority
- Phase 2: Refactor main.js architecture
- Set up proper module system
- Create centralized observer manager

### Questions?
1. Check relevant documentation above
2. See [CODEBASE_ANALYSIS.md](./CODEBASE_ANALYSIS.md) for architectural decisions
3. Review [PHASE1_COMPLETE.md](./PHASE1_COMPLETE.md) for recent changes

---

## 📝 License & Credits

**Theme:** Thinkingisfree (Custom Ghost theme)  
**Portfolio:** prems.design  
**Built with:**
- Ghost (headless CMS)
- Three.js (3D particles)
- GSAP (animations)
- Handlebars (templating)

---

## 📞 Support

For issues or questions:
1. Check documentation above
2. Enable DEBUG in debug.js to see detailed logs
3. Check browser console for errors
4. Review git history for recent changes

**Last documentation update:** June 12, 2026
