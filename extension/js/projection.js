(function (g) {
  'use strict';
  const P = paper,
    D = DM;
  const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  function multiply(a, b) {
    const out = Array(16).fill(0);
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) out[r * 4 + c] += a[r * 4 + k] * b[k * 4 + c];
    return out;
  }
  function solve(A, b) {
    const n = b.length,
      a = A.map((row, i) => row.concat(b[i]));
    for (let c = 0; c < n; c++) {
      let pivot = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[pivot][c])) pivot = r;
      if (Math.abs(a[pivot][c]) < 1e-10) return null;
      [a[c], a[pivot]] = [a[pivot], a[c]];
      const scale = a[c][c];
      for (let j = c; j <= n; j++) a[c][j] /= scale;
      for (let r = 0; r < n; r++)
        if (r !== c) {
          const f = a[r][c];
          for (let j = c; j <= n; j++) a[r][j] -= f * a[c][j];
        }
    }
    return a.map((row) => row[n]);
  }
  function inverse(a) {
    const columns = [];
    for (let c = 0; c < 4; c++) {
      const b = [0, 0, 0, 0];
      b[c] = 1;
      const v = solve([a.slice(0, 4), a.slice(4, 8), a.slice(8, 12), a.slice(12, 16)], b);
      if (!v) return null;
      columns.push(v);
    }
    return Array.from({ length: 16 }, (_, i) => columns[i % 4][Math.floor(i / 4)]);
  }
  function transform(t) {
    t = t || D.transform();
    const position = t.position || [0, 0, 0],
      anchor = t.anchor || [0, 0, 0],
      scale = t.scale || [100, 100, 100],
      orientation = t.orientation || [0, 0, 0];
    let m = identity();
    m[3] = position[0];
    m[7] = position[1];
    m[11] = position[2] || 0;
    const rotate = (axis, degrees) => {
      const r = identity(),
        a = (degrees * Math.PI) / 180,
        c = Math.cos(a),
        s = Math.sin(a),
        i = (axis + 1) % 3,
        j = (axis + 2) % 3;
      r[i * 4 + i] = c;
      r[j * 4 + j] = c;
      r[i * 4 + j] = -s;
      r[j * 4 + i] = s;
      m = multiply(m, r);
    };
    rotate(2, t.rotation || 0);
    rotate(1, t.yRotation || 0);
    rotate(0, t.xRotation || 0);
    rotate(2, orientation[2]);
    rotate(1, orientation[1]);
    rotate(0, orientation[0]);
    const s = identity();
    s[0] = scale[0] / 100;
    s[5] = scale[1] / 100;
    s[10] = (scale[2] ?? 100) / 100;
    m = multiply(m, s);
    const a = identity();
    a[3] = -anchor[0];
    a[7] = -anchor[1];
    a[11] = -(anchor[2] || 0);
    return multiply(m, a);
  }
  function layerWorld(doc, n, base) {
    let m = identity();
    const nativeParent = n.parentId && doc.layers.find((x) => x.source?.layerId === n.parentId);
    if (nativeParent && !base) m = layerWorld(doc, nativeParent, false);
    else for (const t of n.parentTransforms3D || []) m = multiply(m, transform(t));
    return multiply(m, transform(base ? n.projection?.transform || n.transform : n.transform));
  }
  function leastSquares(A, b, size) {
    const aa = Array.from({ length: size }, () => Array(size).fill(0)),
      bb = Array(size).fill(0);
    A.forEach((row, r) => {
      for (let i = 0; i < size; i++) {
        bb[i] += row[i] * b[r];
        for (let j = 0; j < size; j++) aa[i][j] += row[i] * row[j];
      }
    });
    return solve(aa, bb);
  }
  function camera(samples) {
    const A = [],
      b = [];
    samples.forEach((s) => {
      const [x, y, z] = s.local,
        [u, v] = s.comp;
      A.push([x, y, z, 1, 0, 0, 0, 0, -u * x, -u * y, -u * z]);
      b.push(u);
      A.push([0, 0, 0, 0, x, y, z, 1, -v * x, -v * y, -v * z]);
      b.push(v);
    });
    const x = leastSquares(A, b, 11);
    return x ? x.concat(1) : null;
  }
  function plane(samples) {
    const A = [],
      b = [];
    samples
      .filter((s) => !s.local[2])
      .forEach((s) => {
        const [x, y] = s.local,
          [u, v] = s.comp;
        A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
        b.push(u);
        A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
        b.push(v);
      });
    const x = leastSquares(A, b, 8);
    return x ? x.concat(1) : null;
  }
  function mul3(a, b) {
    const out = Array(9).fill(0);
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) out[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
    return out;
  }
  function inv3(a) {
    const cols = [];
    for (let c = 0; c < 3; c++) {
      const b = [0, 0, 0];
      b[c] = 1;
      const v = solve([a.slice(0, 3), a.slice(3, 6), a.slice(6, 9)], b);
      if (!v) return null;
      cols.push(v);
    }
    return Array.from({ length: 9 }, (_, i) => cols[i % 3][Math.floor(i / 3)]);
  }
  function affine(m) {
    return [m.a, m.c, m.tx, m.b, m.d, m.ty, 0, 0, 1];
  }
  function point(h, p) {
    p = new P.Point(p);
    const d = h[6] * p.x + h[7] * p.y + h[8],
      div = Math.abs(d) < 1e-8 ? 1e-8 : d;
    return new P.Point((h[0] * p.x + h[1] * p.y + h[2]) / div, (h[3] * p.x + h[4] * p.y + h[5]) / div);
  }
  function matrix(h) {
    const origin = point(h, [0, 0]),
      x = point(h, [1, 0]).subtract(origin),
      y = point(h, [0, 1]).subtract(origin),
      m = new P.Matrix(x.x, x.y, y.x, y.y, origin.x, origin.y);
    m.homography = h.slice();
    m.transform = (p) => point(m.homography, p);
    m.inverseTransform = (p) => point(inv3(m.homography) || [1, 0, 0, 0, 1, 0, 0, 0, 1], p);
    m.clone = () => matrix(m.homography);
    const sync = () => {
      const o = point(m.homography, [0, 0]),
        x = point(m.homography, [1, 0]).subtract(o),
        y = point(m.homography, [0, 1]).subtract(o);
      m.set(x.x, x.y, y.x, y.y, o.x, o.y);
      return m;
    };
    m.append = (b) => {
      m.homography = mul3(m.homography, b.homography || affine(b));
      return sync();
    };
    m.prepend = (a) => {
      m.homography = mul3(a.homography || affine(a), m.homography);
      return sync();
    };
    m.inverted = () => matrix(inv3(m.homography) || [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    return m;
  }
  function cameraFromPlane(n, oldInverse) {
    if (!oldInverse) return null;
    const h = plane(n.projection.samples);
    if (!h) return null;
    let center = n.projection.cameraCenter;
    if (!center && n.projection.cameraTransforms?.length) {
      let world = identity();
      for (const t of n.projection.cameraTransforms) world = multiply(world, transform(t));
      center = [world[3], world[7], world[11]];
    }
    if (!center) return null;
    const c = Array.from(
      { length: 3 },
      (_, r) =>
        oldInverse[r * 4] * center[0] +
        oldInverse[r * 4 + 1] * center[1] +
        oldInverse[r * 4 + 2] * center[2] +
        oldInverse[r * 4 + 3],
    );
    if (Math.abs(c[2]) < 1e-8) return null;
    const q = [];
    for (let r = 0; r < 3; r++) {
      const x = h[r * 3],
        y = h[r * 3 + 1],
        w = h[r * 3 + 2];
      q.push(x, y, -(x * c[0] + y * c[1] + w) / c[2], w);
    }
    return q;
  }
  function rootMatrix(doc, n) {
    if (!n.projection?.samples) return null;
    let h;
    const oldInverse = inverse(layerWorld(doc, n, true)),
      projection =
        (n.projection.samples.length >= 6 ? camera(n.projection.samples) : null) ||
        cameraFromPlane(n, oldInverse),
      current = layerWorld(doc, n, false);
    if (projection && oldInverse) {
      const relative = multiply(oldInverse, current),
        q = Array(12).fill(0);
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 4; c++)
          for (let k = 0; k < 4; k++) q[r * 4 + c] += projection[r * 4 + k] * relative[k * 4 + c];
      h = [q[0], q[1], q[3], q[4], q[5], q[7], q[8], q[9], q[11]];
    } else {
      h = plane(n.projection.samples);
      if (!h) return null;
      const old = Geometry.matrix({ transform: n.projection.transform }),
        now = Geometry.matrix(n);
      h = mul3(h, affine(old.inverted().append(now)));
    }
    return matrix(h);
  }
  function projectPath(path, m) {
    if (!m.homography) {
      path.transform(m);
      return path;
    }
    if (path instanceof P.Path) {
      const original = path.clone({ insert: false });
      path.flatten(0.3);
      path.segments.forEach((s) => {
        s.point = m.transform(s.point);
        s.handleIn = [0, 0];
        s.handleOut = [0, 0];
      });
      original.remove();
      return path;
    }
    if (path instanceof P.CompoundPath) {
      path.children.forEach((p) => projectPath(p, m));
      return path;
    }
    return path;
  }
  function controls(path, m) {
    if (path instanceof P.Path) {
      path.segments.forEach((s) => {
        const p = s.point.clone(),
          a = m.transform(p.add(s.handleIn)),
          b = m.transform(p.add(s.handleOut)),
          q = m.transform(p);
        s.point = q;
        s.handleIn = a.subtract(q);
        s.handleOut = b.subtract(q);
      });
    } else (path.children || []).forEach((p) => controls(p, m));
    return path;
  }
  function render(container, m) {
    if (!m?.homography) return;
    function visit(item, parent) {
      const local = parent.clone().append(item.matrix);
      if (item instanceof P.Path) {
        item.transform(item.matrix.inverted());
        projectPath(item, local);
        return;
      }
      if (item instanceof P.PointText || item instanceof P.Raster) {
        const center = item.matrix.inverseTransform(item.position),
          p = local.transform(center),
          x = local.transform(center.add([1, 0])).subtract(p),
          y = local.transform(center.add([0, 1])).subtract(p);
        item.matrix = new P.Matrix(
          x.x,
          x.y,
          y.x,
          y.y,
          p.x - x.x * center.x - y.x * center.y,
          p.y - x.y * center.x - y.y * center.y,
        );
        return;
      }
      const children = (item.children || []).slice();
      item.matrix = new P.Matrix();
      children.forEach((c) => visit(c, local));
    }
    container.matrix = new P.Matrix();
    container.children.slice().forEach((c) => visit(c, m));
  }
  function moveLayer(doc, n, dx, dy) {
    const m = rootMatrix(doc, n);
    if (!m) return false;
    const anchor = new P.Point(n.transform.anchor),
      at = m.transform(anchor),
      target = m.inverseTransform(at.add([dx, dy])),
      local = target.subtract(anchor),
      rotation = transform({ ...n.transform, position: [0, 0, 0], anchor: [0, 0, 0] });
    n.transform.position[0] += rotation[0] * local.x + rotation[1] * local.y;
    n.transform.position[1] += rotation[4] * local.x + rotation[5] * local.y;
    if (n.threeD)
      n.transform.position[2] =
        (n.transform.position[2] || 0) + rotation[8] * local.x + rotation[9] * local.y;
    delete n.transform.matrix;
    return true;
  }
  function unparent(doc, n) {
    const m = layerWorld(doc, n, false),
      u = [m[0], m[4], m[8]],
      v = [m[1], m[5], m[9]],
      sx = Math.hypot(...u);
    if (sx < 1e-9) return null;
    for (let i = 0; i < 3; i++) u[i] /= sx;
    const shear = u.reduce((s, x, i) => s + x * v[i], 0);
    for (let i = 0; i < 3; i++) v[i] -= u[i] * shear;
    const sy = Math.hypot(...v);
    if (sy < 1e-9) return null;
    for (let i = 0; i < 3; i++) v[i] /= sy;
    const w = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]],
      y = Math.asin(Math.max(-1, Math.min(1, -u[2]))),
      gimbal = Math.abs(Math.cos(y)) < 1e-8;
    const t = {
      ...D.transform(),
      position: [m[3], m[7], m[11]],
      anchor: [0, 0, 0],
      scale: [sx * 100, sy * 100, 100],
      orientation: [0, 0, 0],
      xRotation: ((gimbal ? 0 : Math.atan2(v[2], w[2])) * 180) / Math.PI,
      yRotation: (y * 180) / Math.PI,
      rotation: ((gimbal ? Math.atan2(-v[0], v[1]) : Math.atan2(u[1], u[0])) * 180) / Math.PI,
      opacity: n.transform.opacity,
    };
    return { transform: t, residual: new P.Matrix(1, 0, shear / sx, 1, 0, 0) };
  }
  g.Projection = {
    rootMatrix,
    unparent,
    matrix,
    render,
    projectPath,
    controls,
    moveLayer,
    transform,
    multiply,
    inverse,
    layerWorld,
  };
})(window);
