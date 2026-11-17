(function (g) {
  'use strict';
  const D = DM,
    P = paper,
    G = Geometry;
  const defaults = {
    Linear: { Copies: 5, 'Step X': 120, 'Step Y': 0 },
    Grid: { Columns: 4, Rows: 3, 'Spacing X': 120, 'Spacing Y': 120 },
    Brick: { Columns: 4, Rows: 3, 'Spacing X': 120, 'Spacing Y': 120 },
    Radial: { Copies: 8, Radius: 150, Start: 0, Sweep: 360 },
    Spiral: { Copies: 12, Radius: 100, Start: 0, Sweep: 360, Scale: 110 },
  };
  function repeater(id, name, copies, pos, rotation = 0, scale = 100) {
    const op = D.node('operator', name);
    op.id = id;
    op.matchName = 'ADBE Vector Filter - Repeater';
    op.props = {
      'ADBE Vector Repeater Copies': copies,
      'ADBE Vector Repeater Offset': 0,
      'ADBE Vector Repeater Order': 1,
      'ADBE Vector Repeater Transform/ADBE Vector Repeater Anchor': [0, 0],
      'ADBE Vector Repeater Transform/ADBE Vector Repeater Position': pos,
      'ADBE Vector Repeater Transform/ADBE Vector Repeater Scale': [scale, scale],
      'ADBE Vector Repeater Transform/ADBE Vector Repeater Rotation': rotation,
      'ADBE Vector Repeater Transform/ADBE Vector Repeater Start Opacity': 100,
      'ADBE Vector Repeater Transform/ADBE Vector Repeater End Opacity': 100,
    };
    return op;
  }
  function build(group) {
    const a = group.array,
      v = a.values,
      id = group.id,
      count = (k) => Math.max(1, Math.min(500, Math.round(+v[k] || 1))),
      seed = D.clone(a.seed),
      layout = a.layout;
    const wrap = (name, kids) => {
      const n = D.node('group', name);
      n.id = id + '-' + name;
      n.children = kids;
      return n;
    };
    group.children = seed;
    if (layout === 'Linear')
      group.children.push(
        repeater(id + '-linear', 'Repeater', count('Copies'), [+v['Step X'], +v['Step Y']]),
      );
    if (layout === 'Grid') {
      group.children.push(repeater(id + '-columns', 'Columns', count('Columns'), [+v['Spacing X'], 0]));
      group.children.push(repeater(id + '-rows', 'Rows', count('Rows'), [0, +v['Spacing Y']]));
    }
    if (layout === 'Brick') {
      const columns = count('Columns'),
        rows = count('Rows'),
        sx = +v['Spacing X'],
        sy = +v['Spacing Y'],
        even = wrap('Even rows', seed),
        odd = wrap(
          'Odd rows',
          seed.map((n, i) => {
            const c = D.fresh(n);
            let j = 0;
            D.walk([c], (x) => (x.id = id + '-odd-' + i + '-' + j++));
            return c;
          }),
        );
      even.children.push(
        repeater(id + '-even-columns', 'Columns', columns, [sx, 0]),
        repeater(id + '-even-rows', 'Rows', Math.ceil(rows / 2), [0, sy * 2]),
      );
      odd.transform.position = [sx / 2, sy];
      odd.children.push(
        repeater(id + '-odd-columns', 'Columns', columns, [sx, 0]),
        repeater(id + '-odd-rows', 'Rows', Math.floor(rows / 2), [0, sy * 2]),
      );
      group.children = rows > 1 ? [even, odd] : [even];
    }
    if (layout === 'Radial' || layout === 'Spiral') {
      const source = wrap('Source', seed),
        copies = count('Copies');
      source.transform.position = [+v.Radius, 0];
      const start = wrap('Start', [source]);
      start.transform.rotation = +v.Start;
      group.children = [
        start,
        repeater(
          id + '-radial',
          'Repeater',
          copies,
          [0, 0],
          +v.Sweep / (Math.abs(+v.Sweep) >= 359.999 ? copies : Math.max(1, copies - 1)),
          layout === 'Spiral' ? +v.Scale : 100,
        ),
      ];
    }
    group.name = layout + ' Array';
    return group;
  }
  function matrices(a) {
    const v = a.values,
      out = [],
      n = (k) => Math.max(1, Math.min(500, Math.round(+v[k] || 1)));
    if (a.layout === 'Linear')
      for (let i = 0; i < n('Copies'); i++)
        out.push(new P.Matrix().translate([i * v['Step X'], i * v['Step Y']]));
    else if (a.layout === 'Grid' || a.layout === 'Brick')
      for (let y = 0; y < n('Rows'); y++)
        for (let x = 0; x < n('Columns'); x++)
          out.push(
            new P.Matrix().translate([
              (x + (a.layout === 'Brick' && y % 2 ? 0.5 : 0)) * v['Spacing X'],
              y * v['Spacing Y'],
            ]),
          );
    else
      for (let i = 0; i < n('Copies'); i++) {
        const angle =
            +v.Start +
            (i * v.Sweep) / (Math.abs(+v.Sweep) >= 359.999 ? n('Copies') : Math.max(1, n('Copies') - 1)),
          scale = a.layout === 'Spiral' ? Math.pow(v.Scale / 100, i) : 1;
        out.push(new P.Matrix().rotate(angle).scale(scale).translate([+v.Radius, 0]));
      }
    return out;
  }
  function create(e, layout, values) {
    const selected = D.roots(e.doc, e.selection),
      bounds = G.bounds(e.doc, e.selection);
    if (!selected.length || !bounds) return null;
    if (selected.some((n) => n.type === 'text')) throw Error('Convert text to shapes before replicating.');
    const layer = D.node('layer', layout + ' Array'),
      group = D.node('group', layout + ' Array');
    layer.layerKind = 'shape';
    group.transform.position = [bounds.center.x, bounds.center.y];
    const seed = [];
    selected.forEach((n) => {
      const clone = D.clone(n),
        world = G.world(e.doc, n);
      if (clone.type === 'layer') {
        clone.id = D.uid();
        clone.type = 'group';
        clone.matchName = D.K.group;
        delete clone.source;
        delete clone.parentMatrix;
      }
      G.storeMatrix(clone, new P.Matrix().translate(bounds.center.negate()).append(world));
      seed.push(clone);
      if (D.isShape(n)) {
        const paints = D.paints(e.doc, n);
        const wrap = D.node('group', n.name);
        wrap.children = [clone];
        if (paints.fill) wrap.children.push(D.fresh(paints.fill));
        if (paints.stroke) wrap.children.push(D.fresh(paints.stroke));
        seed[seed.length - 1] = wrap;
      }
      D.remove(e.doc, n.id);
    });
    group.array = { layout, values: { ...defaults[layout], ...values }, seed };
    build(group);
    layer.children = [group];
    e.doc.layers.unshift(layer);
    e.selection = [group.id];
    return group;
  }
  function expand(group) {
    const a = group.array,
      children = [];
    matrices(a).forEach((m, i) => {
      const copy = D.node('group', 'Copy ' + (i + 1));
      copy.children = a.seed.map(D.fresh);
      G.storeMatrix(copy, m);
      children.push(copy);
    });
    group.children = children;
    delete group.array;
    group.name = 'Expanded copies';
  }
  function fields(ui, n) {
    const a = n.array,
      e = ui.e;
    let out = ui.field(
      'Layout',
      a.layout,
      (v) =>
        e.edit('Array layout', () => {
          n.array.layout = v;
          n.array.values = { ...defaults[v], ...n.array.values };
          build(n);
        }),
      { choices: Object.keys(defaults) },
    );
    Object.keys(defaults[a.layout]).forEach(
      (k) =>
        (out += ui.field(k, a.values[k], (v) =>
          e.edit('Array ' + k, () => {
            n.array.values[k] = v;
            build(n);
          }),
        )),
    );
    return ui.section(a.layout, out + '<button data-cmd="expand-array">Expand copies</button>');
  }
  function hydrate(doc) {
    D.walk(doc.layers, (n) => {
      if (!n.array || n.array.seed) return;
      const a = n.array,
        v = a.values,
        operators = (kids) => (kids || []).filter((x) => x.matchName === 'ADBE Vector Filter - Repeater'),
        ops = operators(n.children),
        op = ops[0],
        copies = (o) => o?.props['ADBE Vector Repeater Copies'],
        pos = (o) => o?.props['ADBE Vector Repeater Transform/ADBE Vector Repeater Position'];
      if (a.layout === 'Brick') {
        const even = n.children[0],
          odd = n.children[1],
          eo = operators(even?.children),
          oo = operators(odd?.children);
        a.seed = D.clone(even?.children.filter((x) => x.type !== 'operator') || []);
        if (eo[0]) {
          v.Columns = copies(eo[0]);
          v['Spacing X'] = pos(eo[0])[0];
        }
        if (eo[1]) {
          v.Rows = copies(eo[1]) + (oo[1] ? copies(oo[1]) : 0);
          v['Spacing Y'] = pos(eo[1])[1] / 2;
        }
      } else if (a.layout === 'Radial' || a.layout === 'Spiral') {
        const start = n.children[0],
          source = start?.children[0];
        a.seed = D.clone(source?.children || []);
        if (source) v.Radius = source.transform.position[0];
        if (start) v.Start = start.transform.rotation;
        if (op) {
          const full = Math.abs(v.Sweep) >= 359.999;
          v.Copies = copies(op);
          v.Sweep =
            op.props['ADBE Vector Repeater Transform/ADBE Vector Repeater Rotation'] *
            (full ? v.Copies : Math.max(1, v.Copies - 1));
          if (a.layout === 'Spiral')
            v.Scale = op.props['ADBE Vector Repeater Transform/ADBE Vector Repeater Scale'][0];
        }
      } else {
        a.seed = D.clone(n.children.filter((x) => x.type !== 'operator'));
        if (a.layout === 'Linear' && op) {
          v.Copies = copies(op);
          const p = pos(op);
          if (p) {
            v['Step X'] = p[0];
            v['Step Y'] = p[1];
          }
        }
        if (a.layout === 'Grid' && ops.length >= 2) {
          v.Columns = copies(ops[0]);
          v.Rows = copies(ops[1]);
          v['Spacing X'] = pos(ops[0])[0];
          v['Spacing Y'] = pos(ops[1])[1];
        }
      }
    });
  }
  g.Arrays = { defaults, build, create, expand, matrices, fields, hydrate };
})(window);
