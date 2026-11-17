(function (g) {
  'use strict';
  const P = paper,
    G = Geometry;
  function pathsOf(container) {
    const out = [];
    function scan(item) {
      if (item instanceof P.Path) out.push(item);
      else if (item.children) item.children.forEach(scan);
    }
    container.children.forEach(scan);
    return out;
  }
  function replace(src, out) {
    if (!out) return;
    out.style = src.style;
    out.data = src.data;
    const parent = src.parent;
    parent.insertChild(src.index, out);
    src.remove();
  }
  function samplePath(src, step, fn, smooth) {
    const out = new P.Path({ closed: src.closed, insert: false }),
      count = Math.max(2, Math.min(4000, Math.ceil(src.length / Math.max(0.5, step))));
    for (let i = 0; i <= (src.closed ? count - 1 : count); i++) {
      const at = (src.length * i) / count,
        point = src.getPointAt(at),
        normal = src.getNormalAt(at);
      if (point) out.add(fn(point, normal || new P.Point(0, 1), at, i, count));
    }
    if (smooth) out.smooth({ type: 'catmull-rom', factor: 0.5 });
    return out;
  }
  function preview(n, container, time = 0) {
    (n.children || [])
      .filter((x) => x.type === 'operator' && x.visible !== false)
      .forEach((op) => {
        const p = op.props,
          paths = pathsOf(container),
          type = op.matchName;
        if (type === 'ADBE Vector Filter - Repeater') {
          const copies = Math.max(0, Math.min(1000, +p['ADBE Vector Repeater Copies'] || 0)),
            offset = +p['ADBE Vector Repeater Offset'] || 0,
            k = 'ADBE Vector Repeater Transform/ADBE Vector Repeater ',
            pos = p[k + 'Position'] || [100, 0],
            rot = p[k + 'Rotation'] || 0,
            sc = p[k + 'Scale'] || [100, 100],
            anchor = p[k + 'Anchor'] || [0, 0],
            start = p[k + 'Start Opacity'] == null ? 100 : p[k + 'Start Opacity'],
            end = p[k + 'End Opacity'] == null ? 100 : p[k + 'End Opacity'],
            original = new P.Group({ children: container.removeChildren(), insert: false });
          for (let i = 0; i < Math.ceil(copies); i++) {
            const t = i + offset,
              copy = original.clone({ insert: false }),
              m = new P.Matrix()
                .translate(new P.Point(pos).multiply(t))
                .translate(anchor)
                .rotate(rot * t)
                .scale(Math.pow(sc[0] / 100, t), Math.pow(sc[1] / 100, t))
                .translate(new P.Point(anchor).negate());
            copy.transform(m);
            copy.opacity *=
              ((start + ((end - start) * i) / Math.max(1, copies - 1)) / 100) * Math.min(1, copies - i);
            copy.data.replica = i > 0;
            if (p['ADBE Vector Repeater Order'] === 2) container.insertChild(0, copy);
            else container.addChild(copy);
          }
          original.remove();
        } else if (type === 'ADBE Vector Filter - Merge') {
          const mode = p['ADBE Vector Merge Type'] || 1;
          if (paths.length < 2 || mode === 1) return;
          const world = container.globalMatrix.inverted(),
            source = paths
              .filter((x) => x.closed)
              .map((x) => {
                const c = x.clone({ insert: false });
                c.transform(world.appended(x.globalMatrix));
                return c;
              });
          if (source.length < 2) return;
          let result = G.boolean(
            source,
            { 2: 'unite', 3: 'subtract', 4: 'intersect', 5: 'exclude' }[mode] || 'unite',
          );
          result.style = paths[0].style;
          result.data = paths[0].data;
          container.removeChildren();
          container.addChild(result);
        } else if (type === 'ADBE Vector Filter - RC')
          paths.forEach((src) => replace(src, G.roundCorners(src, p['ADBE Vector RoundCorner Radius'] || 0)));
        else if (type === 'ADBE Vector Filter - Offset')
          paths
            .filter((x) => x.closed)
            .forEach((src) =>
              replace(
                src,
                G.offset(
                  src,
                  p['ADBE Vector Offset Amount'] || 0,
                  { 1: 'miter', 2: 'round', 3: 'bevel' }[p['ADBE Vector Offset Line Join']] || 'miter',
                ),
              ),
            );
        else if (type === 'ADBE Vector Filter - PB')
          paths.forEach((src) => {
            const amount = (p['ADBE Vector PuckerBloat Amount'] || 0) / 100,
              c = src.bounds.center;
            src.segments.forEach((s) => {
              const pos = s.point.clone();
              s.point = pos.add(c.subtract(pos).multiply(amount));
              s.handleIn = s.handleIn.add(pos.subtract(c).multiply(amount));
              s.handleOut = s.handleOut.add(pos.subtract(c).multiply(amount));
            });
          });
        else if (type === 'ADBE Vector Filter - Twist')
          paths.forEach((src) => {
            const center = new P.Point(p['ADBE Vector Twist Center'] || [0, 0]),
              angle = p['ADBE Vector Twist Angle'] || 0,
              r = Math.max(src.bounds.width, src.bounds.height) / 2 || 1;
            replace(
              src,
              samplePath(src, 2, (point) => {
                const v = point.subtract(center);
                return center.add(v.rotate((angle * v.length) / r));
              }),
            );
          });
        else if (type === 'ADBE Vector Filter - Zigzag' || type === 'ADBE Vector Filter - Roughen')
          paths.forEach((src) => {
            const zig = type === 'ADBE Vector Filter - Zigzag',
              prefix = zig ? 'ADBE Vector Zigzag ' : 'ADBE Vector Roughen ',
              size = p[prefix + 'Size'] || 0,
              detail = Math.max(1, p[prefix + 'Detail'] || 1),
              smooth = p[prefix + 'Points'] === 2,
              seed = p['ADBE Vector Random Seed'] || 0,
              phase =
                ((p['ADBE Vector Temporal Phase'] || 0) / 180) * Math.PI +
                time * (p['ADBE Vector Temporal Freq'] || 0) * 2 * Math.PI,
              spatial = p['ADBE Vector Spatial Phase'] || 0;
            replace(
              src,
              samplePath(
                src,
                src.length / (detail * 2),
                (point, normal, at, i) => {
                  const noise = zig
                    ? i % 2
                      ? 1
                      : -1
                    : Math.sin(i * 12.9898 + seed * 78.233 + spatial + phase) *
                      Math.cos(i * 4.1414 + seed + phase * 0.73);
                  return point.add(normal.multiply(size * noise));
                },
                smooth,
              ),
            );
          });
        else if (type === 'ADBE Vector Filter - Wiggler') {
          const phase =
              ((p['ADBE Vector Temporal Phase'] || 0) * Math.PI) / 180 +
              time * (p['ADBE Vector Temporal Freq'] || 0) * Math.PI * 2,
            seed = p['ADBE Vector Random Seed'] || 0,
            w = Math.sin(phase + seed * 13.17),
            k = 'ADBE Vector Wiggler Transform/ADBE Vector Wiggler ',
            pos = p[k + 'Position'] || [0, 0],
            scale = p[k + 'Scale'] || [100, 100],
            rot = p[k + 'Rotation'] || 0;
          container.children.forEach((child, i) => {
            const v = Math.sin(phase + seed + i * (100 - (p['ADBE Vector Correlation'] || 0)) * 0.01);
            child.translate(new P.Point(pos).multiply(v));
            child.rotate(rot * w, [0, 0]);
            child.scale(1 + (scale[0] / 100 - 1) * v, 1 + (scale[1] / 100 - 1) * v, [0, 0]);
          });
        } else if (type === 'ADBE Vector Filter - Trim') {
          const start = (p['ADBE Vector Trim Start'] || 0) / 100,
            end = (p['ADBE Vector Trim End'] == null ? 100 : p['ADBE Vector Trim End']) / 100,
            offset = (p['ADBE Vector Trim Offset'] || 0) / 360,
            total = paths.reduce((a, x) => a + x.length, 0);
          let traversed = 0;
          paths.forEach((src) => {
            const length = src.length,
              individual = p['ADBE Vector Trim Type'] === 2,
              span = Math.min(1, Math.max(0, end - start));
            if (span >= 0.999999) {
              traversed += length;
              return;
            }
            const ranges = [],
              norm = (v) => ((v % 1) + 1) % 1,
              a = norm(start + offset),
              b = a + span;
            [[a, Math.min(1, b)], ...(b > 1 ? [[0, b - 1]] : [])].forEach(([x, y]) => {
              let lo = individual ? x * total - traversed : x * length,
                hi = individual ? y * total - traversed : y * length;
              lo = Math.max(0, lo);
              hi = Math.min(length, hi);
              if (hi > lo) ranges.push([lo, hi]);
            });
            const parent = src.parent,
              index = src.index;
            for (const [lo, hi] of ranges) {
              let out = src.clone({ insert: false });
              if (hi < length) {
                const tail = out.splitAt(hi);
                if (tail) tail.remove();
              }
              if (lo > 0) {
                const tail = out.splitAt(lo);
                if (tail) {
                  out.remove();
                  out = tail;
                }
              }
              out.style = src.style;
              out.data = src.data;
              parent.insertChild(index, out);
            }
            src.remove();
            traversed += length;
          });
        }
      });
  }
  g.Operators = { preview, pathsOf };
})(window);
