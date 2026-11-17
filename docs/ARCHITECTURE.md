# Architecture

AE Designer is self-contained CEP HTML/JavaScript with an ES3 ExtendScript host. No runtime npm install or web service is required.

| Component | Responsibility |
| --- | --- |
| CSXS/manifest.xml | Main, Layers, Properties panels; AEFT 23+; CEP 11+ |
| model.js | JSON hierarchy, native property identities, transactional history |
| geometry.js, projection.js | Bezier geometry, coordinates, 2D/3D mapping, transfer transforms |
| app.js, input.js | Editor commands, rendering, gestures, pull/push, recovery |
| ui.js, workspace-ui.js, shortcuts.js | Properties, hierarchy, menus, preferences, shortcuts, docking |
| points.js, path-actions.js, structure.js | Direct editing, path operations, source-aware hierarchy changes |
| live-shapes.js, widgets.js, arrays.js | Parametric controls, effect rigs, native Repeater arrays |
| gradients.js, gradient-ui.js, gradient-canvas.js | Stop data, AEP decoding, FFX generation, gradient controls |
| paint-preview.js, masks.js, operators.js | Paint, mask, and shape-operator previews |
| text-editor.js, transforms.js | Inline text and transform gestures |
| bridge.js | Chunked evalScript transport, satellite panel synchronization |
| host/index.jsx | Pull, incremental writes, text/mask operations, native command dispatch |
| host/native.jsx | Animation snapshots/restoration, gradient presets, native geometry helpers |
| host/rigs.jsx | Effect controls, expressions and comment metadata for editable rigs/arrays/curves |

The main panel owns state. Satellite panels send commands and receive state through CEP events; browser tests use BroadcastChannel. Host payloads are JSON-encoded and URI-encoded in bounded chunks. A fixed dispatcher handles actions; document content is not evaluated as source code.

Ordinary writes compare against a pulled baseline. Keyed values write at the pull time. Expression values are guarded. Structural synchronization tracks original properties, restores captured animation when a move requires recreation, and preserves untouched properties when reordering. Real AE acceptance checks remain essential.

Gradient colors use an MIT native-data codec, saved AEP readback, and generated FFX presets. The codec's stop cap is expanded from 8 to 1024 in scripts/bundle-gradient.mjs. Presets and the codec are bundled in extension/vendor. No original Design Mode binary or source was used.

## Build and sign

    npm ci
    npx playwright install chromium
    npm run check
    npm test
    npm run test:ui

Obtain [Adobe ZXPSignCmd](https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD) for the build computer. Keep certificates outside extension/ and version control. Generate a personal development certificate, then sign:

    ZXPSignCmd -selfSignedCert US Illinois "Personal Development" "AE Designer Development" YOUR_PASSWORD /private/path/development.p12
    ZXPSignCmd -sign extension dist/AE-Designer.zxp /private/path/development.p12 YOUR_PASSWORD
    ZXPSignCmd -verify dist/AE-Designer.zxp
    npm run build

The Mac ZIP includes the signed ZXP when one exists, source, docs, and a fallback installer. The installer has LF endings and ZIP executable mode 0755. Panel HTML should be synchronized with npm run build before signing; a subsequent build packages the signed file.

## References

- [Behavioral documentation](https://docs.jakeinmotion.com/design-mode/)
- [Adobe CEP SDK](https://github.com/Adobe-CEP/CEP-Resources)
- [After Effects scripting guide](https://github.com/docsforadobe/after-effects-scripting-guide)
- [Paper.js](https://paperjs.org/reference/)
- [Native gradient toolkit](https://github.com/zimoby/ae-native-gradient-toolkit)
