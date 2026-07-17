# Ghost Theme Development — "thinkingisfree"

We are building a Ghost CMS theme called thinkingisfree from scratch. Here is everything you need to know:

## ENVIRONMENT

- Ghost installed locally via Ghost CLI
- Install path: ~/ghostthemeportfolio/ghost2/
- Theme path: ~/ghostthemeportfolio/ghost2/content/themes/thinkingisfree/
- Ghost running at: http://localhost:2368
- Admin at: http://localhost:2368/ghost
- Node version: v22.22.2
- Ghost version: 6.35.0

## THEME STRUCTURE (already created)

```
thinkingisfree/
├── assets/
│   ├── css/main.css
│   ├── js/main.js
│   └── fonts/
├── partials/
├── default.hbs
├── index.hbs
├── post.hbs
└── package.json
```

## REFERENCE FOLDER

There is a reference portfolio site built in React at ~/ghostthemeportfolio/ghost-local/ (the old broken install folder — the React portfolio files ended up there during the move).
The portfolio is a React site. We are not copying components. We are extracting and adapting:

- Typography system (fonts, scale, weights, line heights) — rewritten as CSS custom properties
- CSS tokens (colours, spacing, easing curves) — rewritten as CSS custom properties
- Navigation behaviour (scroll hide/show, inverted border radius corners) — rewritten in vanilla JS
- Page transition animations — rewritten in vanilla JS + GSAP (not React Router)
- Page load animation — rewritten in vanilla JS + GSAP
- Scroll progress bar — rewritten in vanilla JS
- Dark / light / sunset mode toggle — rewritten in vanilla JS with localStorage
- Word drop scroll animation — rewritten in vanilla JS + GSAP + ScrollTrigger

Everything is adapted to Ghost's structure and Handlebars templating — nothing is pasted directly from React.

## DESIGN DIRECTION

- Bold typographic aesthetic (like the portfolio)
- Built from scratch — not forked from Casper
- GSAP and ScrollTrigger included via CDN in default.hbs
- Clean, distinctive, stands out in Ghost marketplace
- Designed for independent creators / writers

## PURPOSE

- Released free to the Ghost community (aligns with Ghost's open source ethos)
- Part of a reapplication to work at Ghost
- Narrative: "Since applying I've been using Ghost daily and built a free theme for the community"

## TECHNICAL CONSTRAINTS

- Ghost themes use Handlebars (.hbs) templating — not React, not JSX
- All interactivity in vanilla JS (no React, no Vue)
- GSAP loaded via CDN for animations
- CSS custom properties for all design tokens
- Must work with Ghost's data helpers: {{title}}, {{content}}, {{excerpt}}, {{url}}, {{foreach posts}}, {{navigation}}, {{ghost_head}}, {{ghost_foot}}, {{body_class}}, {{asset}}, {{@site.title}}, etc.
- Ghost API v5
- Ghost >= 5.0.0

## TEMPLATES TO BUILD

- default.hbs — master layout (done, shell only)
- index.hbs — homepage post grid (done, shell only)
- post.hbs — single post reading experience (done, shell only)
- page.hbs — static pages
- tag.hbs — tag archive
- author.hbs — author page
- error.hbs — 404
- partials/navigation.hbs — nav component
- partials/post-card.hbs — post card component

## CURRENT STATUS

- Ghost running locally ✓
- Theme folder created ✓
- Shell templates created (default, index, post) ✓
- Theme activated in Ghost admin (confirm this)
- CSS not started yet
- JS not started yet

## NEXT STEPS

1. Build assets/css/main.css — start with CSS custom properties (tokens) extracted and adapted from the portfolio's design system
2. Then typography
3. Then layout
