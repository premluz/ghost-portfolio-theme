# Modal System — Architecture & Usage

## Overview

A reusable modal system for Ghost that:

✅ Works across all pages  
✅ Supports single items or arrays with navigation  
✅ Handles keyboard (arrows, ESC), touch (swipe), mouse navigation  
✅ Smooth slide animations between items  
✅ Full-screen bottom-sheet style  
✅ Responsive (desktop & mobile)  

## Files

- `/assets/js/modal.js` — Core modal system (state, navigation, animations)
- `/assets/js/modal-data.js` — Example data structures and helper functions
- `/assets/css/modal.css` — Modal styling and responsive design
- `/default.hbs` — Includes modal CSS/JS

## Quick Start

### 1. Define Modal Data

File: `/assets/js/modal-data.js`

```javascript
const myModals = [
  {
    id: 'item-1',
    title: 'First Item',
    content: '<p>Content here...</p>'
  },
  {
    id: 'item-2',
    title: 'Second Item',
    content: '<p>More content...</p>'
  }
];
```

### 2. Open Modal from HTML

In any Handlebars template or JavaScript:

```javascript
// Open group modal (with navigation)
openModalGroup('my-group', myModals, 0);  // 0 = start at first item

// Open single modal (no navigation)
openModalSingle('my-group', myModals);
```

### 3. Wire Up Click Handlers

In JavaScript (e.g., main.js):

```javascript
// Make cards clickable
document.querySelectorAll('.testimonial-card').forEach((card, index) => {
  card.style.cursor = 'pointer';
  card.addEventListener('click', () => {
    openModalGroup('testimonials', testimonialModals, index);
  });
});
```

## Usage Examples

### Example 1: Testimonials Section

```handlebars
<!-- In about.hbs or custom-about.hbs -->
<div class="testimonials-grid">
  {{#get "posts" limit="3" filter="tag:testimonial"}}
    {{#posts}}
      <div class="testimonial-card" data-testimonial-index="{{@index}}">
        <h3>{{title}}</h3>
        <p>{{excerpt}}</p>
      </div>
    {{/posts}}
  {{/get}}
</div>

<script>
// Wire up modal clicks
document.querySelectorAll('.testimonial-card').forEach((card) => {
  card.addEventListener('click', () => {
    const index = parseInt(card.dataset.testimonialIndex);
    openModalGroup('testimonials', testimonialModals, index);
  });
});
</script>
```

### Example 2: Image Gallery Modal

```javascript
// modal-data.js
const galleryModals = [
  {
    id: 'gallery-1',
    title: 'Project A',
    content: '<img src="/images/project-a.jpg" alt="Project A">'
  },
  {
    id: 'gallery-2',
    title: 'Project B',
    content: '<img src="/images/project-b.jpg" alt="Project B">'
  }
];

// In template
<div class="gallery-grid">
  <img class="gallery-item" data-index="0" src="/images/project-a.jpg">
  <img class="gallery-item" data-index="1" src="/images/project-b.jpg">
</div>

<script>
document.querySelectorAll('.gallery-item').forEach((img) => {
  img.style.cursor = 'pointer';
  img.addEventListener('click', () => {
    const index = parseInt(img.dataset.index);
    openModalGroup('gallery', galleryModals, index);
  });
});
</script>
```

### Example 3: Single Info Modal

```javascript
const infoModals = [
  {
    id: 'about-me',
    title: 'About Me',
    content: `
      <p>Bio paragraph...</p>
      <p>Experience...</p>
    `
  }
];

// Click button to open
document.getElementById('open-about').addEventListener('click', () => {
  openModalSingle('about', infoModals);
});
```

## API Reference

### ModalSystem

Global object with the following methods:

#### `ModalSystem.openModal(type, groupId, items, initialIndex)`

Open a modal.

**Parameters:**
- `type` (string) — `'single'` or `'group'`
- `groupId` (string) — ID for the modal group (e.g., 'testimonials')
- `items` (array) — Array of modal items (see structure below)
- `initialIndex` (number, default: 0) — Which item to start on

**Example:**
```javascript
ModalSystem.openModal('group', 'testimonials', testimonialModals, 0);
```

