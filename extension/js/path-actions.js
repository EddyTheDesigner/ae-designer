(function (g) {
  'use strict';
  const D = DM,
    G = Geometry,
    P = paper;
  function nonempty(p) {
    return p && Math.abs(p.area) > 1e-5;
  }
  function run(e, operation, resultMode) {
    const order = [];
    D.walk(e.doc.layers, (n) => order.push(n.id));
    const nodes = D.selectedShapes(e.doc, e.selection)
      .filter(D.isShape)
      .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    if (nodes.length < 2) return;
    const paths = nodes.map((n) => {
      const p = G.pathOf(n);
      p.transform(G.world(e.doc, n));
      return p;
    });
    if (paths.some((p) => !p.closed)) throw Error('Select at least two closed shapes.');
    const layer = D.node('layer', 'Pathfinder'),
      group = D.node('group', 'Pathfinder');
    layer.layerKind = 'shape';
    layer.children = [group];
    let pieces = [];
    if (resultMode === 'operator' && ['unite', 'subtract', 'intersect', 'exclude'].includes(operation)) {
      const list = operation === 'subtract' ? nodes.slice().reverse() : nodes;
      list.forEach((n) => {
        const c = D.clone(n);
        G.setPath(c, paths[nodes.indexOf(n)]);
        group.children.push(c);
      });
      const op = D.node('operator', 'Merge Paths');
      op.matchName = 'ADBE Vector Filter - Merge';
      op.props = { 'ADBE Vector Merge Type': { unite: 2, subtract: 3, intersect: 4, exclude: 5 }[operation] };
      group.children.push(op);
      const paint = D.paints(e.doc, list[0]);
      if (paint.fill) group.children.push(D.fresh(paint.fill));
      if (paint.stroke) group.children.push(D.fresh(paint.stroke));
    } else {
      if (['unite', 'subtract', 'intersect', 'exclude'].includes(operation)) {
        const back = operation === 'subtract',
          result = G.boolean(back ? paths.slice().reverse() : paths, operation);
        pieces = [{ path: result, owner: back ? nodes.length - 1 : 0 }];
      } else if (operation === 'trim' || operation === 'merge') {
        let occlusion = null;
        paths.forEach((p, i) => {
          const visible = occlusion ? p.subtract(occlusion, { insert: false }) : p.clone({ insert: false });
          if (nonempty(visible)) pieces.push({ path: visible, owner: i });
          occlusion = occlusion ? occlusion.unite(p, { insert: false }) : p.clone({ insert: false });
        });
        if (operation === 'merge') {
          const paints = new Map();
          pieces.forEach((piece) => {
            const f = D.paints(e.doc, nodes[piece.owner]).fill,
              key = JSON.stringify(f ? { props: f.props, gradient: f.gradient } : null),
              old = paints.get(key);
            if (old) old.path = old.path.unite(piece.path, { insert: false });
            else paints.set(key, piece);
          });
          pieces = [...paints.values()];
        }
      } else if (operation === 'divide') {
        for (let i = paths.length - 1; i >= 0; i--) {
          let remaining = paths[i].clone({ insert: false }),
            next = [];
          pieces.forEach((piece) => {
            const overlap = piece.path.intersect(paths[i], { insert: false }),
              outside = piece.path.subtract(paths[i], { insert: false });
            if (nonempty(outside)) next.push({ ...piece, path: outside });
            if (nonempty(overlap)) next.push({ path: overlap, owner: i });
            remaining = remaining.subtract(piece.path, { insert: false });
          });
          if (nonempty(remaining)) next.push({ path: remaining, owner: i });
          pieces = next;
        }
      }
      pieces.forEach((piece, i) => {
        if (!nonempty(piece.path)) return;
        const part = D.node('group', 'Region ' + (i + 1)),
          styles = D.paints(e.doc, nodes[piece.owner]);
        (piece.path.children || [piece.path]).forEach((p) => {
          const n = D.node('path', 'Path');
          G.setPath(n, p);
          part.children.push(n);
        });
        if (styles.fill) part.children.push(D.fresh(styles.fill));
        if (!['trim', 'merge', 'divide'].includes(operation) && styles.stroke)
          part.children.push(D.fresh(styles.stroke));
        group.children.push(part);
      });
    }
    nodes.forEach((n) => D.remove(e.doc, n.id));
    e.doc.layers.unshift(layer);
    e.selection = [group.id];
  }
  function moveAlong(e, amount, align) {
    if (!amount) return;
    const grouped = new Map(),
      selection = [];
    e.pointSelection.forEach((s) => {
      if (s.handle) return;
      if (!grouped.has(s.id)) grouped.set(s.id, []);
      grouped.get(s.id).push(s.index);
    });
    grouped.forEach((indices, id) => {
      const n = D.find(e.doc, id),
        path = G.pathOf(n),
        original = path.clone({ insert: false }),
        targets = [];
      if (!path.segments || !path.length) return;
      indices.forEach((index) => {
        const seg = original.segments[index],
          loc = original.getLocationOf(seg.point);
        if (!loc) return;
        let at = loc.offset + amount;
        at = original.closed
          ? ((at % original.length) + original.length) % original.length
          : Math.max(0, Math.min(original.length, at));
        targets.push({ at, original: seg });
      });
      targets.sort((a, b) => b.at - a.at);
      const moved = [];
      for (const target of targets) {
        const location = path.getLocationAt(target.at);
        if (!location) continue;
        let seg;
        if (location.time < 1e-8) seg = location.curve.segment1;
        else if (location.time > 1 - 1e-8) seg = location.curve.segment2;
        else seg = path.divideAt(location);
        if (!seg) continue;
        if (!align) {
          seg.handleIn = target.original.handleIn.clone();
          seg.handleOut = target.original.handleOut.clone();
        }
        moved.push(seg);
      }
      G.setPath(n, path);
      moved.forEach((s) => selection.push({ id, index: s.index }));
    });
    e.pointSelection = selection;
  }
  function replacePath(e, n, path) {
    if (path.segments) {
      G.setPath(n, path);
      return;
    }
    const contours = path.children || [];
    if (!contours.length) {
      D.remove(e.doc, n.id);
      return;
    }
    n.type = 'group';
    n.matchName = D.K.group;
    n.props = {};
    n.children = contours.map((p, i) => {
      const c = D.node('path', 'Path ' + (i + 1));
      G.setPath(c, p);
      return c;
    });
  }
  function cleanup(e, ids, distance) {
    D.selectedShapes(e.doc, ids).forEach((n) => {
      const p = G.pathOf(n);
      if (!p?.segments) return;
      for (let i = p.segments.length - 1; i > 0; i--)
        if (p.segments[i].point.getDistance(p.segments[i - 1].point) < distance) p.removeSegment(i);
      if (
        p.closed &&
        p.segments.length > 2 &&
        p.firstSegment.point.getDistance(p.lastSegment.point) < distance
      )
        p.removeSegment(p.segments.length - 1);
      G.setPath(n, p);
    });
  }
  function simplify(e, ids, values) {
    const tolerance = Math.max(0.01, +values.Tolerance);
    D.selectedShapes(e.doc, ids).forEach((n) => {
      const p = G.pathOf(n);
      if (!p?.segments) return;
      if (values.Smooth !== false) p.simplify(tolerance);
      else {
        p.flatten(0.25);
        const reduce = (points) => {
          if (points.length < 3) return points;
          const a = points[0],
            b = points[points.length - 1],
            d = b.subtract(a);
          let index = 0,
            max = 0;
          for (let i = 1; i < points.length - 1; i++) {
            const t = d.dot(d) ? Math.max(0, Math.min(1, points[i].subtract(a).dot(d) / d.dot(d))) : 0,
              dist = points[i].getDistance(a.add(d.multiply(t)));
            if (dist > max) {
              max = dist;
              index = i;
            }
          }
          return max > tolerance
            ? reduce(points.slice(0, index + 1))
                .slice(0, -1)
                .concat(reduce(points.slice(index)))
            : [a, b];
        };
        let pts = p.segments.map((s) => s.point.clone());
        if (p.closed) {
          const mid = Math.floor(pts.length / 2);
          pts = reduce(pts.slice(0, mid + 1))
            .slice(0, -1)
            .concat(reduce(pts.slice(mid).concat(pts[0])).slice(0, -1));
        } else pts = reduce(pts);
        p.removeSegments();
        p.addSegments(pts);
      }
      G.setPath(n, p);
    });
  }
  function offset(e, ids, v) {
    D.selectedShapes(e.doc, ids)
      .filter((n) => n.type !== 'mask' || G.pathOf(n).closed)
      .forEach((n) => {
        const p = G.pathOf(n);
        if (!p.closed) return;
        replacePath(e, n, G.offset(p, +v.Distance, v.Join || 'round', false, 1, +v['Miter limit'] || 4));
      });
  }
  function recognize(points, closed) {
    if (!closed || points.length < 6) return null;
    const p = new P.Path({ segments: points, closed: true, insert: false });
    p.flatten(0.5);
    const polygon = p.clone({ insert: false });
    polygon.simplify(Math.max(2, Math.min(p.bounds.width, p.bounds.height) * 0.025));
    const corners = polygon.segments.map((s) => s.point),
      count = corners.length;
    if (count < 3 || count > 12) return null;
    const center = corners.reduce((a, p) => a.add(p), new P.Point()).divide(count),
      radii = corners.map((p) => p.getDistance(center)),
      radius = radii.reduce((a, b) => a + b, 0) / count;
    if (radii.some((r) => Math.abs(r - radius) > radius * 0.13)) return null;
    const angles = corners.map((p) => p.subtract(center).angle).sort((a, b) => a - b),
      step = 360 / count;
    if (angles.some((a, i) => Math.abs(((angles[(i + 1) % count] - a + 360) % 360) - step) > step * 0.22))
      return null;
    const n = D.shape('star', center.x, center.y, radius, 0, { polygon: true, points: count });
    n.props['ADBE Vector Star Rotation'] = angles[0] + 90;
    return n;
  }
  g.PathActions = { run, moveAlong, replacePath, cleanup, simplify, offset, recognize };
})(window);
