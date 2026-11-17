/* Gradient stops are independent color/opacity tracks, as in After Effects. */
(function (g) {
  'use strict';
  const D = DM;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  function normalize(n) {
    const v =
      n.gradient ||
      (n.gradient = {
        type: 'linear',
        start: [-50, 0],
        end: [50, 0],
        stops: [
          { position: 0, color: '#000000', midpoint: 0.5 },
          { position: 1, color: '#ffffff', midpoint: 0.5 },
        ],
      });
    if (!v.alphaStops)
      v.alphaStops = v.stops.map((s) => ({
        position: s.position,
        opacity: s.opacity == null ? 100 : s.opacity,
        midpoint: 0.5,
      }));
    v.stops.forEach((s) => {
      if (s.midpoint == null) s.midpoint = 0.5;
    });
    v.alphaStops.forEach((s) => {
      if (s.midpoint == null) s.midpoint = 0.5;
    });
    if (v.highlight == null) v.highlight = 0;
    if (v.highlightAngle == null) v.highlightAngle = 0;
    return v;
  }
  function ramp(stops, at, get) {
    if (at <= stops[0].position) return get(stops[0]);
    if (at >= stops[stops.length - 1].position) return get(stops[stops.length - 1]);
    const i = stops.findIndex((s) => s.position >= at),
      a = stops[i - 1],
      b = stops[i];
    let t = (at - a.position) / Math.max(1e-9, b.position - a.position),
      mid = clamp(a.midpoint == null ? 0.5 : a.midpoint, 0.0001, 0.9999);
    // AE midpoint is the half-color location, not a second stop.
    t = Math.pow(t, Math.log(0.5) / Math.log(mid));
    const x = get(a),
      y = get(b);
    return Array.isArray(x) ? x.map((v, i) => v + (y[i] - v) * t) : x + (y - x) * t;
  }
  function sample(v, at) {
    return {
      rgb: ramp(v.stops, at, (s) => s.rgb || D.rgb(s.color)),
      alpha: ramp(
        v.alphaStops || [
          { position: 0, opacity: 100 },
          { position: 1, opacity: 100 },
        ],
        at,
        (s) => s.opacity / 100,
      ),
    };
  }
  function paperStops(v, opacity = 100) {
    const positions = new Set([0, 1]);
    [v.stops, v.alphaStops || []].forEach((a) =>
      a.forEach((s, i) => {
        positions.add(s.position);
        if (a[i + 1])
          for (let j = 1; j < 16; j++)
            positions.add(s.position + ((a[i + 1].position - s.position) * j) / 16);
      }),
    );
    return [...positions]
      .sort((a, b) => a - b)
      .map((at) => {
        const s = sample(v, at),
          c = new paper.Color(s.rgb);
        c.alpha = (s.alpha * opacity) / 100;
        return [c, at];
      });
  }
  function native(v) {
    return {
      schemaVersion: 1,
      colorStops: v.stops.map((s) => ({
        offset: s.position,
        midpoint: s.midpoint == null ? 0.5 : s.midpoint,
        rgb: s.rgb || D.rgb(s.color),
        extra: s.extra || 0,
      })),
      alphaStops: (
        v.alphaStops || [
          { position: 0, opacity: 100 },
          { position: 1, opacity: 100 },
        ]
      ).map((s) => ({
        offset: s.position,
        midpoint: s.midpoint == null ? 0.5 : s.midpoint,
        alpha: s.opacity / 100,
      })),
    };
  }
  function fromNative(v, props) {
    return {
      type: props['ADBE Vector Grad Type'] === 2 ? 'radial' : 'linear',
      start: props['ADBE Vector Grad Start Pt'] || [0, 0],
      end: props['ADBE Vector Grad End Pt'] || [100, 0],
      highlight: props['ADBE Vector Grad HiLite Length'] || 0,
      highlightAngle: props['ADBE Vector Grad HiLite Angle'] || 0,
      stops: v.colorStops.map((s) => ({
        position: s.offset,
        midpoint: s.midpoint,
        color: D.hex(s.rgb),
        rgb: s.rgb,
        extra: s.extra,
      })),
      alphaStops: v.alphaStops.map((s) => ({
        position: s.offset,
        midpoint: s.midpoint,
        opacity: s.alpha * 100,
      })),
    };
  }
  const bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const base64 = (b) => {
    let out = '';
    for (let i = 0; i < b.length; i += 16384)
      out += String.fromCharCode.apply(null, b.subarray(i, i + 16384));
    return btoa(out);
  };
  function hydrate(doc, known) {
    const result = [];
    if (known)
      doc.layers.forEach((layer) =>
        D.walk(layer.children, (n) => {
          const found = known.find(
            (x) =>
              x.layerId === layer.source?.layerId &&
              JSON.stringify(x.path) === JSON.stringify(n.source?.path),
          );
          if (found && !(n.meta['ADBE Vector Grad Colors'] || {}).keys) {
            n.gradient = D.clone(found.gradient);
            result.push({ id: n.id, gradient: n.gradient });
          }
        }),
      );
    if (!doc.source || !doc.source.project || doc.source.dirty || !window.cep || !window.cep.fs)
      return result;
    const nodes = [];
    D.walk(doc.layers, (n) => {
      if (!n.gradient && n.gradientDescriptor && !(n.meta['ADBE Vector Grad Colors'] || {}).keys)
        nodes.push(n);
    });
    if (!nodes.length) return result;
    const file = window.cep.fs.readFile(doc.source.project, 'Base64');
    if (file.err) return result;
    let data;
    try {
      data = bytes(file.data);
    } catch (e) {
      return result;
    }
    // Resolve independently so an unreadable gradient does not hide valid siblings.
    nodes.forEach((n) => {
      try {
        n.gradient = fromNative(
          NativeGradientCodec.resolveAepNativeGradients(data, [n.gradientDescriptor])[0],
          n.props,
        );
        result.push({ id: n.id, gradient: n.gradient });
      } catch (e) {
        n.gradientReadError = e.message;
      }
    });
    return result;
  }
  function prepare(doc, version, asNew) {
    const family = parseFloat(version) >= 26.3 ? 'ae26-3' : parseFloat(version) >= 25.6 ? 'ae25-6' : 'ae22-6';
    D.walk(doc.layers, (n) => {
      if (!n.gradient) return;
      const v = normalize(n);
      Object.assign(n.props, {
        'ADBE Vector Grad Type': v.type === 'radial' ? 2 : 1,
        'ADBE Vector Grad Start Pt': v.start,
        'ADBE Vector Grad End Pt': v.end,
        'ADBE Vector Grad HiLite Length': v.highlight,
        'ADBE Vector Grad HiLite Angle': v.highlightAngle,
      });
      if (!asNew) {
        const kind = n.type === 'gradientStroke' ? 'stroke' : 'fill';
        n.gradientPreset = base64(
          NativeGradientCodec.generateGradientFfx(bytes(GradientPresets[family][kind]), kind, native(v))
            .bytes,
        );
      }
    });
    return doc;
  }
  function reverse(v) {
    [v.stops, v.alphaStops].forEach((a) => {
      const old = D.clone(a);
      a.splice(
        0,
        a.length,
        ...old.reverse().map((s, i) => ({
          ...s,
          position: 1 - s.position,
          midpoint: i < old.length - 1 ? 1 - old[i + 1].midpoint : 0.5,
        })),
      );
    });
  }
  g.Gradients = { normalize, sample, paperStops, native, fromNative, hydrate, prepare, reverse };
})(window);
