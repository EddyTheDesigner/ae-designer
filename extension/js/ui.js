(function (g) {
  'use strict';
  const D = DM;
  const esc = (s) =>
    String(s == null ? '' : s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const TOOLS = [
    ['select', 'Layer Selection', 'V', ['select', 'group-select', 'path-select']],
    ['direct', 'Direct Selection', 'A'],
    ['wand', 'Magic Wand', 'Y'],
    ['lasso', 'Lasso', 'Q'],
    ['hand', 'Hand', 'H'],
    ['zoom', 'Zoom', 'Z'],
    ['rotate', 'Rotate', 'R', ['rotate', 'reflect']],
    ['scale', 'Scale', 'S', ['scale', 'shear']],
    ['anchor', 'Anchor Tool', ''],
    ['rect', 'Rectangle', 'M', ['rect', 'roundrect', 'ellipse', 'polygon', 'star', 'line']],
    ['pen', 'Pen', 'P', ['pen', 'add', 'deletepoint', 'convert']],
    ['pencil', 'Pencil', 'N'],
    ['scissors', 'Scissors', 'C'],
    ['offset', 'Offset Path', ''],
    ['width', 'Width', 'Shift+W'],
    ['text', 'Text', 'T'],
    ['eyedropper', 'Eyedropper', 'I'],
    ['gradient', 'Gradient', 'G'],
  ];
  const NAMES = {
    ...Object.fromEntries(TOOLS.map((t) => [t[0], t[1]])),
    'group-select': 'Group Selection',
    'path-select': 'Path Selection',
    roundrect: 'Rounded Rectangle',
    ellipse: 'Ellipse',
    polygon: 'Polygon',
    star: 'Polystar',
    line: 'Line',
    reflect: 'Reflect',
    shear: 'Shear',
    add: 'Add Vertex',
    deletepoint: 'Delete Vertex',
    convert: 'Convert Vertex',
  };
  const LABELS = [
    '#999999',
    '#b95555',
    '#e4d887',
    '#91d4d3',
    '#bd8ac0',
    '#9b9bdf',
    '#e8ae9c',
    '#b9d5a3',
    '#677bca',
    '#66b5cc',
    '#aa76c0',
    '#d888a8',
    '#71b98a',
    '#bfa77a',
    '#7b7b7b',
    '#cfb66b',
    '#69b8b4',
  ];
  class UI {
    constructor(e) {
      this.e = e;
      this.bindings = [];
      this.closed = new Set();
      this.lastTools = {};
      this.floating = e.read('floatingTools');
      window.addEventListener('resize', () => WorkspaceUI.fitToolbar(this));
      document.body.addEventListener('click', (event) => {
        const el = event.target.closest('[data-cmd]');
        if (el) {
          event.preventDefault();
          this.closeMenu();
          let arg = el.dataset.arg;
          try {
            if (arg && arg[0] === '{') arg = JSON.parse(arg);
          } catch (ignore) {}
          e.command(el.dataset.cmd, arg);
        }
      });
      document.getElementById('open-file').addEventListener('change', async (ev) => {
        try {
          const doc = D.validate(JSON.parse(await ev.target.files[0].text()));
          if (
            e.dirty &&
            !(await this.confirm('Replace the canvas?', 'Importing replaces your current canvas.'))
          )
            return;
          e.history = new D.History(doc);
          e.baseline = D.blank();
          e.detached = !!doc.source;
          e.selection = [];
          e.changed();
          e.fit();
        } catch (err) {
          e.notice(err.message);
        }
        ev.target.value = '';
      });
      window.addEventListener('pointerdown', (ev) => {
        if (!ev.target.closest('.menu') && !ev.target.closest('[data-menu]')) this.closeMenu();
      });
      this.setupDividers();
    }
    btn(cmd, title, ico, arg, extra) {
      return (
        '<button data-cmd="' +
        cmd +
        '" ' +
        (arg ? 'data-arg="' + esc(typeof arg === 'object' ? JSON.stringify(arg) : arg) + '"' : '') +
        ' title="' +
        esc(title) +
        '" aria-label="' +
        esc(title) +
        '" ' +
        (extra || '') +
        '>' +
        icon(ico) +
        '</button>'
      );
    }
    render() {
      this.renderToolbar();
      this.renderLayers();
      this.renderProperties();
      this.renderStatus();
    }
    renderToolbar() {
      if (this.e.role !== 'main') return;
      const e = this.e,
        el = document.getElementById('toolbar');
      let t = '<div class="tools" id="tools">';
      TOOLS.forEach(([id, title, key, group]) => {
        let active = (group || [id]).includes(e.tool);
        let current = active
          ? id === 'select'
            ? e.selectionMode === 'group'
              ? 'group-select'
              : e.selectionMode === 'path'
                ? 'path-select'
                : 'select'
            : e.tool
          : this.lastTools[id] || id;
        if (active) this.lastTools[id] = current;
        const ico = current;
        t +=
          '<button class="tool ' +
          (active ? 'active' : '') +
          '" data-tool="' +
          current +
          '" data-group="' +
          id +
          '" title="' +
          esc(NAMES[current] || title) +
          (key ? ' (' + key + ')' : '') +
          '" aria-label="' +
          esc(NAMES[current] || title) +
          '">' +
          icon(ico) +
          (group ? '<span class="triangle"></span>' : '') +
          '</button>';
      });
      t +=
        '</div><button class="tool" id="more-tools" data-menu="tools" title="More tools">' +
        icon('more') +
        '</button><div class="toolbar-options">' +
        this.btn('snap', 'Snapping', 'magnet', null, 'class="' + (e.prefs.snapping ? 'active' : '') + '"') +
        this.btn(
          'toggle-box',
          'Show Transform Box',
          'box',
          null,
          'class="' + (e.showBox ? 'active' : '') + '"',
        ) +
        '<select id="transform-mode" title="Transform Mode" class="optional">' +
        ['Combined', 'Individual: Comp', 'Individual: Object']
          .map((x) => '<option ' + (x === e.transformMode ? 'selected' : '') + '>' + x + '</option>')
          .join('') +
        '</select><button id="pivot-menu" data-menu="pivot" title="Transform anchor" class="optional">' +
        icon('grid') +
        '</button></div>';
      if (e.selection.length)
        t += '<button id="path-actions" data-menu="path" title="Path actions">' + icon('path') + '</button>';
      t +=
        this.btn('undo', 'Undo (Control+Z)', 'undo') +
        this.btn('redo', 'Redo (Control+Shift+Z)', 'redo') +
        '<div class="spacer"></div><div class="host-actions">';
      [
        ['pull', 'Pull all', 'pull', ''],
        ['pull-selected', 'Pull selected', 'pull', 'secondary'],
        ['push', 'Push', 'push', 'primary'],
        ['push-new', 'Push as new', 'push', 'secondary'],
      ].forEach(
        ([cmd, label, ic, cls]) =>
          (t +=
            '<button data-cmd="' +
            cmd +
            '" class="' +
            cls +
            '" title="' +
            label +
            '" ' +
            (e.busy ? 'disabled' : '') +
            '>' +
            icon(ic) +
            '<span class="text">' +
            (e.busy ? 'Working…' : label) +
            '</span></button>'),
      );
      t += '</div>';
      if (e.pullState)
        t = t.replace(
          /<div class="host-actions">[\s\S]*$/,
          '<div class="pull-progress"><progress max="' +
            Math.max(1, e.pullState.total) +
            '" value="' +
            e.pullState.done +
            '"></progress><span>' +
            e.pullState.done +
            ' / ' +
            e.pullState.total +
            '</span><button data-cmd="cancel-pull" title="Cancel pull (Escape)">×</button></div>',
        );
      el.innerHTML = t;
      el.querySelectorAll('[data-tool]').forEach((b) => {
        b.onclick = (ev) => {
          if (ev.target.classList.contains('triangle')) this.toolMenu(b);
          else this.chooseTool(b.dataset.tool);
        };
        b.oncontextmenu = (ev) => {
          ev.preventDefault();
          this.toolMenu(b);
        };
        let timer;
        b.onpointerdown = () => (timer = setTimeout(() => this.toolMenu(b), 450));
        b.onpointerup = () => clearTimeout(timer);
        b.onpointerleave = () => clearTimeout(timer);
        b.ondblclick = () => {
          const id = b.dataset.tool;
          if (id === 'rotate') e.command('reset-transform', 'rotation');
          else if (id === 'scale') e.command('reset-transform', 'scale');
          else if (id === 'anchor') e.command('center-anchor');
          else if (['rect', 'roundrect', 'ellipse', 'star', 'polygon'].includes(id))
            e.edit('Comp-sized shape', () => {
              const shape = D.shape(
                id === 'roundrect' ? 'rect' : id === 'polygon' ? 'star' : id,
                0,
                0,
                e.doc.width,
                e.doc.height,
                { roundness: id === 'roundrect' ? 40 : 0, polygon: id === 'polygon' },
              );
              if (id === 'star' || id === 'polygon') {
                shape.props['ADBE Vector Star Position'] = [e.doc.width / 2, e.doc.height / 2];
                shape.props['ADBE Vector Star Outer Radius'] = Math.min(e.doc.width, e.doc.height) / 2;
              }
              e.insertShape(shape);
              e.selection = [shape.id];
            });
        };
      });
      el.querySelector('#more-tools').onclick = (ev) =>
        this.menu(
          ev.currentTarget,
          TOOLS.flatMap((t) =>
            (t[3] || [t[0]]).map((id) => ({ label: NAMES[id], run: () => this.chooseTool(id) })),
          ),
        );
      el.querySelector('#transform-mode').onchange = (ev) => (e.transformMode = ev.target.value);
      el.querySelector('#pivot-menu').onclick = (ev) =>
        this.menu(
          ev.currentTarget,
          [
            'Top left',
            'Top center',
            'Top right',
            'Left center',
            'Center',
            'Right center',
            'Bottom left',
            'Bottom center',
            'Bottom right',
          ].map((label, i) => ({
            label,
            run: () => {
              const b = Geometry.bounds(e.doc, e.selection);
              if (b) e.pivot = [b.left + (b.width * (i % 3)) / 2, b.top + (b.height * Math.floor(i / 3)) / 2];
              e.renderCanvas();
            },
          })),
        );
      const path = el.querySelector('#path-actions');
      if (path) path.onclick = (ev) => this.pathMenu(ev.currentTarget);
      WorkspaceUI.toolbar(this);
      el.oncontextmenu = (ev) => {
        if (ev.target.closest('[data-tool]')) return;
        ev.preventDefault();
        this.menu({ x: ev.clientX, y: ev.clientY }, [
          { label: 'Undock toolbar', run: () => this.floatToolbar() },
        ]);
      };
    }
    chooseTool(id) {
      if (id === 'group-select' || id === 'path-select' || id === 'select') {
        this.e.selectionMode = id === 'select' ? 'layer' : id === 'group-select' ? 'group' : 'path';
        this.lastTools.select = id;
        this.e.setTool('select');
      } else this.e.setTool(id);
    }
    toolMenu(btn) {
      const t = TOOLS.find((x) => x[0] === btn.dataset.group);
      if (t && t[3])
        this.menu(
          btn,
          t[3].map((id) => ({ label: NAMES[id], run: () => this.chooseTool(id) })),
        );
    }
    floatToolbar() {
      this.floating = this.floating || { x: 30, y: 35, vertical: false };
      const state = this.floating,
        tools = document.getElementById('tools');
      if (!tools) return;
      tools.classList.add('floating-tools');
      tools.classList.toggle('vertical', !!state.vertical);
      tools.style.left = state.x + 'px';
      tools.style.top = state.y + 'px';
      if (!tools.querySelector('.grip'))
        tools.insertAdjacentHTML('afterbegin', '<span class="grip">⠿</span>');
      document.getElementById('viewport').appendChild(tools);
      const grip = tools.querySelector('.grip'),
        save = () => this.e.save('floatingTools', this.floating);
      grip.onpointerdown = (ev) => {
        const start = [ev.clientX, ev.clientY],
          xy = [state.x, state.y];
        grip.setPointerCapture(ev.pointerId);
        grip.onpointermove = (mv) => {
          state.x = Math.max(0, xy[0] + mv.clientX - start[0]);
          state.y = Math.max(0, xy[1] + mv.clientY - start[1]);
          tools.style.left = state.x + 'px';
          tools.style.top = state.y + 'px';
        };
        grip.onpointerup = () => {
          grip.onpointermove = null;
          save();
        };
      };
      grip.ondblclick = () => {
        state.x = 30;
        state.y = 35;
        tools.style.left = '30px';
        tools.style.top = '35px';
        save();
      };
      tools.oncontextmenu = (ev) => {
        ev.preventDefault();
        this.menu({ x: ev.clientX, y: ev.clientY }, [
          {
            label: 'Horizontal',
            run: () => {
              state.vertical = false;
              save();
              this.renderToolbar();
            },
          },
          {
            label: 'Vertical',
            run: () => {
              state.vertical = true;
              save();
              this.renderToolbar();
            },
          },
          {
            label: 'Dock toolbar',
            run: () => {
              tools.remove();
              this.floating = null;
              save();
              this.renderToolbar();
            },
          },
        ]);
      };
      save();
    }
    renderLayers() {
      const e = this.e,
        el = document.getElementById('layers');
      const scroll = el.scrollTop,
        searchFocused = document.activeElement && document.activeElement.id === 'hierarchy-search',
        caret = searchFocused ? document.activeElement.selectionStart : 0;
      let html =
        '<div class="layer-controls"><button id="collapse-all" title="Collapse all">' +
        icon('down') +
        '</button><button id="expand-all" title="Expand all">' +
        icon('up') +
        '</button><input id="hierarchy-search" placeholder="⌕" aria-label="Search the hierarchy" value="' +
        esc(e.search) +
        '"><select id="kind-filter" title="Filter by kind">' +
        ['All', 'Layers', 'Groups', 'Shapes', 'Masks', 'Fills', 'Strokes', 'Operators']
          .map((x) => '<option ' + (e.kindFilter === x ? 'selected' : '') + '>' + x + '</option>')
          .join('') +
        '</select></div>';
      const matches = (n) => {
        const type = n.type,
          filter = e.kindFilter;
        return (
          (!e.search || n.name.toLowerCase().includes(e.search.toLowerCase())) &&
          (!filter ||
            filter === 'All' ||
            (filter === 'Layers' && (type === 'layer' || type === 'text')) ||
            (filter === 'Groups' && type === 'group') ||
            (filter === 'Shapes' && D.isShape(n) && type !== 'mask') ||
            (filter === 'Masks' && type === 'mask') ||
            (filter === 'Fills' && type.toLowerCase().includes('fill')) ||
            (filter === 'Strokes' && type.toLowerCase().includes('stroke')) ||
            (filter === 'Operators' && type === 'operator'))
        );
      };
      const row = (n, depth) => {
        const filtering = !!e.search || (e.kindFilter && e.kindFilter !== 'All'),
          show = matches(n);
        if (show) {
          const has = n.children.length,
            open = e.expanded.has(n.id);
          html +=
            '<div class="row ' +
            (e.selection.includes(n.id) ? 'selected ' : '') +
            (n.visible === false ? 'dim' : '') +
            '" data-id="' +
            esc(n.id) +
            '" draggable="' +
            (n.type !== 'mask' && !n.locked) +
            '" style="padding-left:' +
            (depth * 12 + 3) +
            'px"><button class="twisty" data-action="expand" title="Expand or collapse">' +
            (has ? (open ? '⌄' : '›') : '') +
            '</button><button data-action="visible" title="Show / hide">' +
            icon('eye') +
            '</button><button data-action="locked" title="Lock / unlock" style="opacity:' +
            (n.locked ? 1 : 0.4) +
            '">' +
            icon(n.locked ? 'lock' : 'unlock') +
            '</button><span class="label" data-action="label" style="background:' +
            (n.type === 'mask' ? D.hex(n.mask.color) : LABELS[n.label] || '#888') +
            '"></span>' +
            icon(
              n.type === 'layer'
                ? 'star'
                : n.type === 'group'
                  ? 'group'
                  : n.type === 'operator'
                    ? 'path'
                    : n.type.includes('Fill')
                      ? 'fill'
                      : n.type.includes('Stroke')
                        ? 'stroke'
                        : n.type,
            ) +
            '<span class="name" title="' +
            esc(n.name) +
            '">' +
            esc(n.name) +
            '</span>' +
            (['path', 'rect', 'ellipse', 'star'].includes(n.type)
              ? '<button class="direction" data-action="direction" title="' +
                (n.props['ADBE Vector Shape Direction'] === 3 ? 'Reversed' : 'Normal') +
                '">' +
                (n.props['ADBE Vector Shape Direction'] === 3 ? '↶' : '↷') +
                '</button>'
              : '') +
            (!n.source ? '<span class="new">new</span>' : '') +
            (['layer', 'group'].includes(n.type)
              ? '<button class="add" data-action="add" title="Add">+</button>'
              : '') +
            '</div>';
        }
        if (filtering || e.expanded.has(n.id)) n.children.forEach((c) => row(c, depth + 1));
      };
      e.doc.layers.forEach((n) => row(n, 0));
      if (!e.doc.layers.length)
        html +=
          '<div class="empty">' +
          (e.role !== 'main' && !e.received ? 'Waiting for AE Designer…' : 'No layers on the canvas') +
          '</div>';
      el.innerHTML = html;
      el.scrollTop = scroll;
      el.querySelector('#hierarchy-search').oninput = (ev) => {
        e.search = ev.target.value;
        this.renderLayers();
      };
      if (searchFocused) {
        el.querySelector('#hierarchy-search').focus();
        el.querySelector('#hierarchy-search').setSelectionRange(caret, caret);
      }
      el.querySelector('#kind-filter').onchange = (ev) => {
        e.kindFilter = ev.target.value;
        this.renderLayers();
      };
      el.querySelector('#collapse-all').onclick = () => {
        e.expanded.clear();
        this.renderLayers();
      };
      el.querySelector('#expand-all').onclick = () => {
        D.walk(e.doc.layers, (n) => e.expanded.add(n.id));
        this.renderLayers();
      };
      el.ondragover = (ev) => {
        if (!ev.target.closest('.row')) ev.preventDefault();
      };
      el.ondrop = (ev) => {
        if (ev.target.closest('.row')) return;
        ev.preventDefault();
        try {
          const ids = JSON.parse(ev.dataTransfer.getData('text/plain'));
          e.command('move-new-layer', { ids });
        } catch (ignore) {}
      };
      el.querySelectorAll('.row').forEach((r) => {
        r.onclick = (ev) => {
          if (Date.now() < (this.suppressTreeClick || 0)) return;
          const action = ev.target.closest('[data-action]');
          if (action) {
            if (action.dataset.action === 'add') return this.addMenu(action, r.dataset.id);
            if (action.dataset.action === 'label') return this.labelMenu(action, r.dataset.id);
            this.treeAction({ id: r.dataset.id, action: action.dataset.action });
          } else
            e.select(
              ev.shiftKey
                ? e.selection.includes(r.dataset.id)
                  ? e.selection.filter((x) => x !== r.dataset.id)
                  : e.selection.concat(r.dataset.id)
                : [r.dataset.id],
            );
        };
        r.onpointerdown = (ev) => {
          const button = ev.target.closest('[data-action]');
          if (ev.button !== 0 || !button || !['visible', 'locked'].includes(button.dataset.action)) return;
          ev.preventDefault();
          ev.stopPropagation();
          const key = button.dataset.action,
            node = D.find(e.doc, r.dataset.id),
            value = !node[key],
            ids = new Set(),
            before = e.history.begin();
          const mark = (row) => {
            const n = row && D.find(e.doc, row.dataset.id);
            if (!n || ids.has(n.id)) return;
            ids.add(n.id);
            n[key] = value;
            e.renderCanvas();
            this.renderLayers();
          };
          mark(r);
          const move = (event) => {
            const target = document.elementFromPoint(event.clientX, event.clientY),
              cell = target?.closest('[data-action]');
            if (cell?.dataset.action === key) mark(cell.closest('.row'));
          };
          const end = () => {
            window.removeEventListener('pointermove', move);
            this.suppressTreeClick = Date.now() + 200;
            if (e.role === 'main') {
              e.history.commit(before, key === 'visible' ? 'Visibility' : 'Lock');
              e.changed();
            } else {
              e.doc = before.doc;
              e.property({
                ids: [...ids],
                target: 'node',
                key,
                value,
                label: key === 'visible' ? 'Visibility' : 'Lock',
              });
            }
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', end, { once: true });
        };
        r.ondblclick = (ev) => {
          if (!ev.target.closest('.name')) return;
          const n = D.find(e.doc, r.dataset.id),
            span = r.querySelector('.name');
          span.innerHTML = '<input value="' + esc(n.name) + '">';
          const input = span.querySelector('input');
          input.focus();
          input.select();
          if (input.type === 'number') {
            input.title = input.closest('.field')?.querySelector('label')?.textContent || '';
            input.onpointerdown = (ev) => {
              if (ev.button !== 0) return;
              const x = ev.clientX,
                initial = Number(input.value),
                base = this.e.history.begin(),
                historyLength = this.e.history.undoStack.length;
              let moved = false,
                lastAction = null;
              const move = (mv) => {
                if (Math.abs(mv.clientX - x) < 3 && !moved) return;
                moved = true;
                mv.preventDefault();
                input.value =
                  initial + (mv.clientX - x) * (mv.shiftKey ? 10 : mv.altKey || mv.ctrlKey ? 0.1 : 1);
                input.onchange();
                lastAction = this.e.history.lastAction;
                this.e.history.undoStack.splice(historyLength);
              };
              const up = () => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
                if (moved) {
                  if (lastAction) {
                    lastAction.base = D.clone(base.doc);
                    lastAction.initialValues = D.clone(lastAction.values);
                  }
                  this.e.history.commit(base, 'Change ' + input.title, lastAction);
                  this.e.changed();
                }
              };
              window.addEventListener('pointermove', move);
              window.addEventListener('pointerup', up, { once: true });
            };
          }
          input.onkeydown = (ev) => {
            if (ev.key === 'Enter') {
              e.property({ ids: [n.id], target: 'node', key: 'name', value: input.value, label: 'Rename' });
            }
            if (ev.key === 'Escape') this.renderLayers();
            ev.stopPropagation();
          };
          input.onblur = () =>
            e.property({ ids: [n.id], target: 'node', key: 'name', value: input.value, label: 'Rename' });
        };
        r.oncontextmenu = (ev) => {
          ev.preventDefault();
          if (!e.selection.includes(r.dataset.id)) e.select([r.dataset.id]);
          this.contextMenu({ x: ev.clientX, y: ev.clientY });
        };
        r.ondragstart = (ev) => {
          if (!e.selection.includes(r.dataset.id)) e.select([r.dataset.id]);
          ev.dataTransfer.setData('text/plain', JSON.stringify(e.selection));
        };
        r.ondragover = (ev) => {
          ev.preventDefault();
          r.classList.add('drop');
        };
        r.ondragleave = () => r.classList.remove('drop');
        r.ondrop = (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          r.classList.remove('drop');
          let ids;
          try {
            ids = JSON.parse(ev.dataTransfer.getData('text/plain'));
          } catch (err) {
            return;
          }
          e.command('reparent', {
            ids,
            target: r.dataset.id,
            inside: ev.offsetX > 40,
            after: ev.clientY > r.getBoundingClientRect().top + r.offsetHeight / 2,
          });
        };
      });
    }
    treeAction(a) {
      const e = this.e;
      if (e.role !== 'main') {
        e.bridge.send('tree', a);
        return;
      }
      const n = D.find(e.doc, a.id);
      if (!n) return;
      if (a.action === 'direction') {
        e.property({
          ids: [n.id],
          key: 'ADBE Vector Shape Direction',
          value: n.props['ADBE Vector Shape Direction'] === 3 ? 1 : 3,
          label: 'Path direction',
        });
        return;
      }
      if (a.action === 'expand') {
        if (e.expanded.has(n.id)) e.expanded.delete(n.id);
        else e.expanded.add(n.id);
        this.renderLayers();
        e.broadcast();
      } else e.edit(a.action === 'visible' ? 'Visibility' : 'Lock', () => (n[a.action] = !n[a.action]));
    }
    addMenu(anchor, id) {
      this.e.select([id]);
      this.menu(
        anchor,
        [
          'Group',
          'Rect',
          'Ellipse',
          'Star',
          'Fill',
          'Stroke',
          'Gradient Fill',
          'Gradient Stroke',
          ...Object.keys(D.operators),
        ].map((x) => ({
          label: x === 'Rect' ? 'Rectangle' : x === 'Star' ? 'Polystar' : x,
          run: () => this.e.command('add', x),
        })),
      );
    }
    labelMenu(anchor, id) {
      const n = D.find(this.e.doc, id);
      if (n.type === 'mask') {
        const picker = document.createElement('input');
        picker.type = 'color';
        picker.value = D.hex(n.mask.color);
        picker.onchange = () => {
          this.e.property({
            ids: this.e.selection.filter((id) => D.find(this.e.doc, id)?.type === 'mask'),
            target: 'mask',
            key: 'color',
            value: D.rgb(picker.value),
            label: 'Mask color',
          });
          picker.remove();
        };
        picker.click();
        return;
      }
      this.menu(anchor, [
        {
          label: 'Select label group',
          run: () => {
            const ids = [];
            D.walk(this.e.doc.layers, (x) => {
              if (x.type === 'layer' && x.label === n.label && !x.locked) ids.push(x.id);
            });
            this.e.select(ids);
          },
        },
        ...LABELS.map((col, i) => ({
          label: (i ? 'Label ' + i : 'None') + '  ' + col,
          run: () =>
            this.e.property({ ids: [id], target: 'node', key: 'label', value: i, label: 'Layer label' }),
        })),
      ]);
    }
    section(title, content) {
      return (
        '<details class="section" data-section="' +
        esc(title) +
        '" ' +
        (this.closed.has(title) ? '' : 'open') +
        '><summary>' +
        esc(title) +
        '</summary>' +
        content +
        '</details>'
      );
    }
    field(label, value, callback, options) {
      options = options || {};
      const id = this.bindings.length;
      this.bindings.push({ callback, value, options });
      let input = '';
      if (options.choices)
        input =
          '<select data-field="' +
          id +
          '">' +
          options.choices
            .map((x) => {
              const [v, t] = Array.isArray(x) ? x : [x, x];
              return (
                '<option value="' +
                esc(v) +
                '" ' +
                (String(v) === String(value) ? 'selected' : '') +
                '>' +
                esc(t) +
                '</option>'
              );
            })
            .join('') +
          '</select>';
      else if (typeof value === 'boolean')
        input = '<input type="checkbox" data-field="' + id + '" ' + (value ? 'checked' : '') + '>';
      else if (Array.isArray(value))
        input = value
          .map(
            (v, i) =>
              '<input type="number" step="any" data-field="' +
              id +
              '" data-component="' +
              i +
              '" value="' +
              +v.toFixed(3) +
              '" title="' +
              esc(label) +
              ' ' +
              ['X', 'Y', 'Z'][i] +
              '">',
          )
          .join('');
      else if (options.color)
        input = '<input type="color" data-field="' + id + '" value="' + esc(value) + '">';
      else
        input =
          '<input ' +
          (options.wide ? 'class="wide" ' : '') +
          'type="' +
          (typeof value === 'number' ? 'number' : 'text') +
          '" ' +
          (typeof value === 'number' ? 'step="any" ' : '') +
          'data-field="' +
          id +
          '" value="' +
          esc(typeof value === 'number' ? +value.toFixed(3) : value) +
          '" ' +
          (options.placeholder ? 'placeholder="' + esc(options.placeholder) + '"' : '') +
          ' ' +
          (options.disabled ? 'disabled' : '') +
          '>';
      if (options.mixed)
        input = input.replace(/value="[^"]*"/g, 'value="" placeholder="Mixed"').replace(/checked/g, '');
      return (
        '<div class="field ' +
        (options.expression ? 'expression' : '') +
        '"><label>' +
        esc(label) +
        '</label><div class="values">' +
        input +
        (options.unit ? '<span class="unit">' + esc(options.unit) + '</span>' : '') +
        '</div>' +
        (options.keys
          ? '<span class="keyframe" title="' +
            (options.atKey ? 'Keyframe at pull time' : 'Animated property') +
            '">' +
            (options.atKey ? '◆' : '◇') +
            '</span>'
          : '') +
        '</div>'
      );
    }
    prop(nodes, key, label, options, target) {
      const e = this.e,
        first = nodes[0];
      if (!first) return '';
      const v =
        target === 'node'
          ? first[key]
          : target === 'transform'
            ? first.transform[key]
            : target === 'text'
              ? first.text[key]
              : target === 'mask'
                ? first.mask[key]
                : target === 'node'
                  ? first[key]
                  : first.props[key];
      if (v === undefined) return '';
      const m = first.meta[(target === 'transform' ? 'transform.' : '') + key] || {};
      return this.field(
        label,
        v,
        (value) =>
          e.property({
            ids: nodes.map((n) => n.id),
            target: target || 'props',
            key,
            value,
            label: 'Change ' + label,
          }),
        {
          ...m,
          ...options,
          mixed: nodes.some(
            (x) =>
              JSON.stringify(
                target === 'transform'
                  ? x.transform[key]
                  : target === 'text'
                    ? x.text[key]
                    : target === 'mask'
                      ? x.mask[key]
                      : target === 'node'
                        ? x[key]
                        : x.props[key],
              ) !== JSON.stringify(v),
          ),
        },
      );
    }
    renderProperties() {
      const e = this.e,
        el = document.getElementById('properties'),
        scroll = el.scrollTop;
      this.bindings = [];
      const nodes = e.selection.map((id) => D.find(e.doc, id)).filter(Boolean),
        n = nodes[0];
      let html = '';
      if (e.tool === 'wand')
        html += this.section(
          'Magic Wand',
          this.field('Select', e.wandMode || 'fill', (v) => (e.wandMode = v), {
            choices: [
              ['fill', 'Same fill color'],
              ['stroke', 'Same stroke color'],
              ['width', 'Same stroke weight'],
              ['both', 'Same fill & stroke'],
            ],
          }),
        );
      if (e.tool === 'pencil')
        html += this.section(
          'Pencil',
          this.field('Fidelity', e.fidelity || 2, (v) => (e.fidelity = v), { unit: 'px' }) +
            this.field('Recognize shapes', !!e.recognize, (v) => (e.recognize = v)),
        );
      if (e.tool === 'scale')
        html += this.section(
          'Scale',
          this.field('Scale strokes', e.prefs.scaleStrokes, (v) => {
            e.prefs.scaleStrokes = v;
            e.save('prefs', e.prefs);
          }) +
            this.field('Scale corners', e.prefs.scaleCorners, (v) => {
              e.prefs.scaleCorners = v;
              e.save('prefs', e.prefs);
            }),
        );
      if (n && n.array) html += Arrays.fields(this, n);
      if (n) {
        const b = e.role === 'main' ? Geometry.bounds(e.doc, e.selection) : null;
        let align = '<div class="sub-label">Alignment:</div><div class="button-row">';
        ['left', 'centerx', 'right', 'top', 'centery', 'bottom'].forEach(
          (x) => (align += this.btn('align', 'Align ' + x, x, x)),
        );
        align +=
          '</div><div class="sub-label">Align To:</div>' +
          this.field('', e.alignTo || 'selection', (v) => (e.alignTo = v), {
            choices: [
              ['selection', 'Selection'],
              ['key', 'Key object'],
              ['composition', 'Composition'],
            ],
          }) +
          '<div class="button-row">' +
          this.btn('distribute', 'Distribute horizontal centers', 'centerx', 'x') +
          this.btn('distribute', 'Distribute vertical centers', 'centery', 'y') +
          '</div>';
        if (nodes.length > 1) {
          align +=
            '<div class="sub-label">Distribute:</div><div class="button-row">' +
            ['left', 'center', 'right']
              .map((edge) =>
                this.btn('distribute', 'Distribute ' + edge, edge === 'center' ? 'centerx' : edge, {
                  axis: 'x',
                  edge,
                }),
              )
              .join('') +
            ['top', 'center', 'bottom']
              .map((edge) =>
                this.btn('distribute', 'Distribute ' + edge, edge === 'center' ? 'centery' : edge, {
                  axis: 'y',
                  edge,
                }),
              )
              .join('') +
            '</div>';
          align +=
            this.field('Gap', e.distributeGap || 0, (v) => (e.distributeGap = v), { unit: 'px' }) +
            '<div class="button-row"><button data-cmd="distribute-gap" data-arg="x">Horizontal spacing</button><button data-cmd="distribute-gap" data-arg="y">Vertical spacing</button></div>';
          if (e.alignTo === 'composition')
            align += this.field(
              'Composition',
              e.alignComposition || 'Each',
              (v) => (e.alignComposition = v),
              {
                choices: ['Each', 'Together'],
              },
            );
        }
        html += this.section('Align', align);
        if (n.type === 'layer' || n.type === 'group' || n.type === 'text') {
          let trans = this.prop(
            nodes.filter((x) => x.type === n.type),
            'name',
            'Name',
            {},
            'node',
          );
          trans +=
            n.type === 'layer'
              ? this.prop(
                  nodes.filter((x) => x.type === n.type),
                  'blendName',
                  'Blend Mode',
                  {
                    choices: [
                      'NORMAL',
                      'DISSOLVE',
                      'DARKEN',
                      'MULTIPLY',
                      'COLOR_BURN',
                      'LINEAR_BURN',
                      'ADD',
                      'LIGHTEN',
                      'SCREEN',
                      'COLOR_DODGE',
                      'LINEAR_DODGE',
                      'OVERLAY',
                      'SOFT_LIGHT',
                      'HARD_LIGHT',
                      'VIVID_LIGHT',
                      'LINEAR_LIGHT',
                      'PIN_LIGHT',
                      'HARD_MIX',
                      'DIFFERENCE',
                      'EXCLUSION',
                      'SUBTRACT',
                      'DIVIDE',
                      'HUE',
                      'SATURATION',
                      'COLOR',
                      'LUMINOSITY',
                    ].map((k) => [k, k.toLowerCase().replace(/_/g, ' ')]),
                  },
                  'node',
                )
              : this.prop(
                  nodes.filter((x) => x.type === n.type),
                  'ADBE Vector Blend Mode',
                  'Blend Mode',
                  { choices: PaintPreview.modes.map((name, i) => [i + 1, name]) },
                );
          [
            'position',
            'anchor',
            'scale',
            'orientation',
            'xRotation',
            'yRotation',
            'rotation',
            'skew',
            'skewAxis',
            'opacity',
          ].forEach((k) => {
            if (n.type !== 'group' && ['skew', 'skewAxis'].includes(k)) return;
            trans += this.prop(
              nodes.filter((x) => x.type === n.type),
              k,
              {
                orientation: 'Orientation',
                xRotation: 'X Rotation',
                yRotation: 'Y Rotation',
                position: 'Position',
                anchor: 'Anchor Point',
                scale: 'Scale',
                rotation: 'Rotation',
                skew: 'Skew',
                skewAxis: 'Skew Axis',
                opacity: 'Opacity',
              }[k],
              { disabled: n.hostLimited },
              'transform',
            );
          });
          html += this.section(n.type === 'group' ? 'Group' : 'Layer', trans);
        }
        if (['rect', 'ellipse', 'star'].includes(n.type)) {
          let fields = '';
          Object.keys(n.props)
            .filter(
              (k) =>
                !k.includes('Direction') &&
                !(n.type === 'star' && n.props['ADBE Vector Star Type'] === 2 && k.includes('Inner')),
            )
            .forEach((k) => {
              const label = k
                .replace(/^ADBE Vector (Rect|Ellipse|Star) /, '')
                .replace('Roundess', 'Roundness');
              fields += this.prop(
                nodes.filter((x) => x.type === n.type),
                k,
                label,
                k === 'ADBE Vector Star Type'
                  ? {
                      choices: [
                        [1, 'Star'],
                        [2, 'Polygon'],
                      ],
                    }
                  : {},
              );
            });
          html += this.section(
            n.type === 'rect' ? 'Rectangle' : n.type === 'ellipse' ? 'Ellipse' : 'Polystar',
            fields,
          );
        }
        if (n.type === 'path') {
          const p = n.props['ADBE Vector Shape'];
          html += this.section(
            'Path',
            this.field('Closed', p.closed, (v) => {
              const next = D.clone(p);
              next.closed = v;
              e.property({ ids: [n.id], key: 'ADBE Vector Shape', value: next });
            }) +
              '<div class="sub-label">' +
              p.vertices.length +
              ' points</div><div class="button-row">' +
              this.btn('reverse', 'Reverse path', 'reflect') +
              this.btn('join', 'Join paths', 'path') +
              this.btn('round', 'Round corners', 'roundrect') +
              '</div>',
          );
        }
        html += LiveShapes.fields(this, n, nodes);
        if (e.pointSelection.length) html += Points.fields(this);
        if (n.type === 'mask') {
          let fields =
            this.prop(
              nodes,
              'mode',
              'Mode',
              { choices: ['none', 'add', 'subtract', 'intersect', 'lighten', 'darken', 'difference'] },
              'mask',
            ) + this.prop(nodes, 'inverted', 'Inverted', {}, 'mask');
          const feather = n.props['ADBE Mask Feather'] || [0, 0];
          fields += this.field('Mask Feather', feather, (v) => {
            if (e.prefs.maskFeatherLinked !== false) {
              const value = v[0] !== feather[0] ? v[0] : v[1];
              v = [value, value];
            }
            e.property({
              ids: nodes.map((n) => n.id),
              key: 'ADBE Mask Feather',
              value: v,
              label: 'Mask Feather',
            });
          });
          fields += this.field('Link feather', e.prefs.maskFeatherLinked !== false, (v) => {
            e.prefs.maskFeatherLinked = v;
            e.save('prefs', e.prefs);
          });
          ['ADBE Mask Opacity', 'ADBE Mask Offset'].forEach(
            (k) =>
              (fields += this.prop(
                nodes,
                k,
                k === 'ADBE Mask Offset' ? 'Mask Expansion' : k.replace('ADBE ', ''),
              )),
          );
          html += this.section('Mask', fields);
        }
        if (n.type === 'text') html += TextEditor.fields(this, n, nodes);
        if (['group', 'layer'].includes(n.type)) {
          const ops = n.children.filter((x) => x.type === 'operator');
          if (ops.length)
            html += this.section(
              'Operators',
              ops
                .map(
                  (op) =>
                    '<div class="sub-label">' +
                    esc(op.name) +
                    '</div>' +
                    Object.keys(op.props)
                      .map((key) =>
                        this.prop(
                          [op],
                          key,
                          key
                            .split('/')
                            .pop()
                            .replace(/^ADBE Vector /, ''),
                        ),
                      )
                      .join(''),
                )
                .join(''),
            );
        }
        const animated = nodes.flatMap((x) =>
          Object.entries(x.meta || {})
            .filter(([k, m]) => m.keys)
            .map(([k]) => k.replace(/^ADBE Vector /, '')),
        );
        if (animated.length)
          html =
            this.section(
              'Animated',
              '<div class="sub-label">' + esc([...new Set(animated)].join(', ')) + '</div>',
            ) + html;
      }
      const paints = {
        fill: D.styleTargets(e.doc, e.selection, 'fill', false),
        stroke: D.styleTargets(e.doc, e.selection, 'stroke', false),
      };
      if (!n || paints.fill.length || paints.stroke.length || D.selectedShapes(e.doc, e.selection).length) {
        let styles = '';
        ['fill', 'stroke'].forEach((kind) => {
          const paint = paints[kind][0],
            cap = kind === 'fill' ? 'Fill' : 'Stroke',
            colorKey = 'ADBE Vector ' + cap + ' Color',
            color = paint ? paint.props[colorKey] || [0, 0, 0] : kind === 'fill' ? e.lastFill : e.lastStroke;
          styles += this.field(
            cap + ' Color',
            D.hex(color),
            (v) => {
              const rgb = D.rgb(v);
              if (kind === 'fill') e.lastFill = rgb;
              else e.lastStroke = rgb;
              if (!e.selection.length) {
                this.renderProperties();
                return;
              }
              e.edit('Change ' + cap, () =>
                D.styleTargets(e.doc, e.selection, kind, true).forEach((p) => {
                  D.set(p, colorKey, rgb);
                  p.visible = true;
                }),
              );
            },
            { color: true },
          );
          styles += this.field(
            cap + ' Type',
            paint
              ? paint.visible === false
                ? 'none'
                : paint.gradient || paint.type.startsWith('gradient')
                  ? 'gradient'
                  : 'solid'
              : 'solid',
            (v) => {
              if (!e.selection.length) return;
              e.edit(cap + ' type', () =>
                D.styleTargets(e.doc, e.selection, kind, true).forEach((p) => {
                  p.visible = v !== 'none';
                  if (v === 'gradient') {
                    const bounds = Geometry.bounds(e.doc, e.selection);
                    p.gradient = {
                      type: 'linear',
                      start: bounds ? [bounds.left, bounds.center.y] : [0, 0],
                      end: bounds ? [bounds.right, bounds.center.y] : [200, 0],
                      stops: [
                        { position: 0, color: '#000000', opacity: 100 },
                        { position: 1, color: '#ffffff', opacity: 100 },
                      ],
                    };
                    const parent = D.parent(e.doc, p.id),
                      matrix = parent ? Geometry.world(e.doc, parent) : new paper.Matrix();
                    p.gradient.start = (() => {
                      const q = matrix.inverseTransform(p.gradient.start);
                      return [q.x, q.y];
                    })();
                    p.gradient.end = (() => {
                      const q = matrix.inverseTransform(p.gradient.end);
                      return [q.x, q.y];
                    })();
                    p.type = kind === 'fill' ? 'gradientFill' : 'gradientStroke';
                    p.matchName = D.K[p.type];
                  } else if (v === 'solid') {
                    if (p.gradient) p.props[colorKey] = D.rgb(p.gradient.stops[0].color);
                    delete p.gradient;
                    p.type = kind;
                    p.matchName = D.K[kind];
                  }
                }),
              );
            },
            {
              choices: [
                ['none', 'None'],
                ['solid', 'Solid'],
                ['gradient', 'Gradient'],
              ],
            },
          );
          if (paint) {
            styles += this.prop(paints[kind], 'ADBE Vector ' + cap + ' Opacity', cap + ' Opacity', {
              unit: '%',
            });
            if (paint.gradient && !(paint.meta['ADBE Vector Grad Colors'] || {}).keys)
              styles += this.gradient(paint, paints[kind]);
            else if (paint.type.startsWith('gradient'))
              styles += '<div class="sub-label">Colors are edited in After Effects.</div>';
            if (kind === 'stroke') {
              styles += this.prop(paints.stroke, 'ADBE Vector Stroke Width', 'Stroke Width', { unit: 'px' });
              styles += this.prop(paints.stroke, 'ADBE Vector Stroke Line Cap', 'Line Cap', {
                choices: [
                  [1, 'Butt'],
                  [2, 'Round'],
                  [3, 'Projecting'],
                ],
              });
              styles += this.prop(paints.stroke, 'ADBE Vector Stroke Line Join', 'Line Join', {
                choices: [
                  [1, 'Miter'],
                  [2, 'Round'],
                  [3, 'Bevel'],
                ],
              });
              if (paint.props['ADBE Vector Stroke Line Join'] === 1)
                styles += this.prop(paints.stroke, 'ADBE Vector Stroke Miter Limit', 'Miter Limit');
            }
          }
        });
        html += this.section('Fill & Stroke', styles);
      }
      if (n && ['fill', 'stroke', 'gradientFill', 'gradientStroke', 'operator'].includes(n.type)) {
        let fields = '';
        Object.keys(n.props)
          .filter((k) => !k.includes('Color') && !k.includes('Shape') && !k.includes('Grad Colors'))
          .forEach((k) => {
            let val = n.props[k];
            if (typeof val === 'number' || typeof val === 'string' || (Array.isArray(val) && val.length <= 4))
              fields += this.prop(
                nodes.filter((x) => x.type === n.type),
                k,
                k
                  .split('/')
                  .pop()
                  .replace(/^ADBE Vector /, '')
                  .replace(/^(Stroke |Fill )/, ''),
              );
          });
        html += this.section('Editing ' + n.name, fields);
        if (n.type === 'stroke' || n.type === 'gradientStroke') html += this.strokeExtras(n);
      }
      if (D.selectedShapes(e.doc, e.selection).length > 1)
        html += this.section(
          'Pathfinder',
          '<div class="button-row">' +
            this.btn('boolean', 'Unite', 'unite', 'unite') +
            this.btn('boolean', 'Minus front', 'subtract', 'subtract') +
            this.btn('boolean', 'Intersect', 'intersect', 'intersect') +
            this.btn('boolean', 'Exclude', 'exclude', 'exclude') +
            '</div><div class="button-row">' +
            this.btn('boolean', 'Divide', 'divide', 'divide') +
            this.btn('boolean', 'Trim', 'trim', 'trim') +
            this.btn('boolean', 'Merge', 'unite', 'merge') +
            '</div>' +
            this.field('Result', e.pathfinderMode || 'destructive', (v) => (e.pathfinderMode = v), {
              choices: [
                ['destructive', 'Destructive'],
                ['operator', 'Operator'],
              ],
            }),
        );
      html += this.colors();
      el.innerHTML = html;
      el.scrollTop = scroll;
      WorkspaceUI.properties(this, el);
      this.bind(el);
      GradientUI.bind(this, el);
      TextEditor.bind(this, el);
    }
    gradient(n, nodes) {
      return GradientUI.render(this, n, nodes);
    }
    strokeExtras(n) {
      const e = this.e;
      let taper = this.field(
        'Length Units',
        n.props['ADBE Vector Stroke Taper/ADBE Vector Taper Length Units'] || 1,
        (v) =>
          e.property({
            ids: [n.id],
            key: 'ADBE Vector Stroke Taper/ADBE Vector Taper Length Units',
            value: v,
          }),
        {
          choices: [
            [1, 'Percent'],
            [2, 'Pixels'],
          ],
        },
      );
      [
        ['Start Length', 0],
        ['End Length', 0],
        ['Start Width', 100],
        ['End Width', 100],
        ['Start Ease', 0],
        ['End Ease', 0],
      ].forEach(([label, d]) => {
        const key = 'ADBE Vector Stroke Taper/ADBE Vector Taper ' + label;
        taper += this.field(label, n.props[key] ?? d, (v) =>
          e.property({ ids: [n.id], key, value: v, label: 'Stroke taper' }),
        );
      });
      let wave = '';
      [
        ['Amount', 0],
        ['Units', 1],
        ['Wavelength', 100],
        ['Phase', 0],
      ].forEach(([label, d]) => {
        const key =
            'ADBE Vector Stroke Wave/ADBE Vector Taper ' +
            (label === 'Wavelength' ? 'Wavelength' : 'Wave ' + label),
          units = n.props['ADBE Vector Stroke Wave/ADBE Vector Taper Wave Units'] || 1;
        wave += this.field(
          label === 'Wavelength' && units === 2 ? 'Cycles' : label,
          n.props[key] ?? d,
          (v) => e.property({ ids: [n.id], key, value: v, label: 'Stroke wave' }),
          label === 'Units'
            ? {
                choices: [
                  [1, 'Pixels'],
                  [2, 'Cycles'],
                ],
              }
            : {},
        );
      });
      let dashes = '';
      for (let i = 0; i < (n.dashes || []).length; i += 2) {
        const index = i;
        ['Dash', 'Gap'].forEach(
          (label, j) =>
            (dashes += this.field(label + ' ' + (i / 2 + 1), n.dashes[i + j] || 0, (v) =>
              e.edit('Stroke dashes', () => (n.dashes[index + j] = Math.max(0, v))),
            )),
        );
        dashes += '<button data-cmd="dash-remove" data-arg="' + i + '">Remove pair</button>';
      }
      if ((n.dashes || []).length < 6) dashes += '<button data-cmd="dash-add">Add dash</button>';
      if (n.dashOffset !== undefined)
        dashes += this.field('Offset', n.dashOffset, (v) =>
          e.property({ ids: [n.id], target: 'node', key: 'dashOffset', value: v, label: 'Dash offset' }),
        );
      else dashes += '<button data-cmd="dash-offset">Add offset</button>';
      return this.section('Taper', taper) + this.section('Dashes', dashes) + this.section('Wave', wave);
    }
    colors() {
      const e = this.e,
        map = new Map(),
        gradients = new Map(),
        seen = new Set(),
        nodes = e.selection.length ? D.roots(e.doc, e.selection) : e.doc.layers;
      const scan = (n) => {
        if (seen.has(n.id)) return;
        seen.add(n.id);
        if (n.gradient) {
          const key = JSON.stringify(n.gradient);
          if (!gradients.has(key)) gradients.set(key, []);
          gradients.get(key).push(n);
          return;
        }
        if (n.type === 'text')
          for (const k of ['fillColor', 'strokeColor']) {
            if (
              (k === 'fillColor' && n.text.applyFill === false) ||
              (k === 'strokeColor' && !n.text.applyStroke)
            )
              continue;
            const color = D.hex(n.text[k] || [0, 0, 0]);
            if (!map.has(color)) map.set(color, []);
            map.get(color).push({ n, k, text: true });
          }
        Object.keys(n.props)
          .filter((k) => k.endsWith(' Color'))
          .forEach((k) => {
            const color = D.hex(n.props[k]);
            if (!map.has(color)) map.set(color, []);
            map.get(color).push({ n, k });
          });
      };
      D.walk(nodes, scan);
      if (e.selection.length)
        D.selectedShapes(e.doc, e.selection).forEach((n) => {
          const p = D.paints(e.doc, n);
          if (p.fill) scan(p.fill);
          if (p.stroke) scan(p.stroke);
        });
      let html = '';
      map.forEach((targets, color) => {
        const id = this.bindings.length;
        this.bindings.push({
          value: color,
          callback: (v) => {
            if (/^#[0-9a-f]{6}$/i.test(v))
              e.edit('Replace color', () =>
                targets.forEach((t) => (t.text ? (t.n.text[t.k] = D.rgb(v)) : D.set(t.n, t.k, D.rgb(v)))),
              );
          },
        });
        html +=
          '<div class="color-row"><input type="color" data-field="' +
          id +
          '" value="' +
          color +
          '"><input class="hex" type="text" data-field="' +
          id +
          '" value="' +
          color.toUpperCase() +
          '"><span class="count">' +
          targets.length +
          '</span><button title="Select this color" data-color-select="' +
          color +
          '">◎</button></div>';
      });
      gradients.forEach((nodes) => {
        const grad = nodes[0].gradient,
          colors = grad.stops.map((s) => s.color + ' ' + s.position * 100 + '%').join(',');
        html +=
          '<div class="color-row"><button class="gradient-color-row" data-gradient-select="' +
          nodes.map((n) => n.id).join(',') +
          '" title="Edit gradient" style="background:linear-gradient(to right,' +
          colors +
          ')"></button><span class="count">' +
          nodes.length +
          '</span></div>';
      });
      return this.section(
        'Colors',
        html || '<div class="sub-label">Colors in your artwork appear here.</div>',
      );
    }
    bind(el) {
      el.querySelectorAll('[data-field]').forEach((input) => {
        const b = this.bindings[+input.dataset.field];
        input.onchange = () => {
          let v =
            input.type === 'checkbox'
              ? input.checked
              : input.type === 'number'
                ? Number(input.value)
                : input.value;
          if (input.tagName === 'SELECT' && typeof b.value === 'number') v = Number(v);
          if (input.dataset.component !== undefined) {
            v = D.clone(b.value);
            v[+input.dataset.component] = Number(input.value);
          }
          if (typeof v === 'number' && !Number.isFinite(v)) return;
          b.callback(v);
        };
        input.onkeydown = (ev) => {
          ev.stopPropagation();
          if (ev.key === 'Enter') {
            input.blur();
            return;
          }
          if (input.type === 'number' && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) {
            ev.preventDefault();
            input.value =
              +input.value +
              (ev.key === 'ArrowUp' ? 1 : -1) * (ev.shiftKey ? 10 : ev.altKey || ev.ctrlKey ? 0.1 : 1);
            input.dispatchEvent(new Event('change'));
          }
        };
      });
      el.querySelectorAll('details[data-section]').forEach(
        (d) =>
          (d.ontoggle = () => {
            if (d.open) this.closed.delete(d.dataset.section);
            else this.closed.add(d.dataset.section);
          }),
      );
    }
    renderStatus() {
      const e = this.e;
      if (e.role !== 'main') return;
      let html =
        this.btn('zoom-out', 'Zoom out', 'minus') +
        '<select id="magnification" aria-label="Magnification"><option value="current">' +
        Math.round(paper.view.zoom * 100) +
        '%</option>' +
        ['Fit', 'Fit up to 100%', 25, 50, 75, 100, 150, 200, 400]
          .map((v) => '<option value="' + v + '">' + v + (typeof v === 'number' ? '%' : '') + '</option>')
          .join('') +
        '</select>' +
        this.btn('zoom-in', 'Zoom in', 'plus') +
        this.btn(
          'checker',
          'Transparency grid',
          'checker',
          null,
          'class="' + (e.checker ? 'active' : '') + '"',
        ) +
        '<input id="background-color" type="color" title="Background Color" value="' +
        D.hex(e.backgroundColor || e.doc.background) +
        '">' +
        this.btn(
          'outline',
          'Outline view (Control+Y)',
          'box',
          null,
          'class="' + (e.outline ? 'active' : '') + '"',
        ) +
        '<span class="status-text">' +
        (e.isolation
          ? '<button data-cmd="exit-isolation" class="crumb">Canvas › ' +
            esc(D.find(e.doc, e.isolation)?.name) +
            '</button>'
          : esc(
              e.statusMessage ||
                e.doc.name +
                  (e.dirty ? ' •' : '') +
                  (e.selection.length ? ' · ' + e.selection.length + ' selected' : ''),
            )) +
        '</span>' +
        this.btn('shortcuts', 'Keyboard Shortcuts', 'keyboard') +
        this.btn('preferences', 'Preferences', 'gear') +
        '<button id="footer-menu" data-menu="footer" title="Menu">' +
        icon('dots') +
        '</button>' +
        this.btn('whats-new', 'What’s New', 'bell');
      const el = document.getElementById('status');
      el.innerHTML = html;
      el.querySelector('#magnification').onchange = (ev) => {
        const v = ev.target.value;
        if (v === 'Fit') e.fit();
        else if (v === 'Fit up to 100%') e.fit(1);
        else if (Number.isFinite(+v)) {
          paper.view.zoom = +v / 100;
          e.renderCanvas();
          this.renderStatus();
        }
      };
      el.querySelector('#background-color').oninput = (ev) => {
        e.backgroundColor = D.rgb(ev.target.value);
        e.renderCanvas();
      };
      el.querySelector('#footer-menu').onclick = (ev) =>
        this.menu(ev.currentTarget, [
          { label: 'New canvas…', cmd: 'new' },
          { label: 'Open canvas…', cmd: 'import' },
          { label: 'Export canvas…', cmd: 'export' },
          null,
          { label: 'Show / hide Layers', cmd: 'hide-layers' },
          { label: 'Show / hide Properties', cmd: 'hide-properties' },
          { label: 'Show / hide rulers', cmd: 'rulers' },
          null,
          { label: 'Reattach recovered draft', cmd: 'reattach', disabled: !e.detached },
          { label: 'User guide', cmd: 'guide' },
          { label: 'Submit feedback', cmd: 'feedback' },
          { label: 'About AE Designer', cmd: 'about' },
        ]);
    }
    renderLastAction() {
      const e = this.e,
        el = document.getElementById('last-action'),
        a = e.history.lastAction;
      if (!a) {
        el.innerHTML = '';
        return;
      }
      if (a.label === 'Reflect' && a.values.Copy === undefined) a.values.Copy = false;
      if (a.label === 'Shear' && a.values.Axis === undefined) a.values.Axis = 0;
      if (!a.initialValues) a.initialValues = D.clone(a.values);
      const start = this.bindings.length;
      let body = '';
      Object.entries(a.values).forEach(([k, v]) => {
        let choices;
        if (k === 'Operation')
          choices = [
            ['unite', 'Unite'],
            ['subtract', 'Minus Front'],
            ['intersect', 'Intersect'],
            ['exclude', 'Exclude'],
            ['divide', 'Divide'],
            ['trim', 'Trim'],
            ['merge', 'Merge'],
          ];
        if (k === 'Result')
          choices = [
            ['destructive', 'Destructive'],
            ['operator', 'Operator'],
          ];
        if (k === 'Layout') choices = Object.keys(Arrays.defaults);
        if (k === 'Join') choices = ['miter', 'round', 'bevel'];
        body += this.field(k, v, (x) => e.adjustLast(k, x), choices ? { choices } : {});
      });
      if (['Move', 'Duplicate and move', 'Scale', 'Rotate', 'Shear'].includes(a.label))
        body += this.field(
          'Transform mode',
          a.mode || 'Combined',
          (value) => {
            const next = D.clone(a);
            next.mode = value;
            e.edit(
              a.label,
              () => {
                e.doc = D.clone(a.base);
                e.applyLast(next);
              },
              next,
            );
          },
          { choices: ['Combined', 'Individual: Comp', 'Individual: Object'] },
        );
      if (a.label === 'Scale') {
        const change = (key, value) => {
          const next = D.clone(a);
          next[key] = value;
          e.edit(
            a.label,
            () => {
              e.doc = D.clone(a.base);
              e.applyLast(next);
            },
            next,
          );
        };
        body += this.field('Link X and Y', a.linked !== false, (v) => change('linked', v));
        body += this.field('Pivot', a.pivotChoice || 'Custom', (v) => change('pivotChoice', v), {
          choices: [
            'Custom',
            'Top left',
            'Top',
            'Top right',
            'Left',
            'Center',
            'Right',
            'Bottom left',
            'Bottom',
            'Bottom right',
          ],
        });
      }
      const collapsed = e.lastActionCollapsed === a.label;
      el.innerHTML =
        '<details ' +
        (collapsed ? '' : 'open') +
        '><summary>' +
        esc(a.label) +
        '</summary><div class="body">' +
        body +
        '<div class="action-bottom">' +
        (a.label === 'Duplicate and move' ? '<button id="action-repeat">Repeat</button>' : '') +
        '<button id="action-reset">Reset</button></div></div></details>';
      this.bind(el);
      el.querySelector('details').ontoggle = (ev) => {
        e.lastActionCollapsed = ev.target.open ? null : a.label;
      };
      el.querySelectorAll('.field').forEach((row) => {
        const key = row.querySelector('label')?.textContent.trim(),
          input = row.querySelector('input,select');
        if (input && Object.prototype.hasOwnProperty.call(a.values, key)) input.dataset.last = key;
      });
      el.querySelector('#action-reset').onclick = () => {
        const next = D.clone(a);
        next.values = D.clone(a.initialValues);
        next.repeatCount = 0;
        e.edit(
          a.label,
          () => {
            e.doc = D.clone(a.base);
            e.applyLast(next);
          },
          next,
        );
      };
      const repeat = el.querySelector('#action-repeat');
      if (repeat)
        repeat.onclick = () => {
          const next = D.clone(a);
          next.repeatCount = (a.repeatCount || 0) + 1;
          e.edit(
            a.label,
            () => {
              e.doc = D.clone(a.base);
              e.applyLast(next);
            },
            next,
          );
        };
    }
    menu(anchor, entries) {
      const el = document.getElementById('menus');
      el.innerHTML =
        '<div class="menu">' +
        entries
          .map((x, i) =>
            !x
              ? '<hr>'
              : x.heading
                ? '<div class="menu-label">' + esc(x.label) + '</div>'
                : '<button data-entry="' +
                  i +
                  '" ' +
                  (x.disabled ? 'disabled' : '') +
                  '>' +
                  esc(x.label) +
                  '<span class="shortcut">' +
                  esc(x.key || '') +
                  '</span></button>',
          )
          .join('') +
        '</div>';
      const menu = el.firstChild,
        r = anchor.getBoundingClientRect
          ? anchor.getBoundingClientRect()
          : { left: anchor.x, bottom: anchor.y };
      menu.style.left = Math.max(2, Math.min(r.left, window.innerWidth - menu.offsetWidth - 4)) + 'px';
      menu.style.top = Math.max(2, Math.min(r.bottom, window.innerHeight - menu.offsetHeight - 4)) + 'px';
      menu.querySelectorAll('[data-entry]').forEach(
        (b) =>
          (b.onclick = () => {
            const x = entries[+b.dataset.entry];
            this.closeMenu();
            if (x.run) x.run();
            else this.e.command(x.cmd, x.arg);
          }),
      );
    }
    closeMenu() {
      document.getElementById('menus').innerHTML = '';
    }
    pathMenu(anchor) {
      this.menu(anchor, [
        { label: 'Clean up paths…', cmd: 'cleanup' },
        { label: 'Simplify paths', cmd: 'simplify' },
        { label: 'Move along path', cmd: 'move-along', disabled: !this.e.pointSelection.length },
        { label: 'Outline stroke', cmd: 'outline-stroke' },
        { label: 'Reverse path', cmd: 'reverse' },
        { label: 'Join paths', cmd: 'join', key: 'Ctrl+J' },
        { label: 'Round corners', cmd: 'round' },
        { label: 'Convert to Bezier path', cmd: 'bezier' },
        { label: 'Average points · horizontal', cmd: 'average', arg: 'horizontal' },
        { label: 'Average points · vertical', cmd: 'average', arg: 'vertical' },
        { label: 'Average points · both', cmd: 'average', arg: 'both' },
        { label: 'Remove points', cmd: 'remove-points' },
        { label: 'Convert to corner', cmd: 'corner' },
        { label: 'Convert to smooth', cmd: 'smooth' },
        null,
        { label: 'Split shapes into groups', cmd: 'split-groups' },
        { label: 'Split shapes into layers', cmd: 'split-layers' },
        { label: 'Consolidate new groups', cmd: 'consolidate' },
        null,
        ...['Linear', 'Grid', 'Brick', 'Radial', 'Spiral'].map((x) => ({
          label: 'Replicate · ' + x,
          cmd: 'replicate',
          arg: x,
        })),
      ]);
    }
    contextMenu(anchor) {
      const e = this.e,
        has = e.selection.length;
      this.menu(
        anchor,
        has
          ? [
              { label: 'Enter group / Isolate layer', cmd: 'isolate' },
              ...(e.selection.some((id) => D.find(e.doc, id)?.type === 'text')
                ? [{ label: 'Convert to shapes in After Effects', cmd: 'outline-text' }]
                : []),
              { label: 'Group', cmd: 'group', key: 'Ctrl+G' },
              { label: 'Split groups into layers', cmd: 'split-groups-layers' },
              { label: 'Merge into layer', cmd: 'merge-layer' },
              { label: 'Move to new layer', cmd: 'move-new-layer' },
              { label: 'Consolidate', cmd: 'consolidate' },
              { label: 'Ungroup', cmd: 'ungroup', key: 'Ctrl+Shift+G' },
              null,
              { label: 'Bring to front', cmd: 'front' },
              { label: 'Bring forward', cmd: 'forward' },
              { label: 'Send backward', cmd: 'backward' },
              { label: 'Send to back', cmd: 'back' },
              null,
              { label: 'Flip horizontal', cmd: 'flip-x' },
              { label: 'Flip vertical', cmd: 'flip-y' },
              { label: 'Path actions…', run: () => this.pathMenu(anchor) },
              { label: 'Select same fill', cmd: 'same-fill' },
              { label: 'Select same stroke', cmd: 'same-stroke' },
              { label: 'Lock selection', cmd: 'lock' },
              null,
              { label: 'Copy', cmd: 'copy', key: 'Ctrl+C' },
              { label: 'Cut', cmd: 'cut', key: 'Ctrl+X' },
              { label: 'Paste in place', cmd: 'paste-in-place', key: 'Ctrl+Shift+V' },
              { label: 'Duplicate', cmd: 'duplicate', key: 'Ctrl+D' },
              { label: 'Delete', cmd: 'delete', key: 'Delete' },
              { label: 'Frame selected', cmd: 'frame', key: 'F' },
            ]
          : [
              { label: 'Exit group', cmd: 'exit-isolation', disabled: !e.isolation },
              { label: 'Paste', cmd: 'paste' },
              { label: 'Select all', cmd: 'select-all' },
              { label: 'Unlock all', cmd: 'unlock' },
            ],
      );
    }
    async dialog(title, text, buttons, body) {
      const modal = document.getElementById('modal');
      this.closeMenu();
      this.e.modalOpen = true;
      modal.hidden = false;
      modal.innerHTML =
        '<div class="dialog" role="dialog" aria-modal="true" aria-label="' +
        esc(title) +
        '"><h2>' +
        esc(title) +
        '</h2>' +
        (text ? '<p>' + esc(text) + '</p>' : '') +
        (body || '') +
        '<div class="buttons">' +
        buttons
          .map(
            (b, i) =>
              '<button data-result="' +
              i +
              '" class="' +
              (b.primary ? 'primary' : '') +
              '">' +
              esc(b.label) +
              '</button>',
          )
          .join('') +
        '</div></div>';
      return new Promise((resolve) => {
        modal.querySelectorAll('[data-result]').forEach(
          (b) =>
            (b.onclick = () => {
              const result = buttons[+b.dataset.result];
              if (result.collect) result.value = result.collect(modal);
              modal.hidden = true;
              this.e.modalOpen = false;
              resolve(result.value);
            }),
        );
        modal.querySelector('input,button')?.focus();
      });
    }
    confirm(title, text) {
      return this.dialog(title, text, [
        { label: 'Cancel', value: false },
        { label: 'Continue', value: true, primary: true },
      ]);
    }
    fields(title, values) {
      const body = Object.entries(values)
        .map(
          ([k, v]) =>
            '<div class="field"><label>' +
            esc(k) +
            '</label><input data-value="' +
            esc(k) +
            '" value="' +
            esc(v) +
            '" type="' +
            (typeof v === 'number' ? 'number' : 'text') +
            '" step="any"></div>',
        )
        .join('');
      return this.dialog(
        title,
        '',
        [
          { label: 'Cancel', value: null },
          {
            label: 'Apply',
            primary: true,
            collect: (modal) =>
              Object.fromEntries(
                [...modal.querySelectorAll('[data-value]')].map((input) => [
                  input.dataset.value,
                  input.type === 'number' ? Number(input.value) : input.value,
                ]),
              ),
          },
        ],
        body,
      );
    }
    selectionColor(n) {
      if (this.e.prefs.selectionColorMode === 'custom') return this.e.prefs.selectionColor;
      if (n.type === 'mask') return D.hex(n.mask?.color || [1, 0.7, 0]);
      const layer = Structure.layerOf(this.e.doc, n);
      return LABELS[layer?.label || 0] || this.e.prefs.selectionColor;
    }
    preferences() {
      const e = this.e;
      this.bindings = [];
      let body = '';
      [
        [
          'Interface',
          [
            ['UI scale', 'uiScale'],
            ['Button size', 'buttonSize'],
          ],
        ],
        [
          'Canvas',
          [
            ['Handle size', 'handleSize'],
            ['Mouse wheel', 'wheel'],
            ['Selection color', 'selectionColorMode'],
            ['Custom color', 'selectionColor'],
            ['Show handles on every selected point', 'showHandles'],
            ['Smooth zoom', 'smoothZoom'],
          ],
        ],
        [
          'Editing',
          [
            ['Keyboard increment', 'increment'],
            ['Snap distance', 'snapDistance'],
            ['Scale strokes', 'scaleStrokes'],
            ['Scale corners', 'scaleCorners'],
          ],
        ],
        ['Layers', [['Reveal selections', 'reveal']]],
      ].forEach(
        ([name, fields]) =>
          (body += this.section(
            name,
            fields
              .map(([label, key]) =>
                this.field(
                  label,
                  e.prefs[key],
                  (v) => {
                    e.prefs[key] = v;
                    if (key === 'uiScale') {
                      e.prefs[key] = Math.min(150, Math.max(75, +v));
                      document.getElementById('app').style.zoom = e.prefs[key] / 100;
                      e.resize();
                    }
                    if (key === 'buttonSize') {
                      e.prefs[key] = Math.min(150, Math.max(75, +v));
                      document.documentElement.style.setProperty('--tool', e.prefs[key] / 100);
                    }
                    if (key === 'handleSize') e.prefs[key] = Math.min(200, Math.max(75, +v));
                    if (key === 'increment') e.prefs[key] = Math.min(100, Math.max(0.01, +v));
                    if (key === 'snapDistance') e.prefs[key] = Math.min(20, Math.max(1, +v));
                    e.save('prefs', e.prefs);
                    e.renderCanvas();
                  },
                  key === 'wheel'
                    ? { choices: ['zoom', 'pan'] }
                    : key === 'selectionColorMode'
                      ? {
                          choices: [
                            ['label', 'Layer label'],
                            ['custom', 'Custom color'],
                          ],
                        }
                      : key === 'selectionColor'
                        ? { color: true }
                        : {},
                ),
              )
              .join(''),
          )),
      );
      this.dialog('Preferences', '', [{ label: 'Done', primary: true }], body);
      this.bind(document.getElementById('modal'));
    }
    shortcuts() {
      Shortcuts.show(this);
    }
    setupDividers() {
      ['left', 'right'].forEach((side) => {
        const el = document.getElementById(side + '-divider');
        el.onpointerdown = (ev) => {
          el.setPointerCapture(ev.pointerId);
          const start = ev.clientX,
            initial = document
              .getElementById(side === 'left' ? 'layers' : 'properties')
              .getBoundingClientRect().width;
          el.onpointermove = (mv) => {
            document.documentElement.style.setProperty(
              '--' + side,
              Math.max(140, Math.min(500, initial + (mv.clientX - start) * (side === 'left' ? 1 : -1))) +
                'px',
            );
            this.e.resize();
          };
          el.onpointerup = () => (el.onpointermove = null);
        };
      });
    }
  }
  g.LayerColors = LABELS;
  g.UI = UI;
  g.TOOL_NAMES = NAMES;
})(window);
