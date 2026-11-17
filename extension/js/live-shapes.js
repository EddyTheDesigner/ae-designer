(function (g) {
  'use strict';
  const xy = (p) => [p.x, p.y];
  const D = DM,
    G = Geometry,
    P = paper,
    TAU = Math.PI * 2;
  function arcPath(center, size, start, sweep, ratio) {
    const out = new P.Path({ insert: false }),
      r = [size[0] / 2, size[1] / 2],
      full = Math.abs(sweep) >= 359.999;
    function arc(scale, from, amount) {
      const count = Math.max(1, Math.ceil(Math.abs(amount) / 90)),
        step = ((amount / count) * Math.PI) / 180;
      let a = (from * Math.PI) / 180;
      for (let i = 0; i <= count; i++) {
        const point = new P.Point(
            center[0] + r[0] * scale * Math.cos(a),
            center[1] + r[1] * scale * Math.sin(a),
          ),
          k = (4 / 3) * Math.tan(step / 4),
          tan = new P.Point(-r[0] * scale * Math.sin(a) * k, r[1] * scale * Math.cos(a) * k);
        out.add(new P.Segment(point, i ? tan.negate() : null, i < count ? tan : null));
        a += step;
      }
    }
    arc(1, start, sweep);
    if (ratio > 0) {
      if (full) {
        const inner = new P.Path({ insert: false });
        const outer = out.clone({ insert: false });
        outer.removeSegment(outer.segments.length - 1);
        outer.firstSegment.handleIn = out.lastSegment.handleIn;
        outer.closed = true;
        out.removeSegments();
        arc(Math.min(1, ratio), start + sweep, -sweep);
        out.firstSegment.handleIn = out.lastSegment.handleIn;
        out.removeSegment(out.segments.length - 1);
        out.closed = true;
        const compound = new P.CompoundPath({ insert: false });
        compound.addChildren([outer, out]);
        return compound;
      }
      arc(Math.min(1, ratio), start + sweep, -sweep);
    } else if (!full) out.add(center);
    if (full && !ratio) {
      out.firstSegment.handleIn = out.lastSegment.handleIn;
      out.removeSegment(out.segments.length - 1);
    }
    out.closed = true;
    return out;
  }
  function lineInfo(n) {
    if (n.type !== 'path') return null;
    const v = n.props['ADBE Vector Shape'];
    if (
      !v ||
      v.closed ||
      v.vertices.length !== 2 ||
      v.inTangents.concat(v.outTangents).some((x) => Math.hypot(...x) > 1e-6)
    )
      return null;
    const a = new P.Point(v.vertices[0]),
      b = new P.Point(v.vertices[1]);
    return { start: a, end: b, length: a.getDistance(b), angle: b.subtract(a).angle };
  }
  function circleInfo(n) {
    if (n.type !== 'path') return null;
    const p = G.pathOf(n);
    if (
      !p.closed ||
      p.segments.length !== 4 ||
      !p.segments.every((s) => s.handleIn.length && s.handleOut.length)
    )
      return null;
    const b = p.bounds,
      r = b.width / 2;
    if (Math.abs(b.width - b.height) > Math.max(0.01, r * 0.001)) return null;
    for (let i = 0; i < 32; i++) {
      const q = p.getPointAt((p.length * i) / 32);
      if (Math.abs(q.getDistance(b.center) - r) > Math.max(0.02, r * 0.001)) return null;
    }
    return { center: [b.center.x, b.center.y], size: [b.width, b.height] };
  }
  function ellipse(n) {
    if (n.rig?.kind === 'ellipse') return { center: n.rig.position, size: n.rig.size };
    if (n.type === 'ellipse')
      return { center: n.props['ADBE Vector Ellipse Position'], size: n.props['ADBE Vector Ellipse Size'] };
    return circleInfo(n);
  }
  function setArc(n, key, value) {
    if (n.rig?.kind === 'ellipse') {
      n.rig[key] = value;
      updateRig(n);
      return;
    }
    const info = ellipse(n);
    if (!info) return;
    if (n.type !== 'ellipse') {
      n.type = 'ellipse';
      n.matchName = D.K.ellipse;
      n.props = { 'ADBE Vector Ellipse Position': info.center, 'ADBE Vector Ellipse Size': info.size };
    }
    n.arc = { start: 0, sweep: 360, ratio: 0, ...n.arc, [key]: value };
    if (!n.meta['ADBE Vector Ellipse Size']?.keys && !n.meta['ADBE Vector Ellipse Position']?.keys)
      n.pushAsRig = true;
  }
  function rounded(path, radii, smoothness = 100) {
    const out = new P.Path({ insert: false, closed: path.closed }),
      ss = path.segments;
    ss.forEach((s, i) => {
      let radius = Array.isArray(radii) ? radii[i] : radii;
      if (
        !radius ||
        (!path.closed && (i === 0 || i === ss.length - 1)) ||
        s.handleIn.length ||
        s.handleOut.length
      ) {
        out.add(s.clone());
        return;
      }
      const a = ss[(i + ss.length - 1) % ss.length].point.subtract(s.point),
        b = ss[(i + 1) % ss.length].point.subtract(s.point),
        theta = Math.acos(Math.max(-1, Math.min(1, a.normalize().dot(b.normalize()))));
      if (theta < 1e-4 || Math.abs(theta - Math.PI) < 1e-4) {
        out.add(s.clone());
        return;
      }
      const distance = Math.min(radius / Math.tan(theta / 2), a.length / 2, b.length / 2),
        actual = distance * Math.tan(theta / 2),
        handle = ((4 / 3) * Math.tan((Math.PI - theta) / 4) * actual * Math.max(0, smoothness)) / 100,
        p1 = s.point.add(a.normalize(distance)),
        p2 = s.point.add(b.normalize(distance));
      out.add(new P.Segment(p1, null, a.normalize(-handle)));
      out.add(new P.Segment(p2, b.normalize(-handle), null));
    });
    return out;
  }
  function recognizeCorners(n) {
    if (n.cornerBase) return;
    const p = G.pathOf(n);
    if (!p?.segments) return;
    const base = new P.Path({ insert: false, closed: p.closed }),
      radii = [],
      s = p.segments;
    for (let i = 0; i < s.length; i++) {
      const a = s[i],
        b = s[(i + 1) % s.length];
      if (
        i + 1 < s.length &&
        a.handleIn.length < 1e-5 &&
        a.handleOut.length &&
        b.handleIn.length &&
        b.handleOut.length < 1e-5
      ) {
        const u = a.handleOut.normalize(),
          v = b.handleIn.normalize(),
          delta = b.point.subtract(a.point),
          den = u.cross(v);
        if (Math.abs(den) > 1e-5) {
          const corner = a.point.add(u.multiply(delta.cross(v) / den)),
            angle = Math.acos(
              Math.max(
                -1,
                Math.min(1, a.point.subtract(corner).normalize().dot(b.point.subtract(corner).normalize())),
              ),
            ),
            r = corner.getDistance(a.point) * Math.tan(angle / 2);
          if (
            r > 0 &&
            Math.abs(corner.getDistance(a.point) - corner.getDistance(b.point)) < Math.max(0.2, r * 0.02)
          ) {
            base.add(corner);
            radii.push(r);
            i++;
            continue;
          }
        }
      }
      base.add(a.clone());
      radii.push(0);
    }
    if (base.segments.length < p.segments.length) {
      n.cornerBase = G.toShape(base);
      n.cornerRadii = radii;
      n.cornerSmoothness = 100;
    }
  }
  function corners(n) {
    if (n.type === 'rect') return G.pathOf({ ...n, props: { ...n.props, 'ADBE Vector Rect Roundness': 0 } });
    if (!n.cornerBase) recognizeCorners(n);
    return n.cornerBase ? G.pathOf({ ...n, props: { 'ADBE Vector Shape': n.cornerBase } }) : G.pathOf(n);
  }
  function setCorner(n, index, radius, smoothness) {
    if (n.type === 'rect') {
      D.set(n, 'ADBE Vector Rect Roundness', Math.max(0, radius));
      return;
    }
    const base = corners(n);
    if (!base?.segments) return;
    const shape = G.toShape(base),
      radii = (n.cornerRadii || base.segments.map(() => 0)).slice();
    if (index == null) radii.fill(Math.max(0, radius));
    else radii[index] = Math.max(0, radius);
    const sm = smoothness == null ? (n.cornerSmoothness ?? 100) : smoothness;
    G.setPath(n, rounded(base, radii, sm));
    n.cornerBase = shape;
    n.cornerRadii = radii;
    n.cornerSmoothness = sm;
  }
  function fields(ui, n, nodes) {
    const e = ui.e;
    let html = '',
      info = ellipse(n);
    if (info) {
      const a = { start: 0, sweep: 360, ratio: 0, ...(n.rig || n.arc) };
      let fields = '';
      if (n.rig?.kind === 'ellipse') {
        ['size', 'position'].forEach(
          (key) =>
            (fields += ui.field(key === 'size' ? 'Size' : 'Position', n.rig[key], (v) =>
              e.edit('Ellipse ' + key, () => {
                n.rig[key] = v;
                updateRig(n);
              }),
            )),
        );
      }
      [
        ['start', 'Start', '°'],
        ['sweep', 'Sweep', '°'],
        ['ratio', 'Ratio', '%'],
      ].forEach(
        ([key, label, unit]) =>
          (fields += ui.field(
            label,
            a[key] * (key === 'ratio' ? 100 : 1),
            (v) =>
              e.edit('Ellipse ' + label, () =>
                nodes
                  .filter((x) => ellipse(x))
                  .forEach((x) => setArc(x, key, v / (key === 'ratio' ? 100 : 1))),
              ),
            { unit },
          )),
      );
      fields += ui.field('Push as rig', !!n.pushAsRig, (v) =>
        e.property({ ids: nodes.map((x) => x.id), target: 'node', key: 'pushAsRig', value: v }),
      );
      html += ui.section('Ellipse arc', fields);
    }
    const line = lineInfo(n);
    if (line) {
      let fields = '';
      ['Length', 'Angle'].forEach(
        (label) =>
          (fields += ui.field(label, label === 'Length' ? line.length : line.angle, (v) =>
            e.edit('Line ' + label, () =>
              nodes.forEach((x) => {
                const l = lineInfo(x);
                if (!l) return;
                const vector = new P.Point({
                  length: label === 'Length' ? v : l.length,
                  angle: label === 'Angle' ? v : l.angle,
                });
                x.props['ADBE Vector Shape'].vertices[1] = xy(l.start.add(vector));
              }),
            ),
          )),
      );
      fields += ui.field('Push as rig', !!n.pushAsRig, (v) =>
        e.property({ ids: nodes.map((x) => x.id), target: 'node', key: 'pushAsRig', value: v }),
      );
      html += ui.section('Line', fields);
    }
    if (n.type === 'path') {
      let fields = ui.field('RotoBezier', !!n.rotoBezier, (v) =>
        e.edit('RotoBezier', () =>
          nodes
            .filter((x) => x.type === 'path')
            .forEach((x) => {
              if (v) {
                const p = G.pathOf(x);
                p.smooth({ type: 'catmull-rom', factor: 0.5 });
                G.setPath(x, p);
              }
              x.rotoBezier = v;
            }),
        ),
      );
      if (n.rotoBezier) fields += '<div class="sub-label">Tension: 1</div>';
      html += ui.section('Path type', fields);
      const p = corners(n);
      if (p?.segments.some((s) => !s.handleIn.length && !s.handleOut.length)) {
        fields =
          ui.field('Radius', Math.max(0, ...(n.cornerRadii || [0])), (v) =>
            e.edit('Corner radius', () => nodes.forEach((x) => setCorner(x, null, v))),
          ) +
          ui.field(
            'Smoothness',
            n.cornerSmoothness ?? 100,
            (v) =>
              e.edit('Corner smoothness', () =>
                nodes.forEach((x) => setCorner(x, null, Math.max(0, ...(x.cornerRadii || [0])), v)),
              ),
            { unit: '%' },
          );
        html += ui.section('Corner', fields);
      }
    }
    return html;
  }
  function prepare(n) {
    if (n.rig?.kind === 'ellipse') {
      updateRig(n);
      if (n.pushAsRig === false) {
        delete n.rig;
        n.children.forEach((x) => delete x.rigControlled);
      }
      return;
    }
    if (n.type === 'ellipse' && n.arc && (n.arc.ratio || Math.abs(n.arc.sweep) !== 360)) {
      const rig = {
        kind: 'ellipse',
        size: n.props['ADBE Vector Ellipse Size'],
        position: n.props['ADBE Vector Ellipse Position'],
        ...n.arc,
      };
      if (n.pushAsRig || (Math.abs(n.arc.sweep) >= 359.999 && n.arc.ratio)) {
        n.type = 'group';
        n.matchName = D.K.group;
        n.props = {};
        n.rig = rig;
        updateRig(n);
        if (!n.pushAsRig) delete n.rig;
      }
      return;
    }
    const line = lineInfo(n);
    if (line && n.pushAsRig) n.rigControlled = true;
    if (line && !n.pushAsRig) {
      delete n.rig;
      delete n.rigControlled;
    }
    if (line && n.pushAsRig)
      n.rig = { ...n.rig, kind: 'line', position: xy(line.start), length: line.length, angle: line.angle };
  }
  function updateRig(n) {
    const r = n.rig;
    if (r.kind !== 'ellipse') return;
    const p = arcPath(r.position, r.size, r.start, r.sweep, r.ratio),
      paths = p.children
        ? p.removeChildren()
        : [p, new P.Path({ segments: [[0, 0]], closed: true, insert: false })];
    n.children = paths.map((p, i) => {
      const child = n.children[i] || D.node('path', i ? 'Inner arc' : 'Outer arc');
      G.setPath(child, p);
      child.rigControlled = !!n.pushAsRig;
      return child;
    });
  }
  g.LiveShapes = {
    arcPath,
    lineInfo,
    circleInfo,
    ellipse,
    setArc,
    rounded,
    recognizeCorners,
    corners,
    setCorner,
    fields,
    prepare,
    updateRig,
  };
})(window);
