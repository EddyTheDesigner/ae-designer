# Mac / After Effects acceptance checks

Version 0.9.2 has passed local browser and mocked-host checks. These real-host checks remain outstanding because AE and macOS were unavailable during development. Use a copy of a project for the first run.

## Launch and workspace

1. Install the ZXP or run the included Mac folder installer. Restart AE.
2. Open Window → Extensions → AE Designer. Record macOS version, AE version and Mac processor.
3. Open the separate Layers and Properties panels. Verify selection and edits synchronize with the main panel.
4. Check Control+Z, Control+D, Control+G and the tool keys. Command+S should remain an AE command.
5. Resize, float the toolbar, collapse sections, use More tools, close/reopen and confirm saved layout.

## Basic round trip

1. Create a 1920 × 1080 comp with a rectangle, fill and stroke.
2. Pull all. Check position, size, color, stroke width and anchor.
3. Move, recolor and round the rectangle. AE should remain unchanged before Push.
4. Push. Confirm native values and one-step AE Undo.
5. Draw new shapes and Push as new. Confirm native editable shape contents and selection of the new layers on the refreshed canvas.
6. Repeat with nested groups, rotated/nonuniformly scaled parents and nonzero anchors. Compare before/after composition bounds.
7. Test 3D shapes and text with a camera. Compare canvas projection and native moves/rotations; include parented 3D layers.

## Animation and structural edits

- Animate rectangle size, pull between keys, change size, move the AE playhead and push. The new key belongs at the original pull time; other keys retain values, easing and interpolation.
- Add an expression to stroke width. Pull again; its red/expression state must prevent editing the native value.
- Reorder, group, reparent, split and duplicate animated shapes. Verify surviving keyframes, expressions, source identities and appearance.
- Delete one animated mask or shape while retaining another; the survivor's animation must remain intact.
- Change the native layer stack after pulling. Confirm Push anyway / Push as new / Cancel appears before transfer.
- Switch compositions before an ordinary push. It must refuse; Push as new is the alternate transfer path.

## Tools and arrays

- Exercise Pen closure/tangents, Pencil recognition, Direct Selection, marquee/lasso, point/handle constraints, slide, corners and scissors/join.
- Check cleanup, simplify/original overlay, Move along path, offset, dashed stroke outline and all Pathfinder operations.
- Test live ellipse Start/Sweep/Ratio and line controls with Push as rig enabled. Verify editable Effect Controls and expressions in AE, then pull native edits back.
- Test Linear, Grid, Brick, Radial and Spiral arrays. They should use native Repeaters. Change native copy count and spacing/rotation, pull, and check the array fields.
- Try each operator's native settings, especially Trim, Repeater, Merge Paths, Wiggle and Zig Zag.

## Paint and gradients

- Check caps, joins, dashes, taper/wave, multiple fills/strokes, opacity and blend modes.
- Save an AEP containing native linear/radial gradients. Pull, edit color/alpha stops and midpoints, push, then repull. Check exact native stop data and highlight controls.
- Repeat on the installed AE version using a gradient created in the panel through ordinary Push.
- Animated/expression-driven/unreadable colors must stay guarded. Push as new should report its first-stop solid conversion.

## Masks and text

- Pull a solid and footage layer with masks. Check source preview, additive/subtractive/intersect masks, inversion, opacity, expansion, separate X/Y feather and colors.
- Add/reorder/delete masks; verify native locked state and animation.
- In AE 2024+, edit point and paragraph text inline. Check installed font family/style, character fields, paragraph settings, fill/stroke order and text direction.
- Test text outline conversion and subsequent Pathfinder. The original native text stays present but disabled.

## Recovery

- Close the panel with unpushed edits; reopen and restore the draft.
- Restart AE; restore again. Push should be paused until reattachment to the same saved project/comp.
- Export an .aedesigner document, create a blank canvas, import it and compare.
- Cancel a large pull with Escape; previous canvas/history should return.

For issues, provide exact steps, expected versus actual result, AE/macOS versions and the complete push-note text. A small AEP reproducing a host failure is useful. Submit through the footer's feedback link or [GitHub Issues](https://github.com/EddyTheDesigner/ae-designer/issues).

## 0.9.2 targeted checks

- Pull a 3D shape with a rotated, nonuniformly scaled or mirrored parent. Push as new and compare all four corners in the source camera.
- Split a nested group from a 3D layer and compare placement, opacity, parent assignment and transform keyframes.
- Duplicate an animated layer and an animated shape group. Existing transform keys should copy without an extra key at pull time.
- Pull animated text at one frame, move the AE playhead, then outline. The outline should use the pulled frame and restore the playhead.
- Ungroup a plain painted group, nested transformed groups and compound paths. Groups containing shared operators should remain intact with an explanatory notice.