#### `ModalSystem.closeModal()`

Close the currently open modal.

```javascript
ModalSystem.closeModal();
```

#### `ModalSystem.nextItem()`

Navigate to next item in group modal.

```javascript
ModalSystem.nextItem();
```

#### `ModalSystem.prevItem()`

Navigate to previous item in group modal.

```javascript
ModalSystem.prevItem();
```

#### `ModalSystem.goToItem(index)`

Jump to specific item index.

```javascript
ModalSystem.goToItem(2);  // Jump to 3rd item
```

#### `ModalSystem.getState()`

Get current modal state.

```javascript
const state = ModalSystem.getState();
console.log(state.currentIndex);  // Current item index
console.log(state.items.length);  // Total items
```

### Helper Functions (modal-data.js)

#### `openModalGroup(groupId, items, initialIndex)`

Convenience function to open a group modal.

```javascript
openModalGroup('testimonials', testimonialModals, 0);
```

#### `openModalSingle(groupId, items)`

Convenience function to open a single modal.

```javascript
openModalSingle('about', infoModals);
```

## Modal Item Structure

```javascript
{
  id: 'unique-id',              // Required: for URL hash
  title: 'Item Title',          // Optional: displayed as h2
  content: '<p>HTML...</p>'     // Required: HTML string or text
}
```

**Example:**
```javascript
{
  id: 'testimonial-1',
  title: 'Bringing clarity & alignment',
  content: `
    <p>"His storytelling skills are impressive..."</p>
    <p style="margin-top: 24px; font-weight: 600;">Paul Wilsher</p>
    <p style="color: var(--color-on-surface-variant); font-size: 14px;">
      Project Manager at Gala
    </p>
  `
}
```

## Navigation Methods

### Keyboard

| Key | Action |
|-----|--------|
| `ArrowLeft` | Previous item |
| `ArrowRight` | Next item |
| `Escape` | Close modal |

### Touch

| Gesture | Action |
|---------|--------|
| Swipe left | Next item |
| Swipe right | Previous item |
| Swipe down | Close modal |

### Mouse

| Action | Result |
|--------|--------|
| Click prev button | Previous item |
| Click next button | Next item |
| Click close button | Close modal |
| Click overlay | Close modal |

### URL Hash

- Open modal: `#item-id`
- Close modal: Remove hash or navigate to home

## Animations

### Opening Modal

1. Overlay fades in (0.4s)
2. Modal slides up from bottom (0.4s)

### Navigating Items

1. Current content slides out (0.3s)
2. New content slides in (0.4s, delayed 0.15s)
3. Direction changes based on next/prev

### Closing Modal

1. Overlay fades out (0.4s)
2. Modal slides down (0.4s)

## Styling & Customization

All modals use CSS variables from the theme:

- `--color-bg` — Modal background
- `--color-on-surface` — Text color
- `--color-surface-2` — Button background
- `--color-surface-3` — Button hover

Customize by editing `/assets/css/modal.css`.

### Responsive Breakpoints

- **Desktop** (>768px) — Large buttons (112x112px)
- **Tablet** (480px-768px) — Medium buttons (96x96px)
- **Mobile** (<480px) — Small buttons (64x64px), stacked layout

## Advanced: Custom Content Types

### Image Modal

```javascript
{
  id: 'photo-1',
  title: 'My Photo',
  content: '<img src="/images/photo.jpg" style="width:100%; border-radius: var(--radius-lg);">'
}
```

### Video Modal

```javascript
{
  id: 'video-1',
  title: 'My Video',
  content: `
    <iframe 
      width="100%" 
      height="600" 
      src="https://www.youtube.com/embed/dQw4w9WgXcQ"
      frameborder="0"
      allowfullscreen>
    </iframe>
  `
}
```

### Styled Text Modal

```javascript
{
  id: 'story-1',
  title: 'My Story',
  content: `
    <div style="font-size: 18px; line-height: 1.8;">
      <p><strong>Chapter 1</strong></p>
      <p>Once upon a time...</p>
      <p style="margin-top: 24px;"><strong>Chapter 2</strong></p>
      <p>And then...</p>
    </div>
  `
}
```

