# Screenshots

This folder is intentionally sparse.

The Stage 1 audit was driven through the in-app automated browser pane, which was **hidden**
for the session. In that mode the pane frequently fails to paint, so `screenshot` calls timed
out or returned partial frames, and there is no reliable path to write image files to disk from
it. Evidence was therefore captured as **text**: DOM/accessibility-tree reads, `get_page_text`
extracts, console and (same-origin) network logs, `localStorage` state, and the exact toast
strings — all quoted inline in `qa/BUGS.md` and the inventories.

A few screenshots *were* viewable in-session (dashboard, auth page, landing hero) and are
described where relevant. To capture proper evidence images, re-run the affected flows in a
normal desktop browser:

- **BUG-017** — open `/app`, screenshot the top "NET WORTH −₹8,128" card and the
  "Wealth Overview → CURRENT NET WORTH ₹52,000" panel in one frame.
- **BUG-002** — open DevTools console, press Ctrl+K, screenshot the `DialogTitle` error.
- **BUG-014** — screenshot `/` after scrolling to the pricing / FAQ / final-CTA sections
  (desktop and mobile) to confirm a user can actually reach them.
- **BUG-003** — screenshot the account card trash icon and confirm no dialog appears on click.
