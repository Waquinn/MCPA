---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: ["2-engr/index.html","css/login-slideshow.css","js/login-slideshow.js"]
---

# Login portfolio

Mode: Operate, with an architectural gallery supporting company identity. Targets: index.html and 2-engr/index.html. The user supplied the complete direction and requested direct implementation.

## Direction contract

THESIS: Keep the real completed projects visible and the sign-in task unobstructed. Desktop dedicates a full-height, unframed panel to the whole photograph; mobile uses its silhouette as a quiet background.

OWN-WORLD: Near-black authentication panel, charcoal gallery, gold primary action, white and muted warm-gray text. Retain the existing MCPA mark and typography. Glass belongs only to compact screens.

STORY: Recognize MCPA's work, enter a company account, recover access, or open the existing offline demonstration. No invented project claims.

FIRST VIEWPORT: Above 900px, the gallery is 75% of viewport height in width, capped to preserve 440px for authentication. A whole 3:4 photograph fills the viewport-height gallery without padding or a caption row. A 360px form is centered in the remaining charcoal panel; the photo count and progress/Pause control sit below it at the bottom of that panel, clear of all photo detail. At 900px and below, one fixed photograph fills the viewport behind a centered, naturally scrolling glass card.

FORM: User-pinned split gallery / mobile glass composition. Code-led build. Seed 4faed49b returned index 3 with no remote challengers; the user's explicit composition overrides exploration. No generated imagery or alternate concepts were needed.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Constraints: Preserve authentication code and uncommitted work; original photographs and watermarks remain unchanged. No production writes, migrations, push, or deployment. Image manifest records source hashes and encoding provenance. QA uses a network-isolated browser fixture.