## Troubleshooting

**Modal doesn't open:**
- Check browser console for errors
- Verify `ModalSystem` global is loaded (modal.js runs first)
- Verify items array is not empty

**Navigation buttons missing:**
- Check that `items.length > 1` for group modals
- Single modals don't show navigation intentionally

**Animations feel choppy:**
- Check GSAP is loaded
- Verify CSS is included in default.hbs
- Check browser performance (DevTools)

**Touch swipe not working:**
- Ensure you're swiping, not scrolling
- Minimum swipe distance is 50px
- Don't swipe on scrollable content inside modal

## Future Enhancements

Potential additions:

- [ ] Image zoom/pinch-zoom on mobile
- [ ] Lightbox-style image gallery
- [ ] Lazy loading for large content
- [ ] Custom transition animations per modal
- [ ] Pagination dots for image galleries
- [ ] Audio/video player integration
- [ ] Comments/reactions on modal items

## Post Page Configuration (projectMeta)

Posts can inject custom configuration via the **Code Injection** field to control card behavior, navigation, and metadata display.

### In Ghost Admin Post Editor:

**Code Injection** → **Header** section:

```html
<script>
window.projectMeta = {
  "longTitle": "DeFi product suite for Gala ecosystem",
  "client": "Gala",
  "accentColor": "#5D76FA",
  "result": "<strong>~DeFi</strong> from zero to 1",
  "logomark": "/content/images/logomark/gala.svg",
  "disable-link": true,
  "next-project": "project-2",
  "prev-project": "project-0"
};
</script>
```

### projectMeta Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `longTitle` | string | Full project title (used in modals) | `"DeFi product suite for Gala"` |
| `client` | string | Client/company name | `"Gala"` |
| `accentColor` | string | Project brand color (hex) | `"#5D76FA"` |
| `result` | string | Project outcome/result (supports HTML) | `"<strong>~DeFi</strong> from zero to 1"` |
| `logomark` | string | Path to project logomark/icon | `"/content/images/logomark/gala.svg"` |
| `disable-link` | boolean | If `true`, card is not clickable | `true` |
| `next-project` | string | Override next project (project ID) | `"project-2"` |
| `prev-project` | string | Override prev project (project ID) | `"project-0"` |

### Usage in Templates

Use `data-project-*` attributes to conditionally display metadata:

```html
<!-- Show only if client is not empty -->
<p data-project-client>Client: {{post.custom.client}}</p>

<!-- Show only if result is not empty -->
<div data-project-result>{{{post.custom.result}}}</div>

<!-- Show only if logomark exists -->
<img data-project-logomark src="{{post.custom.logomark}}" alt="Logomark">
```

### Automatic Behavior

The system automatically:

✅ **Hides empty fields** — If a field is empty or contains `{{...}}` template syntax, the element is hidden  
✅ **Disables cards** — If `disable-link: true`, clicks on cards do nothing (50% opacity)  
✅ **Hides logomark** — If no logomark is provided, the logomark container is hidden  
✅ **Respects overrides** — `next-project` and `prev-project` override array-based navigation  

### Example: Complete Post Setup

**Ghost Post → Code Injection → Header:**

```html
<script>
window.projectMeta = {
  "longTitle": "Mobile App Redesign",
  "client": "Spotify",
  "accentColor": "#1DB954",
  "result": "40% faster onboarding",
  "logomark": "/content/images/logos/spotify.svg",
  "disable-link": false,
  "next-project": "airbnb-redesign",
  "prev-project": "netflix-ui"
};
</script>
```

**Post Template:**

```html
<article class="post">
  <header class="post-header">
    <img id="logomark-container" src="{{post.custom.logomark}}" alt="{{post.custom.client}}" />
    <h1>{{post.custom.longTitle}}</h1>
  </header>

  <section class="post-meta">
    <p data-project-client><strong>Client:</strong> {{post.custom.client}}</p>
    <p data-project-result><strong>Result:</strong> {{{post.custom.result}}}</p>
  </section>

  {{{post.html}}}
</article>
```

---

**Modal System initialized automatically on page load.**  
Use `ModalSystem.openModal()` or helper functions anytime after DOM is ready.
