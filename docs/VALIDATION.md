# Validation record

AE Designer 0.9.0 · November 16, 2026

| Check | Result |
| --- | --- |
| Frontend JavaScript parses at ECMAScript 2020 | Pass: 25 modules |
| Host scripts parse at ECMAScript 3 | Pass: 3 modules |
| Manifest paths and Mac LF endings | Pass |
| Model/history and mocked AE contracts | 21 passed |
| Chromium editor interactions | 39 passed, no skipped/flaky tests |
| UI review | Wide and narrow layouts checked; public reference proportions reviewed |
| ZXP signature | Adobe ZXPSignCmd verification performed for the release package |
| Real macOS installation | Not run |
| Real AE rendering and native round trips | Not run |
| Original-extension side-by-side comparison | Not run |
| Exact original pixel/behavior equivalence | Not established |

Browser coverage includes drawing, pointer coordinates, Pen and direct editing, compound holes, destructive and operator Pathfinder, native array models, gradient serialization and controls, masks, inline text, 3D projection math, hierarchy/clipboard, Last Action replay, anchor preservation, shortcut presets, recovery, satellite synchronization and narrow-panel controls.

Regression checks specifically cover parented Push-as-new appearance, native array hydration, automatic-curve conversion, contour-preserving subdivision, dash gaps and asymmetric mask feathering.

Host tests check source identity, changed-property writes, pull-time keys, expressions, lock state, undo grouping, stack conflicts, progressive-pull cancellation and animated shape/mask deletion or reordering. The mock is intentionally small; passing it does not validate the real AE scripting engine.

Run checks with:

    npm run check
    npm test
    npm run test:ui

Real-host steps are in [MAC-AE-VALIDATION.md](MAC-AE-VALIDATION.md). Implementation details and remaining fidelity boundaries are in [PARITY.md](PARITY.md).
