(function (g) {
  'use strict';
  const D = DM,
    G = Geometry,
    P = paper;
  const defaults = {
    Selection: 'v',
    'Cycle selection target': 'Shift+v',
    'Direct Selection': 'a',
    Lasso: 'q',
    Pen: 'p',
    Pencil: 'n',
    'Convert Vertex': 'Shift+c',
    'Add Vertex': '=',
    'Delete Vertex': '-',
    Scissors: 'c',
    Reflect: 'o',
    'Magic Wand': 'y',
    Line: '\\',
    Rectangle: 'm',
    Ellipse: 'l',
    Polystar: 'Shift+l',
    Width: 'Shift+w',
    Text: 't',
    Rotate: 'r',
    Scale: 's',
    Shear: 'Shift+s',
    Gradient: 'g',
    Eyedropper: 'i',
    Hand: 'h',
    Zoom: 'z',
    Undo: 'Ctrl+z',
    Redo: 'Ctrl+Shift+z',
    'Select all': 'Ctrl+a',
    Deselect: 'Ctrl+Shift+a',
    Copy: 'Ctrl+c',
    Cut: 'Ctrl+x',
    Paste: 'Ctrl+v',
    'Paste in front': 'Ctrl+f',
    'Paste in back': 'Ctrl+b',
    'Paste in place': 'Ctrl+Shift+v',
    Duplicate: 'Ctrl+d',
    'Send backward': 'Ctrl+[',
    'Bring forward': 'Ctrl+]',
    'Send to back': 'Ctrl+Shift+[',
    'Bring to front': 'Ctrl+Shift+]',
    'Join paths': 'Ctrl+j',
    'Lock selection': 'Ctrl+2',
    'Unlock all': 'Ctrl+Alt+2',
    Group: 'Ctrl+g',
    Ungroup: 'Ctrl+Shift+g',
    'Fit view': 'Ctrl+0',
    'Fit up to 100%': 'Ctrl+Shift+0',
    'Zoom in': '.',
    'Zoom out': ',',
    '100%': '/',
    'Frame selection': 'f',
    Rulers: 'Ctrl+r',
    'Outline view': 'Ctrl+y',
    'Show transform box': 'Ctrl+Shift+b',
    'Center anchor': 'Ctrl+Alt+Home',
    'Anchor Tool': '',
    'Rounded Rectangle': '',
    Polygon: '',
    'Offset Path': '',
    'Replicate linear': '',
    'Replicate grid': '',
    'Replicate brick': '',
    'Replicate radial': '',
    'Replicate spiral': '',
    'Expand copies': '',
    Consolidate: '',
    'Split shapes into groups': '',
    'Split shapes into layers': '',
    'Reveal selection': 'x',
  };
  const toolCommands = {
    Selection: 'select',
    'Direct Selection': 'direct',
    Lasso: 'lasso',
    Pen: 'pen',
    Pencil: 'pencil',
    'Convert Vertex': 'convert',
    'Add Vertex': 'add',
    'Delete Vertex': 'deletepoint',
    Scissors: 'scissors',
    Reflect: 'reflect',
    'Magic Wand': 'wand',
    Line: 'line',
    Rectangle: 'rect',
    Ellipse: 'ellipse',
    Polystar: 'star',
    Width: 'width',
    Text: 'text',
    Rotate: 'rotate',
    Scale: 'scale',
    Shear: 'shear',
    Gradient: 'gradient',
    Eyedropper: 'eyedropper',
    Hand: 'hand',
    Zoom: 'zoom',
    'Anchor Tool': 'anchor',
    'Rounded Rectangle': 'roundrect',
    Polygon: 'polygon',
    'Offset Path': 'offset',
  };
  const editCommands = {
    Undo: 'undo',
    Redo: 'redo',
    'Select all': 'select-all',
    Deselect: 'deselect',
    Copy: 'copy',
    Cut: 'cut',
    Paste: 'paste',
    'Paste in front': 'paste-front',
    'Paste in back': 'paste-back',
    'Paste in place': 'paste-in-place',
    Duplicate: 'duplicate',
    'Send backward': 'backward',
    'Bring forward': 'forward',
    'Send to back': 'back',
    'Bring to front': 'front',
    'Join paths': 'join',
    'Lock selection': 'lock',
    'Unlock all': 'unlock',
    Group: 'group',
    Ungroup: 'ungroup',
    'Fit view': 'fit',
    'Fit up to 100%': 'fit100',
    'Zoom in': 'zoom-in',
    'Zoom out': 'zoom-out',
    '100%': '100',
    'Frame selection': 'frame',
    Rulers: 'rulers',
    'Outline view': 'outline',
    'Show transform box': 'toggle-box',
    'Center anchor': 'center-anchor',
    'Expand copies': 'expand-copies',
    Consolidate: 'consolidate',
    'Split shapes into groups': 'split-groups',
    'Split shapes into layers': 'split-layers',
  };
  function keyName(e) {
    let key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    return (e.ctrlKey ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '') + (e.shiftKey ? 'Shift+' : '') + key;
  }
  class Input {
    constructor(editor) {
      this.e = editor;
      this.canvas = document.getElementById('canvas');
      this.space = false;
      this.drag = null;
      this.typed = null;
      this.canvas.addEventListener('pointerdown', (ev) => this.handle('down', ev));
      this.canvas.addEventListener('pointermove', (ev) => this.handle('move', ev));
      this.canvas.addEventListener('pointerup', (ev) => this.handle('up', ev));
      this.canvas.addEventListener('pointercancel', () => this.cancel());
      this.canvas.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        this.e.UI.contextMenu({ x: ev.clientX, y: ev.clientY });
      });
      this.canvas.addEventListener('dblclick', (ev) => this.handle('double', ev));
      this.canvas.addEventListener('wheel', (ev) => this.wheel(ev), { passive: false });
      window.addEventListener('keydown', (ev) => this.key(ev));
      window.addEventListener('keyup', (ev) => {
        if (ev.code === 'Space') this.space = false;
      });
      window.addEventListener('blur', () => {
        this.space = false;
        this.cancel();
      });
      ['x', 'y'].forEach((axis) => {
        const r = document.getElementById('ruler-' + axis);
        r.onpointerdown = (ev) => {
          r.setPointerCapture(ev.pointerId);
          const before = this.e.history.begin(),
            guide = { orientation: axis === 'x' ? 0 : 1, position: 0 };
          this.e.doc.guides.push(guide);
          r.onpointermove = (mv) => {
            const p = this.point(mv);
            guide.position = Math.round(axis === 'x' ? p.y : p.x);
            this.e.renderCanvas();
          };
          r.onpointerup = () => {
            this.e.history.commit(before, 'Add guide');
            this.e.changed();
            r.onpointermove = null;
            r.onpointerup = null;
          };
        };
      });
    }
    handle(method, ev) {
      const before = this.drag?.before;
      const fail = (err) => {
        if (before) this.e.doc = before.doc;
        this.drag = null;
        this.e.render();
        this.e.notice(err.message, true);
      };
      try {
        const result = this[method](ev);
        if (result?.catch) result.catch(fail);
      } catch (err) {
        fail(err);
      }
    }
    point(ev) {
      const r = this.canvas.getBoundingClientRect();
      return P.view.viewToProject(
        new P.Point(
          ((ev.clientX - r.left) * P.view.viewSize.width) / r.width,
          ((ev.clientY - r.top) * P.view.viewSize.height) / r.height,
        ),
      );
    }
    viewPoint(ev) {
      const r = this.canvas.getBoundingClientRect();
      return new P.Point(
        ((ev.clientX - r.left) * P.view.viewSize.width) / r.width,
        ((ev.clientY - r.top) * P.view.viewSize.height) / r.height,
      );
    }
    snap(p, ev) {
      const e = this.e;
      e.snapLines = [];
      if (!(e.prefs.snapping !== !!ev.ctrlKey)) return p;
      const tolerance = e.prefs.snapDistance / P.view.zoom,
        xs = [],
        ys = [],
        add = (list, value, label) => list.push({ value, label });
      [0, e.doc.width / 2, e.doc.width].forEach((v, i) => add(xs, v, i === 1 ? 'Comp center' : 'Comp edge'));
      [0, e.doc.height / 2, e.doc.height].forEach((v, i) =>
        add(ys, v, i === 1 ? 'Comp center' : 'Comp edge'),
      );
      e.doc.guides.forEach((g) => {
        if (g !== e.selectedGuide) add(g.orientation === 1 ? xs : ys, g.position, 'Guide');
      });
      D.walk(e.doc.layers, (n) => {
        if (
          !D.isShape(n) ||
          n.visible === false ||
          e.selection.includes(n.id) ||
          D.ancestors(e.doc, n.id).some((a) => !a.visible || e.selection.includes(a.id))
        )
          return;
        const b = G.bounds(e.doc, [n.id]);
        if (b) {
          [b.left, b.center.x, b.right].forEach((v, i) => add(xs, v, i === 1 ? 'Center' : 'Edge'));
          [b.top, b.center.y, b.bottom].forEach((v, i) => add(ys, v, i === 1 ? 'Center' : 'Edge'));
        }
        const path = G.pathOf(n),
          m = G.world(e.doc, n);
        path?.segments?.forEach((s) => {
          const p = m.transform(s.point);
          add(xs, p.x, 'Point');
          add(ys, p.y, 'Point');
        });
      });
      const result = p.clone();
      for (const [axis, list] of [
        ['x', xs],
        ['y', ys],
      ]) {
        const nearest = list.reduce(
          (best, n) => (!best || Math.abs(n.value - p[axis]) < Math.abs(best.value - p[axis]) ? n : best),
          null,
        );
        if (nearest && Math.abs(nearest.value - p[axis]) < tolerance) {
          result[axis] = nearest.value;
          e.snapLines.push({ axis, value: nearest.value, label: nearest.label, point: [result.x, result.y] });
        }
      }
      return result;
    }
    localize(n) {
      const parent = D.parent(this.e.doc, n.id);
      if (!parent) return;
      const m = G.world(this.e.doc, parent);
      if (m.isIdentity()) return;
      if (n.type === 'mask') {
        const p = G.pathOf(n);
        p.transform(m.inverted());
        G.setPath(n, p);
        return;
      }
      const wrapper = D.node('group', n.name);
      wrapper.children = [n];
      G.storeMatrix(wrapper, m.inverted());
      const index = parent.children.indexOf(n);
      parent.children.splice(index, 1, wrapper);
    }
    down(ev) {
      if (ev.button === 2 || this.e.modalOpen || this.e.pullState) return;
      ev.preventDefault();
      this.canvas.focus();
      this.canvas.setPointerCapture(ev.pointerId);
      const e = this.e,
        p = this.point(ev),
        tool = ev.ctrlKey && !ev.shiftKey && !this.space ? 'direct' : e.tool;
      this.lastPointer = p;
      const before = e.history.begin();
      if (this.typed && ev.button === 1) {
        const v = p.subtract(this.typed.start);
        this.typed.axis = Math.abs(v.x) > Math.abs(v.y) ? 'x' : 'y';
        this.previewTyped(p);
        return;
      }
      if (this.typed) {
        this.finishTyped();
        return;
      }
      if (this.space || ev.button === 1 || tool === 'hand') {
        this.drag = { type: 'pan', start: this.viewPoint(ev), center: P.view.center.clone() };
        return;
      }
      if (tool === 'zoom') {
        this.drag = {
          type: 'zoom',
          start: this.viewPoint(ev),
          zoom: P.view.zoom,
          moved: false,
          alt: ev.altKey,
        };
        return;
      }
      const overlay = e.overlay.hitTest(p, { fill: true, stroke: true, tolerance: 5 / P.view.zoom }),
        data = (overlay && overlay.item.data) || {},
        hit = e.hit(p, tool === 'eyedropper');
      if (data.widget) {
        this.drag = Widgets.begin(e, data.widget, p, before);
        return;
      }
      if (data.guide) {
        e.selectedGuide = data.guide;
        this.drag = { type: 'guide', guide: data.guide, start: p, before };
        return;
      }
      if (
        ['direct', 'add', 'deletepoint', 'convert', 'scissors', 'pen'].includes(tool) &&
        (data.vertex || data.handle)
      ) {
        const ref = data.vertex || data.handle,
          n = D.find(e.doc, ref.id);
        if (tool === 'convert') {
          this.drag = {
            type: 'convert',
            ref,
            handle: !!data.handle,
            start: p,
            before,
            base: D.clone(e.doc),
            ids: [n.id],
            moved: false,
          };
          return;
        }
        if (tool === 'deletepoint' || tool === 'scissors') {
          this.vertexAction(tool, n, ref.index, before);
          return;
        }
        if (tool === 'pen' && data.vertex && e.penId === n.id && ref.index === 0) {
          e.edit('Close path', () => {
            n.props['ADBE Vector Shape'].closed = true;
          });
          e.penId = null;
          return;
        }
        if (tool === 'pen' && !e.penId && data.vertex) {
          this.vertexAction(ev.altKey ? 'convert' : 'deletepoint', n, ref.index, before);
          return;
        }
        this.drag = Points.begin(e, ref, !!data.handle, p, before, ev);
        e.render();
        return;
      }
      if (tool === 'pen' && !e.penId && hit && D.isShape(hit.node)) {
        const path = G.pathOf(hit.node),
          loc = path.getNearestLocation(G.world(e.doc, hit.node).inverseTransform(p));
        if (loc && G.world(e.doc, hit.node).transform(loc.point).getDistance(p) < 6 / P.view.zoom) {
          e.edit('Add vertex', () => {
            path.divideAt(loc);
            Points.save(e, hit.node, path);
            e.selection = [hit.node.id];
          });
          return;
        }
      }
      if (tool === 'pen') {
        this.pen(p, ev);
        return;
      }
      if (tool === 'add' || tool === 'scissors') {
        if (hit && D.isShape(hit.node)) {
          const n = hit.node,
            path = G.pathOf(n),
            local = G.world(e.doc, n).inverseTransform(p),
            loc = path.getNearestLocation(local);
          e.edit(tool === 'add' ? 'Add vertex' : 'Scissors', () => {
            if (tool === 'add') path.divideAt(loc);
            else {
              const tail = path.splitAt(loc);
              if (tail) {
                const newNode = D.fresh(n);
                G.setPath(newNode, tail);
                D.parent(e.doc, n.id).children.push(newNode);
              }
              path.closed = false;
            }
            G.setPath(n, path);
            e.selection = [n.id];
          });
        }
        return;
      }
      if (['rect', 'roundrect', 'ellipse', 'polygon', 'star', 'line'].includes(tool)) {
        this.drag = { type: 'shape', tool, start: this.snap(p, ev), before, base: D.clone(e.doc), id: null };
        return;
      }
      if (tool === 'pencil') {
        this.drag = { type: 'pencil', points: [p], before, base: D.clone(e.doc) };
        return;
      }
      if (tool === 'text') {
        this.drag = {
          type: 'text',
          start: p,
          before,
          existing: hit && hit.node.type === 'text' ? hit.node.id : null,
        };
        return;
      }
      if (tool === 'wand') {
        if (hit) e.match(hit.node, e.wandMode || 'fill', ev);
        return;
      }
      if (tool === 'eyedropper') {
        if (ev.shiftKey || e.eyedropperKind) {
          const was = e.overlay.visible;
          e.overlay.visible = false;
          P.view.update();
          const vp = this.viewPoint(ev),
            ratio = this.canvas.width / P.view.viewSize.width,
            pixel = this.canvas
              .getContext('2d')
              .getImageData(Math.round(vp.x * ratio), Math.round(vp.y * ratio), 1, 1).data;
          e.overlay.visible = was;
          const color = [pixel[0] / 255, pixel[1] / 255, pixel[2] / 255],
            selected = e.selection
              .map((id) => D.find(e.doc, id))
              .filter((n) => n && ['fill', 'stroke', 'gradientFill', 'gradientStroke'].includes(n.type));
          e.edit('Sample color', () => {
            const targets = selected.length
              ? selected
              : D.styleTargets(
                  e.doc,
                  e.selection,
                  e.eyedropperKind || (hit?.hit.type === 'stroke' ? 'stroke' : 'fill'),
                  true,
                );
            targets.forEach((n) => {
              const kind = n.type.toLowerCase().includes('stroke') ? 'stroke' : 'fill';
              D.set(n, 'ADBE Vector ' + (kind === 'fill' ? 'Fill' : 'Stroke') + ' Color', color);
              n.type = kind;
              n.matchName = D.K[kind];
              delete n.gradient;
              n.visible = true;
            });
          });
          if (e.eyedropperKind) {
            e.eyedropperKind = null;
            e.setTool(e.previousTool || 'select');
          }
          return;
        }
        if (hit) {
          const s = D.paints(e.doc, hit.node);
          e.edit('Eyedropper', () =>
            ['fill', 'stroke'].forEach((k) => {
              const target = D.styleTargets(e.doc, e.selection, k, true);
              target.forEach((paint) => {
                if (!s[k]) paint.visible = false;
                else {
                  paint.type = s[k].type;
                  paint.matchName = s[k].matchName;
                  paint.props = D.clone(s[k].props);
                  paint.visible = s[k].visible;
                  paint.gradient = s[k].gradient ? D.clone(s[k].gradient) : undefined;
                  paint.dashes = D.clone(s[k].dashes || []);
                  paint.dashOffset = s[k].dashOffset || 0;
                }
              });
            }),
          );
        }
        return;
      }
      if (tool === 'gradient') {
        if (!e.selection.length && hit) e.select([hit.node.id]);
        this.drag = { type: 'gradient', start: p, before, base: D.clone(e.doc) };
        return;
      }
      if (tool === 'offset') {
        if (hit && !e.selection.includes(hit.node.id)) e.select([hit.node.id]);
        this.drag = { type: 'offset', start: p, before, base: D.clone(e.doc), ids: e.selection.slice() };
        return;
      }
      if (tool === 'width') {
        const targets = D.styleTargets(e.doc, e.selection, 'stroke', false);
        if (targets.length)
          this.drag = {
            type: 'width',
            start: p,
            before,
            base: D.clone(e.doc),
            ids: targets.map((n) => n.id),
          };
        return;
      }
      if (tool === 'lasso') {
        this.drag = {
          type: 'lasso',
          start: p,
          points: [p],
          previous: D.clone(e.pointSelection),
          shift: ev.shiftKey,
          alt: ev.altKey,
        };
        return;
      }
      if (tool === 'reflect' && ev.altKey && e.selection.length) {
        const ids = e.selection.slice(),
          base = D.clone(e.doc),
          pivot = e.pivot || [p.x, p.y];
        e.UI.fields('Reflect', { Angle: 90, Copy: false }).then((values) => {
          if (values)
            e.edit(
              'Reflect',
              () => e.applyLast({ label: 'Reflect', ids, values, pivot, mode: e.transformMode }),
              {
                label: 'Reflect',
                ids,
                values,
                base,
                pivot,
                mode: e.transformMode,
              },
            );
        });
        return;
      }
      if (data.grip !== undefined && e.selectionBounds) {
        this.drag = {
          type: 'scale',
          start: p,
          before,
          base: D.clone(e.doc),
          ids: e.selection.slice(),
          bounds: data.box ? new P.Rectangle(...data.box.bounds) : e.selectionBounds.clone(),
          axisAngle: data.box?.angle || 0,
          frameCenter: data.box ? new P.Point(data.box.center) : e.selectionBounds.center,
          grip: data.grip,
          pivot: e.pivot ? new P.Point(e.pivot) : e.selectionBounds.center,
        };
        return;
      }
      if (data.rotate || (['rotate', 'scale', 'shear', 'reflect'].includes(tool) && e.selection.length)) {
        const bounds = G.bounds(e.doc, e.selection);
        this.drag = {
          type: data.rotate ? 'rotate' : tool,
          start: p,
          before,
          base: D.clone(e.doc),
          ids: e.selection.slice(),
          bounds,
          pivot: e.pivot ? new P.Point(e.pivot) : bounds.center,
        };
        return;
      }
      if (tool === 'anchor' && data.anchor && e.selection.length) {
        this.drag = { type: 'anchor', start: p, before, base: D.clone(e.doc), ids: e.selection.slice() };
        return;
      }
      if (tool === 'direct' && hit && D.isShape(hit.node)) {
        const path = G.pathOf(hit.node),
          m = G.world(e.doc, hit.node),
          loc = path.getNearestLocation(m.inverseTransform(p));
        if (loc && path.segments && m.transform(loc.point).getDistance(p) < 6 / P.view.zoom) {
          const indices = [loc.curve.index, (loc.curve.index + 1) % path.segments.length],
            selected = indices.map((index) => ({ id: hit.node.id, index }));
          e.pointSelection = ev.shiftKey ? [...e.pointSelection, ...selected] : selected;
          e.selection = [...new Set(e.pointSelection.map((x) => x.id))];
          this.drag = {
            type: 'vertex',
            ref: selected[0],
            selected: D.clone(e.pointSelection),
            start: p,
            before,
            base: D.clone(e.doc),
            ids: e.selection.slice(),
          };
          e.render();
          return;
        }
      }
      if (hit) {
        const selectedUnder =
          tool === 'select' &&
          !ev.shiftKey &&
          D.selectedShapes(e.doc, e.selection).some((n) => {
            const path = G.pathOf(n);
            Projection.projectPath(path, G.world(e.doc, n));
            return (
              path.contains(p) ||
              (path.getNearestPoint && path.getNearestPoint(p).getDistance(p) < 5 / P.view.zoom)
            );
          });
        const target = tool === 'direct' ? hit.node : e.target(hit.node);
        if (!selectedUnder && !e.selection.includes(target.id)) {
          e.select(ev.shiftKey ? e.selection.concat(target.id) : [target.id]);
        } else if (ev.shiftKey) {
          e.select(e.selection.filter((id) => id !== target.id));
          return;
        }
        let duplicate = false;
        const originalIds = e.selection.slice();
        if (ev.altKey) {
          e.selection = e.duplicateNodes(e.selection);
          duplicate = true;
        }
        this.drag = {
          type: 'move',
          clickTarget: target.id,
          start: this.snap(p, ev),
          before,
          base: D.clone(e.doc),
          ids: e.selection.slice(),
          duplicate,
          originalIds,
          moved: false,
        };
      } else {
        if (!ev.shiftKey) e.select([]);
        this.drag = {
          type: 'marquee',
          start: p,
          shift: ev.shiftKey,
          alt: ev.altKey,
          previous: D.clone(e.pointSelection),
          pointMode: tool === 'direct',
        };
      }
    }
    move(ev) {
      const e = this.e,
        p = this.point(ev);
      this.lastPointer = p;
      if (this.typed) {
        this.previewTyped(p);
        return;
      }
      const d = this.drag;
      if (!d) {
        if (e.tool === 'offset') {
          e.renderCanvas();
          const hit = e.hit(p),
            shape = hit && D.isShape(hit.node) && G.pathOf(hit.node);
          if (shape?.closed) {
            Projection.projectPath(shape, G.world(e.doc, hit.node));
            const group = new P.Group(),
              clip = shape.clone({ insert: false });
            clip.clipMask = true;
            group.addChild(clip);
            const b = shape.bounds,
              space = 8 / P.view.zoom;
            for (let x = b.left - b.height; x < b.right; x += space) {
              const line = new P.Path.Line([x, b.bottom], [x + b.height, b.top]);
              line.strokeColor = '#a7a7a7';
              line.strokeWidth = 0.6 / P.view.zoom;
              group.addChild(line);
            }
            group.clipped = true;
            P.view.update();
          }
        }
        return;
      }
      if (d.type === 'pan') {
        const delta = this.viewPoint(ev).subtract(d.start).divide(P.view.zoom);
        P.view.center = d.center.subtract(delta);
        e.renderCanvas();
        return;
      }
      if (d.type === 'zoom') {
        const dx = this.viewPoint(ev).x - d.start.x;
        if (Math.abs(dx) > 2) d.moved = true;
        P.view.zoom = Math.max(0.01, Math.min(64, d.zoom * Math.exp(dx * 0.01)));
        e.renderCanvas();
        e.UI.renderStatus();
        return;
      }
      if (d.type === 'guide') {
        const snapped = this.snap(p, ev);
        d.guide.position = Math.round(d.guide.orientation === 1 ? snapped.x : snapped.y);
        e.renderCanvas();
        return;
      }
      if (d.type === 'shape') {
        if (this.space && d.lastPoint) d.start = d.start.add(p.subtract(d.lastPoint));
        d.lastPoint = p;
        const to = this.snap(p, ev);
        let dx = to.x - d.start.x,
          dy = to.y - d.start.y;
        if (ev.shiftKey && d.tool !== 'line') {
          const size = Math.max(Math.abs(dx), Math.abs(dy));
          dx = size * (Math.sign(dx) || 1);
          dy = size * (Math.sign(dy) || 1);
        }
        if (d.tool === 'line' && ev.shiftKey) {
          const len = Math.hypot(dx, dy),
            a = (Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * Math.PI) / 12;
          dx = Math.cos(a) * len;
          dy = Math.sin(a) * len;
        }
        e.doc = D.clone(d.base);
        let n;
        if (d.tool === 'line') {
          n = D.shape('path', d.start.x, d.start.y, dx, dy);
          n.pushAsRig = true;
        } else if (d.tool === 'star' || d.tool === 'polygon')
          n = D.shape('star', d.start.x, d.start.y, Math.hypot(dx, dy), 0, {
            polygon: d.tool === 'polygon',
            points: d.points || 5,
          });
        else
          n = D.shape(
            d.tool === 'ellipse' ? 'ellipse' : 'rect',
            Math.min(d.start.x, d.start.x + dx),
            Math.min(d.start.y, d.start.y + dy),
            Math.abs(dx),
            Math.abs(dy),
            { roundness: d.tool === 'roundrect' ? Math.min(Math.abs(dx), Math.abs(dy)) * 0.15 : 0 },
          );
        if (d.id) n.id = d.id;
        else d.id = n.id;
        e.insertShape(n);
        this.localize(n);
        e.selection = [n.id];
        e.renderCanvas();
        return;
      }
      if (d.type === 'pencil') {
        if (d.points[d.points.length - 1].getDistance(p) > 2 / P.view.zoom) d.points.push(p);
        e.renderCanvas();
        e.overlay.activate();
        const preview = new P.Path({
          segments: d.points,
          strokeColor: '#c3acf8',
          strokeWidth: 2 / P.view.zoom,
        });
        P.view.update();
        return;
      }
      if (d.type === 'text') {
        e.renderCanvas();
        e.overlay.activate();
        const rect = new P.Path.Rectangle(new P.Rectangle(d.start, p));
        rect.strokeColor = '#64b2ff';
        rect.strokeWidth = 1 / P.view.zoom;
        P.view.update();
        return;
      }
      if (d.type === 'marquee' || d.type === 'lasso') {
        e.renderCanvas();
        e.overlay.activate();
        let preview;
        if (d.type === 'lasso') {
          d.points.push(p);
          preview = new P.Path({ segments: d.points, closed: true });
        } else preview = new P.Path.Rectangle(new P.Rectangle(d.start, p));
        preview.strokeColor = '#70baff';
        preview.fillColor = new P.Color(0.2, 0.5, 0.9, 0.08);
        preview.strokeWidth = 1 / P.view.zoom;
        preview.dashArray = [4 / P.view.zoom, 3 / P.view.zoom];
        P.view.update();
        return;
      }
      if (d.base) e.doc = D.clone(d.base);
      const delta = this.snap(p, ev).subtract(d.start);
      if (ev.shiftKey && d.type === 'move') {
        if (Math.abs(delta.x) > Math.abs(delta.y)) delta.y = 0;
        else delta.x = 0;
      }
      if (d.type === 'move') {
        Transforms.move(e, d.ids, delta.x, delta.y, e.transformMode);
        d.values = { X: delta.x, Y: delta.y };
        d.moved = delta.length > 1 / P.view.zoom;
      }
      if (d.type === 'widget') Widgets.drag(e, d, p, ev);
      if (['vertex', 'handle', 'slide'].includes(d.type)) Points.drag(e, d, p, ev);
      if (d.type === 'convert') {
        const n = D.find(e.doc, d.ref.id),
          path = G.pathOf(n),
          seg = path.segments[d.ref.index],
          m = G.world(e.doc, n),
          v = m.inverseTransform(p).subtract(d.handle ? seg.point : m.inverseTransform(d.start));
        d.moved = p.getDistance(d.start) > 2 / P.view.zoom;
        if (ev.shiftKey) v.angle = Math.round(v.angle / 45) * 45;
        if (d.handle) {
          seg[d.ref.key] = v;
          n.tangentModes = n.tangentModes || {};
          n.tangentModes[d.ref.index] = 'Free';
        } else {
          seg.handleOut = v;
          seg.handleIn = ev.altKey ? new P.Point(0, 0) : v.negate();
        }
        Points.save(e, n, path);
      }
      if (d.type === 'pen-handle') {
        const n = D.find(e.doc, d.id),
          path = G.pathOf(n),
          mat = G.world(e.doc, n),
          s = path.lastSegment,
          v = mat.inverseTransform(p).subtract(s.point);
        if (this.space) {
          s.point = s.point.add(mat.inverseTransform(p).subtract(mat.inverseTransform(d.start)));
          G.setPath(n, path);
          e.renderCanvas();
          return;
        }
        if (ev.shiftKey) v.angle = Math.round(v.angle / 45) * 45;
        s.handleOut = v;
        s.handleIn = ev.altKey ? new P.Point(0, 0) : v.negate();
        G.setPath(n, path);
      }
      if (['rotate', 'scale', 'shear', 'reflect'].includes(d.type)) {
        let m = new P.Matrix();
        const v1 = d.start.subtract(d.pivot),
          v2 = p.subtract(d.pivot);
        if (d.type === 'rotate') {
          let angle = v2.angle - v1.angle;
          if (ev.shiftKey) angle = Math.round(angle / 15) * 15;
          m.rotate(angle, d.pivot);
          d.values = { Angle: angle };
        }
        if (d.type === 'reflect') {
          const angle = ev.shiftKey ? Math.round(v2.angle / 15) * 15 : v2.angle;
          m.rotate(angle, d.pivot);
          m.scale(1, -1, d.pivot);
          m.rotate(-angle, d.pivot);
          d.values = { Angle: angle, Copy: false };
        }
        if (d.type === 'shear') {
          const axis = ev.shiftKey ? Math.round(v1.angle / 45) * 45 : 0;
          let value = p.subtract(d.start).rotate(-axis).x / Math.max(10, d.bounds.height);
          m.shear(value, 0, d.pivot);
          d.values = { Angle: (Math.atan(value) * 180) / Math.PI, Axis: axis };
        }
        if (d.type === 'scale') {
          let sx = 1,
            sy = 1,
            pivot = d.pivot;
          if (d.grip !== undefined) {
            const points = [
              d.bounds.topLeft,
              d.bounds.topCenter,
              d.bounds.topRight,
              d.bounds.rightCenter,
              d.bounds.bottomRight,
              d.bounds.bottomCenter,
              d.bounds.bottomLeft,
              d.bounds.leftCenter,
            ];
            pivot = ev.ctrlKey ? d.pivot : points[(d.grip + 4) % 8];
            const frame = new P.Matrix().rotate(-(d.axisAngle || 0), d.frameCenter || d.bounds.center);
            const a = frame.transform(d.start).subtract(pivot),
              b = frame.transform(p).subtract(pivot);
            pivot = frame.inverted().transform(pivot);
            sx = Math.abs(a.x) > 0.001 ? b.x / a.x : 1;
            sy = Math.abs(a.y) > 0.001 ? b.y / a.y : 1;
          } else {
            sx = Math.abs(v1.x) > 1 ? v2.x / v1.x : 1 + (p.x - d.start.x) / 100;
            sy = Math.abs(v1.y) > 1 ? v2.y / v1.y : 1 + (p.y - d.start.y) / 100;
          }
          if (ev.shiftKey && (d.grip === undefined || d.grip % 2 === 0)) {
            const factor = Math.abs(sx - 1) > Math.abs(sy - 1) ? sx : sy;
            sx = sy = factor;
          }
          sx = Math.abs(sx) < 0.001 ? 0.001 : sx;
          sy = Math.abs(sy) < 0.001 ? 0.001 : sy;
          m.scale(sx, sy, pivot);
          d.actionPivot = pivot;
          d.values = { X: sx * 100, Y: sy * 100 };
        }
        Transforms.apply(e, d.ids, d.type, d.values, d.actionPivot || d.pivot, e.transformMode);
      }
      if (d.type === 'anchor') {
        const b = G.bounds(e.doc, d.ids),
          at = delta.add(d.start);
        if (b && at.getDistance(b.center) < e.prefs.snapDistance / P.view.zoom) {
          delta.x = b.center.x - d.start.x;
          delta.y = b.center.y - d.start.y;
        }
        Transforms.anchor(e, d.ids, delta.x, delta.y);
        d.values = { X: delta.x, Y: delta.y };
      }
      if (d.type === 'gradient') {
        const v = p.subtract(d.start);
        if (ev.shiftKey) v.angle = Math.round(v.angle / 45) * 45;
        GradientCanvas.place(e, d.start, d.start.add(v));
      }
      if (d.type === 'offset') {
        d.values = { Distance: delta.x, Join: e.offsetJoin || 'round', 'Miter limit': e.offsetMiter || 4 };
        PathActions.offset(e, d.ids, d.values);
      }
      if (d.type === 'width')
        d.ids.forEach((id) => {
          const n = D.find(e.doc, id);
          n.props['ADBE Vector Stroke Width'] = Math.max(
            0,
            (n.props['ADBE Vector Stroke Width'] || 0) + delta.y * 2,
          );
        });
      e.renderCanvas();
    }
    async up(ev) {
      const d = this.drag;
      if (!d) return;
      this.drag = null;
      this.e.snapLines = null;
      if (d.type === 'convert' && !d.moved) {
        this.e.doc = d.base;
        this.vertexAction('convert', D.find(this.e.doc, d.ref.id), d.ref.index, d.before);
        return;
      }
      if (d.type === 'move' && !d.moved && !d.duplicate && d.clickTarget) {
        this.e.select([d.clickTarget]);
        return;
      }
      const e = this.e,
        p = this.point(ev);
      if (d.type === 'guide') {
        const v = this.viewPoint(ev);
        if ((d.guide.orientation === 1 ? v.x : v.y) < 18)
          e.doc.guides = e.doc.guides.filter((g) => g !== d.guide);
      }
      if (d.type === 'zoom') {
        if (!d.moved) e.zoom(d.alt ? 0.8 : 1.25, this.viewPoint(ev));
        return;
      }
      if (d.type === 'pan') return;
      if (d.type === 'marquee' || d.type === 'lasso') {
        const area =
          d.type === 'lasso'
            ? new P.Path({ segments: d.points, closed: true, insert: false })
            : new P.Path.Rectangle({ rectangle: new P.Rectangle(d.start, p), insert: false });
        const ids = [],
          points = [];
        D.walk(e.doc.layers, (n) => {
          if (!D.isShape(n) || n.locked || D.ancestors(e.doc, n.id).some((x) => x.locked || !x.visible))
            return;
          const shape = G.pathOf(n);
          Projection.controls(shape, G.world(e.doc, n));
          if (d.pointMode || d.type === 'lasso') {
            shape.segments?.forEach((s, i) => {
              if (d.pointMode && d.alt) {
                ['handleIn', 'handleOut'].forEach((handle) => {
                  if (s[handle].length && area.contains(s.point.add(s[handle]))) {
                    points.push({ id: n.id, index: i, handle });
                    if (!ids.includes(n.id)) ids.push(n.id);
                  }
                });
                return;
              }
              if (area.contains(s.point)) {
                points.push({ id: n.id, index: i });
                if (!ids.includes(n.id)) ids.push(n.id);
              }
            });
          } else if (area.bounds.intersects(shape.bounds)) {
            const target = e.target(n);
            if (!ids.includes(target.id)) ids.push(target.id);
          }
        });
        e.select(d.shift ? [...e.selection, ...ids] : ids);
        e.pointSelection =
          d.type === 'lasso' && d.alt
            ? (d.previous || []).filter((p) => !points.some((q) => p.id === q.id && p.index === q.index))
            : d.shift
              ? [
                  ...(d.previous || []),
                  ...points.filter(
                    (q) =>
                      !(d.previous || []).some(
                        (p) => p.id === q.id && p.index === q.index && p.handle === q.handle,
                      ),
                  ),
                ]
              : points;
        e.render();
        return;
      }
      if (d.type === 'text') {
        const n = d.existing ? D.find(e.doc, d.existing) : TextEditor.create(e, d.start, p);
        TextEditor.begin(e, n, d.before);
        return;
      }
      if (d.type === 'pencil') {
        if (d.points.length < 2) return;
        const path = new P.Path({
          segments: d.points,
          insert: false,
          closed: d.points[0].getDistance(p) < 10 / P.view.zoom,
        });
        path.simplify(e.fidelity || 2);
        let n = D.node('path', 'Pencil path');
        G.setPath(n, path);
        if (e.recognize && !ev.altKey) {
          const b = path.bounds,
            tolerance = Math.max(4, Math.min(b.width, b.height) * 0.06);
          const samples = d.points;
          const edgeScore =
            samples.reduce(
              (sum, p) =>
                sum +
                Math.min(
                  Math.abs(p.x - b.left),
                  Math.abs(p.x - b.right),
                  Math.abs(p.y - b.top),
                  Math.abs(p.y - b.bottom),
                ),
              0,
            ) / samples.length;
          const circleScore =
            samples.reduce(
              (sum, p) =>
                sum +
                Math.abs(
                  Math.hypot(
                    (p.x - b.center.x) / (b.width / 2 || 1),
                    (p.y - b.center.y) / (b.height / 2 || 1),
                  ) - 1,
                ),
              0,
            ) / samples.length;
          if (path.closed && edgeScore < tolerance) n = D.shape('rect', b.x, b.y, b.width, b.height);
          else if (path.closed && circleScore < 0.12) n = D.shape('ellipse', b.x, b.y, b.width, b.height);
          else if (path.closed) n = PathActions.recognize(samples, true) || n;
          else if (!path.closed && path.length < samples[0].getDistance(samples[samples.length - 1]) * 1.04)
            n = D.shape(
              'path',
              samples[0].x,
              samples[0].y,
              samples[samples.length - 1].x - samples[0].x,
              samples[samples.length - 1].y - samples[0].y,
            );
        }
        e.insertShape(n);
        this.localize(n);
        e.selection = [n.id];
      }
      if (d.type === 'shape' && !d.id) {
        const values = await e.UI.fields('Create ' + d.tool, { Width: 200, Height: 200 });
        if (!values) return;
        const n = D.shape(
          d.tool === 'ellipse'
            ? 'ellipse'
            : d.tool === 'star' || d.tool === 'polygon'
              ? 'star'
              : d.tool === 'line'
                ? 'path'
                : 'rect',
          d.start.x,
          d.start.y,
          +values.Width,
          +values.Height,
          { roundness: d.tool === 'roundrect' ? 20 : 0, polygon: d.tool === 'polygon' },
        );
        e.insertShape(n);
        this.localize(n);
        e.selection = [n.id];
      }
      if (
        ['rotate', 'scale', 'shear', 'reflect'].includes(d.type) &&
        p.getDistance(d.start) < 2 / P.view.zoom
      ) {
        e.pivot = [p.x, p.y];
        e.renderCanvas();
        return;
      }
      GradientCanvas.finish(e, d, p);
      if (d.type === 'gradient' && p.getDistance(d.start) < 2 / P.view.zoom) {
        const b = G.bounds(e.doc, e.selection);
        if (b) GradientCanvas.place(e, b.leftCenter, b.rightCenter);
      }
      const labels = {
        move: d.duplicate ? 'Duplicate and move' : 'Move',
        scale: 'Scale',
        rotate: 'Rotate',
        shear: 'Shear',
        reflect: 'Reflect',
        offset: 'Offset Path',
        vertex: 'Move points',
        slide: 'Slide point',
        handle: 'Move tangent',
        'pen-handle': 'Pen vertex',
        gradient: 'Gradient',
        width: 'Stroke width',
        anchor: 'Move anchor',
        shape: 'Draw shape',
        pencil: 'Pencil',
        guide: 'Move guide',
      };
      const label = d.label || labels[d.type] || 'Edit';
      let action = d.values
        ? {
            label,
            values: d.values,
            initialValues: D.clone(d.values),
            base: D.clone(d.before.doc),
            ids: (d.originalIds || d.ids || e.selection).slice(),
            pivot: d.actionPivot
              ? [d.actionPivot.x, d.actionPivot.y]
              : d.pivot
                ? [d.pivot.x, d.pivot.y]
                : null,
            mode: e.transformMode,
            points: d.selected,
            widget: d.type === 'widget' ? d.ref : null,
          }
        : null;
      e.history.commit(d.before, label, action);
      e.changed();
    }
    vertexAction(tool, n, index, before) {
      const e = this.e;
      e.edit(
        tool === 'scissors' ? 'Scissors' : tool === 'convert' ? 'Convert vertex' : 'Remove point',
        () => {
          const path = G.pathOf(n);
          if (tool === 'deletepoint') {
            path.removeSegment(index);
            if (path.segments.length < 2) {
              D.remove(e.doc, n.id);
              return;
            }
          }
          if (tool === 'convert') {
            const s = path.segments[index];
            if (s.handleIn.length || s.handleOut.length) {
              s.handleIn = [0, 0];
              s.handleOut = [0, 0];
            } else {
              const prev = path.segments[(index + path.segments.length - 1) % path.segments.length].point,
                next = path.segments[(index + 1) % path.segments.length].point,
                v = next.subtract(prev).divide(6);
              s.handleOut = v;
              s.handleIn = v.negate();
            }
          }
          if (tool === 'scissors') {
            const tail = path.splitAt(path.curves[Math.min(index, path.curves.length - 1)].getLocationAt(0));
            if (tail) {
              const copy = D.fresh(n);
              G.setPath(copy, tail);
              D.parent(e.doc, n.id).children.push(copy);
            }
            path.closed = false;
          }
          G.setPath(n, path);
          e.selection = [n.id];
        },
      );
    }
    pen(p, ev) {
      const e = this.e;
      const before = e.history.begin();
      let n = D.find(e.doc, e.penId);
      if (!n) {
        n = D.node('path', 'Path');
        n.props['ADBE Vector Shape'] = {
          vertices: [[p.x, p.y]],
          inTangents: [[0, 0]],
          outTangents: [[0, 0]],
          closed: false,
        };
        e.insertShape(n);
        this.localize(n);
        e.penId = n.id;
      } else {
        const local = G.world(e.doc, n).inverseTransform(this.snap(p, ev)),
          v = n.props['ADBE Vector Shape'];
        v.vertices.push([local.x, local.y]);
        v.inTangents.push([0, 0]);
        v.outTangents.push([0, 0]);
      }
      e.selection = [n.id];
      this.drag = { type: 'pen-handle', id: n.id, start: p, before, base: D.clone(e.doc) };
      e.render();
    }
    double(ev) {
      const widget = this.e.overlay.hitTest(this.point(ev), {
        fill: true,
        stroke: true,
        tolerance: 5 / P.view.zoom,
      })?.item.data.widget;
      if (widget) {
        Widgets.reset(this.e, widget);
        return;
      }
      const e = this.e,
        hit = e.hit(this.point(ev));
      if (e.tool === 'text') {
        this.down(ev);
        this.up(ev);
        return;
      }
      if (e.tool === 'pen') {
        e.finishPen();
        return;
      }
      if (e.tool !== 'select') return;
      if (!hit) {
        e.isolation = null;
        e.select([]);
      } else {
        const target = e.target(hit.node);
        if (target.type === 'layer' || target.type === 'group') {
          e.isolation = target.id;
          e.selectionMode = 'group';
          e.select([]);
        } else {
          e.tool = 'direct';
          e.select([hit.node.id]);
        }
      }
    }
    wheel(ev) {
      ev.preventDefault();
      const e = this.e;
      if (e.prefs.wheel === 'zoom' || ev.ctrlKey || ev.altKey)
        e.zoom(Math.exp(-ev.deltaY * 0.0015), this.viewPoint(ev));
      else {
        P.view.center = P.view.center.add(
          new P.Point(ev.shiftKey ? ev.deltaY : ev.deltaX, ev.shiftKey ? 0 : ev.deltaY).divide(P.view.zoom),
        );
        e.renderCanvas();
      }
    }
    key(ev) {
      const e = this.e;
      if (e.pullState) {
        if (ev.key === 'Escape') e.pullState.cancel = true;
        ev.preventDefault();
        return;
      }
      if (e.modalOpen || ev.target.closest('input,textarea,select,[contenteditable]')) return;
      if (ev.metaKey) return;
      if (ev.code === 'Space') {
        ev.preventDefault();
        this.space = true;
        return;
      }
      if (ev.key === 'Escape') {
        ev.preventDefault();
        if (e.eyedropperKind) {
          e.eyedropperKind = null;
          e.setTool(e.previousTool || 'select');
          return;
        }
        if (this.typed) {
          this.cancelTyped();
          return;
        }
        if (this.drag) {
          this.cancel();
          return;
        }
        if (e.penId) {
          e.finishPen();
          return;
        }
        if (document.getElementById('menus').children.length) {
          e.UI.closeMenu();
          return;
        }
        if (e.selectedGuide) {
          e.selectedGuide = null;
          e.renderCanvas();
          return;
        }
        if (e.selection.length) e.select([]);
        else {
          e.isolation = e.isolation ? D.parent(e.doc, e.isolation)?.id || null : null;
          e.render();
        }
        return;
      }
      if (this.typed) {
        if (ev.key === 'Enter') {
          this.finishTyped();
          ev.preventDefault();
          return;
        }
        if (ev.key.toLowerCase() === 'x' || ev.key.toLowerCase() === 'y') {
          this.typed.axis = ev.key.toLowerCase();
          ev.preventDefault();
          return;
        }
        if (/[0-9.\-]/.test(ev.key) && ev.key.length === 1) {
          this.typed.number += ev.key;
          this.previewTyped(this.lastPointer);
          ev.preventDefault();
          return;
        }
        if (ev.key === 'Backspace') {
          this.typed.number = this.typed.number.slice(0, -1);
          this.previewTyped(this.lastPointer);
          ev.preventDefault();
          return;
        }
      }
      if ((ev.key === 'Delete' || ev.key === 'Backspace') && !ev.ctrlKey) {
        ev.preventDefault();
        if (e.penId) {
          e.command('undo');
          if (!D.find(e.doc, e.penId)) e.penId = null;
        } else e.command('delete');
        return;
      }
      if (ev.key === 'Enter' && e.penId) {
        e.finishPen();
        return;
      }
      if (ev.key.startsWith('Arrow')) {
        ev.preventDefault();
        const inc = e.prefs.increment * (ev.shiftKey ? 10 : 1);
        if (e.pointSelection.length) {
          e.edit('Nudge points', () =>
            Points.move(
              e,
              new P.Point(
                ev.key === 'ArrowRight' ? inc : ev.key === 'ArrowLeft' ? -inc : 0,
                ev.key === 'ArrowDown' ? inc : ev.key === 'ArrowUp' ? -inc : 0,
              ),
            ),
          );
          return;
        }
        e.edit('Nudge', () =>
          G.move(
            e.doc,
            e.selection,
            ev.key === 'ArrowRight' ? inc : ev.key === 'ArrowLeft' ? -inc : 0,
            ev.key === 'ArrowDown' ? inc : ev.key === 'ArrowUp' ? -inc : 0,
          ),
        );
        return;
      }
      if (ev.ctrlKey && ev.key.toLowerCase() === 'a' && e.tool === 'direct' && !ev.shiftKey) {
        ev.preventDefault();
        e.pointSelection = [];
        D.selectedShapes(e.doc, e.selection).forEach((n) =>
          G.pathOf(n)?.segments?.forEach((s, index) => e.pointSelection.push({ id: n.id, index })),
        );
        e.render();
        return;
      }
      const key = keyName(ev),
        command = Object.keys(defaults).find((c) => Shortcuts.key(e, c) === key);
      if (!command) return;
      ev.preventDefault();
      if (command === 'Cycle selection target') {
        e.selectionMode = ['layer', 'group', 'path'][
          (['layer', 'group', 'path'].indexOf(e.selectionMode) + 1) % 3
        ];
        e.notice(e.selectionMode[0].toUpperCase() + e.selectionMode.slice(1) + ' Selection');
        return;
      }
      if (command.startsWith('Replicate ')) {
        e.command(
          'replicate',
          command.slice(10).replace(/^./, (c) => c.toUpperCase()),
        );
        return;
      }
      if (command === 'Reveal selection') {
        e.selection.forEach((id) => D.ancestors(e.doc, id).forEach((n) => e.expanded.add(n.id)));
        e.UI.renderLayers();
        document.querySelector('.row.selected')?.scrollIntoView({ block: 'nearest' });
        return;
      }
      if (toolCommands[command]) {
        const tool = toolCommands[command];
        if (e.tool === tool && ['select', 'direct', 'scale', 'rotate'].includes(tool) && e.selection.length) {
          this.startTyped(tool);
          return;
        }
        e.setTool(tool);
      } else e.command(editCommands[command]);
    }
    startTyped(tool) {
      const e = this.e;
      this.typed = {
        tool,
        start: this.lastPointer || new P.Point(0, 0),
        base: e.history.begin(),
        ids: e.selection.slice(),
        points: D.clone(e.pointSelection),
        axis: null,
        number: '',
      };
      e.notice(
        tool === 'rotate'
          ? 'Rotate: type an angle, Enter to apply.'
          : tool === 'scale'
            ? 'Scale: type a percentage, X/Y to constrain, Enter to apply.'
            : 'Move: X or Y, then type a distance. Enter applies.',
      );
    }
    previewTyped(p) {
      const t = this.typed,
        e = this.e;
      e.doc = D.clone(t.base.doc);
      const b = G.bounds(e.doc, t.ids);
      if (!b) return;
      const amount = t.number ? parseFloat(t.number) : null,
        pivot = e.pivot ? new P.Point(e.pivot) : b.center;
      if (t.tool === 'rotate') {
        const a = amount == null ? p.subtract(pivot).angle - t.start.subtract(pivot).angle : amount;
        if (Number.isFinite(a)) {
          t.values = { Angle: a };
          Transforms.apply(e, t.ids, 'rotate', t.values, pivot);
        }
      } else if (t.tool === 'scale') {
        const s = amount == null ? 1 + (p.x - t.start.x) / 100 : amount / 100;
        if (Number.isFinite(s)) {
          t.values = { X: t.axis === 'y' ? 100 : s * 100, Y: t.axis === 'x' ? 100 : s * 100 };
          Transforms.apply(e, t.ids, 'scale', t.values, pivot);
        }
      } else {
        const d = p.subtract(t.start);
        if (amount != null && t.axis) d[t.axis] = amount;
        if (t.axis) d[t.axis === 'x' ? 'y' : 'x'] = 0;
        if (Number.isFinite(d.x) && Number.isFinite(d.y)) {
          if (t.points.length) Points.move(e, d, t.points);
          else G.move(e.doc, t.ids, d.x, d.y);
          t.values = { X: d.x, Y: d.y };
        }
      }
      t.pivot = [pivot.x, pivot.y];
      e.renderCanvas();
    }
    finishTyped() {
      const t = this.typed;
      if (!t) return;
      const label = t.tool === 'rotate' ? 'Rotate' : t.tool === 'scale' ? 'Scale' : 'Move',
        a = {
          label,
          base: D.clone(t.base.doc),
          ids: t.ids,
          values: t.values || {},
          initialValues: t.values || {},
          mode: this.e.transformMode,
          pivot: t.pivot,
          points: t.points,
        };
      this.e.history.commit(t.base, label, a);
      this.typed = null;
      this.e.changed();
    }
    cancelTyped() {
      this.e.doc = this.typed.base.doc;
      this.typed = null;
      this.e.render();
    }
    cancel() {
      if (this.drag && this.drag.before) this.e.doc = this.drag.before.doc;
      this.drag = null;
      this.e.render();
    }
  }
  Input.defaults = defaults;
  Input.toolCommands = toolCommands;
  Input.keyName = keyName;
  g.Input = Input;
})(window);
