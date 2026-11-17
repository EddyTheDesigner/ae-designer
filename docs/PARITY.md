# Implementation coverage — 0.9.1

Behavioral reference: [Design Mode documentation](https://docs.jakeinmotion.com/design-mode/), reviewed November 16, 2026. [The full directory](DOCUMENTATION-DIRECTORY.md) indexes all 22 product pages and 4 support pages.

The features below are implemented. Browser checks exercise the local editor; native checks use a deliberately limited AE mock. No original extension binary, real AE session, or Mac installation was available. This is an implementation coverage report, not a certification of identical rendering or host behavior.

| Documentation page | Implementation |
| --- | --- |
| Overview / Quick Start | Local vector canvas, explicit Pull/Push, native shapes, three CEP panels |
| Installation | Mac ZIP, development-signed ZXP, user-folder installer, separate AE Designer bundle IDs |
| Pull and Push | Progressive/cancelable pull, selected/all layers at pull time, changed-property writes, expression guards, animation snapshots during structural edits, stack conflict choices, new-layer refresh, partial-write notes, recovery and reattach |
| The Workspace | Dark layout, toolbar order, side panels, rulers, guides, zoom/pan, outline, resizing, saved floating toolbar, narrow-panel overflow, satellite panels |
| Last Action | Base-state replay for move/duplicate, rotate, linked scale, shear, reflect/copy, offset, simplify, cleanup, arrays, widgets, spacing and property edits; undo/redo retains cards |
| Selecting | Layers/groups/paths, direct points and handles, marquee/lasso, wand color/weight matching, isolation, lock, selection-under-front behavior, snapping and smart guides |
| Layers | Search/filter, expand, rename, eye/lock-column painting, labels, reorder/reparent, add menu, group/ungroup, stable arrangement, source-aware clipboard, split/merge/consolidate, direction controls |
| Drawing | Parametric shapes, Pen, Pencil and recognition, space-drag repositioning, inline point/box text, live shape controls |
| Editing Paths | Point/handle editing and constraints, slide, tangent modes, add/delete/convert, scissors, join/average, corners and recognition, automatic curves, native stroke taper handles |
| Transforming | Numeric and pointer transforms, anchor preservation, pivots, combined/individual modes, flips, align/distribute/spacing, copy/duplicate/repeat, parent coordinates and projected 3D canvas mapping |
| Path Actions | Cleanup, simplify with original overlay, curve-preserving subdivision for Move along path, dashed/compound stroke outlines, offsets, seven destructive Pathfinder operations and native Merge Paths mode |
| Replicate / Split / Consolidate | Linear, Grid, Brick, Radial and Spiral native Repeater layouts; editable array controls and expand; appearance-aware split and consolidation |
| Fill and Stroke | Color, opacity, width, caps, joins, miter, fill rule, dashes, taper/wave previews and native values, multiple paints, blend names, color replacement and style eyedropper |
| Gradients | Color/alpha stops, independent tracks and midpoints, linear/radial endpoints, highlights, canvas controls, multiple-gradient edits, AEP readback and FFX native writes |
| Shape Properties | Native layer/group/shape values, expression/key indicators, pie/ring/line effect rigs; previews and properties for Merge, Offset, Pucker/Bloat, Repeater, Round Corners, Trim, Twist, Wiggle Paths/Transform and Zig Zag |
| Masks | Paths, modes, inversion, opacity, XY feather, expansion, colors, source-image previews and compositing; native add/edit/reorder/delete |
| Text | Inline point/box text, font family/style picker, character/paragraph fields, host font refresh, native TextDocument write, native outline conversion |
| Keyboard Shortcuts | Default Control bindings on Mac, Command passthrough, Illustrator/AE/Figma sets, custom saved sets, native AE shortcut-file import with command-name mapping |
| Troubleshooting / FAQ | Project installation instructions, surfaced host errors, recovery, validation checklist and GitHub issue route |
| Changelog | AE Designer's own version history and What's New dialog |
| EULA / Accounts / Activation | The original publisher's commercial services are reference-only; AE Designer has its own MIT license and no activation system |

## Rendering and transfer boundaries

- Exact original UI pixels and behavior have not been independently established. Panel proportions and interaction arrangement were reviewed against the public screenshots; toolbar vectors are independently drawn.
- Canvas text uses browser font metrics. AE remains the authority for final text layout. Canvas IME input and text gradients are unsupported, matching the reference documentation.
- Shape-layer masks appear as gray overlays. Lighten/Darken/Difference mask modes, some blend modes, feathering on transformed layers, and native stochastic operator previews are approximations. Native properties are retained for AE rendering.
- Push as new makes gradients solid at their first color. Unreadable, animated, or expression-driven native gradient colors remain guarded. Existing gradient readback depends on available saved AEP data; preset application and AE-version selection need real-host checks.
- Move along path retains original Bezier knots as construction points and selects newly subdivided knots to preserve the contour. Disabling tangent alignment restores the original selected handle vectors.
- Automatic-curve metadata for shape paths is stored in the layer comment; mask RotoBezier uses AE's native mask flag. Tangent edits convert automatic curves to Bezier.
- Parented 2D shape appearance is baked into unparented new layers, including a Contents transform when shear is needed. Parented 3D shape planes use a rotation/scale factorization plus a Contents shear, preserving the plane even with mirrored and nonuniform parents. Text under parent shear still requires outlines for exact transfer. Different destination cameras can change 3D appearance.
- Source footage is not recreated by Push as new. Its masks can be edited through ordinary Push; unsupported new source transfer is reported.
- Native gradients, source previews, text outlines, expressions/rigs, 3D coordinates and complex animated hierarchy changes require Mac/AE round-trip testing. A mock cannot establish that those AE APIs behave exactly as expected.
- Changes made concurrently in AE are not comprehensively checked per property. Layer-stack changes are detected. Pull again after external edits.

## Validation

70 automated tests pass: 26 model/native-contract tests and 44 browser tests. All frontend files pass ES2020 parsing; all host files pass ES3 parsing. See [VALIDATION.md](VALIDATION.md) and the [Mac acceptance checklist](MAC-AE-VALIDATION.md).
