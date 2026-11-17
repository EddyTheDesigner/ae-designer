/* On-canvas gradient stops, midpoint controls and rotation. */
(function (g) {
  'use strict';
  const D = DM,
    P = paper,
    G = Geometry,
    original = { ...Widgets };
  function targets(e, n) {
    const kind = n.type === 'gradientStroke' ? 'stroke' : 'fill',
      ids = D.styleTargets(e.doc, e.selection, kind, false)
        .filter((x) => x.gradient)
        .map((x) => x.id);
    if (!ids.includes(n.id)) ids.unshift(n.id);
    return ids;
  }
  function matrix(e, n) {
    const parent = D.parent(e.doc, n.id);
    return parent ? G.world(e.doc, parent) : new P.Matrix();
  }
  Widgets.draw = function (e) {
    original.draw(e);
    if (e.tool !== 'gradient') return;
    const paints = [...D.styleTargets(e.doc, e.selection, e.gradientTarget || 'fill', false)].filter(
      (n) => n.gradient,
    );
    for (const n of paints) {
      const grad = Gradients.normalize(n),
        m = matrix(e, n),
        a = m.transform(grad.start),
        b = m.transform(grad.end),
        axis = b.subtract(a),
        normal = new P.Point(-axis.y, axis.x).normalize(10 / P.view.zoom),
        radius = 3.5 / P.view.zoom;
      function handle(p, key, index, color, diamond) {
        const item = new P.Path.Rectangle(
          new P.Rectangle(p.subtract(radius), new P.Size(radius * 2, radius * 2)),
        );
        item.fillColor = color || '#eee';
        item.strokeColor = e.prefs.selectionColor;
        item.strokeWidth = 1 / P.view.zoom;
        if (diamond) {
          item.scale(0.65);
          item.rotate(45);
        }
        item.data = { widget: { id: n.id, kind: 'gradient-canvas', key, index } };
      }
      handle(b.add(axis.normalize(22 / P.view.zoom)), 'rotate');
      grad.stops.forEach((stop, index) => {
        handle(a.add(axis.multiply(stop.position)).add(normal), 'stop', index, stop.color);
        const next = grad.stops[index + 1];
        if (next)
          handle(
            a.add(axis.multiply(stop.position + (next.position - stop.position) * stop.midpoint)).add(normal),
            'midpoint',
            index,
            null,
            true,
          );
      });
    }
  };
  Widgets.begin = function (e, ref, p, before) {
    if (ref.kind !== 'gradient-canvas') {
      const d = original.begin(e, ref, p, before);
      if (ref.kind === 'gradient') d.ids = targets(e, D.find(e.doc, ref.id));
      return d;
    }
    const n = D.find(e.doc, ref.id);
    e.gradientStop = { id: n.id, track: 'stops', index: ref.index || 0 };
    return { type: 'widget', ref, ids: targets(e, n), start: p, before, base: D.clone(e.doc) };
  };
  Widgets.drag = function (e, d, p, ev) {
    if (d.ref.kind !== 'gradient-canvas') return original.drag(e, d, p, ev);
    const ref = d.ref,
      n = D.find(e.doc, ref.id),
      grad = Gradients.normalize(n),
      m = matrix(e, n),
      local = m.inverseTransform(p),
      axis = new P.Point(grad.end).subtract(grad.start),
      at = local.subtract(grad.start).dot(axis) / Math.max(1e-8, axis.dot(axis));
    let value;
    if (ref.key === 'rotate') {
      const angle = local.subtract(grad.start).angle;
      value = ev.shiftKey ? Math.round(angle / 45) * 45 : angle;
    } else if (ref.key === 'stop') value = Math.max(0, Math.min(1, at));
    else {
      const stop = grad.stops[ref.index],
        next = grad.stops[ref.index + 1];
      value = Math.max(
        0.001,
        Math.min(0.999, (at - stop.position) / Math.max(1e-6, next.position - stop.position)),
      );
    }
    Widgets.apply(e, ref, d.ids, value);
    d.values = { Value: value };
    d.label =
      ref.key === 'rotate' ? 'Rotate gradient' : ref.key === 'stop' ? 'Gradient stop' : 'Gradient midpoint';
    d.remove =
      ref.key === 'stop' &&
      Math.abs(local.subtract(grad.start).cross(axis)) / Math.max(1e-6, axis.length) > 45 / P.view.zoom;
  };
  Widgets.apply = function (e, ref, ids, value) {
    if (ref.kind !== 'gradient-canvas') return original.apply(e, ref, ids, value);
    const source = D.find(e.doc, ref.id),
      base = source && D.clone(Gradients.normalize(source));
    ids.forEach((id) => {
      const n = D.find(e.doc, id);
      if (!n || !base) return;
      n.gradient = D.clone(base);
      const grad = n.gradient;
      if (ref.key === 'rotate') {
        const axis = new P.Point(grad.end).subtract(grad.start);
        axis.angle = value;
        grad.end = [grad.start[0] + axis.x, grad.start[1] + axis.y];
      } else if (grad.stops[ref.index])
        grad.stops[ref.index][ref.key === 'stop' ? 'position' : 'midpoint'] = value;
    });
  };
  Widgets.valueFromFields = function (ref, v) {
    return ref.kind === 'gradient-canvas' ? +v.Value : original.valueFromFields(ref, v);
  };
  Widgets.reset = function (e, ref) {
    if (ref.kind !== 'gradient-canvas') return original.reset(e, ref);
    if (ref.key === 'midpoint')
      e.edit('Reset gradient midpoint', () => Widgets.apply(e, ref, targets(e, D.find(e.doc, ref.id)), 0.5));
    else if (ref.key === 'stop') {
      e.gradientStop = { id: ref.id, track: 'stops', index: ref.index };
      e.UI.renderProperties();
      [...document.querySelectorAll('#properties .field')]
        .find((row) => row.querySelector('label')?.textContent === 'Color')
        ?.querySelector('input[type=color]')
        ?.click();
    }
  };
  function finish(e, d, p) {
    if (d.type !== 'widget') return;
    const ref = d.ref;
    if (ref.kind === 'gradient-canvas' && ref.key === 'stop') {
      d.ids.forEach((id) => {
        const grad = Gradients.normalize(D.find(e.doc, id)),
          stop = grad.stops[ref.index];
        if (d.remove && grad.stops.length > 2) grad.stops.splice(ref.index, 1);
        grad.stops.sort((a, b) => a.position - b.position);
        if (id === ref.id)
          e.gradientStop = { id, track: 'stops', index: Math.max(0, grad.stops.indexOf(stop)) };
      });
      if (d.remove) d.values = null;
    }
    if (ref.kind === 'gradient' && ref.key === 'move' && p.getDistance(d.start) < 2 / P.view.zoom) {
      const n = D.find(e.doc, ref.id),
        grad = Gradients.normalize(n),
        local = matrix(e, n).inverseTransform(p),
        axis = new P.Point(grad.end).subtract(grad.start),
        pos = Math.max(0, Math.min(1, local.subtract(grad.start).dot(axis) / Math.max(1e-8, axis.dot(axis)))),
        sample = Gradients.sample(grad, pos);
      d.ids.forEach((id) => {
        const g = Gradients.normalize(D.find(e.doc, id));
        g.stops.push({ position: pos, color: D.hex(sample.rgb), midpoint: 0.5 });
        g.stops.sort((a, b) => a.position - b.position);
      });
      e.gradientStop = { id: n.id, track: 'stops', index: grad.stops.findIndex((s) => s.position === pos) };
      d.values = null;
      d.label = 'Add gradient stop';
    }
  }
  function place(e, start, end) {
    if (D.roots(e.doc, e.selection).some((n) => n.type === 'text'))
      throw Error('Text uses solid fills and strokes.');
    const paints = D.styleTargets(e.doc, e.selection, e.gradientTarget || 'fill', true);
    for (const n of paints) {
      if (n.type.startsWith('gradient') && (!n.gradient || n.meta['ADBE Vector Grad Colors']?.keys))
        throw Error('Colors are edited in After Effects.');
      const m = matrix(e, n),
        a = m.inverseTransform(start),
        b = m.inverseTransform(end);
      n.type = e.gradientTarget === 'stroke' ? 'gradientStroke' : 'gradientFill';
      n.matchName = D.K[n.type];
      const grad = Gradients.normalize(n);
      grad.start = [a.x, a.y];
      grad.end = [b.x, b.y];
    }
  }
  g.GradientCanvas = { finish, place };
})(window);
