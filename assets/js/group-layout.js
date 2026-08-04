/**
 * GROUP LAYOUT SYSTEM
 * Marker-based column layout for Ghost post content
 * Detects HTML card markers, groups content, and applies CSS grid layouts
 */

(function() {
  'use strict';

  // Safe logging (some extensions block console)
  const log = function(...args) {
    try { console.log(...args); } catch (e) {}
  };
  const warn = function(...args) {
    try { console.warn(...args); } catch (e) {}
  };

  // Safety: only run on post pages
  const isPostPage = document.body.classList.contains('post-template');
  if (!isPostPage) {
    log('[group-layout] Not a post page, skipping');
    return;
  }

  const postContent = document.querySelector('.gh-content, .post-content');
  if (!postContent) {
    warn('[group-layout] Post content container not found');
    return;
  }

  log('[group-layout] Initialized on post page', postContent);

  /**
   * Parse group config from class name
   * group-h4-2 → { selector: 'h4', cols: 2 }
   * group-img-4 → { selector: 'figure', cols: 4 }
   */
  function parseGroupConfig(classList) {
    const configClass = Array.from(classList).find(cls => cls.startsWith('group-') && cls !== 'group-start' && cls !== 'group-end');

    if (!configClass) {
      warn('[group-layout] No config class found in', classList);
      return null;
    }

    const parts = configClass.split('-');
    if (parts.length < 3) return null;

    const selectorPart = parts[1];
    const colsPart = parseInt(parts[2], 10);

    if (isNaN(colsPart) || colsPart < 1) return null;

    // Map selector aliases
    let selector = selectorPart;
    if (selectorPart === 'img') {
      selector = 'figure';
    }

    const config = { selector, cols: colsPart };
    log('[group-layout] Parsed config:', config);
    return config;
  }

  /**
   * Helper: split nodes into groups on selector boundary
   * Returns array of arrays, split whenever a node matches selector
   */
  function splitOnSelector(nodes, selector) {
    const groups = [];
    let currentGroup = [];

    for (const node of nodes) {
      // Check if node matches selector
      let matches = false;

      if (node.nodeType === Node.ELEMENT_NODE) {
        matches = node.matches(selector);
      }

      if (matches) {
        // Start a new group with this node
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
        }
        currentGroup = [node];
      } else {
        currentGroup.push(node);
      }
    }

    // Push final group
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  /**
   * Collect sibling nodes between start and end markers
   */
  function collectNodesBetween(startMarker, endMarker) {
    const nodes = [];
    let current = startMarker.nextSibling;

    while (current && current !== endMarker) {
      nodes.push(current);
      current = current.nextSibling;
    }

    return nodes;
  }

  /**
   * Process a single group-start marker
   */
  function processGroupMarker(startMarker) {
    try {
      // Parse config
      const config = parseGroupConfig(startMarker.classList);
      if (!config) {
        warn('[group-layout] Invalid or missing config class on marker', startMarker);
        return;
      }

      // Find end marker
      const endMarker = startMarker.parentNode.querySelector('.group-end');
      if (!endMarker) {
        warn('[group-layout] Missing end marker for group', config);
        return;
      }

      // Collect nodes
      const nodes = collectNodesBetween(startMarker, endMarker);
      if (nodes.length === 0) {
        return; // Silent skip
      }

      // Split into groups
      const groups = splitOnSelector(nodes, config.selector);
      if (groups.length === 0) {
        return;
      }

      // Warn if group count doesn't match column count
      if (groups.length !== config.cols) {
        warn(`[group-layout] Expected ${config.cols} groups, found ${groups.length}`, config);
      }

      // Build DOM
      const grid = document.createElement('div');
      grid.className = `tif-group tif-group--cols-${config.cols}`;
      grid.dataset.selector = config.selector;

      for (const groupNodes of groups) {
        const col = document.createElement('div');
        col.className = 'tif-group__col';

        for (const node of groupNodes) {
          col.appendChild(node.cloneNode(true));
        }

        grid.appendChild(col);
      }

      // Replace range (start marker through end marker) with grid
      startMarker.parentNode.insertBefore(grid, startMarker);

      // Remove markers and all collected nodes
      startMarker.remove();
      for (const node of nodes) {
        node.remove();
      }
      endMarker.remove();

      log('[group-layout] Grid created successfully:', { selector: config.selector, cols: config.cols, groups: groups.length });

    } catch (err) {
      warn('[group-layout] Error processing marker:', err);
    }
  }

  /**
   * Initialize: find all group-start markers in post content
   */
  function init() {
    const markers = postContent.querySelectorAll('.group-start');
    log(`[group-layout] Found ${markers.length} group markers`);

    if (markers.length === 0) {
      log('[group-layout] No markers found, nothing to process');
      return;
    }

    for (const marker of markers) {
      try {
        processGroupMarker(marker);
      } catch (err) {
        log('[group-layout] Error processing marker:', err);
      }
    }
  }

  // Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
