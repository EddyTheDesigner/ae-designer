/* Geometry is evaluated independently of AE. Paper.js does Bezier topology;
   Clipper does robust polygon offsets of flattened curves. */
(function (g) {
  'use strict';
  const D = DM,
    P = paper;
  function matrix(n) {
    const t = n.transform || D.transform();
    if (t.matrix) return new P.Matrix(t.matrix);
    const m = new P.Matrix();
    m.translate(t.position);
    m.rotate(t.rotation);
    if (t.skew) {
      m.rotate(t.skewAxis || 0);
      m.shear(-Math.tan((t.skew * Math.PI) / 180), 0);
      m.rotate(-(t.skewAxis || 0));
    }
    m.scale(t.scale[0] / 100, t.scale[1] / 100);
    m.translate([-t.anchor[0], -t.anchor[1]]);
    return m;
  }
  function parentSpace(doc, n) {
    const native = n.parentId && doc.layers.find((x) => x.source && x.source.layerId === n.parentId);
    return native ? world(doc, native) : new P.Matrix(n.parentMatrix || [1, 0, 0, 1, 0, 0]);
  }
  function world(doc, n) {
    const parents = D.ancestors(doc, n.id).reverse(),
      chain = parents.concat([n]),
      root = chain[0],
      projection = window.Projection && Projection.rootMatrix(doc, root),
      m = projection || parentSpace(doc, root);
    (projection ? chain.slice(1) : chain).forEach((x) => m.append(matrix(x)));
    return m;
  }
  function pathOf(n) {
    const q = n.props;
    let item;
    const pt = (v) => new P.Point(v);
    if (n.type === 'rect') {
      const s = q['ADBE Vector Rect Size'] || [100, 100],
        p = q['ADBE Vector Rect Position'] || [0, 0],
        r = Math.min(q['ADBE Vector Rect Roundness'] || 0, s[0] / 2, s[1] / 2);
      item = new P.Path.Rectangle({
        rectangle: new P.Rectangle(p[0] - s[0] / 2, p[1] - s[1] / 2, s[0], s[1]),
        radius: r,
        insert: false,
      });
    } else if (n.type === 'ellipse') {
      const s = q['ADBE Vector Ellipse Size'] || [100, 100],
        p = q['ADBE Vector Ellipse Position'] || [0, 0];
      item = new P.Path.Ellipse({ center: p, size: s, insert: false });
      if (n.arc && (n.arc.sweep !== 360 || n.arc.ratio)) {
        item = LiveShapes.arcPath(p, s, n.arc.start, n.arc.sweep, n.arc.ratio);
      }
    } else if (n.type === 'star') {
      const center = new P.Point(q['ADBE Vector Star Position'] || [0, 0]),
        star = q['ADBE Vector Star Type'] !== 2,
        count = Math.max(star ? 2 : 3, +q['ADBE Vector Star Points'] || 5),
        outer = Math.max(0, +q['ADBE Vector Star Outer Radius'] || 0),
        inner = Math.max(0, q['ADBE Vector Star Inner Radius'] ?? outer / 2),
        total = star ? count * 2 : count,
        step = (2 * Math.PI) / total,
        rotation = (((q['ADBE Vector Star Rotation'] || 0) - 90) * Math.PI) / 180;
      item = new P.Path({ insert: false, closed: true });
      for (let i = 0; i < Math.ceil(total); i++) {
        const isInner = star && i % 2 === 1,
          r = isInner ? inner : outer,
          angle = rotation + i * step,
          roundness =
            (q[isInner ? 'ADBE Vector Star Inner Roundess' : 'ADBE Vector Star Outer Roundess'] || 0) / 100,
          point = center.add([r * Math.cos(angle), r * Math.sin(angle)]),
          factor = star ? 0.47829 : 0.25,
          len = ((2 * Math.PI * r) / count) * roundness * factor,
          tangent = new P.Point(-Math.sin(angle) * len, Math.cos(angle) * len);
        item.add(new P.Segment(point, tangent.negate(), tangent));
      }
    } else if (n.type === 'path' || n.type === 'mask') {
      const s = q[n.type === 'mask' ? 'ADBE Mask Shape' : 'ADBE Vector Shape'];
      if (!s) return new P.Path({ insert: false });
      item = new P.Path({
        insert: false,
        closed: s.closed,
        segments: s.vertices.map(
          (v, i) => new P.Segment(v, s.inTangents[i] || [0, 0], s.outTangents[i] || [0, 0]),
        ),
      });
    } else if (n.type === 'text') item = TextEditor.pathOf(n);
    else return null;
    if (q['ADBE Vector Shape Direction'] === 3 && item.reverse) item.reverse();
    return item;
  }
  function toShape(item) {
    return {
      vertices: item.segments.map((s) => [s.point.x, s.point.y]),
      inTangents: item.segments.map((s) => [s.handleIn.x, s.handleIn.y]),
      outTangents: item.segments.map((s) => [s.handleOut.x, s.handleOut.y]),
      closed: item.closed,
    };
  }
  function setPath(n, item) {
    const isMask = n.type === 'mask',
      meta = n.meta || {};
    n.type = isMask ? 'mask' : 'path';
    n.matchName = isMask ? 'ADBE Mask Atom' : D.K.path;
    n.props = isMask
      ? { ...n.props, 'ADBE Mask Shape': toShape(item) }
      : { 'ADBE Vector Shape': toShape(item) };
    n.transform = D.transform();
    n.meta = meta;
  }
  function color(v, opacity) {
    const c = new P.Color(v || [0, 0, 0]);
    c.alpha = (opacity == null ? 100 : opacity) / 100;
    return c;
  }
  function applyPaint(item, fill, stroke, outline) {
    if (outline) {
      item.fillColor = null;
      item.strokeColor = '#aaaaaa';
      item.strokeWidth = 1 / paper.view.zoom;
      item.strokeScaling = false;
      return;
    }
    item.fillColor =
      fill && fill.visible
        ? color(
            fill.props['ADBE Vector Fill Color'] || fill.props['ADBE Vector Grad Colors'] || [0.65, 0.5, 0.9],
            fill.props['ADBE Vector Fill Opacity'],
          )
        : null;
    item.strokeColor =
      stroke && stroke.visible
        ? color(
            stroke.props['ADBE Vector Stroke Color'] || [0.1, 0.1, 0.1],
            stroke.props['ADBE Vector Stroke Opacity'],
          )
        : null;
    [fill, stroke].forEach((n, i) => {
      if (!n || !n.visible || !n.gradient) return;
      const grad = n.gradient;
      const c = new P.Color({
        gradient: {
          stops: Gradients.paperStops(
            Gradients.normalize(n),
            n.props[i ? 'ADBE Vector Stroke Opacity' : 'ADBE Vector Fill Opacity'] ?? 100,
          ),
          radial: grad.type === 'radial',
        },
        origin: grad.start,
        destination: grad.end,
      });
      if (grad.type === 'radial' && grad.highlight) {
        const delta = new P.Point(grad.end).subtract(new P.Point(grad.start));
        delta.angle += grad.highlightAngle || 0;
        c.highlight = new P.Point(grad.start).add(
          delta.multiply(Math.max(-0.99, Math.min(0.99, grad.highlight / 100))),
        );
      }
      if (i) item.strokeColor = c;
      else item.fillColor = c;
    });
    if (stroke) {
      item.strokeWidth = stroke.props['ADBE Vector Stroke Width'] || 0;
      item.strokeCap = ['butt', 'round', 'square'][(stroke.props['ADBE Vector Stroke Line Cap'] || 1) - 1];
      item.strokeJoin = ['miter', 'round', 'bevel'][(stroke.props['ADBE Vector Stroke Line Join'] || 1) - 1];
      item.miterLimit = stroke.props['ADBE Vector Stroke Miter Limit'] || 4;
      item.dashArray = stroke.dashes || [];
      item.dashOffset = stroke.dashOffset || 0;
    }
    if (fill) item.fillRule = fill.props['ADBE Vector Fill Rule'] === 2 ? 'evenodd' : 'nonzero';
  }
  function offset(item, amount, join, outline, cap, miter) {
    const copy = item.clone({ insert: false });
    copy.flatten(0.35);
    const scale = 1000;
    const paths = (copy.children || [copy]).map((p) =>
      p.segments.map((s) => ({ X: Math.round(s.point.x * scale), Y: Math.round(s.point.y * scale) })),
    );
    const C = ClipperLib,
      co = new C.ClipperOffset(miter || 4, 0.25 * scale),
      solution = new C.Paths();
    paths.forEach((p, i) =>
      co.AddPath(
        p,
        join === 'round' ? C.JoinType.jtRound : join === 'bevel' ? C.JoinType.jtSquare : C.JoinType.jtMiter,
        outline
          ? (copy.children ? copy.children[i].closed : copy.closed)
            ? C.EndType.etClosedLine
            : cap === 1
              ? C.EndType.etOpenButt
              : cap === 3
                ? C.EndType.etOpenSquare
                : C.EndType.etOpenRound
          : C.EndType.etClosedPolygon,
      ),
    );
    co.Execute(solution, amount * scale);
    const out = new P.CompoundPath({ insert: false });
    solution.forEach((p) =>
      out.addChild(
        new P.Path({ segments: p.map((s) => [s.X / scale, s.Y / scale]), closed: true, insert: false }),
      ),
    );
    return out.children.length === 1 ? out.removeChildren()[0] : out;
  }
  function roundCorners(item, radius) {
    if (radius <= 0) return item;
    const src = item.segments,
      out = new P.Path({ closed: item.closed, insert: false });
    src.forEach((s, i) => {
      if ((!item.closed && (i === 0 || i === src.length - 1)) || s.handleIn.length || s.handleOut.length) {
        out.add(s.clone());
        return;
      }
      const a = src[(i + src.length - 1) % src.length].point.subtract(s.point),
        b = src[(i + 1) % src.length].point.subtract(s.point),
        r = Math.min(radius, a.length / 2, b.length / 2),
        p1 = s.point.add(a.normalize(r)),
        p2 = s.point.add(b.normalize(r));
      const f = 0.55228475;
      out.add(new P.Segment(p1, null, s.point.subtract(p1).multiply(f)));
      out.add(new P.Segment(p2, s.point.subtract(p2).multiply(f), null));
    });
    return out;
  }
  function transformSelection(doc, ids, m, options) {
    options = options || {};
    const paints = new Set(),
      factor = Math.sqrt(Math.abs(m.determinant));
    D.roots(doc, ids).forEach((n) => {
      if (n.projection) {
        const mapping = Projection.rootMatrix(doc, n),
          anchor = mapping.transform(n.transform.anchor),
          desired = m.transform(anchor),
          d = m.decompose();
        n.transform.rotation += d.rotation;
        n.transform.scale[0] *= d.scaling.x;
        n.transform.scale[1] *= d.scaling.y;
        Projection.moveLayer(doc, n, desired.x - anchor.x, desired.y - anchor.y);
        return;
      }
      const par = D.parent(doc, n.id),
        pm = par ? world(doc, par) : parentSpace(doc, n),
        local = pm.inverted().append(m).append(pm).append(matrix(n));
      if (['layer', 'group', 'text'].includes(n.type)) {
        ['position', 'rotation', 'scale', 'skew'].forEach((k) => {
          if (n.meta && n.meta['transform.' + k] && n.meta['transform.' + k].expression)
            throw Error(k + ' is expression-driven.');
        });
        storeMatrix(n, local);
        if (!options.scaleCorners && factor > 1e-8)
          D.walk([n], (x) => {
            if (x.type === 'rect' && x.props['ADBE Vector Rect Roundness'])
              x.props['ADBE Vector Rect Roundness'] /= factor;
          });
        if (!options.scaleStrokes && factor > 1e-8)
          D.walk([n], (x) => {
            if ((x.type === 'stroke' || x.type === 'gradientStroke') && !paints.has(x.id)) {
              paints.add(x.id);
              x.props['ADBE Vector Stroke Width'] /= factor;
            }
          });
      } else if (D.isShape(n)) {
        if (['rect', 'ellipse'].includes(n.type) && Math.abs(local.b) < 1e-8 && Math.abs(local.c) < 1e-8) {
          const key = 'ADBE Vector ' + (n.type === 'rect' ? 'Rect' : 'Ellipse'),
            v = local.transform(new P.Point(n.props[key + ' Position']));
          D.set(n, key + ' Position', [v.x, v.y]);
          D.set(n, key + ' Size', [
            Math.abs(n.props[key + ' Size'][0] * local.a),
            Math.abs(n.props[key + ' Size'][1] * local.d),
          ]);
          if (n.type === 'rect' && options.scaleCorners)
            D.set(n, key + ' Roundness', (n.props[key + ' Roundness'] || 0) * factor);
          n.transform = D.transform();
        } else {
          const p = pathOf(n);
          if (local.homography) Projection.projectPath(p, local);
          else p.transform(local);
          setPath(n, p);
        }
        if (options.scaleStrokes) {
          const stroke = D.paints(doc, n).stroke;
          if (stroke && !paints.has(stroke.id)) {
            paints.add(stroke.id);
            D.set(stroke, 'ADBE Vector Stroke Width', stroke.props['ADBE Vector Stroke Width'] * factor);
          }
        }
      }
    });
  }
  function move(doc, ids, dx, dy) {
    D.roots(doc, ids).forEach((n) => {
      if (n.projection && Projection.moveLayer(doc, n, dx, dy)) return;
      const p = D.parent(doc, n.id),
        pm = p ? world(doc, p) : parentSpace(doc, n),
        a = pm.inverseTransform(new P.Point(dx, dy)).subtract(pm.inverseTransform(new P.Point(0, 0)));
      if (n.type === 'rect' || n.type === 'ellipse' || n.type === 'star') {
        const k = 'ADBE Vector ' + { rect: 'Rect', ellipse: 'Ellipse', star: 'Star' }[n.type] + ' Position';
        D.set(n, k, [n.props[k][0] + a.x, n.props[k][1] + a.y]);
      } else if (n.type === 'path' || n.type === 'mask') {
        const k = n.type === 'mask' ? 'ADBE Mask Shape' : 'ADBE Vector Shape',
          v = D.clone(n.props[k]);
        v.vertices = v.vertices.map((p) => [p[0] + a.x, p[1] + a.y]);
        D.set(n, k, v);
      } else {
        if (n.meta && n.meta['transform.position'] && n.meta['transform.position'].expression)
          throw Error('Position is expression-driven.');
        if (n.transform.matrix) {
          n.transform.matrix[4] += a.x;
          n.transform.matrix[5] += a.y;
        }
        n.transform.position[0] += a.x;
        n.transform.position[1] += a.y;
      }
    });
  }
  function boolean(items, operation) {
    let result = items[0].clone({ insert: false });
    for (let i = 1; i < items.length; i++) {
      const next = result[operation](items[i], { insert: false });
      result.remove();
      result = next;
    }
    return result;
  }
  function bounds(doc, ids) {
    function tree(n) {
      let item = n.preview
        ? new P.Path.Rectangle({
            rectangle: new P.Rectangle(0, 0, n.preview.width, n.preview.height),
            insert: false,
          })
        : pathOf(n);
      if (!item) {
        item = new P.Group({ insert: false });
        (n.children || [])
          .filter((x) => x.visible !== false && (D.isShape(x) || ['group', 'text'].includes(x.type)))
          .forEach((c) => item.addChild(tree(c)));
        if (window.Operators) Operators.preview(n, item, doc.time);
      }
      item.transform(matrix(n));
      return item;
    }
    let b = null;
    D.roots(doc, ids).forEach((n) => {
      const item = tree(n),
        parent = D.parent(doc, n.id),
        m = parent ? world(doc, parent) : parentSpace(doc, n);
      if (n.projection) {
        item.transform(matrix(n).inverted());
        Projection.render(item, Projection.rootMatrix(doc, n));
      } else if (m.homography) {
        if (item instanceof P.Path || item instanceof P.CompoundPath) Projection.projectPath(item, m);
        else Projection.render(item, m);
      } else item.transform(m);
      if (!item.isEmpty()) {
        b = b ? b.unite(item.bounds) : item.bounds.clone();
      }
      item.remove();
    });
    return b;
  }
  function storeMatrix(n, m) {
    const d = m.decompose(),
      a = (n.transform.anchor || [0, 0]).slice(),
      pos = m.transform(new P.Point(a));
    n.transform = {
      ...n.transform,
      matrix: m.values,
      position: [pos.x, pos.y].concat((n.transform.position || []).slice(2)),
      anchor: a,
      scale: [d.scaling.x * 100, d.scaling.y * 100].concat((n.transform.scale || []).slice(2)),
      rotation: d.rotation,
      skew: -d.skewing.x,
      skewAxis: 0,
    };
  }
  function prepareDocument(doc, asNew) {
    const copy = D.clone(doc);
    copy.transferWarnings = [];
    copy.layers.forEach((n, i) => {
      const original = doc.layers[i];
      if (asNew && (n.parentId || n.parentMatrix)) {
        if (
          window.Projection &&
          (n.projection || n.threeD || n.parentTransforms3D?.some((t) => t.position?.length === 3))
        ) {
          const baked = Projection.unparent(doc, original);
          if (baked) {
            n.transform = baked.transform;
            n.threeD = true;
            if (!baked.residual.isIdentity()) {
              if (n.layerKind === 'shape') {
                const group = D.node('group', 'Parent transform');
                storeMatrix(group, baked.residual);
                group.children = n.children.filter((x) => x.type !== 'mask');
                n.children = n.children.filter((x) => x.type === 'mask');
                n.children.forEach((mask) => {
                  const p = pathOf(mask);
                  p.transform(baked.residual);
                  setPath(mask, p);
                });
                n.children.unshift(group);
              } else
                copy.transferWarnings.push(
                  n.name + ': parent shear requires text outlines for an exact new-layer transfer.',
                );
            }
          } else
            copy.transferWarnings.push(n.name + ': a zero-scale parent prevents recovering its 3D plane.');
        } else storeMatrix(n, world(doc, original));
        delete n.parentId;
        delete n.parentMatrix;
        delete n.parentTransforms3D;
        delete n.projection;
      }
      if (n.layerKind === 'shape' && Math.abs(n.transform.skew || 0) > 1e-8 && !n.threeD) {
        const desired = matrix(n);
        delete n.transform.matrix;
        n.transform.skew = 0;
        const remaining = matrix(n).inverted().append(desired),
          wrapper = D.node('group', 'Artwork');
        storeMatrix(wrapper, remaining);
        wrapper.children = n.children.filter((x) => x.type !== 'mask');
        n.children = n.children.filter((x) => x.type === 'mask');
        n.children.forEach((mask) => {
          const p = pathOf(mask);
          p.transform(remaining);
          setPath(mask, p);
        });
        n.children.unshift(wrapper);
      } else if (n.type === 'text' && Math.abs(n.transform.skew || 0) > 1e-8)
        copy.transferWarnings.push(
          n.name + ': layer shear cannot be carried to native text; convert text to shapes first.',
        );
    });
    D.walk(copy.layers, (n) => {
      if (window.LiveShapes) LiveShapes.prepare(n);
      if (n.transform.matrix) {
        const m = new P.Matrix(n.transform.matrix);
        if (D.isShape(n)) {
          const p = pathOf(n);
          p.transform(m);
          setPath(n, p);
        } else {
          storeMatrix(n, m);
          delete n.transform.matrix;
        }
      }
      if (n.type === 'ellipse' && n.arc && (n.arc.sweep !== 360 || n.arc.ratio)) {
        setPath(n, pathOf(n));
      }
      if (n.dashes) {
        Object.keys(n.props)
          .filter((k) => k.startsWith('ADBE Vector Stroke Dashes/'))
          .forEach((k) => delete n.props[k]);
        n.dashes.forEach(
          (v, i) =>
            (n.props[
              'ADBE Vector Stroke Dashes/ADBE Vector Stroke ' +
                (i % 2 ? 'Gap ' : 'Dash ') +
                (Math.floor(i / 2) + 1)
            ] = v),
        );
        if (n.dashOffset != null && (n.dashes.length || n.dashOffset))
          n.props['ADBE Vector Stroke Dashes/ADBE Vector Stroke Offset'] = n.dashOffset;
      }
    });
    return copy;
  }
  g.Geometry = {
    matrix,
    parentSpace,
    world,
    pathOf,
    toShape,
    setPath,
    color,
    applyPaint,
    offset,
    roundCorners,
    transformSelection,
    move,
    boolean,
    bounds,
    storeMatrix,
    prepareDocument,
  };
})(window);
