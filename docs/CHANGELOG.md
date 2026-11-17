# Changelog

## 0.9.2 — November 16, 2026

Includes the 0.9.1 native-transfer corrections below, with rebuilt installation artifacts. The release build now compares every signed ZXP file with the current extension source and rejects stale or missing content. Two packaging regressions bring the test total to 72. The incorrect 0.9.1 download was withdrawn before the handoff.

## 0.9.1 — November 16, 2026

- Preserve 3D shape planes when Push as new removes rotated, mirrored or nonuniformly scaled parents.
- Keep 3D projection, parent coordinates, opacity and transform-animation provenance when splitting groups into layers.
- Fall back to planar native coordinate samples when AE rejects or ignores depth samples. An enabled camera's center calibrates subsequent 3D edits.
- Ungroup ordinary paint groups and nested groups without leaving an equivalent outer wrapper. Keep compound contours together; retain shared operators instead of silently deleting them.
- Restore transform animation on duplicated layers/groups without adding an unnecessary key at the pull time.
- Outline text at the original pull time, restore the playhead/selection/locks, and remove temporary or partial output if conversion fails.

70 tests pass (26 model/host contracts and 44 browser interactions). Real Mac/AE testing remains outstanding.

## 0.9.0 — November 16, 2026

First public AE Designer testing release. Includes the local vector editor, three CEP panels, native Pull/Push, drawing and point tools, transform/anchor controls, Last Action replay, Pathfinder and path actions, five Repeater layouts, live shape rigs, gradient codec and controls, masks, inline text, recovery and shortcut presets.

60 local automated tests pass. Real Mac installation and AE round trips await user acceptance testing; exact original equivalence is unverified.
