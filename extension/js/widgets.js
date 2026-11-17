(function (g) {
  'use strict';
  const xy = (p) => [p.x, p.y];
  const D = DM,
    G = Geometry,
    P = paper,
    L = LiveShapes;
  const taperKey = (k) => 'ADBE Vector Stroke Taper/ADBE Vector Taper ' + k;
  function dot(e, point, data, kind) {
    const z = P.view.zoom / (e.prefs.handleSize / 100),
      p =
        kind === 'square'
          ? new P.Path.Rectangle(new P.Rectangle(point.subtract(3.5 / z), new P.Size(7 / z, 7 / z)))
          : new P.Path.Circle(point, 3.5 / z);
    p.fillColor = kind === 'corner' ? '#222' : '#fff';
    p.strokeColor = e.prefs.selectionColor;
    p.strokeWidth = 1 / z;
    p.data = { widget: data };
    return p;
  }
  function line(e, a, b, data) {
    const p = new P.Path.Line(a, b);
    p.strokeColor = e.prefs.selectionColor;
    p.strokeWidth = 1 / P.view.zoom;
    if (data) p.data = { widget: data };
    return p;
  }
  function draw(e) {
    const shapes = D.selectedShapes(e.doc, e.selection),
      count = shapes.reduce((sum, n) => sum + (n.props['ADBE Vector Shape']?.vertices.length || 4), 0);
    shapes.forEach((n) => {
      const m = G.world(e.doc, n),
        info = L.ellipse(n),
        origin = (v) => m.transform(new P.Point(v));
      if (info && ['select', 'ellipse', 'direct'].includes(e.tool)) {
        const a = { start: 0, sweep: 360, ratio: 0, ...(n.rig || n.arc) },
          pt = (ang, ratio = 1) =>
            origin([
              info.center[0] + (info.size[0] / 2) * ratio * Math.cos((ang * Math.PI) / 180),
              info.center[1] + (info.size[1] / 2) * ratio * Math.sin((ang * Math.PI) / 180),
            ]);
        dot(e, pt(a.start), { id: n.id, kind: 'arc', key: 'start' });
        dot(e, pt(a.start + a.sweep, 0.94), { id: n.id, kind: 'arc', key: 'sweep' });
        dot(
          e,
          pt(a.start + a.sweep / 2, Math.max(0.12, a.ratio)),
          { id: n.id, kind: 'arc', key: 'ratio' },
          'square',
        );
      }
      if (n.type === 'star' && ['select', 'star', 'polygon', 'direct'].includes(e.tool)) {
        const q = n.props,
          c = new P.Point(q['ADBE Vector Star Position']),
          r = q['ADBE Vector Star Outer Radius'],
          angle = (q['ADBE Vector Star Rotation'] || 0) - 90,
          point = (radius, offset) => origin(c.add(new P.Point({ length: radius, angle: angle + offset })));
        [
          ['Outer Radius', r, 0],
          ['Inner Radius', q['ADBE Vector Star Inner Radius'], 180 / (q['ADBE Vector Star Points'] || 5)],
          ['Points', r + 22 / P.view.zoom, 20],
          ['Outer Roundess', r * 0.75, 0],
          ['Inner Roundess', r * 0.3, 20],
        ].forEach(([key, radius, offset]) => {
          if (key.startsWith('Inner') && q['ADBE Vector Star Type'] === 2) return;
          dot(e, point(radius, offset), { id: n.id, kind: 'star', key }, 'square');
        });
      }
      if (
        count <= 500 &&
        ['select', 'direct'].includes(e.tool) &&
        ['rect', 'path', 'mask'].includes(n.type)
      ) {
        const p = L.corners(n);
        if (p?.segments)
          p.segments.forEach((s, i) => {
            if (
              (!p.closed && (i === 0 || i === p.segments.length - 1)) ||
              s.handleIn.length ||
              s.handleOut.length
            )
              return;
            const a = p.segments[(i + p.segments.length - 1) % p.segments.length].point
                .subtract(s.point)
                .normalize(),
              b = p.segments[(i + 1) % p.segments.length].point.subtract(s.point).normalize(),
              bisector = a.add(b).normalize();
            if (!bisector.length) return;
            const r =
                n.type === 'rect' ? n.props['ADBE Vector Rect Roundness'] || 0 : n.cornerRadii?.[i] || 0,
              scale = Math.sqrt(Math.abs(m.determinant)),
              distance = Math.max(14 / (P.view.zoom * scale), r * 1.4);
            dot(
              e,
              origin(s.point.add(bisector.multiply(distance))),
              { id: n.id, kind: 'corner', index: i },
              'corner',
            );
          });
      }
      if (e.tool === 'width') {
        const p = G.pathOf(n),
          stroke = D.paints(e.doc, n).stroke;
        if (!stroke || !p?.segments || p.closed || p.length < 1e-3) return;
        const q = stroke.props,
          width = q['ADBE Vector Stroke Width'] || 1,
          units = q[taperKey('Length Units')] || 1;
        ['Start', 'End'].forEach((end, i) => {
          const len = (q[taperKey(end + ' Length')] || 0) * (units === 1 ? p.length / 100 : 1),
            offset = i ? p.length - len : len,
            at = p.getPointAt(Math.max(0, Math.min(p.length, offset))),
            normal = p.getNormalAt(Math.max(0, Math.min(p.length, offset))) || new P.Point(0, -1),
            w = ((q[taperKey(end + ' Width')] ?? 100) * width) / 200;
          const a = origin(at.add(normal.multiply(w))),
            b = origin(at.subtract(normal.multiply(w)));
          line(e, a, b);
          [1, -1].forEach((sign) =>
            dot(
              e,
              origin(at.add(normal.multiply(w * sign))),
              { id: n.id, stroke: stroke.id, kind: 'taper', end, sign },
              'square',
            ),
          );
        });
      }
    });
    if (e.tool === 'gradient') {
      const paints = [
        ...D.styleTargets(e.doc, e.selection, 'fill', false),
        ...D.styleTargets(e.doc, e.selection, 'stroke', false),
      ].filter((n) => n.gradient);
      paints.forEach((n) => {
        const grad = Gradients.normalize(n),
          parent = D.parent(e.doc, n.id),
          m = parent ? G.world(e.doc, parent) : new P.Matrix(),
          a = m.transform(grad.start),
          b = m.transform(grad.end);
        line(e, a, b, { id: n.id, kind: 'gradient', key: 'move' });
        dot(e, a, { id: n.id, kind: 'gradient', key: 'start' }, 'square');
        dot(e, b, { id: n.id, kind: 'gradient', key: 'end' });
        if (grad.type === 'radial') {
          const v = new P.Point(grad.end).subtract(new P.Point(grad.start));
          v.angle += grad.highlightAngle || 0;
          dot(
            e,
            m.transform(new P.Point(grad.start).add(v.multiply((grad.highlight || 0) / 100))),
            { id: n.id, kind: 'gradient', key: 'highlight' },
            'square',
          );
        }
      });
    }
    e.selection
      .map((id) => D.find(e.doc, id))
      .filter((n) => n?.array)
      .forEach((n) => {
        const a = n.array,
          v = a.values,
          m = G.world(e.doc, n);
        let controls = [];
        if (a.layout === 'Linear')
          controls = [
            ['Step X', [v['Step X'], v['Step Y']]],
            ['Copies', [(v.Copies - 1) * v['Step X'], (v.Copies - 1) * v['Step Y']]],
          ];
        else if (a.layout === 'Grid' || a.layout === 'Brick')
          controls = [
            ['Spacing X', [v['Spacing X'], 0]],
            ['Spacing Y', [0, v['Spacing Y']]],
            ['Columns', [(v.Columns - 1) * v['Spacing X'], 0]],
            ['Rows', [0, (v.Rows - 1) * v['Spacing Y']]],
          ];
        else
          controls = [
            ['Radius', new P.Point({ length: v.Radius, angle: v.Start })],
            ['Start', new P.Point({ length: v.Radius + 20 / P.view.zoom, angle: v.Start })],
            ['Sweep', new P.Point({ length: v.Radius, angle: v.Start + v.Sweep - 2 })],
            ['Copies', new P.Point({ length: v.Radius + 40 / P.view.zoom, angle: v.Start + v.Sweep })],
          ];
        controls.forEach(([key, pos]) =>
          dot(e, m.transform(new P.Point(pos)), { id: n.id, kind: 'array', key }, 'square'),
        );
      });
  }
  function begin(e, ref, p, before) {
    const n = D.find(e.doc, ref.id),
      selected = D.selectedShapes(e.doc, e.selection);
    let ids = [n.id];
    if (ref.kind === 'arc') ids = selected.filter((x) => L.ellipse(x)).map((x) => x.id);
    if (ref.kind === 'star') ids = selected.filter((x) => x.type === 'star').map((x) => x.id);
    return { type: 'widget', ref, ids, start: p, before, base: D.clone(e.doc) };
  }
  function drag(e, d, p, ev) {
    const ref = d.ref,
      n = D.find(e.doc, ref.id),
      m = ref.kind === 'gradient' ? G.world(e.doc, D.parent(e.doc, n.id)) : G.world(e.doc, n),
      local = m.inverseTransform(p);
    let value;
    if (ref.kind === 'arc') {
      const info = L.ellipse(n),
        v = local.subtract(new P.Point(info.center)),
        angle =
          ((((Math.atan2(v.y / (info.size[1] / 2), v.x / (info.size[0] / 2)) * 180) / Math.PI) % 360) + 360) %
          360;
      value =
        ref.key === 'ratio'
          ? Math.max(0, Math.min(0.999, Math.hypot(v.x / (info.size[0] / 2), v.y / (info.size[1] / 2))))
          : ref.key === 'start'
            ? angle
            : (angle - (n.rig?.start || n.arc?.start || 0) + 360) % 360;
      if (ev.shiftKey && ref.key !== 'ratio') value = Math.round(value / 15) * 15;
    }
    if (ref.kind === 'star') {
      const center = new P.Point(n.props['ADBE Vector Star Position']),
        v = local.subtract(center),
        base = D.find(d.base, n.id);
      value =
        ref.key === 'Points'
          ? Math.max(3, Math.round(base.props['ADBE Vector Star Points'] + (p.y - d.start.y) * -0.1))
          : ref.key.includes('Roundess')
            ? Math.max(0, Math.min(100, 50 + (p.x - d.start.x)))
            : v.length;
    }
    if (ref.kind === 'corner') {
      const path = L.corners(n),
        s = path.segments[ref.index],
        a = path.segments[(ref.index + path.segments.length - 1) % path.segments.length].point
          .subtract(s.point)
          .normalize(),
        b = path.segments[(ref.index + 1) % path.segments.length].point.subtract(s.point).normalize(),
        bisector = a.add(b).normalize();
      value = Math.max(0, local.subtract(s.point).dot(bisector) / 1.4 - 10 / P.view.zoom);
    }
    if (ref.kind === 'taper') {
      const path = G.pathOf(n),
        stroke = D.find(e.doc, ref.stroke),
        loc = path.getNearestLocation(local),
        normal = path.getNormalAt(loc.offset),
        length = ref.end === 'Start' ? loc.offset : path.length - loc.offset,
        units = stroke.props[taperKey('Length Units')] || 1;
      value = {
        length: units === 1 ? (length / path.length) * 100 : length,
        width: Math.max(
          0,
          (Math.abs(local.subtract(loc.point).dot(normal)) * 200) /
            (stroke.props['ADBE Vector Stroke Width'] || 1),
        ),
      };
    }
    if (ref.kind === 'gradient') {
      const grad = Gradients.normalize(n);
      if (ref.key === 'move') {
        const delta = local.subtract(m.inverseTransform(d.start));
        value = { start: xy(new P.Point(grad.start).add(delta)), end: xy(new P.Point(grad.end).add(delta)) };
      } else if (ref.key === 'highlight') {
        const v = local.subtract(new P.Point(grad.start)),
          axis = new P.Point(grad.end).subtract(new P.Point(grad.start));
        value = {
          highlight: Math.min(99, (v.length / axis.length) * 100),
          highlightAngle: v.angle - axis.angle,
        };
      } else value = [local.x, local.y];
    }
    if (ref.kind === 'array') {
      const v = n.array.values;
      if (ref.key === 'Step X') value = [local.x, local.y];
      else if (ref.key === 'Spacing X') value = local.x;
      else if (ref.key === 'Spacing Y') value = local.y;
      else if (ref.key === 'Radius') value = local.length;
      else if (ref.key === 'Start') value = local.angle;
      else if (ref.key === 'Sweep') value = (local.angle - v.Start + 360) % 360 || 360;
      else if (ref.key === 'Columns' || ref.key === 'Rows')
        value = Math.max(
          1,
          Math.round((ref.key === 'Columns' ? local.x / v['Spacing X'] : local.y / v['Spacing Y']) + 1),
        );
      else if (n.array.layout === 'Linear')
        value = Math.max(
          1,
          Math.round(
            local.dot(new P.Point(v['Step X'], v['Step Y'])) / (v['Step X'] ** 2 + v['Step Y'] ** 2) + 1,
          ),
        );
      else value = Math.max(1, Math.round(v.Copies + (p.x - d.start.x) / 8));
    }
    apply(e, ref, d.ids, value);
    d.values = fields(ref, value);
    d.label =
      ref.kind === 'corner'
        ? 'Corner radius'
        : ref.kind === 'taper'
          ? 'Stroke taper'
          : ref.kind === 'gradient'
            ? 'Gradient'
            : ref.key || 'Shape';
  }
  function apply(e, ref, ids, value) {
    ids.forEach((id) => {
      const n = D.find(e.doc, id);
      if (!n) return;
      if (ref.kind === 'arc') L.setArc(n, ref.key, value);
      if (ref.kind === 'star') D.set(n, 'ADBE Vector Star ' + ref.key, value);
      if (ref.kind === 'corner') L.setCorner(n, ref.index, value);
      if (ref.kind === 'taper') {
        const stroke = D.find(e.doc, ref.stroke);
        D.set(stroke, taperKey(ref.end + ' Length'), value.length);
        D.set(stroke, taperKey(ref.end + ' Width'), value.width);
      }
      if (ref.kind === 'gradient') {
        const grad = Gradients.normalize(n);
        if (ref.key === 'move' || ref.key === 'highlight') Object.assign(grad, value);
        else grad[ref.key] = value;
      }
      if (ref.kind === 'array') {
        if (ref.key === 'Step X') {
          n.array.values['Step X'] = value[0];
          n.array.values['Step Y'] = value[1];
        } else n.array.values[ref.key] = value;
        Arrays.build(n);
      }
    });
  }
  function reset(e, ref) {
    if (ref.kind === 'taper') e.edit('Reset taper', () => apply(e, ref, [ref.id], { width: 100, length: 0 }));
    if (ref.kind === 'corner') e.edit('Reset corner', () => apply(e, ref, [ref.id], 0));
  }
  function fields(ref, v) {
    if (ref.kind === 'taper') return { Length: v.length, Width: v.width };
    if (ref.kind === 'gradient') {
      if (ref.key === 'move')
        return { 'Start X': v.start[0], 'Start Y': v.start[1], 'End X': v.end[0], 'End Y': v.end[1] };
      if (ref.key === 'highlight') return { Length: v.highlight, Angle: v.highlightAngle };
      return { X: v[0], Y: v[1] };
    }
    if (ref.kind === 'array' && ref.key === 'Step X') return { 'Step X': v[0], 'Step Y': v[1] };
    return { Value: v };
  }
  function valueFromFields(ref, v) {
    if (ref.kind === 'taper') return { length: +v.Length, width: +v.Width };
    if (ref.kind === 'gradient') {
      if (ref.key === 'move')
        return { start: [+v['Start X'], +v['Start Y']], end: [+v['End X'], +v['End Y']] };
      if (ref.key === 'highlight') return { highlight: +v.Length, highlightAngle: +v.Angle };
      return [+v.X, +v.Y];
    }
    if (ref.kind === 'array' && ref.key === 'Step X') return [+v['Step X'], +v['Step Y']];
    return +v.Value;
  }
  g.Widgets = { draw, begin, drag, apply, reset, taperKey, fields, valueFromFields };
})(window);
