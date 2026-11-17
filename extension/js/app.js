(function (g) {
  'use strict';
  const D = DM,
    G = Geometry,
    P = paper;
  class Editor {
    constructor() {
      this.bridge = new Bridge();
      this.role = document.body.dataset.panel || new URLSearchParams(location.search).get('panel') || 'main';
      this.history = new D.History(D.blank());
      this.baseline = D.clone(this.doc);
      this.selection = [];
      this.pointSelection = [];
      this.expanded = new Set();
      this.tool = 'select';
      this.selectionMode = 'layer';
      this.isolation = null;
      this.clipboard = [];
      this.items = new Map();
      this.showBox = true;
      this.outline = false;
      this.checker = false;
      this.search = '';
      this.kindFilter = '';
      this.pivot = null;
      this.busy = false;
      this.penId = null;
      this.modalOpen = false;
      this.ready = false;
      this.statusMessage = '';
      this.lastFill = [0.65, 0.51, 0.94];
      this.lastStroke = [0.08, 0.08, 0.08];
      this.lastWidth = 3;
      this.prefs = Object.assign(
        {
          uiScale: 100,
          buttonSize: 100,
          handleSize: 100,
          wheel: 'zoom',
          selectionColor: '#63b2ff',
          selectionColorMode: 'label',
          increment: 1,
          snapDistance: 6,
          scaleStrokes: false,
          scaleCorners: false,
          snapping: true,
          rulers: true,
          showHandles: true,
          reveal: true,
          smoothZoom: true,
        },
        this.read('prefs') || {},
      );
      this.shortcuts = this.read('shortcuts') || {};
      this.transformMode = 'Combined';
      this.bridge.on((e) => this.message(e));
      if (this.role === 'main') {
        P.setup(document.getElementById('canvas'));
        this.bg = new P.Layer();
        this.art = new P.Layer();
        this.overlay = new P.Layer();
        P.view.autoUpdate = false;
        window.addEventListener('resize', () => this.resize());
      } else {
        P.setup(document.createElement('canvas'));
        document.body.classList.add('satellite', this.role + '-only');
      }
    }
    get doc() {
      return this.history.doc;
    }
    set doc(v) {
      this.history.doc = v;
    }
    get dirty() {
      return JSON.stringify(this.doc) !== JSON.stringify(this.baseline);
    }
    read(k) {
      try {
        return JSON.parse(localStorage.getItem('edm.aedesigner.' + k));
      } catch (e) {
        return null;
      }
    }
    save(k, v) {
      try {
        localStorage.setItem('edm.aedesigner.' + k, JSON.stringify(v));
      } catch (e) {
        if (k === 'draft')
          this.statusMessage = 'Recovery storage is full. Export the document from the menu.';
      }
    }
    async init() {
      Shortcuts.initialize(this);
      this.UI = new UI(this);
      this.UI.render();
      this.ready = true;
      if (this.role === 'main') {
        this.resize();
        this.render();
        this.fit();
        this.input = new Input(this);
        const draft = this.read('draft');
        if (draft && draft.doc) {
          const restore = await this.UI.dialog(
            'Recover canvas edits?',
            'Your last canvas contains changes that have not been pushed.',
            [
              { label: 'Keep for later', value: 'later' },
              { label: 'Discard', value: 'discard' },
              { label: 'Restore draft', value: 'restore', primary: true },
            ],
          );
          if (restore === 'restore') {
            this.history = new D.History(D.validate(draft.doc));
            this.history.undoStack = draft.undo || [];
            this.history.redoStack = draft.redo || [];
            this.history.lastAction = draft.lastAction;
            this.baseline = draft.baseline || D.blank();
            this.detached = !!this.doc.source;
            this.render();
            this.fit();
            this.notice(
              this.detached ? 'Draft restored. Push is paused. Use Reattach in the menu.' : 'Draft restored.',
            );
          } else if (restore === 'discard') localStorage.removeItem('edm.aedesigner.draft');
        }
        if (this.bridge.connected) {
          try {
            const info = await this.bridge.call('info');
            this.hostVersion = info.version;
            this.fonts = await this.bridge.call('fonts');
            this.shortcutFiles = await this.bridge.call('shortcutFiles');
            if (this.shortcutFiles.length) {
              const saved = this.read('shortcutSourceName'),
                i = this.shortcutFiles.findIndex((f) => f.name === saved);
              this.shortcutSource = Math.max(0, i);
              this.nativeShortcuts = Shortcuts.parse(this.shortcutFiles[this.shortcutSource].text);
              Shortcuts.initialize(this);
            }
            this.UI.renderStatus();
          } catch (e) {
            this.notice(e.message);
          }
        }
      } else {
        this.bridge.send('request', {});
        this.statusMessage = 'Waiting for AE Designer…';
        setTimeout(() => {
          if (!this.received) this.UI.renderLayers();
        }, 700);
      }
    }
    message(e) {
      if (this.role === 'main') {
        if (e.type === 'request') this.broadcast();
        if (e.type === 'command') this.command(e.payload.name, e.payload.arg);
        if (e.type === 'property') this.property(e.payload);
        if (e.type === 'select') this.select(e.payload.ids);
        if (e.type === 'tree') this.UI.treeAction(e.payload);
        if (e.type === 'edit-patch')
          this.edit(e.payload.label, () =>
            e.payload.changes.forEach((change) => {
              const n = D.find(this.doc, change.id);
              if (!n) throw Error('The selection changed. Try the edit again.');
              Object.keys(change.after).forEach((key) => {
                if (
                  JSON.stringify(n[key] === undefined ? null : n[key]) !== JSON.stringify(change.before[key])
                )
                  throw Error('This property changed in the other panel. Try the edit again.');
                n[key] = D.clone(change.after[key]);
              });
            }),
          );
      } else if (e.type === 'state') {
        this.received = true;
        this.doc = e.payload.doc;
        this.selection = e.payload.selection;
        this.tool = e.payload.tool;
        this.prefs = e.payload.prefs;
        this.fonts = e.payload.fonts || [];
        this.transformMode = e.payload.transformMode;
        this.expanded = new Set(e.payload.expanded);
        this.history.lastAction = e.payload.lastAction;
        this.UI.renderLayers();
        this.UI.renderProperties();
      }
    }
    broadcast() {
      if (this.role === 'main')
        this.bridge.send('state', {
          doc: this.doc,
          selection: this.selection,
          tool: this.tool,
          prefs: this.prefs,
          fonts: this.fonts || [],
          transformMode: this.transformMode,
          expanded: [...this.expanded],
          lastAction: this.history.lastAction,
        });
    }
    notice(text, sticky) {
      const el = document.getElementById('notice');
      el.textContent = text;
      clearTimeout(this.noticeTimer);
      if (!sticky) this.noticeTimer = setTimeout(() => (el.textContent = ''), 6500);
      this.statusMessage = text.split('\n')[0];
      if (this.UI) this.UI.renderStatus();
    }
    changed() {
      if (this.role !== 'main') {
        this.UI.render();
        return;
      }
      this.selection = this.selection.filter((id) => D.find(this.doc, id));
      this.history.selection = this.selection.slice();
      this.render();
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => {
        if (this.dirty)
          this.save('draft', {
            doc: this.doc,
            baseline: this.baseline,
            undo: this.history.undoStack.slice(-30),
            redo: this.history.redoStack.slice(-15),
            lastAction: this.history.lastAction,
          });
        else localStorage.removeItem('edm.aedesigner.draft');
      }, 250);
      this.broadcast();
    }
    edit(label, fn, action) {
      if (this.role !== 'main') {
        const before = D.clone(this.doc);
        try {
          fn();
          const changes = [];
          const diff = (old, n) => {
            if (!n) return;
            const prior = {},
              after = {};
            for (const key of new Set([...Object.keys(old), ...Object.keys(n)])) {
              if (key === 'children') continue;
              if (JSON.stringify(old[key]) !== JSON.stringify(n[key])) {
                prior[key] = old[key] === undefined ? null : old[key];
                after[key] = n[key] === undefined ? null : n[key];
              }
            }
            const a = old.children || [],
              b = n.children || [];
            if (JSON.stringify(a.map((x) => x.id)) !== JSON.stringify(b.map((x) => x.id))) {
              prior.children = a;
              after.children = b;
            } else a.forEach((c, i) => diff(c, b[i]));
            if (Object.keys(after).length) changes.push({ id: old.id, before: prior, after });
          };
          before.layers.forEach((old) => diff(old, D.find(this.doc, old.id)));
          this.doc = before;
          this.bridge.send('edit-patch', { label, changes });
        } catch (err) {
          this.doc = before;
          this.notice(err.message);
        }
        return;
      }
      try {
        this.history.transact(label, fn, action);
        this.changed();
      } catch (e) {
        this.notice(e.message);
        this.render();
      }
    }
    select(ids) {
      if (this.role !== 'main') {
        this.bridge.send('select', { ids });
        return;
      }
      this.selection = [...new Set(ids)].filter((id) => D.find(this.doc, id));
      this.history.selection = this.selection.slice();
      this.pointSelection = [];
      if (this.prefs.reveal)
        this.selection.forEach((id) => D.ancestors(this.doc, id).forEach((n) => this.expanded.add(n.id)));
      this.render();
      this.broadcast();
    }
    setTool(tool) {
      if (tool === 'shear' && this.selection.some((id) => D.find(this.doc, id)?.type === 'text')) {
        this.outlineSelectedText().then((ok) => {
          if (ok) this.setTool(tool);
        });
        return;
      }
      if (this.penId && tool !== 'pen') this.finishPen();
      if (this.input?.typed) this.input.finishTyped();
      const category = (t) => (t === 'select' ? 'select' : t === 'wand' ? 'wand' : 'other');
      this.boxPreferences = this.boxPreferences || this.read('boxes') || {};
      this.boxPreferences[category(this.tool)] = this.showBox;
      this.tool = tool;
      this.showBox = this.boxPreferences[category(tool)] !== false;
      this.pointSelection = [];
      this.UI.renderToolbar();
      this.UI.renderProperties();
      this.renderCanvas();
      this.broadcast();
    }
    resize() {
      if (this.role !== 'main') return;
      const r = document.getElementById('viewport').getBoundingClientRect();
      P.view.viewSize = new P.Size(Math.max(1, r.width), Math.max(1, r.height));
      this.renderCanvas();
    }
    fit(max, selection) {
      if (this.role !== 'main') return;
      const b = selection
        ? G.bounds(this.doc, this.selection)
        : new P.Rectangle(0, 0, this.doc.width, this.doc.height);
      if (!b) return;
      P.view.zoom = Math.max(
        0.01,
        Math.min(
          max || 8,
          (P.view.viewSize.width - 70) / Math.max(1, b.width),
          (P.view.viewSize.height - 70) / Math.max(1, b.height),
        ),
      );
      P.view.center = b.center;
      this.renderCanvas();
      if (this.UI) this.UI.renderStatus();
    }
    zoom(factor, point) {
      const before = point ? P.view.viewToProject(point) : null,
        start = P.view.zoom,
        target = Math.min(64, Math.max(0.01, start * factor));
      cancelAnimationFrame(this.zoomAnimation);
      const apply = (z) => {
        P.view.zoom = z;
        if (before) P.view.center = P.view.center.add(before.subtract(P.view.viewToProject(point)));
        this.renderCanvas();
        this.UI.renderStatus();
      };
      if (!this.prefs.smoothZoom) {
        apply(target);
        return;
      }
      const begin = performance.now(),
        tick = (now) => {
          const t = Math.min(1, (now - begin) / 100);
          apply(start + (target - start) * (1 - Math.pow(1 - t, 3)));
          if (t < 1) this.zoomAnimation = requestAnimationFrame(tick);
        };
      this.zoomAnimation = requestAnimationFrame(tick);
    }
    render() {
      if (!this.UI) return;
      this.UI.renderToolbar();
      this.UI.renderLayers();
      this.UI.renderProperties();
      this.UI.renderStatus();
      this.UI.renderLastAction();
      if (this.role === 'main') this.renderCanvas();
    }
    renderCanvas() {
      if (!P.project || this.role !== 'main') return;
      this.bg.removeChildren();
      this.art.removeChildren();
      this.overlay.removeChildren();
      this.items.clear();
      this.bg.activate();
      const background = new P.Path.Rectangle(new P.Rectangle(0, 0, this.doc.width, this.doc.height));
      background.fillColor = this.backgroundColor || this.doc.background;
      this.clipRect = background.bounds;
      if (this.checker) {
        const size = 12 / P.view.zoom,
          visible = P.view.bounds.intersect(background.bounds),
          cols = Math.ceil(visible.width / size),
          rows = Math.ceil(visible.height / size);
        for (let y = 0; y < rows; y++)
          for (let x = 0; x < cols; x++) {
            const r = new P.Path.Rectangle(
              new P.Rectangle(visible.x + x * size, visible.y + y * size, size, size),
            );
            r.fillColor = (x + y) % 2 ? '#666' : '#888';
          }
      }
      this.art.activate();
      const draw = (n, parent, inherited) => {
        if (n.visible === false) return;
        const container = new P.Group({ insert: false });
        container.applyMatrix = false;
        container.data = { id: n.id };
        container.matrix = G.matrix(n);
        if (!n.projection && (n.parentId || n.parentMatrix))
          container.matrix.prepend(G.parentSpace(this.doc, n));
        parent.addChild(container);
        container.blendMode = PaintPreview.blend(n);
        container.opacity = (n.transform.opacity == null ? 100 : n.transform.opacity) / 100;
        this.items.set(n.id, container);
        if (['layer', 'group', 'text'].includes(n.type)) {
          Masks.source(this, n, container);
          if (n.type === 'text' && this.inlineText?.nodeId !== n.id) {
            const item = G.pathOf(n);
            item.data = { id: n.id };
            container.addChild(item);
          }
          let styles = { fill: inherited.fill, stroke: inherited.stroke };
          n.children.forEach((c) => {
            if (c.type === 'fill' || c.type === 'gradientFill') styles.fill = c;
            if (c.type === 'stroke' || c.type === 'gradientStroke') styles.stroke = c;
          });
          n.children
            .slice()
            .reverse()
            .forEach((c) => {
              if ((D.isShape(c) && c.type !== 'mask') || c.type === 'group') draw(c, container, styles);
            });
          // AE paints sibling paths together. Compound winding is essential for holes.
          const shapeNodes = n.children.filter(
            (c) => D.isShape(c) && c.type !== 'mask' && c.visible !== false,
          );
          if (shapeNodes.length > 1) {
            const compound = new P.CompoundPath({ insert: false });
            shapeNodes.forEach((c) => {
              const original = this.items.get(c.id);
              if (!original || !original.children.length) return;
              const path = original.children[0].clone({ insert: false });
              path.transform(G.matrix(c));
              path.data = { id: c.id };
              compound.addChild(path);
              original.removeChildren();
            });
            if (compound.children.length) {
              G.applyPaint(compound, styles.fill, styles.stroke, this.outline);
              compound.data = { id: shapeNodes[0].id, compoundIds: shapeNodes.map((c) => c.id) };
              container.addChild(compound);
              if (!this.outline) PaintPreview.addProfile(container, compound, styles.stroke);
            }
          }
          PaintPreview.composite(n, container, this.outline);
          this.previewOperators(n, container);
          Masks.apply(this, n, container);
        } else if (D.isShape(n)) {
          const item = G.pathOf(n);
          if (item) {
            item.data = { id: n.id };
            if (n.type === 'mask') {
              item.fillColor = null;
              item.strokeColor = n.mask ? G.color(n.mask.color || [1, 0.7, 0]) : '#ffbb22';
              item.strokeWidth = 1 / P.view.zoom;
              item.dashArray = [4 / P.view.zoom, 3 / P.view.zoom];
            } else G.applyPaint(item, inherited.fill, inherited.stroke, this.outline);
            container.addChild(item);
            if (n.type !== 'mask' && !this.outline)
              PaintPreview.addProfile(container, item, inherited.stroke);
          }
        }
        if (n.projection) Projection.render(container, Projection.rootMatrix(this.doc, n));
        if (
          this.isolation &&
          n.id !== this.isolation &&
          !D.ancestors(this.doc, n.id).some((x) => x.id === this.isolation) &&
          !D.ancestors(this.doc, this.isolation).some((x) => x.id === n.id)
        )
          container.opacity *= 0.2;
      };
      this.doc.layers
        .slice()
        .reverse()
        .forEach((n) => draw(n, this.art, {}));
      this.overlay.activate();
      this.drawSelection();
      Widgets.draw(this);
      const action = this.history.lastAction;
      if (action?.label === 'Simplify paths' && action.values['Show original path'])
        D.selectedShapes(action.base, action.ids).forEach((n) => {
          const p = G.pathOf(n);
          Projection.projectPath(p, G.world(action.base, n));
          p.strokeColor = '#ee5b5b';
          p.strokeWidth = 1 / P.view.zoom;
          p.fillColor = null;
          this.overlay.addChild(p);
        });
      this.doc.guides.forEach((guide) => {
        const p = new P.Path.Line(
          guide.orientation === 1
            ? [guide.position, P.view.bounds.top]
            : [P.view.bounds.left, guide.position],
          guide.orientation === 1
            ? [guide.position, P.view.bounds.bottom]
            : [P.view.bounds.right, guide.position],
        );
        p.strokeColor = '#37b4b8';
        p.strokeWidth = 1 / P.view.zoom;
        p.data = { guide };
      });
      (this.snapLines || []).forEach((s) => {
        const p = new P.Path.Line(
          s.axis === 'x' ? [s.value, P.view.bounds.top] : [P.view.bounds.left, s.value],
          s.axis === 'x' ? [s.value, P.view.bounds.bottom] : [P.view.bounds.right, s.value],
        );
        p.strokeColor = '#c578d9';
        p.strokeWidth = 1 / P.view.zoom;
        p.dashArray = [3 / P.view.zoom, 3 / P.view.zoom];
        new P.PointText({
          point: new P.Point(s.point).add([8 / P.view.zoom, -8 / P.view.zoom]),
          content: s.label,
          fillColor: '#d58cea',
          fontSize: 10 / P.view.zoom,
        });
      });
      P.view.update();
      this.drawRulers();
      document.getElementById('welcome').style.display = this.doc.layers.length ? 'none' : '';
      document.getElementById('connection').textContent = this.bridge.connected
        ? 'After Effects connected'
        : 'Browser preview · Pull and Push require After Effects';
    }
    previewOperators(n, container) {
      Operators.preview(n, container, this.doc.time);
    }
    drawSelection() {
      const z = P.view.zoom / (this.prefs.handleSize / 100);
      let color = this.prefs.selectionColor;
      D.selectedShapes(this.doc, this.selection).forEach((n) => {
        color = this.UI.selectionColor(n);
        const p = G.pathOf(n);
        if (!p) return;
        const handles = Projection.controls(p.clone({ insert: false }), G.world(this.doc, n));
        Projection.projectPath(p, G.world(this.doc, n));
        p.strokeColor =
          n.type === 'mask' && this.prefs.selectionColorMode !== 'custom'
            ? D.hex(n.mask?.color || [1, 0.7, 0])
            : color;
        p.strokeWidth = 1 / z;
        p.strokeScaling = false;
        p.fillColor = null;
        this.overlay.addChild(p);
        if (
          ['direct', 'lasso', 'add', 'deletepoint', 'convert', 'scissors', 'pen'].includes(this.tool) &&
          handles.segments
        ) {
          handles.segments.forEach((s, i) => {
            const selected = this.pointSelection.some((x) => x.id === n.id && x.index === i);
            const r = new P.Path.Rectangle(
              new P.Rectangle(s.point.subtract(3 / z), new P.Size(6 / z, 6 / z)),
            );
            r.fillColor = selected ? color : '#222';
            r.strokeColor = color;
            r.strokeWidth = 1 / z;
            r.data = { vertex: { id: n.id, index: i } };
            if (
              selected &&
              (this.prefs.showHandles || this.pointSelection.filter((x) => !x.handle).length === 1)
            ) {
              ['handleIn', 'handleOut'].forEach((key) => {
                if (s[key].length) {
                  const to = s.point.add(s[key]);
                  const line = new P.Path.Line(s.point, to);
                  line.strokeColor = color;
                  line.strokeWidth = 1 / z;
                  const c = new P.Path.Circle(to, 2.5 / z);
                  c.strokeColor = color;
                  c.strokeWidth = 1 / z;
                  c.fillColor = '#222';
                  c.data = { handle: { id: n.id, index: i, key } };
                }
              });
            }
          });
        }
      });
      const b = G.bounds(this.doc, this.selection);
      this.selectionBounds = b;
      Transforms.drawBoxes(this);
      Transforms.drawAnchor(this);
      if (this.pivot) {
        const c = new P.Path.Circle(this.pivot, 4 / z);
        c.strokeColor = '#fff';
        c.strokeWidth = 1 / z;
      }
    }
    drawRulers() {
      ['x', 'y'].forEach((axis) => {
        const el = document.getElementById('ruler-' + axis);
        el.style.display = this.prefs.rulers ? 'block' : 'none';
        if (!this.prefs.rulers) return;
        const horizontal = axis === 'x',
          size = horizontal ? P.view.viewSize.width : P.view.viewSize.height,
          dpr = window.devicePixelRatio || 1;
        el.width = (horizontal ? size : 18) * dpr;
        el.height = (horizontal ? 18 : size) * dpr;
        const c = el.getContext('2d');
        c.scale(dpr, dpr);
        c.fillStyle = '#202020';
        c.fillRect(0, 0, horizontal ? size : 18, horizontal ? 18 : size);
        c.strokeStyle = '#777';
        c.fillStyle = '#888';
        c.font = '9px -apple-system, sans-serif';
        const step = Math.pow(10, Math.floor(Math.log10(75 / P.view.zoom))),
          major = step * (75 / P.view.zoom / step > 5 ? 10 : 75 / P.view.zoom / step > 2 ? 5 : 2),
          min = horizontal ? P.view.bounds.left : P.view.bounds.top;
        for (let v = Math.floor(min / major) * major; v < min + size / P.view.zoom; v += major / 5) {
          const pos = (v - min) * P.view.zoom,
            isMajor = Math.abs(v / major - Math.round(v / major)) < 0.01;
          c.beginPath();
          if (horizontal) {
            c.moveTo(pos, 18);
            c.lineTo(pos, isMajor ? 6 : 13);
            if (isMajor) c.fillText(Math.round(v), pos + 3, 10);
          } else {
            c.moveTo(18, pos);
            c.lineTo(isMajor ? 6 : 13, pos);
            if (isMajor) {
              c.save();
              c.translate(10, pos - 3);
              c.rotate(-Math.PI / 2);
              c.fillText(Math.round(v), 0, 0);
              c.restore();
            }
          }
          c.stroke();
        }
      });
    }
    hit(point, includeLocked) {
      const hits = this.art.hitTestAll(point, { fill: true, stroke: true, tolerance: 5 / P.view.zoom });
      for (const hit of hits) {
        let id = hit.item.data.id;
        if (hit.item.data.compoundIds) {
          const candidates = hit.item.data.compoundIds.map((id) => D.find(this.doc, id)).filter(Boolean);
          const sampled = candidates.find((n) => {
            const path = G.pathOf(n);
            Projection.projectPath(path, G.world(this.doc, n));
            return path.contains(point) || path.getNearestPoint(point).getDistance(point) < 5 / P.view.zoom;
          });
          if (sampled) id = sampled.id;
        }
        if (!id) continue;
        const n = D.find(this.doc, id);
        if (!n || (!includeLocked && (n.locked || D.ancestors(this.doc, id).some((a) => a.locked)))) continue;
        if (
          this.isolation &&
          id !== this.isolation &&
          !D.ancestors(this.doc, id).some((a) => a.id === this.isolation)
        )
          continue;
        return { node: n, item: hit.item, hit };
      }
      return null;
    }
    target(n) {
      if (this.selectionMode === 'path' || n.type === 'mask') return n;
      const chain = [n].concat(D.ancestors(this.doc, n.id));
      if (this.selectionMode === 'layer') return chain[chain.length - 1];
      let group = chain.filter((x) => x.type === 'group' && x.id !== this.isolation);
      if (this.isolation) {
        const idx = chain.findIndex((x) => x.id === this.isolation);
        group = chain.slice(0, idx).filter((x) => x.type === 'group');
      }
      return group[group.length - 1] || n;
    }
    insertShape(shape) {
      let parent = this.selection.length === 1 ? D.find(this.doc, this.selection[0]) : null;
      if (parent && !['layer', 'group', 'text'].includes(parent.type))
        parent = D.ancestors(this.doc, parent.id).find((n) => n.type === 'group' || n.type === 'layer');
      if (parent && (parent.layerKind === 'other' || parent.type === 'text')) {
        const p = G.pathOf(shape);
        G.setPath(shape, p);
        shape.type = 'mask';
        shape.matchName = 'ADBE Mask Atom';
        shape.props = {
          'ADBE Mask Shape': G.toShape(p),
          'ADBE Mask Feather': [0, 0],
          'ADBE Mask Opacity': 100,
          'ADBE Mask Offset': 0,
        };
        shape.name = 'Mask ' + (parent.children.filter((n) => n.type === 'mask').length + 1);
        shape.mask = {
          mode: 'add',
          inverted: false,
          color: [
            [1, 0.7, 0.15],
            [0.2, 0.75, 1],
            [1, 0.3, 0.5],
            [0.4, 1, 0.5],
            [0.8, 0.5, 1],
            [1, 1, 0.3],
          ][parent.children.filter((n) => n.type === 'mask').length % 6],
        };
        parent.children.push(shape);
        return shape;
      }
      if (!parent) {
        parent = D.node('layer', 'Shape Layer ' + (this.doc.layers.length + 1));
        parent.layerKind = 'shape';
        this.doc.layers.unshift(parent);
      }
      let group = parent;
      if (parent.type !== 'group') {
        group = D.node('group', shape.name);
        parent.children.unshift(group);
      }
      group.children.unshift(shape);
      if (!group.children.some((n) => n.type === 'fill')) group.children.push(D.paint('fill', this.lastFill));
      if (!group.children.some((n) => n.type === 'stroke')) {
        const stroke = D.paint('stroke', this.lastStroke);
        stroke.props['ADBE Vector Stroke Width'] = this.lastWidth;
        group.children.push(stroke);
      }
      this.expanded.add(parent.id);
      this.expanded.add(group.id);
      return shape;
    }
    finishPen() {
      this.penId = null;
      this.render();
    }
    actionTransform(label, values, apply) {
      const base = D.clone(this.doc),
        ids = this.selection.slice(),
        action = {
          label,
          values,
          initialValues: D.clone(values),
          base,
          ids,
          pivot: this.pivot ? [this.pivot.x, this.pivot.y] : null,
          mode: this.transformMode,
        };
      this.edit(label, () => apply(values), action);
    }
    adjustLast(key, value) {
      const a = this.history.lastAction;
      if (!a) return;
      const next = D.clone(a);
      next.values[key] = value;
      if (a.label === 'Scale' && a.linked !== false && ['X', 'Y'].includes(key))
        next.values[key === 'X' ? 'Y' : 'X'] = value;
      this.edit(
        a.label,
        () => {
          this.doc = D.clone(a.base);
          this.applyLast(next);
        },
        next,
      );
    }
    applyLast(a) {
      const v = a.values,
        ids = a.ids.slice();
      const b = G.bounds(this.doc, ids),
        pivot = a.pivot ? new P.Point(a.pivot) : b ? b.center : new P.Point(0, 0);
      if (['Rotate', 'Scale', 'Shear', 'Reflect'].includes(a.label)) {
        if (a.label === 'Reflect' && v.Copy) {
          ids.splice(0, ids.length, ...this.duplicateNodes(ids));
          this.selection = ids.slice();
        }
        const box = G.bounds(this.doc, ids),
          anchor = a.pivotChoice && box ? Transforms.pivot(box, a.pivotChoice) : pivot;
        Transforms.apply(this, ids, a.label.toLowerCase(), v, anchor, a.mode);
        return;
      }
      if (a.widget) {
        Widgets.apply(this, a.widget, ids, Widgets.valueFromFields(a.widget, v));
        return;
      }
      if (a.label === 'Move' || a.label === 'Duplicate and move') {
        if (a.label === 'Duplicate and move') {
          const copies = this.duplicateNodes(ids);
          ids.splice(0, ids.length, ...copies);
          for (let i = 1; i <= (a.repeatCount || 0); i++) {
            const more = this.duplicateNodes(a.ids);
            G.move(this.doc, more, (+v.X || 0) * (i + 1), (+v.Y || 0) * (i + 1));
          }
          this.selection = ids.slice();
        }
        if (a.points?.length) Points.move(this, new P.Point(+v.X || 0, +v.Y || 0), a.points);
        else Transforms.move(this, ids, +v.X || 0, +v.Y || 0, a.mode);
      } else if (a.label === 'Move anchor') {
        Transforms.anchor(this, ids, +v.X || 0, +v.Y || 0);
      } else if (a.label === 'Distribute Spacing') {
        const axis = a.axis || 'x',
          list = D.roots(this.doc, ids)
            .map((n) => ({ n, b: G.bounds(this.doc, [n.id]) }))
            .filter((x) => x.b)
            .sort((a, b) => a.b[axis] - b.b[axis]);
        let cursor = list[0]?.b[axis] || 0;
        list.forEach((x) => {
          const delta = cursor - x.b[axis];
          G.move(this.doc, [x.n.id], axis === 'x' ? delta : 0, axis === 'y' ? delta : 0);
          cursor += (axis === 'x' ? x.b.width : x.b.height) + Number(v.Spacing);
        });
      } else if (a.label === 'Pathfinder') {
        this.selection = ids;
        PathActions.run(this, v.Operation, v.Result);
      } else if (a.label === 'Replicate') {
        this.selection = ids;
        Arrays.create(this, v.Layout, v);
      } else if (a.label === 'Slide point') {
        this.pointSelection = a.points || [];
        const s = this.pointSelection[0];
        if (s) {
          const n = D.find(this.doc, s.id),
            path = G.pathOf(n),
            p = path.segments[s.index],
            a = p.point.add(p.handleIn),
            b = p.point.add(p.handleOut),
            next = a.add(b.subtract(a).multiply(v.Amount / 100));
          p.point = next;
          p.handleIn = a.subtract(next);
          p.handleOut = b.subtract(next);
          G.setPath(n, path);
        }
      } else if (a.label === 'Move along path') {
        this.pointSelection = a.points;
        PathActions.moveAlong(this, +v.Amount, v['Align tangents to path']);
      } else if (a.label === 'Rotate')
        G.transformSelection(this.doc, ids, new P.Matrix().rotate(+v.Angle, pivot));
      else if (a.label === 'Scale')
        G.transformSelection(this.doc, ids, new P.Matrix().scale(+v.X / 100, +v.Y / 100, pivot), this.prefs);
      else if (a.label === 'Shear')
        G.transformSelection(
          this.doc,
          ids,
          new P.Matrix().shear(Math.tan((+v.Angle * Math.PI) / 180), 0, pivot),
        );
      else if (a.label === 'Offset Path') PathActions.offset(this, ids, v);
      else if (a.label === 'Clean up paths') PathActions.cleanup(this, ids, +v.Distance);
      else if (a.label === 'Simplify paths') PathActions.simplify(this, ids, v);
      else if (a.label === 'Round Corners')
        D.selectedShapes(this.doc, ids).forEach((n) => G.setPath(n, G.roundCorners(G.pathOf(n), +v.Radius)));
      else if (a.property) {
        a.ids.forEach((id) => {
          const n = D.find(this.doc, id);
          if (n) {
            const value = valueOf(v.Value);
            if (a.propertyTarget === 'transform') {
              delete n.transform.matrix;
              n.transform[a.property] = D.clone(value);
            } else if (a.propertyTarget === 'text') n.text[a.property] = D.clone(value);
            else if (a.propertyTarget === 'mask') n.mask[a.property] = D.clone(value);
            else if (a.propertyTarget === 'node') n[a.property] = D.clone(value);
            else D.set(n, a.property, value);
          }
        });
      }
      function valueOf(x) {
        return typeof x === 'number' ? x : x;
      }
    }
    duplicateNodes(ids) {
      const result = [];
      D.roots(this.doc, ids).forEach((n) => {
        const p = D.parent(this.doc, n.id),
          a = p ? p.children : this.doc.layers,
          copy = D.fresh(n);
        const base = n.name.replace(/\s+\d+$/, '');
        let number = Number(n.name.match(/\s+(\d+)$/)?.[1] || 0) + 1;
        while (a.some((x) => x.name === base + ' ' + number)) number++;
        copy.name = base + ' ' + number;
        a.splice(a.indexOf(n), 0, copy);
        result.push(copy.id);
      });
      return result;
    }
    property(args) {
      if (this.role !== 'main') {
        this.bridge.send('property', args);
        return;
      }
      const ids = args.ids || this.selection;
      const base = D.clone(this.doc);
      this.edit(
        args.label || 'Change property',
        () => {
          ids.forEach((id) => {
            const n = D.find(this.doc, id);
            if (!n) return;
            if (args.target === 'transform') {
              if (n.hostLimited) throw Error('Transform edits on this parented or 3D layer need AE.');
              if (n.meta['transform.' + args.key] && n.meta['transform.' + args.key].expression)
                throw Error('This value is expression-driven.');
              delete n.transform.matrix;
              n.transform[args.key] = args.value;
            } else if (args.target === 'text') {
              if (n.meta.text && n.meta.text.expression) throw Error('Text is expression-driven.');
              n.text[args.key] = args.value;
            } else if (args.target === 'mask') {
              n.mask[args.key] = args.value;
            } else if (args.target === 'node') n[args.key] = args.value;
            else D.set(n, args.key, args.value);
          });
        },
        args.value !== undefined
          ? {
              label: args.label || 'Change property',
              values: { Value: args.value },
              base,
              ids: ids.slice(),
              property: args.key,
              propertyTarget: args.target || 'props',
            }
          : null,
      );
    }
    async pull(selected) {
      if (!this.bridge.connected) {
        this.notice('Pull reads the active After Effects composition. Open the extension in AE on your Mac.');
        return;
      }
      if (this.dirty) {
        const ok = await this.UI.dialog('Replace the canvas?', 'There are edits that have not been pushed.', [
          { label: 'Cancel', value: false },
          { label: 'Pull anyway', value: true, primary: true },
        ]);
        if (!ok) return;
      }
      const saved = {
        history: this.history,
        baseline: this.baseline,
        selection: this.selection.slice(),
        expanded: new Set(this.expanded),
      };
      this.busy = true;
      this.pullState = { done: 0, total: 0, cancel: false };
      this.UI.renderToolbar();
      let finished = false;
      try {
        const start = await this.bridge.call('beginPull', { selected });
        this.history = new D.History(start.document);
        this.selection = [];
        this.pullState.total = start.total;
        this.render();
        while (this.pullState.done < start.total && !this.pullState.cancel) {
          const part = await this.bridge.call('pullNext');
          if (this.pullState.cancel) break;
          this.doc.layers.push(...part.layers);
          this.pullState.done = part.done;
          this.render();
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
        if (this.pullState.cancel) {
          await this.bridge.call('cancelPull');
          return;
        }
        const r = await this.bridge.call('finishPull');
        Arrays.hydrate(r.document);
        Masks.hydrate(r.document);
        const gradients = Gradients.hydrate(r.document);
        if (gradients.length) await this.bridge.call('hydrateGradients', { gradients });
        this.history = new D.History(r.document);
        this.baseline = D.clone(this.doc);
        this.selection = [];
        this.expanded.clear();
        this.detached = false;
        finished = true;
        this.changed();
        this.fit();
        this.notice(
          r.notes.length
            ? r.notes.join('\n')
            : 'Pulled ' + r.document.layers.length + ' layers from ' + r.document.name,
          !!r.notes.length,
        );
      } catch (err) {
        try {
          await this.bridge.call('cancelPull');
        } catch (ignore) {}
        this.notice(err.message, true);
      } finally {
        if (!finished) {
          this.history = saved.history;
          this.baseline = saved.baseline;
          this.selection = saved.selection;
          this.expanded = saved.expanded;
        }
        this.pullState = null;
        this.busy = false;
        this.render();
      }
    }
    async push(asNew, force) {
      this.finishPen();
      if (this.detached && !asNew) {
        this.notice(
          'Push is paused for this recovered draft. Reattach from the menu or use Push as new.',
          true,
        );
        return;
      }
      this.busy = true;
      this.UI.renderToolbar();
      try {
        const r = await this.bridge.call('push', {
          document: Gradients.prepare(
            G.prepareDocument(this.doc, asNew || !this.doc.source),
            this.hostVersion,
            asNew || !this.doc.source,
          ),
          asNew,
          force,
        });
        if (r.notes.length) {
          this.notice(
            (r.landed ? 'Some edits did not land' : 'Nothing was pushed') + '\n' + r.notes.join('\n'),
            true,
          );
          this.detached = true;
          this.statusMessage = 'Review push notes, then pull before pushing again.';
        } else {
          const result = await this.bridge.call(
            'pull',
            asNew
              ? { layerIds: r.created }
              : r.layerMap
                ? { layerIds: Object.values(r.layerMap) }
                : { selected: false },
          );
          Arrays.hydrate(result.document);
          Masks.hydrate(result.document);
          const gradients = Gradients.hydrate(result.document, r.gradients);
          if (gradients.length) await this.bridge.call('hydrateGradients', { gradients });
          this.history = new D.History(result.document);
          this.baseline = D.clone(this.doc);
          this.selection = [];
          this.expanded.clear();
          this.changed();
          this.notice(
            'Pushed to ' + r.name + (r.warnings?.length ? '\n' + r.warnings.join('\n') : ''),
            !!r.warnings?.length,
          );
        }
      } catch (e) {
        if (e.code === 'STACK_CHANGED') {
          const choice = await this.UI.dialog(
            'The layer stack changed in After Effects',
            'Choose how to send this canvas.',
            [
              { label: 'Cancel', value: 'cancel' },
              { label: 'Push as new', value: 'new' },
              { label: 'Push anyway', value: 'force' },
            ],
          );
          this.busy = false;
          if (choice !== 'cancel') return this.push(choice === 'new', choice === 'force');
        } else this.notice(e.message, true);
      } finally {
        this.busy = false;
        this.UI.renderToolbar();
      }
    }
    async command(name, arg) {
      if (this.role !== 'main') {
        this.bridge.send('command', { name, arg });
        return;
      }
      try {
        await this.execute(name, arg);
      } catch (e) {
        this.notice(e.message, true);
      }
    }
    async outlineSelectedText() {
      const texts = D.roots(this.doc, this.selection).filter((n) => n.type === 'text');
      if (!texts.length) return true;
      if (!this.bridge.connected) {
        this.notice(
          'Text outlines are created by After Effects. Open this panel in AE to convert text.',
          true,
        );
        return false;
      }
      const yes = await this.UI.dialog(
        'Convert text to shapes?',
        'After Effects will create shape layers and keep the original text layers switched off.',
        [
          { label: 'Cancel', value: false },
          { label: 'Convert to shapes', value: true, primary: true },
        ],
      );
      if (!yes) return false;
      for (const n of texts) {
        const result = await this.bridge.call('outlineText', { node: n, document: this.doc }),
          index = this.doc.layers.indexOf(n);
        this.doc.layers.splice(index, 1, result.node);
        this.doc.source = result.source;
        this.selection = this.selection.map((id) => (id === n.id ? result.node.id : id));
        this.baseline.layers = this.baseline.layers.filter((x) => x.id !== n.id);
        this.baseline.layers.unshift(D.clone(result.node));
        this.baseline.source = D.clone(result.source);
        if (result.notes.length) this.notice(result.notes.join('\n'), true);
      }
      this.history.undoStack = [];
      this.history.redoStack = [];
      this.changed();
      return true;
    }
    async execute(name, arg) {
      if (name === 'cancel-pull') {
        if (this.pullState) this.pullState.cancel = true;
        return;
      }
      if (this.pullState) return;
      if (name === 'outline-text') {
        await this.outlineSelectedText();
        return;
      }
      if (
        ['group', 'merge-layer', 'boolean', 'replicate'].includes(name) &&
        this.selection.some((id) => D.find(this.doc, id)?.type === 'text')
      ) {
        if (await this.outlineSelectedText()) return this.execute(name, arg);
        return;
      }
      const ids = this.selection.slice(),
        shapes = D.selectedShapes(this.doc, ids),
        b = G.bounds(this.doc, ids);
      if (name === 'refresh-fonts') {
        if (this.bridge.connected) this.fonts = await this.bridge.call('fonts');
        this.UI.renderProperties();
        return;
      }
      if (name === 'pull') return this.pull(false);
      if (name === 'pull-selected') return this.pull(true);
      if (name === 'push') return this.push(false);
      if (name === 'push-new') return this.push(true);
      if (name === 'undo') {
        if (!this.history.undo() && this.bridge.connected) await this.bridge.call('undo');
        this.selection = this.history.selection.slice();
        this.changed();
        return;
      }
      if (name === 'redo') {
        this.history.redo();
        this.selection = this.history.selection.slice();
        this.changed();
        return;
      }
      if (name === 'new') {
        if (
          this.dirty &&
          !(await this.UI.confirm(
            'Create a new canvas?',
            'Export or push the current canvas first if you want to keep it.',
          ))
        )
          return;
        const size = await this.UI.fields('New canvas', { Name: 'Untitled', Width: 1920, Height: 1080 });
        if (!size) return;
        this.history = new D.History(D.blank());
        this.doc.name = size.Name;
        this.doc.width = Math.max(1, Math.min(30000, +size.Width));
        this.doc.height = Math.max(1, Math.min(30000, +size.Height));
        this.baseline = D.clone(this.doc);
        this.selection = [];
        this.detached = false;
        this.changed();
        this.fit();
        this.notice('Choose a shape or Pen tool to draw.');
        return;
      }
      if (name === 'tool') {
        this.setTool(arg);
        return;
      }
      if (name === 'select-all') {
        this.select(this.doc.layers.filter((n) => !n.locked && n.visible).map((n) => n.id));
        return;
      }
      if (name === 'deselect') {
        this.select([]);
        return;
      }
      if (name === 'fit' || name === 'frame') {
        this.fit(null, name === 'frame');
        return;
      }
      if (name === 'fit100') {
        this.fit(1);
        return;
      }
      if (name === '100') {
        P.view.zoom = 1;
        P.view.center = [this.doc.width / 2, this.doc.height / 2];
        this.renderCanvas();
        this.UI.renderStatus();
        return;
      }
      if (name === 'zoom-in' || name === 'zoom-out') {
        this.zoom(name === 'zoom-in' ? 1.25 : 0.8);
        return;
      }
      if (name === 'copy' || name === 'cut') {
        const roots = Structure.order(this.doc, ids);
        this.clipboard = roots.map(D.clone);
        this.clipboardContext = roots.map((n) => ({
          world: G.world(this.doc, n).values,
          styles: D.clone(D.paints(this.doc, n)),
        }));
        if (name === 'cut') this.command('delete');
        return;
      }
      if (name.indexOf('paste') === 0) {
        if (!this.clipboard.length) return;
        this.edit('Paste', () => Structure.paste(this, name));
        return;
      }
      if (name === 'duplicate') {
        this.edit('Duplicate', () => (this.selection = this.duplicateNodes(ids)));
        return;
      }
      if (name === 'delete') {
        this.edit('Delete', () => {
          if (this.pointSelection.length) Points.remove(this, false);
          else if (this.selectedGuide) {
            this.doc.guides = this.doc.guides.filter((g) => g !== this.selectedGuide);
            this.selectedGuide = null;
          } else D.roots(this.doc, ids).forEach((n) => D.remove(this.doc, n.id));
          this.selection = [];
        });
        return;
      }
      if (name === 'remove-points' && this.pointSelection.length) {
        this.edit('Remove points', () => Points.remove(this, true));
        return;
      }
      if (name === 'lock' || name === 'unlock') {
        this.edit(name === 'lock' ? 'Lock selection' : 'Unlock all', () =>
          D.walk(
            name === 'lock' ? D.roots(this.doc, ids) : this.doc.layers,
            (n) => (n.locked = name === 'lock'),
          ),
        );
        if (name === 'lock') this.select([]);
        return;
      }
      if (name === 'group' || name === 'merge-layer') {
        const layers = [...new Set(D.roots(this.doc, ids).map((n) => Structure.layerOf(this.doc, n)))].filter(
          Boolean,
        );
        if (
          layers.length > 1 &&
          layers.some((n) => Object.values(n.meta).some((m) => m.keys || m.expression))
        ) {
          const ok = await this.UI.dialog(
            'Group across animated layers?',
            'Moved artwork takes on the animation of the layer it lands in.',
            [
              { label: 'Cancel', value: false },
              { label: 'Group', value: true, primary: true },
            ],
          );
          if (!ok) return;
        }
        this.edit(name === 'group' ? 'Group' : 'Merge into layer', () =>
          Structure.group(this, name === 'merge-layer'),
        );
        return;
      }
      if (name === 'ungroup') {
        this.edit('Ungroup', () => Structure.ungroup(this));
        return;
      }
      if (name === 'move-new-layer') {
        this.edit('Move to new layer', () => {
          if (arg?.ids) this.selection = arg.ids;
          Structure.newLayer(this);
        });
        return;
      }
      if (name === 'split-groups-layers') {
        this.edit('Split groups into layers', () => Structure.split(this, 'groups'));
        return;
      }
      if (['front', 'forward', 'backward', 'back'].includes(name)) {
        this.edit('Arrange', () => Structure.arrange(this, name));
        return;
      }
      if (name === 'flip-x' || name === 'flip-y') {
        if (b) {
          const a = {
            label: 'Reflect',
            values: { Angle: name === 'flip-x' ? 90 : 0, Copy: false },
            base: D.clone(this.doc),
            ids,
            pivot: [b.center.x, b.center.y],
            mode: 'Combined',
          };
          this.edit(a.label, () => this.applyLast(a), a);
        }
        return;
      }
      if (name === 'align') {
        this.align(arg);
        return;
      }
      if (name === 'distribute-gap') {
        this.distribute({ axis: arg, gap: this.distributeGap || 0 });
        return;
      }
      if (name === 'distribute') {
        this.distribute(arg);
        return;
      }
      if (name === 'reparent') {
        this.edit('Move in hierarchy', () =>
          Structure.move(this, arg.ids, D.find(this.doc, arg.target), arg.inside, arg.after),
        );
        return;
      }
      if (name === 'average' || name === 'remove-points' || name === 'corner' || name === 'smooth') {
        if (!this.pointSelection.length) return;
        this.edit(name, () => {
          const points = this.pointSelection.map((s) => {
              const n = D.find(this.doc, s.id),
                p = G.pathOf(n);
              return { s, n, p, world: G.world(this.doc, n).transform(p.segments[s.index].point) };
            }),
            center = points.reduce((sum, x) => sum.add(x.world), new P.Point(0, 0)).divide(points.length);
          const grouped = new Map();
          points.forEach((x) => {
            if (!grouped.has(x.n.id)) grouped.set(x.n.id, { n: x.n, p: x.p, indices: [] });
            grouped.get(x.n.id).indices.push(x.s.index);
          });
          grouped.forEach(({ n, p, indices }) => {
            if (name === 'remove-points') indices.sort((a, b) => b - a).forEach((i) => p.removeSegment(i));
            else
              indices.forEach((i) => {
                const segment = p.segments[i];
                if (name === 'average') {
                  const w = G.world(this.doc, n).transform(segment.point);
                  if (arg !== 'vertical') w.y = center.y;
                  if (arg !== 'horizontal') w.x = center.x;
                  segment.point = G.world(this.doc, n).inverseTransform(w);
                } else if (name === 'corner') {
                  segment.handleIn = [0, 0];
                  segment.handleOut = [0, 0];
                } else {
                  const prev = p.segments[(i + p.segments.length - 1) % p.segments.length].point,
                    next = p.segments[(i + 1) % p.segments.length].point,
                    handle = next.subtract(prev).divide(6);
                  segment.handleIn = handle.negate();
                  segment.handleOut = handle;
                }
              });
            if (p.segments.length < 2) D.remove(this.doc, n.id);
            else G.setPath(n, p);
          });
          this.pointSelection = [];
        });
        return;
      }
      if (name === 'split-layers' || name === 'split-groups') {
        this.edit('Split shapes', () =>
          Structure.split(this, name === 'split-layers' ? 'shapes-layers' : 'shapes-groups'),
        );
        return;
      }
      if (name === 'consolidate') {
        this.edit('Consolidate', () => Structure.consolidate(this));
        return;
      }
      if (name === 'isolate') {
        this.isolation = arg || ids[0];
        this.select([]);
        return;
      }
      if (name === 'exit-isolation') {
        this.isolation = null;
        this.render();
        return;
      }
      if (name === 'same-fill' || name === 'same-stroke') {
        const n = D.find(this.doc, ids[0]);
        if (n) this.match(n, name === 'same-fill' ? 'fill' : 'stroke');
        return;
      }
      if (name === 'reverse') {
        this.edit('Reverse path', () =>
          shapes.forEach((n) => {
            const p = G.pathOf(n);
            p.reverse();
            G.setPath(n, p);
          }),
        );
        return;
      }
      if (name === 'bezier') {
        this.edit('Convert to Bezier', () =>
          shapes.filter(D.isShape).forEach((n) => G.setPath(n, G.pathOf(n))),
        );
        return;
      }
      if (name === 'join') {
        this.edit('Join paths', () => {
          if (shapes.length === 1) {
            const p = G.pathOf(shapes[0]);
            p.closed = true;
            G.setPath(shapes[0], p);
          } else if (shapes.length === 2) {
            const [a, c] = shapes,
              pa = G.pathOf(a),
              pc = G.pathOf(c);
            pc.transform(G.world(this.doc, a).inverted().append(G.world(this.doc, c)));
            pa.join(pc, 1);
            G.setPath(a, pa);
            D.remove(this.doc, c.id);
            this.selection = [a.id];
          }
        });
        return;
      }
      if (name === 'simplify' || name === 'round' || name === 'offset') {
        if (!shapes.length) return;
        const label = { simplify: 'Simplify paths', round: 'Round Corners', offset: 'Offset Path' }[name],
          key = { simplify: 'Tolerance', round: 'Radius', offset: 'Distance' }[name],
          a = {
            label,
            values:
              name === 'simplify'
                ? { Tolerance: 2, Smooth: true, 'Show original path': false }
                : name === 'offset'
                  ? { Distance: 10, Join: this.offsetJoin || 'round', 'Miter limit': this.offsetMiter || 4 }
                  : { [key]: 10 },
            base: D.clone(this.doc),
            ids,
          };
        this.edit(label, () => this.applyLast(a), a);
        return;
      }
      if (name === 'cleanup') {
        const result = await this.UI.fields('Clean up paths', { Distance: 0.5 });
        if (!result) return;
        const a = { label: 'Clean up paths', values: result, base: D.clone(this.doc), ids };
        this.edit(a.label, () => this.applyLast(a), a);
        return;
      }
      if (name === 'outline-stroke') {
        this.edit('Outline stroke', () => {
          const selected = [];
          shapes.forEach((n) => {
            const styles = D.paints(this.doc, n),
              stroke = styles.stroke;
            if (!stroke || !stroke.visible) return;
            const q = PaintPreview.profile(stroke),
              path = PaintPreview.dashed(G.pathOf(n), stroke),
              out =
                q.start || q.end || q.wave
                  ? PaintPreview.outline(path, stroke)
                  : G.offset(
                      path,
                      (stroke.props['ADBE Vector Stroke Width'] || 0) / 2,
                      ['miter', 'round', 'bevel'][(stroke.props['ADBE Vector Stroke Line Join'] || 1) - 1],
                      true,
                      stroke.props['ADBE Vector Stroke Line Cap'],
                      stroke.props['ADBE Vector Stroke Miter Limit'],
                    ),
              parent = D.parent(this.doc, n.id),
              index = parent.children.indexOf(n),
              group = D.node('group', n.name + ' outline');
            group.transform = D.clone(n.transform);
            if (styles.fill?.visible) {
              const original = DM.fresh(n),
                fillGroup = D.node('group', 'Original fill');
              original.transform = D.transform();
              fillGroup.children = [original, D.fresh(styles.fill), D.paint('stroke')];
              fillGroup.children[2].visible = false;
              group.children.push(fillGroup);
            }
            const contours = out.children ? out.removeChildren() : [out],
              outlineGroup = D.node('group', 'Outlined stroke');
            contours.forEach((p, i) => {
              const node = D.node('path', 'Outline ' + (i + 1));
              G.setPath(node, p);
              outlineGroup.children.push(node);
            });
            const fill = D.fresh(stroke);
            fill.type = stroke.gradient ? 'gradientFill' : 'fill';
            fill.matchName = D.K[fill.type];
            fill.props['ADBE Vector Fill Color'] = stroke.props['ADBE Vector Stroke Color'] || [0, 0, 0];
            fill.props['ADBE Vector Fill Opacity'] = stroke.props['ADBE Vector Stroke Opacity'] ?? 100;
            Object.keys(fill.props)
              .filter((k) => k.includes('Stroke'))
              .forEach((k) => delete fill.props[k]);
            delete fill.dashes;
            const noStroke = D.paint('stroke');
            noStroke.visible = false;
            outlineGroup.children.push(fill, noStroke);
            group.children.push(outlineGroup);
            parent.children.splice(index, 1, group);
            selected.push(group.id);
          });
          this.selection = selected;
        });
        return;
      }
      if (name === 'boolean') {
        this.pathfinder(arg);
        return;
      }
      if (name === 'replicate') {
        const values = await this.UI.fields('Replicate ' + arg, Arrays.defaults[arg]);
        if (values) this.replicate(arg, values);
        return;
      }
      if (name === 'expand-array') {
        this.edit('Expand copies', () =>
          D.roots(this.doc, this.selection).forEach((n) => {
            if (n.array) Arrays.expand(n);
          }),
        );
        return;
      }
      if (name === 'move-along') {
        const action = {
          label: 'Move along path',
          values: { Amount: 0, 'Align tangents to path': true },
          base: D.clone(this.doc),
          ids,
          points: D.clone(this.pointSelection),
        };
        this.history.lastAction = action;
        this.UI.renderLastAction();
        return;
      }
      if (['dash-add', 'dash-remove', 'dash-offset'].includes(name)) {
        this.edit('Stroke dashes', () =>
          D.roots(this.doc, this.selection)
            .filter((n) => n.type === 'stroke' || n.type === 'gradientStroke')
            .forEach((n) => {
              n.dashes = n.dashes || [];
              if (name === 'dash-add' && n.dashes.length < 6) n.dashes.push(10, 10);
              if (name === 'dash-remove') n.dashes.splice(Number(arg), 2);
              if (name === 'dash-offset') n.dashOffset = 0;
            }),
        );
        return;
      }
      if (name === 'add') {
        this.add(arg);
        return;
      }
      if (name === 'toggle-box') {
        this.showBox = !this.showBox;
        this.boxPreferences = this.boxPreferences || {};
        this.boxPreferences[this.tool === 'select' ? 'select' : this.tool === 'wand' ? 'wand' : 'other'] =
          this.showBox;
        this.save('boxes', this.boxPreferences);
        this.render();
        return;
      }
      if (name === 'snap') {
        this.prefs.snapping = !this.prefs.snapping;
        this.save('prefs', this.prefs);
        this.UI.renderToolbar();
        return;
      }
      if (name === 'rulers') {
        this.prefs.rulers = !this.prefs.rulers;
        this.save('prefs', this.prefs);
        this.renderCanvas();
        return;
      }
      if (name === 'outline') {
        this.outline = !this.outline;
        this.render();
        return;
      }
      if (name === 'checker') {
        this.checker = !this.checker;
        this.render();
        return;
      }
      if (name === 'hide-layers' || name === 'hide-properties') {
        document.body.classList.toggle(name);
        this.resize();
        return;
      }
      if (name === 'preferences') {
        this.UI.preferences();
        return;
      }
      if (name === 'shortcuts') {
        this.UI.shortcuts();
        return;
      }
      if (name === 'export') {
        this.download(this.doc.name + '.aedesigner', JSON.stringify(this.doc, null, 2));
        return;
      }
      if (name === 'import') {
        document.getElementById('open-file').click();
        return;
      }
      if (name === 'guide') {
        this.bridge.openURL('https://github.com/EddyTheDesigner/ae-designer#readme');
        return;
      }
      if (name === 'reattach') {
        const r = await this.bridge.call('reattach', { document: this.doc, baseline: this.baseline });
        this.doc = r.document;
        this.detached = false;
        this.changed();
        this.notice('Draft reattached.');
        return;
      }
      if (name === 'feedback') {
        this.bridge.openURL('https://github.com/EddyTheDesigner/ae-designer/issues/new');
        return;
      }
      if (name === 'whats-new') {
        this.UI.dialog(
          'What’s New · 0.9.1',
          'This update fixes 3D parent transforms and split layers, planar projection fallback, ungroup paint handling, duplicated transform animation, and text outlining at the original pull time. It also cleans up partial output after a failed text conversion.',
          [{ label: 'Done', primary: true }],
        );
        return;
      }
      if (name === 'about') {
        this.UI.dialog(
          'AE Designer 0.9.1',
          'An independent vector editor for After Effects, built from public Design Mode documentation. Version 0.9.1 is ready for Mac/AE acceptance testing. See the repository for source, instructions, and validation results.',
          [{ label: 'Done', primary: true }],
        );
        return;
      }
      if (name === 'reset-transform') {
        this.edit('Reset transform', () =>
          D.roots(this.doc, ids).forEach((n) => {
            delete n.transform.matrix;
            n.transform[arg] = arg === 'scale' ? [100, 100] : 0;
          }),
        );
        return;
      }
      if (name === 'center-anchor') {
        this.edit('Center anchor', () =>
          D.roots(this.doc, ids).forEach((n) => {
            if (!['layer', 'group'].includes(n.type)) return;
            const bb = G.bounds(this.doc, [n.id]);
            if (!bb) return;
            const local = G.world(this.doc, n).inverseTransform(bb.center),
              old = n.transform.anchor,
              delta = local.subtract(new P.Point(old));
            const m = G.matrix(n);
            const d = m.transform(delta).subtract(m.transform(new P.Point(0, 0)));
            n.transform.anchor = [local.x, local.y];
            n.transform.position[0] += d.x;
            n.transform.position[1] += d.y;
            delete n.transform.matrix;
          }),
        );
        return;
      }
    }
    download(name, content) {
      const a = document.createElement('a');
      a.download = name.replace(/[\\/:*?"<>|]/g, '-');
      a.href = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    align(mode) {
      const points = this.pointSelection.length
          ? this.pointSelection
              .filter((s) => !s.handle)
              .map((s) => {
                const n = D.find(this.doc, s.id),
                  p = G.pathOf(n).segments[s.index].point;
                return { ...s, p: G.world(this.doc, n).transform(p) };
              })
          : null,
        roots = D.roots(this.doc, this.selection);
      if (!roots.length) return;
      const combined = points
          ? new P.Rectangle(
              new P.Point(Math.min(...points.map((x) => x.p.x)), Math.min(...points.map((x) => x.p.y))),
              new P.Point(Math.max(...points.map((x) => x.p.x)), Math.max(...points.map((x) => x.p.y))),
            )
          : G.bounds(this.doc, this.selection),
        target =
          this.alignTo === 'composition' || (roots.length === 1 && !points)
            ? new P.Rectangle(0, 0, this.doc.width, this.doc.height)
            : this.alignTo === 'key'
              ? G.bounds(this.doc, [this.keyObject || roots[0].id])
              : combined;
      if (!target || !combined) return;
      const delta = (b) =>
        new P.Point(
          mode === 'left'
            ? target.left - b.left
            : mode === 'right'
              ? target.right - b.right
              : ['centerx', 'center'].includes(mode)
                ? target.center.x - b.center.x
                : 0,
          mode === 'top'
            ? target.top - b.top
            : mode === 'bottom'
              ? target.bottom - b.bottom
              : ['centery', 'center'].includes(mode)
                ? target.center.y - b.center.y
                : 0,
        );
      this.edit('Align', () => {
        if (points) {
          points.forEach((s) => Points.move(this, delta(new P.Rectangle(s.p, new P.Size(0, 0))), [s]));
          return;
        }
        if (this.alignTo === 'composition' && this.alignComposition === 'Together') {
          const v = delta(combined);
          G.move(
            this.doc,
            roots.map((n) => n.id),
            v.x,
            v.y,
          );
        } else
          roots.forEach((n) => {
            const b = G.bounds(this.doc, [n.id]);
            if (b) {
              const v = delta(b);
              G.move(this.doc, [n.id], v.x, v.y);
            }
          });
      });
    }
    distribute(arg) {
      const opts = typeof arg === 'string' ? { axis: arg } : arg,
        axis = opts.axis || 'x',
        edge = opts.edge || 'center',
        coordinate = (b) => (edge === 'center' ? b.center[axis] : b[edge]),
        roots = D.roots(this.doc, this.selection)
          .map((n) => ({ n, b: G.bounds(this.doc, [n.id]) }))
          .filter((x) => x.b)
          .sort((a, b) => coordinate(a.b) - coordinate(b.b));
      if (roots.length < (opts.gap == null ? 3 : 2)) return;
      const first = coordinate(roots[0].b),
        last = coordinate(roots[roots.length - 1].b);
      if (opts.gap != null) {
        const a = {
          label: 'Distribute Spacing',
          values: { Spacing: Number(opts.gap) },
          axis,
          base: D.clone(this.doc),
          ids: roots.map((x) => x.n.id),
        };
        this.edit(a.label, () => this.applyLast(a), a);
        return;
      }
      this.edit('Distribute ' + edge, () => {
        let cursor = axis === 'x' ? roots[0].b.left : roots[0].b.top;
        roots.forEach((x, i) => {
          const d =
            opts.gap == null
              ? first + ((last - first) * i) / (roots.length - 1) - coordinate(x.b)
              : cursor - (axis === 'x' ? x.b.left : x.b.top);
          G.move(this.doc, [x.n.id], axis === 'x' ? d : 0, axis === 'y' ? d : 0);
          cursor += (axis === 'x' ? x.b.width : x.b.height) + Number(opts.gap || 0);
        });
      });
    }
    match(node, kind, modifiers) {
      if (node.type === 'mask') return;
      const ref = D.paints(this.doc, node),
        matches = [],
        same = (a, b) => JSON.stringify(a) === JSON.stringify(b),
        paint = (p, k) =>
          p?.visible !== false
            ? p?.gradient || p?.props['ADBE Vector ' + (k === 'fill' ? 'Fill' : 'Stroke') + ' Color'] || null
            : null;
      D.walk(this.doc.layers, (n) => {
        if (
          !D.isShape(n) ||
          n.type === 'mask' ||
          n.locked ||
          !n.visible ||
          D.ancestors(this.doc, n.id).some((x) => x.locked || !x.visible)
        )
          return;
        const p = D.paints(this.doc, n);
        const ok =
          kind === 'width'
            ? same(p.stroke?.props['ADBE Vector Stroke Width'], ref.stroke?.props['ADBE Vector Stroke Width'])
            : kind === 'both'
              ? same(paint(p.fill, 'fill'), paint(ref.fill, 'fill')) &&
                same(paint(p.stroke, 'stroke'), paint(ref.stroke, 'stroke'))
              : same(paint(p[kind], kind), paint(ref[kind], kind));
        if (ok) matches.push(n.id);
      });
      this.select(
        modifiers?.altKey
          ? this.selection.filter((id) => !matches.includes(id))
          : modifiers?.shiftKey
            ? [...new Set(this.selection.concat(matches))]
            : matches,
      );
    }
    pathfinder(operation) {
      const base = D.clone(this.doc),
        ids = this.selection.slice(),
        values = { Operation: operation, Result: this.pathfinderMode || 'destructive' };
      this.edit('Pathfinder', () => PathActions.run(this, operation, values.Result), {
        label: 'Pathfinder',
        values,
        initialValues: D.clone(values),
        base,
        ids,
      });
    }
    replicate(layout, v) {
      const base = D.clone(this.doc),
        ids = this.selection.slice(),
        values = { Layout: layout, ...Arrays.defaults[layout], ...v };
      this.edit('Replicate ' + layout, () => Arrays.create(this, layout, v), {
        label: 'Replicate',
        values,
        initialValues: D.clone(values),
        base,
        ids,
      });
    }
    add(kind) {
      this.edit('Add ' + kind, () => {
        let target = D.find(this.doc, this.selection[0]);
        if (target && !['layer', 'group'].includes(target.type)) target = D.parent(this.doc, target.id);
        if (!target) {
          target = D.node('layer', 'Shape Layer ' + (this.doc.layers.length + 1));
          target.layerKind = 'shape';
          this.doc.layers.unshift(target);
        }
        if (D.operators[kind]) {
          const n = D.node('operator', kind);
          n.matchName = D.operators[kind][0];
          n.props = D.clone(D.operators[kind][1]);
          target.children.push(n);
          this.selection = [n.id];
        } else if (kind === 'Group') {
          const n = D.node('group', 'Group');
          target.children.unshift(n);
          this.selection = [n.id];
        } else if (['Fill', 'Stroke', 'Gradient Fill', 'Gradient Stroke'].includes(kind)) {
          const base = kind.toLowerCase().includes('stroke') ? 'stroke' : 'fill',
            n = D.paint(base);
          if (kind.startsWith('Gradient')) {
            n.type = base === 'fill' ? 'gradientFill' : 'gradientStroke';
            n.matchName = D.K[n.type];
            Gradients.normalize(n);
          }
          target.children.push(n);
          this.selection = [n.id];
        } else {
          const n = D.shape(
            kind.toLowerCase(),
            this.doc.width / 2 - 100,
            this.doc.height / 2 - 100,
            200,
            200,
          );
          this.insertShape(n);
          this.selection = [n.id];
        }
        this.expanded.add(target.id);
      });
    }
  }
  g.Editor = Editor;
  document.addEventListener('DOMContentLoaded', () => {
    g.editor = new Editor();
    g.editor.init().catch((e) => {
      console.error(e);
      g.editor.notice(e.message, true);
    });
  });
})(window);
