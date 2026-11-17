(function (g) {
  'use strict';
  const D = DM,
    G = Geometry,
    P = paper;
  const paint = (n) => ['fill', 'stroke', 'gradientFill', 'gradientStroke'].includes(n.type);
  function order(doc, ids) {
    const indices = new Map();
    let i = 0;
    D.walk(doc.layers, (n) => indices.set(n.id, i++));
    return D.roots(doc, ids).sort((a, b) => indices.get(a.id) - indices.get(b.id));
  }
  function layerOf(doc, n) {
    return n.type === 'layer' || n.type === 'text'
      ? n
      : D.ancestors(doc, n.id).find((x) => x.type === 'layer' || x.type === 'text');
  }
  function unlocked(doc, n) {
    return !n.locked && !D.ancestors(doc, n.id).some((x) => x.locked);
  }
  function samePaint(a, b) {
    const value = (n) =>
      n
        ? {
            type: n.type,
            visible: n.visible,
            props: n.props,
            gradient: n.gradient,
            dashes: n.dashes,
            dashOffset: n.dashOffset,
          }
        : null;
    return JSON.stringify(value(a)) === JSON.stringify(value(b));
  }
  function paintsFor(doc, n) {
    return D.paints(doc, n);
  }
  function carry(doc, n, destination, m) {
    const styles = paintsFor(doc, n),
      target = paintsFor(doc, destination);
    let moved = n;
    if (D.isShape(n) && (!samePaint(styles.fill, target.fill) || !samePaint(styles.stroke, target.stroke))) {
      const wrap = D.node('group', n.name);
      wrap.children = [n];
      ['fill', 'stroke'].forEach((kind) => {
        const p = styles[kind] ? D.fresh(styles[kind]) : D.paint(kind);
        if (!styles[kind]) p.visible = false;
        wrap.children.push(p);
      });
      moved = wrap;
    } else if (n.type === 'group') {
      ['fill', 'stroke'].forEach((kind) => {
        if (
          !n.children.some((x) => x.type.toLowerCase().includes(kind)) &&
          !samePaint(styles[kind], target[kind])
        ) {
          const p = styles[kind] ? D.fresh(styles[kind]) : D.paint(kind);
          if (!styles[kind]) p.visible = false;
          n.children.push(p);
        }
      });
    }
    D.remove(doc, n.id);
    G.storeMatrix(n, m);
    return moved;
  }
  function group(e, merge) {
    const roots = order(e.doc, e.selection);
    if (!roots.length) return;
    if (roots.some((n) => !unlocked(e.doc, n))) throw Error('Unlock the affected layers first.');
    const layers = [...new Set(roots.map((n) => layerOf(e.doc, n)).filter(Boolean))].sort(
        (a, b) => e.doc.layers.indexOf(a) - e.doc.layers.indexOf(b),
      ),
      top = layers[0];
    if (!top || top.layerKind === 'other' || top.type === 'text')
      throw Error('Choose shape layers or convert text to shapes first.');
    if (roots.some((n) => n.type === 'layer') || merge) {
      const inv = G.world(e.doc, top).inverted();
      roots.forEach((n) => {
        if (n === top) return;
        const world = G.world(e.doc, n);
        if (n.type === 'layer') {
          const group = D.node('group', n.name);
          group.children = n.children;
          G.storeMatrix(group, inv.clone().append(world));
          D.remove(e.doc, n.id);
          top.children.push(group);
        } else top.children.push(carry(e.doc, n, top, inv.clone().append(world)));
      });
      e.selection = [top.id];
      e.expanded.add(top.id);
      return;
    }
    const common = D.parent(e.doc, roots[0].id),
      parent = roots.every((n) => D.parent(e.doc, n.id) === common) && common ? common : top,
      group = D.node('group', 'Group 1'),
      inv = G.world(e.doc, parent).inverted(),
      styles = roots.map((n) => paintsFor(e.doc, n)),
      same = styles.every((s) => samePaint(s.fill, styles[0].fill) && samePaint(s.stroke, styles[0].stroke));
    parent.children.unshift(group);
    roots.forEach((n) => {
      const m = inv.clone().append(G.world(e.doc, n));
      if (same) {
        D.remove(e.doc, n.id);
        G.storeMatrix(n, m);
        group.children.push(n);
      } else group.children.push(carry(e.doc, n, group, m));
    });
    if (same)
      ['fill', 'stroke'].forEach((kind) => {
        if (styles[0][kind]) group.children.push(D.fresh(styles[0][kind]));
      });
    e.selection = [group.id];
    e.expanded.add(parent.id);
    e.expanded.add(group.id);
  }
  function move(e, ids, target, inside, after) {
    const roots = order(e.doc, ids);
    if (
      !target ||
      !unlocked(e.doc, target) ||
      roots.some(
        (n) =>
          !unlocked(e.doc, n) ||
          n.type === 'mask' ||
          n.id === target.id ||
          D.ancestors(e.doc, target.id).some((x) => x.id === n.id),
      )
    )
      throw Error('This item cannot be moved there.');
    const parent = inside && ['group', 'layer'].includes(target.type) ? target : D.parent(e.doc, target.id);
    if (roots.some((n) => n.type === 'layer' || n.type === 'text')) {
      if (parent) throw Error('Use Merge into layer to combine layer contents.');
      roots.forEach((n) => D.remove(e.doc, n.id));
      const index = e.doc.layers.indexOf(target) + (after ? 1 : 0);
      e.doc.layers.splice(index, 0, ...roots);
      return;
    }
    if (!parent) throw Error('Drop the artwork inside a shape layer.');
    const inv = G.world(e.doc, parent).inverted(),
      prepared = roots.map((n) => ({ n, m: inv.clone().append(G.world(e.doc, n)) })),
      moved = prepared.map((x) => carry(e.doc, x.n, parent, x.m)),
      index = inside ? 0 : parent.children.indexOf(target) + (after ? 1 : 0);
    parent.children.splice(Math.max(0, index), 0, ...moved);
    e.selection = moved.map((n) => n.id);
    e.expanded.add(parent.id);
  }
  function safeFlatten(n) {
    const t = n.transform;
    return (
      n.type === 'group' &&
      n.visible !== false &&
      !n.array &&
      !n.rig &&
      t.rotation === 0 &&
      !t.skew &&
      t.scale[0] === 100 &&
      t.scale[1] === 100 &&
      t.opacity === 100 &&
      (!n.props['ADBE Vector Blend Mode'] || n.props['ADBE Vector Blend Mode'] === 1) &&
      !Object.values(n.meta).some((m) => m.keys || m.expression)
    );
  }
  function toLayer(e, n) {
    const parent = D.parent(e.doc, n.id),
      world = G.world(e.doc, n),
      styles = paintsFor(e.doc, n),
      layer = D.node('layer', n.name);
    layer.layerKind = 'shape';
    const sourceLayer = layerOf(e.doc, n);
    if (sourceLayer?.projection || sourceLayer?.threeD) {
      [
        'transform',
        'threeD',
        'parentId',
        'parentMatrix',
        'parentTransforms3D',
        'projection',
        'blendName',
        'blendMode',
        'label',
        'visible',
      ].forEach((k) => {
        if (sourceLayer[k] !== undefined) layer[k] = D.clone(sourceLayer[k]);
      });
      layer.transformSource = sourceLayer.id;
      let branch = n;
      const ancestors = D.ancestors(e.doc, n.id).filter((x) => x !== sourceLayer);
      for (const ancestor of ancestors) {
        const wrapper = D.fresh(ancestor);
        wrapper.name = ancestor.name;
        wrapper.children = [
          branch,
          ...ancestor.children.filter((x) => paint(x) || x.type === 'operator').map(D.fresh),
        ];
        branch = wrapper;
      }
      layer.children = [branch, ...sourceLayer.children.filter(paint).map(D.fresh)];
      D.remove(e.doc, n.id);
      e.doc.layers.unshift(layer);
      return layer;
    }
    if (n.type === 'group' && safeFlatten(n) && !world.homography) {
      layer.children = n.children;
      G.storeMatrix(layer, world);
    } else {
      const parentWorld = parent ? G.world(e.doc, parent) : G.parentSpace(e.doc, n);
      G.storeMatrix(layer, parentWorld);
      layer.children = [n];
      if (D.isShape(n))
        ['fill', 'stroke'].forEach((kind) => {
          if (styles[kind]) layer.children.push(D.fresh(styles[kind]));
        });
    }
    if (sourceLayer) {
      layer.transform.opacity *= sourceLayer.transform.opacity / 100;
      layer.visible = sourceLayer.visible;
      layer.blendName = sourceLayer.blendName;
    }
    D.remove(e.doc, n.id);
    e.doc.layers.unshift(layer);
    return layer;
  }
  function split(e, kind) {
    const selected =
        kind === 'groups'
          ? order(e.doc, e.selection).filter((n) => n.type === 'group')
          : D.selectedShapes(e.doc, e.selection).filter((n) => n.type !== 'mask'),
      roots = [],
      handled = new Set();
    selected.forEach((n) => {
      if (handled.has(n.id)) return;
      const parent = D.parent(e.doc, n.id),
        siblings = selected.filter((x) => D.parent(e.doc, x.id) === parent),
        shared = parent && parent.children.some((x) => x.matchName === 'ADBE Vector Filter - Merge'),
        cluster = shared ? siblings : [n];
      if (!shared && siblings.length > 1) {
        const p = G.pathOf(n);
        if (p.closed)
          siblings.forEach((s) => {
            if (s === n || handled.has(s.id)) return;
            const q = G.pathOf(s);
            if (
              (q.closed && p.intersects(q)) ||
              (q.closed && p.contains(q.bounds.center)) ||
              (p.closed && q.contains(p.bounds.center))
            )
              cluster.push(s);
          });
      }
      cluster.forEach((x) => handled.add(x.id));
      if (cluster.length === 1) {
        roots.push(n);
        return;
      }
      const group = D.node('group', n.name),
        styles = paintsFor(e.doc, n);
      cluster.forEach((x) => {
        D.remove(e.doc, x.id);
        group.children.push(x);
      });
      ['fill', 'stroke'].forEach((k) => {
        if (styles[k]) group.children.push(D.fresh(styles[k]));
      });
      if (shared)
        parent.children.filter((x) => x.type === 'operator').forEach((x) => group.children.push(D.fresh(x)));
      parent.children.unshift(group);
      roots.push(group);
    });
    e.selection = [];
    roots
      .slice()
      .reverse()
      .forEach((n) => {
        if (kind === 'shapes-groups') {
          if (n.type === 'group') {
            e.selection.unshift(n.id);
            return;
          }
          const parent = D.parent(e.doc, n.id),
            styles = paintsFor(e.doc, n),
            index = parent.children.indexOf(n),
            group = D.node('group', n.name);
          group.children = [n];
          ['fill', 'stroke'].forEach((k) => {
            if (styles[k]) group.children.push(D.fresh(styles[k]));
          });
          parent.children.splice(index, 1, group);
          e.selection.unshift(group.id);
        } else e.selection.unshift(toLayer(e, n).id);
      });
  }
  function newLayer(e) {
    const roots = order(e.doc, e.selection),
      layer = D.node('layer', 'New Layer');
    layer.layerKind = 'shape';
    e.doc.layers.unshift(layer);
    roots.forEach((n) => {
      const world = G.world(e.doc, n);
      if (n.type === 'layer') {
        const group = D.node('group', n.name);
        group.children = n.children;
        G.storeMatrix(group, world);
        D.remove(e.doc, n.id);
        layer.children.push(group);
      } else layer.children.push(carry(e.doc, n, layer, world));
    });
    e.selection = [layer.id];
  }
  function ungroup(e) {
    const selection = [];
    order(e.doc, e.selection).forEach((n) => {
      if (n.type !== 'group') return;
      if (!unlocked(e.doc, n)) throw Error('Unlock the group first.');
      if (n.array) Arrays.expand(n);
      const parent = D.parent(e.doc, n.id);
      if (!parent) return;
      const index = parent.children.indexOf(n),
        paints = n.children.filter(paint),
        contents = n.children.filter((x) => !paint(x));
      if (contents.some((x) => x.type === 'operator')) {
        selection.push(n.id);
        e.notice('This group has shared operators. Its contents stay together to preserve the result.');
        return;
      }
      const matrix = G.matrix(n),
        moved = [],
        simple =
          matrix.isIdentity() &&
          n.transform.opacity === 100 &&
          n.visible !== false &&
          (!n.props['ADBE Vector Blend Mode'] || n.props['ADBE Vector Blend Mode'] === 1);
      const otherArt = parent.children.some((x) => x !== n && (D.isShape(x) || x.type === 'group'));
      if (simple && !otherArt && !parent.children.some((x) => x.type === 'operator') && paints.length) {
        // The paints can move with their paths because there is no sibling artwork to recolor.
        const parentPaints = parent.children.filter(paint);
        parentPaints.forEach((p) => {
          const kind = p.type.toLowerCase().includes('stroke') ? 'stroke' : 'fill';
          if (paints.some((x) => x.type.toLowerCase().includes(kind))) D.remove(e.doc, p.id);
        });
        const at = parent.children.indexOf(n);
        parent.children.splice(at, 1, ...n.children);
        selection.push(...contents.map((x) => x.id));
        return;
      }
      const shapes = contents.filter(D.isShape),
        clusters = [],
        visited = new Set();
      // Winding holes and intersecting contours must remain in one paint scope.
      const linked = (a, b) => {
        const p = G.pathOf(a),
          q = G.pathOf(b);
        p.transform(G.matrix(a));
        q.transform(G.matrix(b));
        return (
          p.closed &&
          q.closed &&
          (p.intersects(q) || p.contains(q.firstSegment.point) || q.contains(p.firstSegment.point))
        );
      };
      for (const shape of shapes) {
        if (visited.has(shape.id)) continue;
        const cluster = [shape];
        visited.add(shape.id);
        for (let i = 0; i < cluster.length; i++)
          for (const other of shapes)
            if (!visited.has(other.id) && linked(cluster[i], other)) {
              visited.add(other.id);
              cluster.push(other);
            }
        clusters.push(cluster);
      }
      const done = new Set();
      for (const c of contents) {
        if (done.has(c.id)) continue;
        if (
          c.type === 'group' &&
          !paints.some(
            (p) =>
              !c.children.some(
                (x) =>
                  paint(x) &&
                  x.type.toLowerCase().includes(p.type.toLowerCase().includes('stroke') ? 'stroke' : 'fill'),
              ),
          )
        ) {
          G.storeMatrix(c, matrix.clone().append(G.matrix(c)));
          c.transform.opacity *= n.transform.opacity / 100;
          c.visible = c.visible !== false && n.visible !== false;
          if (
            n.props['ADBE Vector Blend Mode'] > 1 &&
            (!c.props['ADBE Vector Blend Mode'] || c.props['ADBE Vector Blend Mode'] === 1)
          )
            c.props['ADBE Vector Blend Mode'] = n.props['ADBE Vector Blend Mode'];
          moved.push(c);
          continue;
        }
        const cluster = D.isShape(c) ? clusters.find((xs) => xs.includes(c)) : [c];
        cluster.forEach((x) => done.add(x.id));
        const same =
          simple &&
          paints.every((p) =>
            samePaint(
              p,
              paintsFor(e.doc, parent)[p.type.toLowerCase().includes('stroke') ? 'stroke' : 'fill'],
            ),
          );
        if (same) {
          moved.push(...cluster);
          continue;
        }
        const wrapper = D.node('group', cluster.length > 1 ? 'Compound path' : c.name);
        wrapper.children = [...cluster, ...paints.map(D.fresh)];
        wrapper.transform = D.clone(n.transform);
        wrapper.visible = n.visible;
        wrapper.props = D.clone(n.props);
        moved.push(wrapper);
      }
      parent.children.splice(index, 1, ...moved);
      selection.push(...moved.map((x) => x.id));
    });
    e.selection = selection;
  }
  function consolidate(e) {
    const selected = order(e.doc, e.selection),
      containers = selected.length ? selected : e.doc.layers;
    const work = (parent) => {
      if (!['layer', 'group'].includes(parent.type) || !unlocked(e.doc, parent)) return;
      parent.children.filter((n) => n.type === 'group').forEach(work);
      const buckets = [];
      parent.children
        .filter(
          (n) =>
            n.type === 'group' &&
            unlocked(e.doc, n) &&
            !n.array &&
            !n.rig &&
            n.transform.opacity === 100 &&
            !Object.values(n.meta).some((m) => m.keys || m.expression) &&
            !n.children.some((c) => c.type === 'operator') &&
            !n.children.some((c) => Object.values(c.meta).some((m) => m.keys || m.expression)),
        )
        .forEach((n) => {
          const styles = paintsFor(e.doc, n);
          let target = buckets.find(
            (x) =>
              samePaint(x.styles.fill, styles.fill) &&
              samePaint(x.styles.stroke, styles.stroke) &&
              JSON.stringify(x.node.props) === JSON.stringify(n.props),
          );
          if (!target) {
            buckets.push({ node: n, styles });
            return;
          }
          const into = target.node,
            m = G.matrix(into).inverted().append(G.matrix(n));
          n.children
            .filter((c) => !paint(c))
            .forEach((c) => {
              G.storeMatrix(c, m.clone().append(G.matrix(c)));
              into.children.push(c);
            });
          D.remove(e.doc, n.id);
          into.name = styles.fill?.gradient
            ? 'Gradient'
            : styles.fill
              ? D.hex(styles.fill.props['ADBE Vector Fill Color'])
              : styles.stroke
                ? D.hex(styles.stroke.props['ADBE Vector Stroke Color'])
                : 'No fill';
        });
    };
    containers.forEach(work);
    e.selection = e.selection.filter((id) => D.find(e.doc, id));
  }
  function arrange(e, name) {
    const roots = order(e.doc, e.selection),
      lists = new Map();
    roots.forEach((n) => {
      const p = D.parent(e.doc, n.id),
        list = p ? p.children : e.doc.layers;
      if (!lists.has(list)) lists.set(list, new Set());
      lists.get(list).add(n.id);
    });
    lists.forEach((ids, list) => {
      if (name === 'front' || name === 'back') {
        const selected = list.filter((n) => ids.has(n.id)),
          rest = list.filter((n) => !ids.has(n.id));
        list.splice(0, list.length, ...(name === 'front' ? selected.concat(rest) : rest.concat(selected)));
      } else if (name === 'forward') {
        for (let i = 1; i < list.length; i++)
          if (ids.has(list[i].id) && !ids.has(list[i - 1].id))
            [list[i - 1], list[i]] = [list[i], list[i - 1]];
      } else
        for (let i = list.length - 2; i >= 0; i--)
          if (ids.has(list[i].id) && !ids.has(list[i + 1].id))
            [list[i], list[i + 1]] = [list[i + 1], list[i]];
    });
  }
  function paste(e, kind) {
    const selected = order(e.doc, e.selection),
      context = e.clipboardContext || [],
      copies = e.clipboard.map(D.fresh),
      inserted = [],
      first = selected[0],
      last = selected[selected.length - 1];
    let shapeParent = first && (['layer', 'group'].includes(first.type) ? first : D.parent(e.doc, first.id));
    if (shapeParent?.layerKind === 'other') shapeParent = null;
    copies.forEach((n, i) => {
      const ctx = context[i];
      if (n.type === 'layer' || n.type === 'text') {
        delete n.parentId;
        delete n.parentMatrix;
        if (ctx) G.storeMatrix(n, new P.Matrix(ctx.world));
        let at = 0;
        if (kind === 'paste-front' && first) {
          const layer = layerOf(e.doc, first);
          at = e.doc.layers.indexOf(layer);
        }
        if (kind === 'paste-back' && last) {
          at = e.doc.layers.indexOf(layerOf(e.doc, last)) + 1;
        }
        e.doc.layers.splice(Math.max(0, at + i), 0, n);
        inserted.push(n.id);
        return;
      }
      if (!shapeParent) {
        shapeParent = D.node('layer', 'Pasted artwork');
        shapeParent.layerKind = 'shape';
        e.doc.layers.unshift(shapeParent);
      }
      let moved = n;
      if (ctx) {
        G.storeMatrix(n, G.world(e.doc, shapeParent).inverted().append(new P.Matrix(ctx.world)));
        if (D.isShape(n)) {
          const wrap = D.node('group', n.name);
          wrap.children = [n];
          ['fill', 'stroke'].forEach((k) => {
            const p = ctx.styles[k] ? D.fresh(ctx.styles[k]) : D.paint(k);
            if (!ctx.styles[k]) p.visible = false;
            wrap.children.push(p);
          });
          moved = wrap;
        }
      }
      let at = 0;
      if (kind === 'paste-front' && first && D.parent(e.doc, first.id) === shapeParent)
        at = shapeParent.children.indexOf(first);
      if (kind === 'paste-back' && last && D.parent(e.doc, last.id) === shapeParent)
        at = shapeParent.children.indexOf(last) + 1;
      shapeParent.children.splice(Math.max(0, at + i), 0, moved);
      inserted.push(moved.id);
    });
    e.selection = inserted;
    if (kind === 'paste') {
      const b = G.bounds(e.doc, inserted);
      if (b) G.move(e.doc, inserted, P.view.center.x - b.center.x, P.view.center.y - b.center.y);
    }
  }
  g.Structure = {
    order,
    layerOf,
    group,
    move,
    split,
    newLayer,
    ungroup,
    samePaint,
    consolidate,
    arrange,
    paste,
  };
})(window);
