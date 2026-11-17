/* Document model shared by the editor and the three CEP panels. No host writes here. */
(function (g) {
  'use strict';
  var serial = 0;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const uid = () => 'dm-' + Date.now().toString(36) + '-' + (++serial).toString(36);
  const K = {
    rect: 'ADBE Vector Shape - Rect',
    ellipse: 'ADBE Vector Shape - Ellipse',
    star: 'ADBE Vector Shape - Star',
    path: 'ADBE Vector Shape - Group',
    group: 'ADBE Vector Group',
    fill: 'ADBE Vector Graphic - Fill',
    stroke: 'ADBE Vector Graphic - Stroke',
    gradientFill: 'ADBE Vector Graphic - G-Fill',
    gradientStroke: 'ADBE Vector Graphic - G-Stroke',
  };
  const operators = {
    'Merge Paths': ['ADBE Vector Filter - Merge', { 'ADBE Vector Merge Type': 2 }],
    'Offset Paths': [
      'ADBE Vector Filter - Offset',
      {
        'ADBE Vector Offset Amount': 10,
        'ADBE Vector Offset Line Join': 1,
        'ADBE Vector Offset Miter Limit': 4,
      },
    ],
    'Pucker & Bloat': ['ADBE Vector Filter - PB', { 'ADBE Vector PuckerBloat Amount': 0 }],
    Repeater: [
      'ADBE Vector Filter - Repeater',
      { 'ADBE Vector Repeater Copies': 3, 'ADBE Vector Repeater Offset': 0 },
    ],
    'Round Corners': ['ADBE Vector Filter - RC', { 'ADBE Vector RoundCorner Radius': 10 }],
    'Trim Paths': [
      'ADBE Vector Filter - Trim',
      {
        'ADBE Vector Trim Start': 0,
        'ADBE Vector Trim End': 100,
        'ADBE Vector Trim Offset': 0,
        'ADBE Vector Trim Type': 1,
      },
    ],
    Twist: [
      'ADBE Vector Filter - Twist',
      { 'ADBE Vector Twist Angle': 0, 'ADBE Vector Twist Center': [0, 0] },
    ],
    'Wiggle Paths': [
      'ADBE Vector Filter - Roughen',
      {
        'ADBE Vector Roughen Size': 10,
        'ADBE Vector Roughen Detail': 10,
        'ADBE Vector Roughen Points': 1,
        'ADBE Vector Temporal Freq': 2,
        'ADBE Vector Correlation': 50,
        'ADBE Vector Temporal Phase': 0,
        'ADBE Vector Spatial Phase': 0,
        'ADBE Vector Random Seed': 0,
      },
    ],
    'Wiggle Transform': [
      'ADBE Vector Filter - Wiggler',
      {
        'ADBE Vector Temporal Freq': 2,
        'ADBE Vector Correlation': 50,
        'ADBE Vector Temporal Phase': 0,
        'ADBE Vector Spatial Phase': 0,
        'ADBE Vector Random Seed': 0,
      },
    ],
    'Zig Zag': [
      'ADBE Vector Filter - Zigzag',
      { 'ADBE Vector Zigzag Size': 5, 'ADBE Vector Zigzag Detail': 5, 'ADBE Vector Zigzag Points': 1 },
    ],
  };
  function transform() {
    return {
      position: [0, 0],
      anchor: [0, 0],
      scale: [100, 100],
      rotation: 0,
      skew: 0,
      skewAxis: 0,
      opacity: 100,
    };
  }
  function node(type, name) {
    return {
      id: uid(),
      type,
      name: name || type,
      visible: true,
      locked: false,
      props: type === 'group' ? { 'ADBE Vector Blend Mode': 1 } : {},
      ...(type === 'layer' || type === 'text' ? { blendName: 'NORMAL' } : {}),
      meta: {},
      transform: transform(),
      children: [],
      matchName: K[type] || '',
      label: 9,
    };
  }
  function paint(type, color) {
    const n = node(type, type === 'fill' ? 'Fill 1' : 'Stroke 1');
    if (type === 'fill')
      Object.assign(n.props, {
        'ADBE Vector Fill Color': color || [0.64, 0.51, 0.95],
        'ADBE Vector Fill Opacity': 100,
        'ADBE Vector Fill Rule': 1,
      });
    else
      Object.assign(n.props, {
        'ADBE Vector Stroke Color': color || [0.08, 0.08, 0.08],
        'ADBE Vector Stroke Opacity': 100,
        'ADBE Vector Stroke Width': 3,
        'ADBE Vector Stroke Line Cap': 1,
        'ADBE Vector Stroke Line Join': 1,
        'ADBE Vector Stroke Miter Limit': 4,
      });
    return n;
  }
  function shape(type, x, y, w, h, options) {
    options = options || {};
    const n = node(
      type,
      { rect: 'Rectangle', ellipse: 'Ellipse', star: 'Polystar', path: 'Path' }[type] + ' 1',
    );
    if (type === 'rect' || type === 'ellipse') {
      const p = type === 'rect' ? 'Rect' : 'Ellipse';
      n.props['ADBE Vector ' + p + ' Position'] = [x + w / 2, y + h / 2];
      n.props['ADBE Vector ' + p + ' Size'] = [Math.abs(w), Math.abs(h)];
      if (type === 'rect') n.props['ADBE Vector Rect Roundness'] = options.roundness || 0;
    }
    if (type === 'star')
      Object.assign(n.props, {
        'ADBE Vector Star Type': options.polygon ? 2 : 1,
        'ADBE Vector Star Points': options.points || 5,
        'ADBE Vector Star Position': [x, y],
        'ADBE Vector Star Rotation': 0,
        'ADBE Vector Star Outer Radius': Math.max(1, w),
        'ADBE Vector Star Inner Radius': Math.max(1, w / 2),
        'ADBE Vector Star Inner Roundess': 0,
        'ADBE Vector Star Outer Roundess': 0,
      });
    if (type === 'path')
      n.props['ADBE Vector Shape'] = {
        vertices: options.vertices || [
          [x, y],
          [x + w, y + h],
        ],
        inTangents: options.inTangents || [
          [0, 0],
          [0, 0],
        ],
        outTangents: options.outTangents || [
          [0, 0],
          [0, 0],
        ],
        closed: !!options.closed,
      };
    return n;
  }
  function walk(nodes, fn, parent) {
    (nodes || []).forEach((n) => {
      fn(n, parent);
      walk(n.children, fn, n);
    });
  }
  function index(doc) {
    const m = new Map();
    walk(doc.layers, (n, p) => m.set(n.id, { node: n, parent: p }));
    return m;
  }
  function find(doc, id) {
    let result;
    walk(doc.layers, (n) => {
      if (n.id === id) result = n;
    });
    return result;
  }
  function parent(doc, id) {
    let result;
    walk(doc.layers, (n, p) => {
      if (n.id === id) result = p;
    });
    return result;
  }
  function ancestors(doc, id) {
    const out = [];
    let p = parent(doc, id);
    while (p) {
      out.push(p);
      p = parent(doc, p.id);
    }
    return out;
  }
  function roots(doc, ids) {
    return ids
      .filter((id) => !ancestors(doc, id).some((n) => ids.includes(n.id)))
      .map((id) => find(doc, id))
      .filter(Boolean);
  }
  function remove(doc, id) {
    const p = parent(doc, id),
      list = p ? p.children : doc.layers,
      i = list.findIndex((n) => n.id === id);
    if (i >= 0) return list.splice(i, 1)[0];
  }
  function fresh(n) {
    n = clone(n);
    walk([n], (x) => {
      x.duplicateOf = x.id;
      x.id = uid();
      delete x.source;
      x.meta = {};
    });
    const match = n.name.match(/^(.*?)(?:\s+(\d+))?$/);
    n.name = match[1] + ' ' + (Number(match[2] || 0) + 1);
    return n;
  }
  function isShape(n) {
    return ['rect', 'ellipse', 'star', 'path', 'mask'].includes(n.type);
  }
  function selectedShapes(doc, ids) {
    const out = [];
    roots(doc, ids).forEach((n) =>
      walk([n], (x) => {
        if (isShape(x) || x.type === 'text') out.push(x);
      }),
    );
    return out;
  }
  function paints(doc, n) {
    let p = parent(doc, n.id),
      fill = null,
      stroke = null;
    while (p) {
      (p.children || []).forEach((c) => {
        if (!fill && (c.type === 'fill' || c.type === 'gradientFill')) fill = c;
        if (!stroke && (c.type === 'stroke' || c.type === 'gradientStroke')) stroke = c;
      });
      p = parent(doc, p.id);
    }
    return { fill, stroke };
  }
  function styleTargets(doc, ids, kind, create) {
    const result = new Map();
    roots(doc, ids).forEach((n) => {
      if (n.type.toLowerCase().endsWith(kind)) result.set(n.id, n);
      else
        walk([n], (x) => {
          if (isShape(x) && x.type !== 'mask') {
            let p = paints(doc, x)[kind];
            if (!p && create) {
              const par = parent(doc, x.id);
              p = paint(kind);
              par.children.push(p);
            }
            if (p) result.set(p.id, p);
          }
        });
    });
    return [...result.values()];
  }
  function set(n, key, value) {
    if (n.meta && n.meta[key] && n.meta[key].expression)
      throw Error('This value is driven by an After Effects expression.');
    n.props[key] = clone(value);
  }
  function blank() {
    return {
      version: 1,
      name: 'Untitled',
      width: 1920,
      height: 1080,
      background: [0.08, 0.08, 0.08],
      time: 0,
      layers: [],
      guides: [],
      source: null,
    };
  }
  class History {
    constructor(doc) {
      this.doc = doc;
      this.undoStack = [];
      this.redoStack = [];
      this.lastAction = null;
      this.selection = [];
    }
    capture() {
      return clone({ doc: this.doc, lastAction: this.lastAction, selection: this.selection });
    }
    begin() {
      return this.capture();
    }
    commit(before, label, action) {
      if (
        JSON.stringify(before.doc) === JSON.stringify(this.doc) &&
        (!action || JSON.stringify(before.lastAction) === JSON.stringify(action))
      )
        return false;
      this.undoStack.push({ ...before, label });
      if (this.undoStack.length > 100) this.undoStack.shift();
      this.redoStack = [];
      this.lastAction = action || null;
      return true;
    }
    transact(label, fn, action) {
      const before = this.begin();
      try {
        fn(this.doc);
        return this.commit(before, label, action);
      } catch (e) {
        this.doc = before.doc;
        throw e;
      }
    }
    undo() {
      if (!this.undoStack.length) return false;
      const e = this.undoStack.pop();
      this.redoStack.push(this.capture());
      this.doc = e.doc;
      this.lastAction = e.lastAction;
      this.selection = e.selection || [];
      return true;
    }
    redo() {
      if (!this.redoStack.length) return false;
      const e = this.redoStack.pop();
      this.undoStack.push(this.capture());
      this.doc = e.doc;
      this.lastAction = e.lastAction;
      this.selection = e.selection || [];
      return true;
    }
  }
  function validate(doc) {
    if (
      !doc ||
      doc.version !== 1 ||
      !Array.isArray(doc.layers) ||
      !(doc.width > 0 && doc.width <= 30000 && doc.height > 0 && doc.height <= 30000)
    )
      throw Error('Invalid AE Designer document.');
    const ids = new Set();
    let count = 0;
    walk(doc.layers, (n) => {
      if (++count > 50000) throw Error('Document has too many items.');
      if (!n.id || ids.has(n.id) || !Array.isArray(n.children) || !n.props) throw Error('Invalid hierarchy.');
      ids.add(n.id);
    });
    return doc;
  }
  const hex = (a) =>
    '#' +
    a
      .slice(0, 3)
      .map((x) =>
        Math.round(Math.max(0, Math.min(1, x)) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('');
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const API = {
    clone,
    uid,
    K,
    operators,
    transform,
    node,
    paint,
    shape,
    walk,
    index,
    find,
    parent,
    ancestors,
    roots,
    remove,
    fresh,
    isShape,
    selectedShapes,
    paints,
    styleTargets,
    set,
    blank,
    History,
    validate,
    hex,
    rgb,
  };
  g.DM = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
