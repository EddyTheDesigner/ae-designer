(function (g) {
  'use strict';
  const D = DM,
    G = Geometry,
    P = paper;
  const modes = [
    'normal',
    'dissolve',
    'normal',
    'darken',
    'multiply',
    'color-burn',
    'color-burn',
    'darken',
    'add',
    'lighten',
    'screen',
    'color-dodge',
    'add',
    'lighten',
    'overlay',
    'soft-light',
    'hard-light',
    'hard-light',
    'hard-light',
    'hard-light',
    'normal',
    'difference',
    'exclusion',
    'subtract',
    'divide',
    'hue',
    'saturation',
    'color',
    'luminosity',
  ];
  function blend(n) {
    return n.blendName
      ? n.blendName.toLowerCase().replace(/_/g, '-')
      : modes[(n.props?.['ADBE Vector Blend Mode'] || 1) - 1] || 'normal';
  }
  function profile(stroke) {
    const q = stroke.props,
      p = 'ADBE Vector Stroke Taper/ADBE Vector Taper ',
      w = 'ADBE Vector Stroke Wave/ADBE Vector Taper ';
    return {
      width: q['ADBE Vector Stroke Width'] || 0,
      start: q[p + 'Start Length'] || 0,
      end: q[p + 'End Length'] || 0,
      startWidth: (q[p + 'Start Width'] ?? 100) / 100,
      endWidth: (q[p + 'End Width'] ?? 100) / 100,
      startEase: q[p + 'Start Ease'] || 0,
      endEase: q[p + 'End Ease'] || 0,
      units: q[p + 'Length Units'] || 1,
      wave: (q[w + 'Wave Amount'] || 0) / 100,
      phase: q[w + 'Wave Phase'] || 0,
      waveUnits: q[w + 'Wave Units'] || 1,
      wavelength: q[w + 'Wavelength'] || 100,
    };
  }
  function outline(path, stroke) {
    const q = profile(stroke),
      result = new P.CompoundPath({ insert: false }),
      paths = path.children || [path];
    paths.forEach((p) => {
      if (!p.segments || p.length < 0.001) return;
      const width = q.width / 2,
        length = p.length,
        start = q.start * (q.units === 1 ? length / 100 : 1),
        end = q.end * (q.units === 1 ? length / 100 : 1),
        samples = Math.max(8, Math.min(2048, Math.ceil(length / 1.5))),
        left = [],
        right = [],
        ease = (t, v) => Math.pow(Math.max(0, Math.min(1, t)), Math.pow(3, v / 100));
      for (let i = 0; i <= samples; i++) {
        const at = (length * i) / samples,
          point = p.getPointAt(at),
          normal = p.getNormalAt(at) || new P.Point(0, 1);
        let factor = 1;
        if (!p.closed) {
          if (start > 0 && at < start)
            factor *= q.startWidth + (1 - q.startWidth) * ease(at / start, q.startEase);
          if (end > 0 && at > length - end)
            factor *= q.endWidth + (1 - q.endWidth) * ease((length - at) / end, q.endEase);
        }
        if (q.wave) {
          const cycles = q.waveUnits === 2 ? q.wavelength : length / Math.max(0.001, q.wavelength);
          factor *=
            1 - q.wave * (0.5 + 0.5 * Math.cos((TAU() * cycles * at) / length + (q.phase * Math.PI) / 180));
        }
        const off = normal.multiply(width * factor);
        left.push(point.add(off));
        right.push(point.subtract(off));
      }
      const shape = new P.Path({ insert: false, closed: true, segments: left.concat(right.reverse()) });
      if (!p.closed && stroke.props['ADBE Vector Stroke Line Cap'] === 2) {
        const cap1 = new P.Path.Circle({
            center: p.firstSegment.point,
            radius: width * q.startWidth,
            insert: false,
          }),
          cap2 = new P.Path.Circle({
            center: p.lastSegment.point,
            radius: width * q.endWidth,
            insert: false,
          });
        const joined = shape.unite(cap1, { insert: false }).unite(cap2, { insert: false });
        if (joined.children) result.addChildren(joined.removeChildren());
        else result.addChild(joined);
      } else result.addChild(shape);
    });
    return result;
  }
  function TAU() {
    return Math.PI * 2;
  }
  function addProfile(container, item, stroke) {
    if (!stroke || stroke.visible === false) return;
    const q = profile(stroke);
    if (!q.start && !q.end && !q.wave) return;
    const out = outline(item, stroke);
    out.data = { ...item.data, profile: true };
    G.applyPaint(out, null, stroke, false);
    out.fillColor = out.strokeColor;
    out.strokeColor = null;
    out.blendMode = blend(stroke);
    item.strokeColor = null;
    container.addChild(out);
  }
  function composite(n, container, outlineMode) {
    const paints = n.children.filter(
        (c) => ['fill', 'stroke', 'gradientFill', 'gradientStroke'].includes(c.type) && c.visible !== false,
      ),
      fills = paints.filter((c) => c.type.toLowerCase().includes('fill')),
      strokes = paints.filter((c) => c.type.toLowerCase().includes('stroke'));
    if (
      outlineMode ||
      (fills.length < 2 &&
        strokes.length < 2 &&
        !paints.some((p) => (p.props['ADBE Vector Blend Mode'] || 1) !== 1))
    )
      return;
    const source = new P.CompoundPath({ insert: false });
    function collect(item, m) {
      if (item.data.profile) return;
      const local = m.clone().append(item.matrix);
      if (item instanceof P.Path) {
        const copy = item.clone({ insert: false });
        copy.matrix = new P.Matrix();
        copy.transform(local);
        source.addChild(copy);
      } else (item.children || []).forEach((c) => collect(c, local));
    }
    container.children.forEach((c) => collect(c, new P.Matrix()));
    if (!source.children.length) return;
    container.removeChildren();
    paints.forEach((paint) => {
      const item = source.clone({ insert: false }),
        stroke = paint.type.toLowerCase().includes('stroke');
      G.applyPaint(item, stroke ? null : paint, stroke ? paint : null, false);
      item.blendMode = blend(paint);
      item.data = { id: n.id };
      container.addChild(item);
      if (stroke) addProfile(container, item, paint);
    });
  }
  function dashed(path, stroke) {
    const pattern = (stroke.dashes || []).map((v) => Math.max(0.01, +v || 0.01));
    if (!pattern.length) return path;
    const out = new P.CompoundPath({ insert: false }),
      period = pattern.reduce((a, b) => a + b, 0),
      offset = (((stroke.dashOffset || 0) % period) + period) % period;
    for (const source of path.children || [path]) {
      const p = source.clone({ insert: false });
      if (p.closed) {
        const first = p.firstSegment.clone();
        p.closed = false;
        p.add(first);
      }
      let start = -offset,
        index = 0;
      while (start < p.length) {
        const end = start + pattern[index % pattern.length];
        if (index % 2 === 0 && end > 0) {
          const from = Math.max(0, start),
            to = Math.min(p.length, end);
          let segment = p.clone({ insert: false });
          if (to < segment.length) segment.splitAt(to)?.remove();
          if (from > 0) {
            const tail = segment.splitAt(from);
            segment.remove();
            segment = tail;
          }
          if (segment?.segments?.length > 1) out.addChild(segment);
        }
        start = end;
        index++;
        if (index > 20000) break;
      }
    }
    return out;
  }
  g.PaintPreview = { modes, blend, profile, outline, addProfile, composite, dashed };
})(window);
