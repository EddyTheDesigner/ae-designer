(function (g) {
  'use strict';
  const D = DM,
    G = Geometry,
    P = paper,
    images = new Map();
  function hydrate(doc) {
    D.walk(doc.layers, (n) => {
      if (n.previewFile && window.cep?.fs) {
        const read = window.cep.fs.readFile(n.previewFile, 'Base64');
        if (read.err === 0) {
          n.preview = n.preview || {};
          n.preview.data = 'data:image/png;base64,' + read.data;
          window.cep.fs.deleteFile(n.previewFile);
        }
        delete n.previewFile;
      }
    });
  }
  function source(e, n, container) {
    if (n.layerKind !== 'other' || !n.preview) return;
    const p = n.preview;
    if (p.color) {
      const rect = new P.Path.Rectangle({
        rectangle: new P.Rectangle(0, 0, p.width, p.height),
        insert: false,
        fillColor: p.color,
      });
      rect.data = { id: n.id };
      container.addChild(rect);
    } else if (p.data) {
      let image = images.get(p.data);
      if (!image) {
        image = new Image();
        images.set(p.data, image);
        image.onload = () => e.renderCanvas();
        image.src = p.data;
      }
      if (image.complete && image.naturalWidth) {
        const raster = new P.Raster({ image: image, insert: false });
        raster.position = [p.width / 2, p.height / 2];
        raster.scale(p.width / raster.width, p.height / raster.height);
        raster.data = { id: n.id };
        container.addChild(raster);
      }
    }
  }
  function canvasPath(ctx, path) {
    const paths = path.children || [path];
    ctx.beginPath();
    paths.forEach((p) => {
      if (!p.segments?.length) return;
      const ss = p.segments;
      ctx.moveTo(ss[0].point.x, ss[0].point.y);
      for (let i = 1; i <= ss.length; i++) {
        if (i === ss.length && !p.closed) break;
        const a = ss[i - 1],
          b = ss[i % ss.length],
          c1 = a.point.add(a.handleOut),
          c2 = b.point.add(b.handleIn);
        ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.point.x, b.point.y);
      }
      if (p.closed) ctx.closePath();
    });
  }
  function apply(e, n, container) {
    const masks = n.children.filter(
      (x) => x.type === 'mask' && x.visible !== false && x.mask?.mode !== 'none',
    );
    if (!masks.length) return;
    if (n.layerKind === 'shape') {
      masks.forEach((m) => {
        const path = G.pathOf(m);
        path.fillColor = new P.Color(0.5, 0.5, 0.5, 0.22);
        path.strokeColor = null;
        path.data = { id: m.id };
        container.addChild(path);
      });
      return;
    }
    if (!container.children.length) return;
    const saved = container.matrix.clone();
    container.matrix = new P.Matrix();
    const bounds = container.bounds.clone();
    if (bounds.width < 0.01 || bounds.height < 0.01) {
      container.matrix = saved;
      return;
    }
    const scale = Math.max(0.25, Math.min(2, 2048 / Math.max(bounds.width, bounds.height))),
      width = Math.max(1, Math.ceil(bounds.width * scale)),
      height = Math.max(1, Math.ceil(bounds.height * scale));
    const raster = container.rasterize({ resolution: 72 * scale, insert: false }),
      content = document.createElement('canvas');
    content.width = width;
    content.height = height;
    const ctx = content.getContext('2d');
    ctx.drawImage(raster.canvas, 0, 0, width, height);
    raster.remove();
    const alpha = document.createElement('canvas');
    alpha.width = width;
    alpha.height = height;
    const ac = alpha.getContext('2d');
    if (masks[0].mask.mode !== 'add' && masks[0].mask.mode !== 'lighten') {
      ac.fillStyle = '#fff';
      ac.fillRect(0, 0, width, height);
    }
    masks.forEach((m) => {
      let path = G.pathOf(m);
      const expansion = m.props['ADBE Mask Offset'] || 0;
      if (expansion) path = G.offset(path, expansion, 'round');
      const temp = document.createElement('canvas');
      temp.width = width;
      temp.height = height;
      const tc = temp.getContext('2d'),
        feather = m.props['ADBE Mask Feather'] || [0, 0],
        blurX = (Math.max(0, feather[0]) * scale) / 2,
        blurY = (Math.max(0, feather[1]) * scale) / 2;
      tc.fillStyle = '#fff';
      if (m.mask.inverted) {
        tc.fillRect(0, 0, width, height);
        tc.globalCompositeOperation = 'destination-out';
      }
      tc.setTransform(scale, 0, 0, scale, -bounds.x * scale, -bounds.y * scale);
      canvasPath(tc, path);
      tc.fill('nonzero');
      if (blurX || blurY) featherCanvas(tc, width, height, blurX, blurY);
      ac.globalAlpha = (m.props['ADBE Mask Opacity'] ?? 100) / 100;
      ac.globalCompositeOperation =
        {
          add: 'source-over',
          subtract: 'destination-out',
          intersect: 'destination-in',
          lighten: 'source-over',
          darken: 'multiply',
          difference: 'xor',
        }[m.mask.mode] || 'source-over';
      ac.drawImage(temp, 0, 0);
    });
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(alpha, 0, 0);
    container.removeChildren();
    const masked = new P.Raster({ image: content, insert: false });
    masked.position = bounds.center;
    masked.scale(bounds.width / masked.width, bounds.height / masked.height);
    masked.data = { id: n.id };
    container.addChild(masked);
    container.matrix = saved;
  }
  function featherCanvas(ctx, width, height, sx, sy) {
    const data = ctx.getImageData(0, 0, width, height),
      pixels = data.data;
    let a = new Float32Array(width * height),
      b = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) a[i] = pixels[i * 4 + 3];
    const boxes = (sigma) => {
      const ideal = Math.sqrt(4 * sigma * sigma + 1),
        lo = Math.max(1, Math.floor(ideal) | 1),
        hi = lo + 2,
        count = Math.round((12 * sigma * sigma - 3 * lo * lo - 12 * lo - 9) / (-4 * lo - 4));
      return Array.from({ length: 3 }, (_, i) => ((i < count ? lo : hi) - 1) / 2);
    };
    const pass = (radius, horizontal) => {
      if (!radius) return;
      const lines = horizontal ? height : width,
        length = horizontal ? width : height,
        step = horizontal ? 1 : width,
        div = radius * 2 + 1;
      for (let line = 0; line < lines; line++) {
        const base = horizontal ? line * width : line;
        let sum = 0;
        for (let j = -radius; j <= radius; j++) sum += a[base + Math.max(0, Math.min(length - 1, j)) * step];
        for (let i = 0; i < length; i++) {
          b[base + i * step] = sum / div;
          sum +=
            a[base + Math.min(length - 1, i + radius + 1) * step] - a[base + Math.max(0, i - radius) * step];
        }
      }
      [a, b] = [b, a];
    };
    boxes(sx).forEach((r) => pass(r, true));
    boxes(sy).forEach((r) => pass(r, false));
    for (let i = 0; i < a.length; i++) {
      pixels[i * 4] = pixels[i * 4 + 1] = pixels[i * 4 + 2] = 255;
      pixels[i * 4 + 3] = a[i];
    }
    ctx.putImageData(data, 0, 0);
  }
  g.Masks = { hydrate, source, apply, featherCanvas };
})(window);
