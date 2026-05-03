# Editor Guide — Group Layouts

The **Group Layout** system lets you create automatic multi-column grids in post content without touching CSS or HTML tags. Writers insert simple HTML card markers, and the theme automatically arranges content into columns.

---

## How It Works

1. Insert a **Start Group** marker (HTML card)
2. Write your content naturally (headings, paragraphs, lists, images)
3. Insert an **End Group** marker (HTML card)
4. The theme detects the markers and automatically wraps your content in a CSS grid

The system groups content based on a boundary element (headings, lists, or images) and splits into the number of columns you specify.

---

## Setup — Create Ghost Snippets

Before using groups, save these snippets in your Ghost editor. Go to **Editor → Select → Save as Snippet** and create one for each:

### Snippet 1: "2 Column (Headings)"

```html
<span class="group-start group-h4-2"></span>
```

Use this to create a 2-column layout split on **h4 headings**. Good for: feature lists, methodology breakdowns.

### Snippet 2: "3 Column (Headings)"

```html
<span class="group-start group-h4-3"></span>
```

Creates a **3-column** layout split on h4 headings.

### Snippet 3: "2 Column (Lists)"

```html
<span class="group-start group-ul-2"></span>
```

Creates a **2-column** layout where each bulleted list (`<ul>`) is its own column. Good for: side-by-side comparisons, feature lists.

### Snippet 4: "4 Column Images"

```html
<span class="group-start group-img-4"></span>
```

Creates a **4-column image grid**. Each image automatically becomes one column. Good for: photo galleries, portfolio showcases.

### Snippet 5: "End Group" ← **Always insert this when done**

```html
<span class="group-end"></span>
```

Marks the end of the group. The theme looks for this to know where to stop collecting content.

---

## Example: 2-Column Feature List

In the Ghost editor:

```
[Insert snippet: "2 Column (Headings)"]

#### Feature 1
Lorem ipsum dolor sit amet, consectetur adipiscing elit.

#### Feature 2
Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

#### Feature 3
Ut enim ad minim veniam, quis nostrud exercitation.

#### Feature 4
Duis aute irure dolor in reprehenderit in voluptate velit esse.

[Insert snippet: "End Group"]
```

**Result:** The four headings are split into 2 columns automatically. On mobile, it collapses to 1 column.

---

## Example: 4-Column Image Gallery

```
[Insert snippet: "4 Column Images"]

[Image 1]
[Image 2]
[Image 3]
[Image 4]
[Image 5]
[Image 6]

[Insert snippet: "End Group"]
```

**Result:** Images are arranged in a 4-column grid. On tablets, it drops to 2 columns. On mobile, single column.

---

## Available Layouts

| Snippet | Selector | Columns | Use Case |
|---------|----------|---------|----------|
| `group-h4-2` | h4 headings | 2 | Feature lists, pros/cons |
| `group-h4-3` | h4 headings | 3 | Method steps, comparison |
| `group-h3-2` | h3 headings | 2 | Section splits, side-by-side |
| `group-h3-3` | h3 headings | 3 | Testimonials, team members |
| `group-ul-2` | Bulleted lists | 2 | Feature comparison, options |
| `group-img-2` | Images | 2 | Before/after, left/right |
| `group-img-3` | Images | 3 | Triptych, photo series |
| `group-img-4` | Images | 4 | Grid gallery, portfolio |
| `group-p-2` | Paragraphs | 2 | Pull quotes, call-outs (advanced) |

---

## Responsive Behavior

- **Mobile (<768px):** All columns collapse to **1 column**
- **Tablet (768–1024px):** 3 and 4-column layouts drop to **2 columns**
- **Desktop (>1024px):** Full layout (2, 3, or 4 columns as specified)

---

## Tips

✅ **Do:**
- Insert start and end markers properly — they must be in HTML cards
- Keep content between markers natural — use normal headings, paragraphs, lists
- Use one layout per group — don't nest groups

❌ **Don't:**
- Forget the end marker — content after will not be grouped
- Create more or fewer groups than columns — if you specify 2-column but write 3 h4s, you'll get 3 columns anyway (with a warning in browser console)
- Use groups on non-post pages — they only work on blog posts

---

## Troubleshooting

**Q: My layout doesn't look like columns**
- Check your browser console (F12 → Console) for red warnings
- Verify you inserted both start and end markers
- Make sure the selector matches your content (h4 headings for `group-h4-2`, etc.)

**Q: Only one column shows**
- You're probably on mobile — the layout is responsive
- Desktop view should show multiple columns

**Q: Images are tiny or distorted**
- The image grid uses `object-fit: cover` to fill columns
- Ensure images are high-res and roughly the same aspect ratio

---

## Advanced: Custom Selectors

The naming convention is: `group-[selector]-[columns]`

- `selector` = HTML tag or class (h4, h3, ul, img/figure, p)
- `columns` = number of columns (2, 3, or 4)

For example:
- `group-h2-2` → split on h2 tags, 2 columns
- `group-blockquote-3` → split on blockquotes, 3 columns

If you want a custom layout, create an HTML card with the pattern and it will work automatically.

---

## Questions?

If something isn't working:
1. Check the browser console (F12)
2. Verify markers are in HTML cards (not typed as text)
3. Ensure start marker has the config class (e.g., `group-h4-2`)
4. Make sure end marker is present

The system is fail-safe — if something is wrong, it logs a warning but doesn't break the page.
