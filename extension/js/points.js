(function (g) {
  'use strict';
  const D = DM,
    G = Geometry,
    P = paper;
  const key = (n) => (n.type === 'mask' ? 'ADBE Mask Shape' : 'ADBE Vector Shape');
  function mode(n, i) {
    if (n.tangentModes?.[i]) return n.tangentModes[i];
    const p = G.pathOf(n),
      s = p.segments[i];
    if (!s) return 'Symmetric';
    if (
      Math.abs(Math.abs(s.handleIn.getDirectedAngle(s.handleOut)) - 180) > 0.1 &&
      s.handleIn.length &&
      s.handleOut.length
    )
      return 'Free';
    return Math.abs(s.handleIn.length - s.handleOut.length) < 0.01 ? 'Symmetric' : 'Angle';
  }
  function save(e, n, p, preserveAuto = false) {
    if (n.meta?.[key(n)]?.expression) throw Error('Path is expression-driven.');
    const expanded = !['path', 'mask'].includes(n.type);
    if (n.rotoBezier || n.mask?.rotoBezier) {
      if (preserveAuto) p.smooth({ type: 'catmull-rom', factor: 0.5 });
      else {
        n.rotoBezier = false;
        if (n.mask) n.mask.rotoBezier = false;
        e.notice('Path converted to Bezier');
      }
    }
    G.setPath(n, p);
    delete n.cornerBase;
    delete n.cornerRadii;
    if (expanded) e.notice('Shape Expanded');
  }
  function begin(e, ref, isHandle, p, before, ev) {
    const item = { id: ref.id, index: ref.index, ...(isHandle ? { handle: ref.key } : {}) },
      same = (x) => x.id === item.id && x.index === item.index && x.handle === item.handle;
    if (ev.shiftKey) {
      if (e.pointSelection.some(same)) {
        e.pointSelection = e.pointSelection.filter((x) => !same(x));
        e.render();
        return null;
      }
      e.pointSelection.push(item);
    } else if (!e.pointSelection.some(same)) e.pointSelection = [item];
    e.selection = [...new Set(e.pointSelection.map((x) => x.id))];
    return {
      type: isHandle ? 'handle' : ev.ctrlKey ? 'slide' : 'vertex',
      ref,
      start: p,
      before,
      base: D.clone(e.doc),
      selected: D.clone(e.pointSelection),
      ids: e.selection.slice(),
    };
  }
  function drag(e, d, p, ev) {
    const ref = d.ref,
      n = D.find(e.doc, ref.id),
      world = G.world(e.doc, n),
      local = world.inverseTransform(p),
      start = world.inverseTransform(d.start),
      source = G.pathOf(n),
      segment = source.segments[ref.index];
    if (d.type === 'slide') {
      const a = segment.point.add(segment.handleIn),
        b = segment.point.add(segment.handleOut),
        line = b.subtract(a),
        at = line.dot(local.subtract(a)) / Math.max(1e-9, line.dot(line)),
        next = a.add(line.multiply(Math.max(0, Math.min(1, at))));
      segment.point = next;
      segment.handleIn = a.subtract(next);
      segment.handleOut = b.subtract(next);
      save(e, n, source);
      d.values = { Amount: at * 100 };
      return;
    }
    if (d.type === 'vertex') {
      const delta = p.subtract(d.start);
      move(e, delta, d.selected);
      return;
    }
    const original = segment[ref.key],
      v = local.subtract(segment.point);
    if (ev.shiftKey) v.angle = Math.round(v.angle / 45) * 45;
    if (ev.ctrlKey) v.angle = original.angle;
    const rotation = v.angle - original.angle,
      ratio = original.length ? v.length / original.length : 1;
    const grouped = new Map();
    d.selected
      .filter((x) => x.handle)
      .forEach((s) => {
        if (!grouped.has(s.id)) grouped.set(s.id, []);
        grouped.get(s.id).push(s);
      });
    grouped.forEach((selected, id) => {
      const node = D.find(e.doc, id),
        path = G.pathOf(node);
      selected.forEach((s) => {
        const seg = path.segments[s.index],
          handle = s.handle,
          other = handle === 'handleIn' ? 'handleOut' : 'handleIn',
          next =
            s.id === ref.id && s.index === ref.index && handle === ref.key
              ? v
              : seg[handle].rotate(rotation).multiply(ratio),
          kind = ev.altKey ? 'Free' : mode(node, s.index);
        if (!node.tangentModes) node.tangentModes = {};
        node.tangentModes[s.index] = kind;
        const length = seg[other].length;
        seg[handle] = next;
        if (kind === 'Symmetric') seg[other] = next.negate();
        else if (kind === 'Angle') seg[other] = next.negate().normalize(length);
      });
      save(e, node, path);
    });
  }
  function move(e, delta, selection = e.pointSelection) {
    const grouped = new Map();
    selection.forEach((s) => {
      if (!grouped.has(s.id)) grouped.set(s.id, []);
      grouped.get(s.id).push(s);
    });
    grouped.forEach((items, id) => {
      const n = D.find(e.doc, id),
        m = G.world(e.doc, n),
        v = m.inverseTransform(delta).subtract(m.inverseTransform([0, 0])),
        path = G.pathOf(n);
      items.forEach((s) => {
        const seg = path.segments[s.index];
        if (!seg) return;
        if (s.handle) seg[s.handle] = seg[s.handle].add(v);
        else seg.point = seg.point.add(v);
      });
      save(
        e,
        n,
        path,
        items.every((s) => !s.handle),
      );
    });
  }
  function remove(e, keepClosed) {
    const grouped = new Map();
    e.pointSelection.forEach((s) => {
      if (!grouped.has(s.id)) grouped.set(s.id, []);
      grouped.get(s.id).push(s);
    });
    grouped.forEach((items, id) => {
      const n = D.find(e.doc, id),
        p = G.pathOf(n),
        vertices = new Set(items.filter((s) => !s.handle).map((s) => s.index));
      items.filter((s) => s.handle).forEach((s) => (p.segments[s.index][s.handle] = [0, 0]));
      if (!vertices.size) {
        save(e, n, p);
        return;
      }
      if (keepClosed) {
        [...vertices].sort((a, b) => b - a).forEach((i) => p.removeSegment(i));
        if (p.segments.length < 2) D.remove(e.doc, id);
        else save(e, n, p);
        return;
      }
      const runs = [];
      let run = [],
        start = p.closed ? ([...vertices][0] + 1) % p.segments.length : 0;
      for (let i = 0; i < p.segments.length; i++) {
        const index = (start + i) % p.segments.length;
        if (vertices.has(index)) {
          if (run.length > 1) runs.push(run);
          run = [];
        } else run.push(p.segments[index].clone());
      }
      if (run.length > 1) runs.push(run);
      if (!runs.length) {
        D.remove(e.doc, id);
        return;
      }
      runs.forEach((segments, i) => {
        const target = i ? D.fresh(n) : n;
        if (i) D.parent(e.doc, id).children.push(target);
        save(e, target, new P.Path({ segments, closed: false, insert: false }));
      });
    });
    e.pointSelection = [];
  }
  function paired(node, seg, index, key, value) {
    const other = key === 'handleIn' ? 'handleOut' : 'handleIn',
      kind = mode(node, index),
      length = seg[other].length;
    seg[key] = value;
    if (kind === 'Symmetric') seg[other] = value.negate();
    else if (kind === 'Angle') seg[other] = value.negate().normalize(length);
  }
  function transform(e, selected, m) {
    const nodes = new Map();
    selected.forEach((s) => {
      if (!nodes.has(s.id)) nodes.set(s.id, []);
      nodes.get(s.id).push(s);
    });
    nodes.forEach((items, id) => {
      const n = D.find(e.doc, id),
        world = G.world(e.doc, n),
        path = G.pathOf(n);
      items.forEach((s) => {
        const seg = path.segments[s.index];
        if (s.handle) {
          const end = world.inverseTransform(m.transform(world.transform(seg.point.add(seg[s.handle]))));
          seg[s.handle] = end.subtract(seg.point);
        } else {
          const p = world.inverseTransform(m.transform(world.transform(seg.point))),
            a = world.inverseTransform(m.transform(world.transform(seg.point.add(seg.handleIn)))),
            b = world.inverseTransform(m.transform(world.transform(seg.point.add(seg.handleOut))));
          seg.point = p;
          seg.handleIn = a.subtract(p);
          seg.handleOut = b.subtract(p);
        }
      });
      save(
        e,
        n,
        path,
        items.every((s) => !s.handle),
      );
    });
  }
  function selectionFields(ui) {
    const e = ui.e,
      selected = e.pointSelection.filter((s) => !s.handle);
    if (!selected.length) return '';
    const points = selected.map((s) => {
      const n = D.find(e.doc, s.id);
      return G.world(e.doc, n).transform(G.pathOf(n).segments[s.index].point);
    });
    const xs = points.map((p) => p.x),
      ys = points.map((p) => p.y),
      b = new P.Rectangle(
        Math.min(...xs),
        Math.min(...ys),
        Math.max(...xs) - Math.min(...xs),
        Math.max(...ys) - Math.min(...ys),
      );
    let h = ui.field('Position', [b.left, b.top], (v) =>
      e.edit('Point selection position', () => move(e, new P.Point(v[0] - b.left, v[1] - b.top), selected)),
    );
    ['Width', 'Height'].forEach((name, i) => {
      h += ui.field(name, i ? b.height : b.width, (v) => {
        const old = i ? b.height : b.width,
          factor = old ? v / old : 1;
        e.edit('Point selection size', () =>
          transform(e, selected, new P.Matrix().scale(i ? 1 : factor, i ? factor : 1, b.topLeft)),
        );
      });
    });
    h += ui.field('Move by', [0, 0], (v) => e.edit('Move points', () => move(e, new P.Point(v), selected)));
    return ui.section('Selection', h);
  }
  function fields(ui) {
    const e = ui.e,
      selected = e.pointSelection,
      first = selected[0],
      n = first && D.find(e.doc, first.id);
    if (!n) return '';
    const path = G.pathOf(n),
      seg = path.segments[first.index];
    if (!seg) return '';
    const change = (label, fn) =>
      e.edit(label, () => {
        const grouped = new Map();
        selected.forEach((s) => {
          if (!grouped.has(s.id)) grouped.set(s.id, []);
          grouped.get(s.id).push(s);
        });
        grouped.forEach((list, id) => {
          const node = D.find(e.doc, id),
            p = G.pathOf(node);
          list.forEach((s) => fn(p.segments[s.index], s, node));
          save(e, node, p);
        });
      });
    let html = '';
    if (first.handle) {
      const handle = seg[first.handle];
      html += ui.field('Length', handle.length, (v) =>
        change('Tangent length', (s, r, node) =>
          paired(node, s, r.index, r.handle, s[r.handle].normalize(v)),
        ),
      );
      html += ui.field('Angle', handle.angle, (v) =>
        change('Tangent angle', (s, r, node) => {
          const next = s[r.handle].clone();
          next.angle = v;
          paired(node, s, r.index, r.handle, next);
        }),
      );
      html += ui.field(
        'Scale',
        100,
        (v) =>
          change('Scale tangents', (s, r, node) =>
            paired(node, s, r.index, r.handle, s[r.handle].multiply(v / 100)),
          ),
        { unit: '%' },
      );
      return ui.section('Tangents', html);
    }
    html += ui.field('Point', [seg.point.x, seg.point.y], (v) => {
      const old = seg.point,
        delta = new P.Point(v).subtract(old),
        world = G.world(e.doc, n),
        comp = world.transform(delta).subtract(world.transform([0, 0]));
      e.edit('Move points', () => move(e, comp));
    });
    html += ui.field(
      'Tangent mode',
      mode(n, first.index),
      (v) =>
        change('Tangent mode', (s, r, node) => {
          node.tangentModes = node.tangentModes || {};
          node.tangentModes[r.index] = v;
          if (v === 'Symmetric') s.handleIn = s.handleOut.negate();
          else if (v === 'Angle') s.handleIn = s.handleOut.negate().normalize(s.handleIn.length);
        }),
      { choices: ['Symmetric', 'Angle', 'Free'] },
    );
    ['handleIn', 'handleOut'].forEach((k) => {
      const label = k === 'handleIn' ? 'In' : 'Out';
      html += ui.field(label + ' Length', seg[k].length, (v) =>
        change('Tangent length', (s, r, node) => paired(node, s, r.index, k, s[k].normalize(v))),
      );
      html += ui.field(label + ' Angle', seg[k].angle, (v) =>
        change('Tangent angle', (s, r, node) => {
          const next = s[k].clone();
          next.angle = v;
          paired(node, s, r.index, k, next);
        }),
      );
    });
    html += ui.field(
      'Slide',
      50,
      (v) =>
        change('Slide point', (s) => {
          const a = s.point.add(s.handleIn),
            b = s.point.add(s.handleOut),
            next = a.add(b.subtract(a).multiply(v / 100));
          s.point = next;
          s.handleIn = a.subtract(next);
          s.handleOut = b.subtract(next);
        }),
      { unit: '%' },
    );
    if (n.rotoBezier)
      html += '<div class="sub-label">Tension ' + (n.tensions?.[first.index] || 100) + '%</div>';
    return ui.section('Point', html) + selectionFields(ui);
  }
  g.Points = { begin, drag, move, remove, fields, mode, save, transform, paired };
})(window);
