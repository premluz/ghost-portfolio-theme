# Debug Utility Guide

**File:** `debug.js`  
**Purpose:** Centralized logging control for development and production

---

## Quick Start

### Enable Debug Output

```javascript
// In debug.js, set:
const DEBUG = true;
```

### Use in Any File

```javascript
// Import or reference the debug functions
// (They're available globally if debug.js loads first)

debug('module-name', 'Message here');
debugWarn('module-name', 'Warning message');
debugError('module-name', 'Error message');
```

### Example Output

```javascript
debug('particles', 'Initializing particle system');
// Output: [particles] Initializing particle system

debugWarn('cards', 'Card metadata missing');
// Output: [cards] ⚠️ Card metadata missing

debugError('gradient', 'Failed to load gradient');
// Output: [gradient] ❌ Failed to load gradient
```

---

## API Reference

### `debug(prefix, message)`
**Regular debug logs** - only shown when `DEBUG = true`

```javascript
debug('scroll', 'User scrolled to card');
// When DEBUG=true: [scroll] User scrolled to card
// When DEBUG=false: (silent)
```

**Parameters:**
- `prefix` (string): Module or feature name (shown in brackets)
- `message` (string): Log message

**Returns:** undefined

---

### `debugWarn(prefix, message)`
**Warning logs** - only shown when `DEBUG = true`, prefixed with ⚠️

```javascript
debugWarn('metadata', 'Polling took longer than expected');
// When DEBUG=true: [metadata] ⚠️ Polling took longer than expected
// When DEBUG=false: (silent)
```

**Parameters:**
- `prefix` (string): Module or feature name
- `message` (string): Warning message

**Returns:** undefined

---

### `debugError(prefix, message)`
**Error logs** - ALWAYS shown, even in production, prefixed with ❌

```javascript
debugError('particles', 'Failed to load GLB mesh');
// Always: [particles] ❌ Failed to load GLB mesh
```

**Parameters:**
- `prefix` (string): Module or feature name
- `message` (string): Error message

**Returns:** undefined

---

## Usage in Modules

### How to Use

**Option 1: Reference globally** (if debug.js is first script)
```javascript
// In card-animations.js
class CardAnimations {
  constructor() {
    debug('card-anim', 'Constructor called');
  }
}
```

**Option 2: Import (future ES6 modules)**
```javascript
import { debug, debugWarn, debugError } from './debug.js';

class CardAnimations {
  constructor() {
    debug('card-anim', 'Constructor called');
  }
}
```

---

## Common Patterns

### Initialization Tracking
```javascript
function initCards() {
  debug('cards', 'Starting initialization');
  
  const cards = document.querySelectorAll('.post-card');
  debug('cards', `Found ${cards.length} cards`);
  
  cards.forEach((card, i) => {
    debug('cards', `Processing card ${i}`);
  });
  
  debug('cards', 'Initialization complete');
}
```

**Output when DEBUG=true:**
```
[cards] Starting initialization
[cards] Found 5 cards
[cards] Processing card 0
[cards] Processing card 1
[cards] Processing card 2
[cards] Processing card 3
[cards] Processing card 4
[cards] Initialization complete
```

---

### Error Handling
```javascript
async function loadParticles() {
  try {
    debug('particles', 'Loading meshes...');
    await loadGLBMeshes();
    debug('particles', 'Meshes loaded successfully');
  } catch (err) {
    debugError('particles', `Failed to load: ${err.message}`);
    // Fallback behavior
  }
}
```

---

### Conditional Logging
```javascript
function updateParticles() {
  const isMobile = window.innerWidth < 768;
  
  if (isMobile) {
    debug('particles', 'Mobile mode: 1500 particles');
  } else {
    debug('particles', 'Desktop mode: 2000 particles');
  }
}
```

---

## Enabling for Production

### When You Want Debug On (Staging)

```javascript
// In debug.js:
const DEBUG = true; // Enable for staging/testing

// Commit and deploy
```

**All console outputs visible** - helps diagnose production issues

---

### When You Want Debug Off (Production)

```javascript
// In debug.js:
const DEBUG = false; // Disable for production

// All debug() and debugWarn() calls are silent
// debugError() calls still appear (critical issues)
```

**Only errors shown** - cleaner console, no debug overhead

---

## Checklist: Adding Debug Logs

When you modify a module, add debug logs using this checklist:

- [ ] Log at initialization: `debug('module', 'Initializing...')`
- [ ] Log key decisions: `debug('module', 'Branch A taken')`
- [ ] Log important state changes: `debug('module', 'State: ${state}')`
- [ ] Log errors: `debugError('module', 'Error message')`
- [ ] Log completion: `debug('module', 'Complete')`

**Example:**
```javascript
class Example {
  constructor() {
    debug('example', 'Constructor started');
    this.state = 'ready';
    debug('example', `State set to: ${this.state}`);
  }
  
  doSomething() {
    try {
      debug('example', 'doSomething() called');
      // ... work ...
      debug('example', 'doSomething() complete');
    } catch (err) {
      debugError('example', `doSomething failed: ${err.message}`);
    }
  }
}
```

---

## Performance Notes

### When DEBUG=false
- **No performance impact** - logs are completely silent
- No string concatenation overhead (not evaluated)
- No console.log() calls executed

### When DEBUG=true
- **Minimal impact** - only for development
- Useful for identifying performance bottlenecks
- Leave disabled in production

---

## Prefixes Used in Codebase

Use consistent prefixes so logs are easy to grep:

| Prefix | Module | File |
|--------|--------|------|
| `[particles]` | Particle system | particle-animation-loop.js |
| `[morph]` | Morphing system | particle-morph-system.js |
| `[cards]` | Card animations | card-animations.js |
| `[scroll]` | Scroll behavior | main.js |
| `[metadata]` | Post metadata | main.js |
| `[gradient]` | Gradient system | gradient-layer.js |
| `[nav]` | Navigation | main.js |
| `[modal]` | Modal system | modal.js |

---

## Troubleshooting

### Logs Not Showing?
1. Check `DEBUG = true` in debug.js
2. Make sure debug.js loads FIRST in page
3. Check browser DevTools console tab
4. Reload page with Ctrl+Shift+R (hard refresh)

### Too Many Logs?
1. Set `DEBUG = false` in debug.js
2. Reload page
3. Only errors (debugError) will show

### Need Logs for Specific Module?
Create a temporary debug file:
```javascript
// In your module:
const SHOW_LOGS = true;
function log(msg) {
  if (SHOW_LOGS) console.log(`[module] ${msg}`);
}
```

Then remove after debugging.

---

## Future Improvements

**Ideas for enhancing debug.js:**

```javascript
// Timestamp logging
debugWithTime('module', 'Event occurred');
// Output: [12:34:56.789] [module] Event occurred

// Performance tracking
debugStartTimer('particles', 'initialization');
// ... code ...
debugEndTimer('particles', 'initialization');
// Output: [particles] initialization took 145ms

// Log levels
setLogLevel('INFO'); // Show all
setLogLevel('WARN'); // Show warns + errors only
setLogLevel('ERROR'); // Show errors only

// Remote logging (send to server)
debugRemote('critical-error', 'This will be sent to server');
```

---

## Summary

✅ **Use debug.js to:**
- Control all console output globally
- Keep code clean (logs look professional)
- Easily toggle debug on/off
- Track initialization and state changes
- Handle errors consistently

❌ **Don't:**
- Use `console.log()` directly (use debug() instead)
- Leave `DEBUG = true` in production
- Log sensitive data (API keys, passwords)
- Log on every frame (use conditions)

