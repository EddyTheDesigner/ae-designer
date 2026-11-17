/* Shortcut presets and read-only import of native AE shortcut files. */
(function (g) {
  'use strict';
  const D = DM;
  const views = ['Fit view', 'Fit up to 100%', 'Zoom in', 'Zoom out', 'Center anchor'];
  function parse(text) {
    const map = {},
      aliases = {
        Selection: /^(?:Tool)?(?:Arrow|Selection)(?:Tool)?$/i,
        Hand: /^(?:Tool)?Hand(?:Tool)?$/i,
        Zoom: /^(?:Tool)?(?:Magnify|Zoom)(?:Tool)?$/i,
        Rotate: /^(?:Tool)?Rotat(?:e|ion)(?:Tool)?$/i,
        'Anchor Tool': /PanBehind|AnchorPointTool/i,
        Rectangle: /^(?:Tool)?Rect(?:angle)?(?:Tool)?$/i,
        Ellipse: /^(?:Tool)?(?:Oval|Ellipse)(?:Tool)?$/i,
        Pen: /^(?:Tool)?Pen(?:Tool)?$/i,
        Text: /ToolTextH|HorizontalTypeTool/i,
        'Fit view': /FitCompToWindow|ZoomFit|FitToWindow/i,
        'Fit up to 100%': /FitComp.*100|Fit.*UpTo100|ZoomFit100/i,
        'Zoom in': /^(?:Comp)?ZoomIn$/i,
        'Zoom out': /^(?:Comp)?ZoomOut$/i,
        'Center anchor': /CenterAnchor.*Content/i,
      };
    const re = /"([^"\r\n]+)"\s*=\s*"([^"\r\n]*)"/g;
    let m;
    while ((m = re.exec(text))) {
      const command = m[1].replace(/^(?:Cmd|cmd)_/, ''),
        raw = m[2].split(',')[0].replace(/[()]/g, '').trim();
      if (!raw) continue;
      let parts = raw.split('+').map((x) => x.trim()),
        key = parts.pop();
      if (/cmd|command/i.test(parts.join('+')))
        parts = parts.map((x) => (/cmd|command/i.test(x) ? 'Ctrl' : x));
      const normalize = { control: 'Ctrl', ctrl: 'Ctrl', option: 'Alt', alt: 'Alt', shift: 'Shift' };
      parts = parts.map((x) => normalize[x.toLowerCase()] || x);
      key = key.replace(/^U\+([0-9a-f]+)$/i, (_, x) => String.fromCharCode(parseInt(x, 16)));
      key =
        key.length === 1
          ? key.toLowerCase()
          : { Home: 'Home', Backspace: 'Backspace', Delete: 'Delete', Space: ' ' }[key] || key;
      const chord =
        (parts.includes('Ctrl') ? 'Ctrl+' : '') +
        (parts.includes('Alt') ? 'Alt+' : '') +
        (parts.includes('Shift') ? 'Shift+' : '') +
        key;
      for (const [name, re] of Object.entries(aliases)) if (re.test(command)) map[name] = chord;
    }
    return map;
  }
  function defaults(e, name) {
    const set = { ...Input.defaults },
      native = e.nativeShortcuts || {};
    if (name === 'Figma')
      Object.assign(set, {
        Selection: 'v',
        'Direct Selection': 'Enter',
        Rectangle: 'r',
        Ellipse: 'o',
        Line: 'l',
        Pen: 'p',
        Pencil: 'Shift+p',
        Text: 't',
        Hand: 'h',
        Scale: 'k',
        'Fit view': 'Shift+1',
        'Frame selection': 'Shift+2',
        '100%': 'Shift+0',
        'Zoom in': '+',
        'Zoom out': '-',
        'Delete Vertex': '',
        Reflect: '',
      });
    if (name === 'After Effects') Object.assign(set, native);
    for (const k of views)
      if (native[k] && !(name === 'Figma' && ['Fit view', 'Zoom in', 'Zoom out'].includes(k)))
        set[k] = native[k];
    const saved = e.read('shortcutPresets') || {};
    return saved[name] || set;
  }
  function initialize(e) {
    e.shortcutPreset = e.read('shortcutPreset') || 'Illustrator';
    e.shortcutDefaults = defaults(e, e.shortcutPreset);
  }
  function key(e, command) {
    return Object.prototype.hasOwnProperty.call(e.shortcuts, command)
      ? e.shortcuts[command]
      : (e.shortcutDefaults || Input.defaults)[command];
  }
  function show(ui) {
    const e = ui.e,
      esc = (s) =>
        String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    initialize(e);
    const saved = e.read('shortcutPresets') || {},
      names = ['Illustrator', 'After Effects', 'Figma', ...Object.keys(saved)];
    const categories = {
      Tools: Object.keys(Input.toolCommands).concat(['Cycle selection target']),
      View: [
        'Fit view',
        'Fit up to 100%',
        'Zoom in',
        'Zoom out',
        '100%',
        'Frame selection',
        'Reveal selection',
        'Rulers',
        'Outline view',
        'Show transform box',
      ],
      Edit: Object.keys(Input.defaults).filter(
        (x) =>
          !Input.toolCommands[x] &&
          x !== 'Cycle selection target' &&
          ![
            'Fit view',
            'Fit up to 100%',
            'Zoom in',
            'Zoom out',
            '100%',
            'Frame selection',
            'Reveal selection',
            'Rulers',
            'Outline view',
            'Show transform box',
          ].includes(x),
      ),
    };
    let html =
      '<div class="preset-controls"><select id="shortcut-preset">' +
      names
        .map((n) => '<option ' + (n === e.shortcutPreset ? 'selected' : '') + '>' + esc(n) + '</option>')
        .join('') +
      '</select><button id="shortcut-save">Save as preset…</button><button id="shortcut-delete" ' +
      (!saved[e.shortcutPreset] ? 'disabled' : '') +
      '>Delete</button><button id="shortcut-reset">Reset</button></div><input id="shortcut-filter" placeholder="Filter commands">';
    if (e.shortcutFiles?.length)
      html +=
        '<label>After Effects file <select id="shortcut-source">' +
        e.shortcutFiles
          .map(
            (f, i) =>
              '<option value="' +
              i +
              '" ' +
              (i === (e.shortcutSource || 0) ? 'selected' : '') +
              '>' +
              esc(f.name) +
              '</option>',
          )
          .join('') +
        '</select></label>';
    for (const [category, commands] of Object.entries(categories)) {
      html +=
        '<details open><summary>' +
        category +
        '</summary><div class="key-list">' +
        commands
          .map(
            (c) =>
              '<div class="field" data-command="' +
              esc(c) +
              '"><label>' +
              esc(c) +
              '</label><button data-key="' +
              esc(c) +
              '">' +
              esc(key(e, c) || '—') +
              '</button><button data-reset="' +
              esc(c) +
              '" ' +
              (Object.prototype.hasOwnProperty.call(e.shortcuts, c) ? '' : 'hidden') +
              '>↺</button></div>',
          )
          .join('') +
        '</div></details>';
    }
    html +=
      '<p>Always After Effects: Save, Save As, and Undo when the canvas history is empty. On Mac, Control is Control and Option is Alt. Command shortcuts remain with After Effects.</p>';
    ui.dialog(
      'Keyboard Shortcuts',
      'Click a shortcut, then press new keys.',
      [{ label: 'Done', primary: true }],
      html,
    );
    const modal = document.getElementById('modal'),
      save = () => {
        e.save('shortcuts', e.shortcuts);
        e.UI.renderToolbar();
      };
    modal.querySelector('#shortcut-preset').onchange = (ev) => {
      e.shortcutPreset = ev.target.value;
      e.save('shortcutPreset', e.shortcutPreset);
      e.shortcuts = {};
      save();
      show(ui);
    };
    modal.querySelector('#shortcut-filter').oninput = (ev) =>
      modal.querySelectorAll('[data-command]').forEach((row) => {
        row.hidden = !row.dataset.command.toLowerCase().includes(ev.target.value.toLowerCase());
        if (ev.target.value) row.closest('details').open = true;
      });
    modal.querySelectorAll('[data-key]').forEach(
      (button) =>
        (button.onclick = () => {
          button.textContent = 'Press keys…';
          button.onkeydown = (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const cmd = button.dataset.key;
            if (ev.key === 'Escape') {
              button.textContent = key(e, cmd) || '—';
              button.onkeydown = null;
              return;
            }
            if (['Control', 'Alt', 'Shift', 'Meta'].includes(ev.key)) return;
            if (ev.metaKey) {
              button.textContent = 'Command belongs to AE';
              return;
            }
            const next = Input.keyName(ev),
              conflict = Object.keys(Input.defaults).find((c) => c !== cmd && key(e, c) === next);
            if (conflict) {
              button.textContent = 'Used by ' + conflict;
              return;
            }
            e.shortcuts[cmd] = next;
            save();
            button.textContent = next;
            button.onkeydown = null;
            button.parentElement.querySelector('[data-reset]').hidden = false;
          };
          button.focus();
        }),
    );
    modal.querySelectorAll('[data-reset]').forEach(
      (b) =>
        (b.onclick = () => {
          delete e.shortcuts[b.dataset.reset];
          save();
          show(ui);
        }),
    );
    modal.querySelector('#shortcut-reset').onclick = () => {
      e.shortcuts = {};
      save();
      show(ui);
    };
    modal.querySelector('#shortcut-save').onclick = async () => {
      const values = await ui.fields('Save shortcut preset', { Name: 'My shortcuts' });
      if (!values?.Name || ['Illustrator', 'After Effects', 'Figma'].includes(values.Name)) {
        show(ui);
        return;
      }
      const presets = e.read('shortcutPresets') || {};
      presets[values.Name] = { ...e.shortcutDefaults, ...e.shortcuts };
      e.save('shortcutPresets', presets);
      e.save('shortcutPreset', values.Name);
      e.shortcuts = {};
      save();
      show(ui);
    };
    modal.querySelector('#shortcut-delete').onclick = () => {
      delete saved[e.shortcutPreset];
      e.save('shortcutPresets', saved);
      e.save('shortcutPreset', 'Illustrator');
      e.shortcuts = {};
      save();
      show(ui);
    };
    const source = modal.querySelector('#shortcut-source');
    if (source)
      source.onchange = (ev) => {
        e.shortcutSource = Number(ev.target.value);
        e.nativeShortcuts = parse(e.shortcutFiles[e.shortcutSource].text);
        e.save('shortcutSourceName', e.shortcutFiles[e.shortcutSource].name);
        initialize(e);
        show(ui);
      };
  }
  g.Shortcuts = { parse, defaults, initialize, key, show };
})(window);
