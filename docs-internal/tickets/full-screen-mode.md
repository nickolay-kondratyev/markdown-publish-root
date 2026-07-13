# Full screen mode: site-wide toolbar toggle

Status: RESOLVED (2026-07-11 — `full-screen-mode/` local plugin, rightmost corner
icon; native Fullscreen API on `<html>` so the mode survives SPA navigation
(canvas opens already fullscreen); aria-label CSS tooltips on all corner icons
in `engine/src/siteChromeStyles.ts`. Constraint: browsers refuse
`requestFullscreen` without a user gesture, so the mode cannot be restored
across a full page RELOAD — it is site-wide for the browsing session, not a
persisted preference.)

Amendment (2026-07-11, owner direction): the canvas-local fullscreen control
was REINSTATED as a second, INNER level — `.canvas-flow-fullscreen` fullscreens
the canvas mount (with `fullscreenRetention.js` for canvas->canvas SPA nav),
and it NESTS on top of the site-wide level via the Fullscreen API stack:
exiting the canvas level pops back to site fullscreen. The site mode keys on
`documentElement.matches(":fullscreen")` so canvas-level fullscreen never flips
the site toggle. This supersedes the "remove the separate canvas action"
section below.

Add ability to have full screen mode.

Full screen mode will expand to fully fill the screen with the content. (Similar to how react flow is able to do full screen mode).

It will have an Icon of full screen, and the icon will STACK with reading mode and zen mode. So when we go into zenmode/reading mode we will still leave the full screen icon visible (WHY: so that the user can upgrade their reading experience further by going into full screen mode, combined with the mode of choice they have taken). 

When full screen mode is activated going into the canvas should open the canvas in the full screen mode already.

### Separate Canvas full screen action: remove
Right now within canvas view we have full screen action at the bottom, lets remove that separate action so that users learn to user ubiquitous full screen action.

When we are in full screen in canvas we should see the full screen icon at the top right corner. when we are not in full screen in canvas the way for user to go to full screen is to use the full screen icon that is outside of canvas.  

### Hover over for icons
we should add helpful text to the hover over icons that are in the top right corner.

### clarification
Full screen mode becomes a site wide setting. 