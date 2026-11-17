(function (g) {
  'use strict';
  const D = DM,
    G = Geometry,
    P = paper;
  const corners = (b) => [
    b.topLeft,
    b.topCenter,
    b.topRight,
    b.rightCenter,
    b.bottomRight,
    b.bottomCenter,
    b.bottomLeft,
    b.leftCenter,
  ];
  function frame(doc, id, objectAxes) {
    const b = G.bounds(doc, [id]),
      n = D.find(doc, id);
    if (!b) return null;
    const angle = objectAxes ? G.world(doc, n).decompose().rotation : 0,
      center = b.center;
    let bounds = b;
    if (angle) {
      const inv = new P.Matrix().rotate(-angle, center);
      let out = null;
      D.selectedShapes(doc, [id]).forEach((n) => {
        const p = G.pathOf(n);
        p.transform(inv.clone().append(G.world(doc, n)));
        out = out ? out.unite(p.bounds) : p.bounds.clone();
      });
      bounds = out || b;
    }
    return { bounds, angle, center };
  }
  function affine(kind, values, pivot, axis = 0) {
    const m = new P.Matrix();
    m.translate(pivot);
    m.rotate(axis);
    if (kind === 'rotate') m.rotate(+values.Angle || 0);
    if (kind === 'scale') m.scale(+values.X / 100, +values.Y / 100);
    if (kind === 'shear') {
      const a = values.Axis || 0;
      m.rotate(a);
      m.shear(Math.tan(((+values.Angle || 0) * Math.PI) / 180), 0);
      m.rotate(-a);
    }
    if (kind === 'reflect') {
      m.rotate(+values.Angle || 0);
      m.scale(1, -1);
      m.rotate(-(+values.Angle || 0));
    }
    m.rotate(-axis);
    m.translate(pivot.negate());
    return m;
  }
  function apply(e, ids, kind, values, pivot, mode) {
    mode = mode || e.transformMode;
    const all = G.bounds(e.doc, ids);
    if (!all) return;
    const center = pivot ? new P.Point(pivot) : all.center;
    if (mode === 'Combined') {
      G.transformSelection(e.doc, ids, affine(kind, values, center), e.prefs);
      return;
    }
    D.roots(e.doc, ids).forEach((n) => {
      const f = frame(e.doc, n.id, mode === 'Individual: Object');
      if (!f) return;
      const rx = all.width ? (center.x - all.left) / all.width : 0.5,
        ry = all.height ? (center.y - all.top) / all.height : 0.5,
        local = new P.Point(f.bounds.left + f.bounds.width * rx, f.bounds.top + f.bounds.height * ry),
        p = new P.Matrix().rotate(f.angle, f.center).transform(local);
      G.transformSelection(
        e.doc,
        [n.id],
        affine(kind, values, p, mode === 'Individual: Object' ? f.angle : 0),
        e.prefs,
      );
    });
  }
  function drawBoxes(e) {
    const z = P.view.zoom / (e.prefs.handleSize / 100),
      color = e.prefs.selectionColor,
      combined = G.bounds(e.doc, e.selection);
    if (!combined || !e.showBox || ['direct', 'pen', 'lasso', 'width', 'gradient'].includes(e.tool)) return;
    const frames =
      e.transformMode === 'Combined'
        ? [{ bounds: combined, angle: 0, center: combined.center }]
        : D.roots(e.doc, e.selection)
            .map((n) => frame(e.doc, n.id, e.transformMode === 'Individual: Object'))
            .filter(Boolean);
    frames.forEach((f) => {
      const m = new P.Matrix().rotate(f.angle, f.center),
        pts = corners(f.bounds).map((p) => m.transform(p)),
        rect = new P.Path({ segments: [pts[0], pts[2], pts[4], pts[6]], closed: true });
      rect.strokeColor = color;
      rect.strokeWidth = 1 / z;
      rect.fillColor = null;
      pts.forEach((point, i) => {
        const h = new P.Path.Rectangle(new P.Rectangle(point.subtract(4 / z), new P.Size(8 / z, 8 / z)));
        h.strokeColor = color;
        h.fillColor = '#fff';
        h.strokeWidth = 1 / z;
        h.data = {
          grip: i,
          box: {
            bounds: [f.bounds.x, f.bounds.y, f.bounds.width, f.bounds.height],
            angle: f.angle,
            center: [f.center.x, f.center.y],
          },
        };
        if (i % 2 === 0) {
          const outward = point.subtract(f.center).normalize(12 / z),
            ring = new P.Path.Circle(point.add(outward), 8 / z);
          ring.fillColor = new P.Color(0, 0, 0, 0.001);
          ring.data = { rotate: true };
        }
      });
    });
    const pivot = e.pivot ? new P.Point(e.pivot) : combined.center,
      circle = new P.Path.Circle(pivot, 3 / z);
    circle.fillColor = '#fff';
    circle.strokeColor = color;
    circle.strokeWidth = 1 / z;
  }
  function move(e, ids, dx, dy, mode) {
    if (mode === 'Individual: Object') {
      D.roots(e.doc, ids).forEach((n) => {
        const m = G.world(e.doc, n),
          d = new P.Point(dx, dy).rotate(m.decompose().rotation);
        G.move(e.doc, [n.id], d.x, d.y);
      });
    } else G.move(e.doc, ids, dx, dy);
  }
  function anchor(e, ids, dx, dy) {
    D.roots(e.doc, ids).forEach((n) => {
      if (!['layer', 'group', 'text'].includes(n.type)) return;
      if (n.meta['transform.anchor']?.expression || n.meta['transform.position']?.expression)
        throw Error('Anchor or position is expression-driven.');
      const m = G.world(e.doc, n),
        at = m.transform(n.transform.anchor),
        diff = m.inverseTransform(at.add([dx, dy])).subtract(new P.Point(n.transform.anchor));
      if (n.projection) {
        const r = Projection.transform({ ...n.transform, position: [0, 0, 0], anchor: [0, 0, 0] });
        n.transform.position[0] += r[0] * diff.x + r[1] * diff.y;
        n.transform.position[1] += r[4] * diff.x + r[5] * diff.y;
        n.transform.position[2] = (n.transform.position[2] || 0) + r[8] * diff.x + r[9] * diff.y;
      } else {
        const linear = G.matrix(n),
          v = linear.transform(diff).subtract(linear.transform([0, 0]));
        n.transform.position[0] += v.x;
        n.transform.position[1] += v.y;
      }
      n.transform.anchor[0] += diff.x;
      n.transform.anchor[1] += diff.y;
      delete n.transform.matrix;
    });
  }
  function drawAnchor(e) {
    if (e.tool !== 'anchor') return;
    D.roots(e.doc, e.selection)
      .filter((n) => ['layer', 'group', 'text'].includes(n.type))
      .forEach((n) => {
        const p = G.world(e.doc, n).transform(n.transform.anchor),
          z = P.view.zoom,
          c = new P.Path.Circle(p, 6 / z);
        c.fillColor = '#202020';
        c.strokeColor = e.prefs.selectionColor;
        c.strokeWidth = 1 / z;
        c.data = { anchor: n.id };
        for (const v of [
          [10, 0],
          [0, 10],
        ]) {
          const d = new P.Point(v).divide(z),
            l = new P.Path.Line(p.subtract(d), p.add(d));
          l.strokeColor = e.prefs.selectionColor;
          l.strokeWidth = 1 / z;
          l.data = { anchor: n.id };
        }
      });
  }
  function pivot(b, key) {
    const names = {
      'Top left': 'topLeft',
      Top: 'topCenter',
      'Top right': 'topRight',
      Left: 'leftCenter',
      Center: 'center',
      Right: 'rightCenter',
      'Bottom left': 'bottomLeft',
      Bottom: 'bottomCenter',
      'Bottom right': 'bottomRight',
    };
    return b[names[key] || 'center'];
  }
  g.Transforms = { apply, affine, frame, drawBoxes, move, anchor, drawAnchor, pivot };
})(window);
