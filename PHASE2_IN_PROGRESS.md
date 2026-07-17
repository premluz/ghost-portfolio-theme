# Phase 2: Architecture Refactoring - IN PROGRESS

**Status:** Foundation complete, main.js refactoring in progress  
**Date Started:** June 12, 2026

---

## ✅ Completed

### 1. CONSTANTS.js
- Extracted all magic numbers
- Organized into logical groups (DEVICE, TIMINGS, ANIMATIONS, etc.)
- Single source of truth for configuration
- **Impact:** Easy to tweak settings in one place

**Usage:**
```javascript
import { TIMINGS, DEVICE, ANIMATIONS } from './CONSTANTS.js';

const isMobile = window.innerWidth < DEVICE.MOBILE_BREAKPOINT;
const delay = TIMINGS.METADATA_POLL_INTERVAL;
```

---

### 2. InitializationManager.js
- Dependency-based module initialization
- Prevents race conditions
- Topological sort for correct init order
- Performance timing built-in

**Usage:**
```javascript
const initManager = new InitializationManager();

initManager.register('particles', [], () => initParticles());
initManager.register('cards', ['particles'], () => initCards());

await initManager.initialize();
initManager.printReport(); // See timings
```

---

### 3. ObserverManager.js
- Centralized IntersectionObserver management
- Prevents duplicate observers
- Memory leak protection
- Easy reobserve on DOM changes

**Usage:**
```javascript
const observerMgr = new ObserverManager();

observerMgr.createObserver('hero', '.home', (entry) => {
  if (entry.isIntersecting) {
    particles.fadeIn();
  }
}, { threshold: 0.5 });
```

---

## 🚀 In Progress

### main.js Refactoring
**Current:** 3991 lines, monolithic  
**Target:** Split into focused modules

**Modules to Create:**
- [ ] `modules/metadata.js` (Post metadata fetching)
- [ ] `modules/navigation.js` (Scroll, hash handling, nav behavior)
- [ ] `modules/theme.js` (Theme toggle, localStorage)
- [ ] `modules/scroll-progress.js` (Progress bar)
- [ ] `modules/animations/heading-animation.js` (H1/H2/H3 animations)
- [ ] `modules/animations/word-animation.js` (Word animations)
- [ ] `modules/ui/modal.js` (Modal initialization)
- [ ] `modules/ui/tooltip.js` (Tooltip system)
- [ ] `modules/ui/customscrollbar.js` (Custom scrollbar)
- [ ] `core/init-sequence.js` (Coordinator)

---

## 📋 Refactoring Checklist

### Phase 2a: Simple Modules (Day 1)
- [ ] Extract CONSTANTS usage into files
- [ ] Create metadata.js module
- [ ] Create theme.js module
- [ ] Create scroll-progress.js module

### Phase 2b: Complex Modules (Day 2)
- [ ] Create heading-animation.js
- [ ] Create word-animation.js
- [ ] Create navigation.js

### Phase 2c: UI Modules (Day 2-3)
- [ ] Create modal.js
- [ ] Create tooltip.js
- [ ] Create customscrollbar.js

### Phase 2d: Integration (Day 3)
- [ ] Create init-sequence.js coordinator
- [ ] Wire up InitializationManager
- [ ] Update default.hbs
- [ ] Test all functionality
- [ ] Update main.js to minimal coordinator

---

## 📊 Expected Results

### Code Metrics
| Metric | Before | After | Gain |
|--------|--------|-------|------|
| main.js | 3991 lines | 300 lines | -92% |
| main.js size | 147 KB | 15 KB | -90% |
| Total modules | 1 | 12+ | +1100% |
| Parse time | ~800ms | ~300ms | -60% |

### Architecture Benefits
- ✅ Each module has single responsibility
- ✅ Easy to test in isolation
- ✅ Reusable across projects
- ✅ Dependency tracking
- ✅ Clear init sequence
- ✅ Memory management
- ✅ Error isolation

---

## 🏗️ Module Structure

```
assets/js/
├── CONSTANTS.js                     # Single source of truth
├── managers/
│   ├── InitializationManager.js     # Dependency-based init
│   └── ObserverManager.js           # Observer lifecycle
│
├── core/
│   └── init-sequence.js             # Main coordinator
│
└── modules/
    ├── metadata.js                  # Post metadata
    ├── theme.js                     # Theme toggling
    ├── scroll-progress.js           # Scroll bar
    ├── navigation.js                # Scroll behavior
    ├── animations/
    │   ├── heading-animation.js
    │   └── word-animation.js
    └── ui/
        ├── modal.js
        ├── tooltip.js
        └── customscrollbar.js
```

---

## 🔄 How It Works

### Old Flow (main.js monolith)
```
DOM Load → main.js (3991 lines) → All functions → Initialization
             ↓
          Hard to debug, test, maintain
```

### New Flow (modular + manager)
```
DOM Load → InitializationManager
             ↓
         Register modules with dependencies
             ↓
         Initialize in correct order:
          1. metadata (no deps)
          2. theme (no deps)
          3. particles (no deps)
          4. cards (depends on particles)
          5. animations (depends on DOM)
             ↓
         Each module encapsulated
         Easy to debug, test, reuse
```

---

## 🔧 Next Immediate Steps

1. **Extract metadata.js** from main.js
   - Move `fetchPostsByTag()`
   - Move `initPostCardMetadata()`
   - Move metadata constants

2. **Extract theme.js** from main.js
   - Move `initThemeToggle()`
   - Move `getTheme()` / `setTheme()`
   - Move localStorage logic

3. **Register with InitializationManager**
   - Register metadata module (no deps)
   - Register theme module (no deps)
   - Create simple init-sequence.js

4. **Test integration**
   - Verify all functions work
   - Check no console errors
   - Verify timings improved

---

## 📝 Notes

- **Backwards Compatibility:** All exported functions will be available globally for now
- **Timeline:** Phase 2 = 3 days to complete
- **Testing:** Run after each module extraction
- **Rollback:** main.js.backup exists if needed

---

## 📚 Documentation

See main README for:
- CODEBASE_ANALYSIS.md (full roadmap)
- PHASE1_COMPLETE.md (Phase 1 results)
- DEBUG.md (debug utility guide)

---

**Progress:** ████░░░░░░ 40% (Managers complete, modules pending)
