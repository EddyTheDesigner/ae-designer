# AE Designer

A vector design workspace inside Adobe After Effects. Draw and edit on a local canvas, then send the result to native AE shape layers with **Pull / Push**.

AE Designer is an independent implementation of the workflows described in the [Design Mode documentation](https://docs.jakeinmotion.com/design-mode/). It is not affiliated with Jake In Motion or Adobe. The original extension's code, binary, branding, and artwork are not included.

**Version 0.9.0 is ready for Mac/AE acceptance testing.** The documented editor tools are implemented, with 60 passing automated tests. After Effects and macOS were unavailable during development, so native execution and exact equivalence to the original remain unverified. See [implementation coverage](docs/PARITY.md) and [validation results](docs/VALIDATION.md).

## Install on Mac

Download **AE-Designer-Mac.zip** from [Releases](https://github.com/EddyTheDesigner/ae-designer/releases), then extract the entire archive.

1. Install the included **AE-Designer.zxp** using your ZXP installer.
2. Restart After Effects.
3. Open **Window → Extensions → AE Designer**.
4. Optional: open **AE Designer Layers** and **AE Designer Properties** from the same menu. Keep the main panel open.

The ZXP uses this project's own development certificate. If your installer rejects it or the panel does not appear, use the included folder installer:

    bash "/path/to/AE-Designer/scripts/install-mac.command"

You can type bash followed by a space in Terminal, drag install-mac.command onto it, and press Return. The installer backs up a previous AE Designer installation, copies the extension into your user CEP folder, and enables CEP development mode. It does not require administrator access.

Target: **After Effects 2023+**, with **AE 2024+ for text**, on Intel or Apple Silicon Macs. The installed extension consists of HTML, CSS, JavaScript, ExtendScript, and bundled libraries; it contains no platform-specific executable. In AE's **Scripting & Expressions** preferences, enable **Allow Scripts to Write Files and Access Network** for gradient presets and source preview files.

## Use

- **Pull all / Pull selected** reads the active composition at the current time. Large pulls show progress and can be canceled with Escape.
- Draw, select, and edit locally. Normal canvas edits do not alter AE until **Push**.
- **Push** updates source layers and changed properties. Animated properties receive a key at the pull time; expression-driven values are guarded.
- **Push as new** creates fresh layers at the top of the active comp. It carries current values, not source animation, effects, or parenting. Gradients become first-stop solid colors in this mode, as documented by the reference tool.
- Converting text to shapes is an explicit host action: AE creates outlines and switches off the original text layer.
- Export an **.aedesigner** file from the footer menu for a portable canvas copy. Recovery drafts are saved automatically in CEP's local storage.

On Mac, editor shortcuts use **Control**, not Command. Command shortcuts remain available to AE. Option supplies alternate-drag behavior. Illustrator, AE, Figma, and custom shortcut sets are available.

## Tools

- Selection, Direct Selection, Magic Wand, Lasso, Pen, Pencil, shape tools, text, anchor, rotation, scale, shear, reflect, gradient, offset, and width controls.
- Live rectangles, ellipses, polystars, pie/ring and line rigs; point/tangent editing; corners, cleanup, simplify, move along path, stroke outlines, and all seven Pathfinder operations.
- Five native Repeater array layouts, split/merge/consolidate, paint controls, gradients with color and opacity stops, mask previews, and inline point/paragraph text.
- Layers and Properties panels, Last Action replay, undo/redo, guides, snapping, isolation, recovery, and saved preferences.

The full documentation section index is in [DOCUMENTATION-DIRECTORY.md](docs/DOCUMENTATION-DIRECTORY.md). Start your real-host checks with [MAC-AE-VALIDATION.md](docs/MAC-AE-VALIDATION.md).

## Development

The installed panel requires no npm or network connection. Development requires Node.js 22 or 24:

    npm ci
    npx playwright install chromium
    npm run check
    npm test
    npm run test:ui
    node scripts/serve.cjs

Open [localhost:8173](http://127.0.0.1:8173). Browser preview exercises the editor; Pull and Push require AE and report that requirement rather than simulating a successful transfer.

Running npm run build creates the Mac ZIP and includes a signed ZXP when present. See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for signing and module details.

Project code is MIT-licensed. Bundled components retain their own licenses; see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
