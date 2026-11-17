const { test, expect } = require('@playwright/test');
async function load(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.editor?.ready);
}

test('planar native samples plus camera center support depth and X/Y rotation edits', async ({ page }) => {
  await load(page);
  const r = await page.evaluate(() => {
    const doc = DM.blank(),
      n = DM.node('layer', '3D');
    n.threeD = true;
    n.transform.position = [100, 50, 150];
    n.transform.anchor = [30, 20, 0];
    n.transform.scale = [110, 80, 100];
    n.transform.yRotation = 35;
    const project = (m, p) => {
      const w = [0, 1, 2].map(
          (r) => m[r * 4] * p[0] + m[r * 4 + 1] * p[1] + m[r * 4 + 2] * (p[2] || 0) + m[r * 4 + 3],
        ),
        d = 1 + w[2] / 1000;
      return [960 + w[0] / d, 540 + w[1] / d];
    };
    const base = Projection.transform(n.transform);
    n.projection = {
      transform: DM.clone(n.transform),
      samples: [
        [0, 0, 0],
        [256, 0, 0],
        [0, 256, 0],
        [256, 256, 0],
      ].map((p) => ({ local: p, comp: project(base, p) })),
      cameraCenter: [0, 0, -1000],
    };
    doc.layers = [n];
    n.transform.position[2] += 280;
    n.transform.xRotation = 23;
    n.transform.yRotation = -18;
    const now = Projection.transform(n.transform),
      mapping = Projection.rootMatrix(doc, n);
    return [
      [0, 0],
      [150, 70],
      [280, -40],
    ].map((p) => {
      const actual = mapping.transform(p);
      return { actual: [actual.x, actual.y], expected: project(now, p) };
    });
  });
  for (const p of r) for (let i = 0; i < 2; i++) expect(p.actual[i]).toBeCloseTo(p.expected[i], 4);
});

test('3D Push as new exactly preserves the source plane under sheared and mirrored parents', async ({
  page,
}) => {
  await load(page);
  const r = await page.evaluate(() => {
    const output = [];
    for (const scale of [
      [160, 65, 120],
      [-160, 65, 120],
      [160, -65, 120],
    ]) {
      const doc = DM.blank(),
        parent = DM.node('layer', 'Parent'),
        n = DM.node('layer', 'Artwork');
      parent.source = { layerId: 50 };
      parent.threeD = true;
      parent.transform = {
        ...parent.transform,
        position: [300, 200, 80],
        scale,
        anchor: [12, 20, 0],
        rotation: 28,
        xRotation: 19,
        yRotation: -34,
      };
      n.layerKind = 'shape';
      n.threeD = true;
      n.parentId = 50;
      n.transform = {
        ...n.transform,
        position: [70, 110, 40],
        scale: [90, 130, 100],
        anchor: [30, 20, 5],
        rotation: 42,
        xRotation: -21,
        yRotation: 15,
      };
      const shape = DM.shape('rect', 0, 0, 180, 80);
      n.children = [shape, DM.paint('fill', [1, 0, 0])];
      doc.layers = [n, parent];
      const old = Projection.layerWorld(doc, n, false),
        copy = Geometry.prepareDocument(doc, true),
        fresh = copy.layers[0],
        now = Projection.transform(fresh.transform),
        found = DM.find(copy, shape.id),
        anc = DM.ancestors(copy, found.id)
          .reverse()
          .filter((x) => x.id !== fresh.id);
      let residual = new paper.Matrix();
      anc.forEach((x) => residual.append(Geometry.matrix(x)));
      const errors = [
        [0, 0],
        [180, 0],
        [180, 80],
        [0, 80],
      ].map((p) => {
        const q = residual.transform(p);
        return Math.max(
          ...[0, 1, 2].map((r) =>
            Math.abs(
              old[r * 4] * p[0] +
                old[r * 4 + 1] * p[1] +
                old[r * 4 + 3] -
                (now[r * 4] * q.x + now[r * 4 + 1] * q.y + now[r * 4 + 3]),
            ),
          ),
        );
      });
      output.push({ error: Math.max(...errors), parent: fresh.parentId, warnings: copy.transferWarnings });
    }
    return output;
  });
  for (const row of r) {
    expect(row.error).toBeLessThan(0.00001);
    expect(row.parent).toBeUndefined();
    expect(row.warnings).toEqual([]);
  }
});

test('ungroup removes the only outer paint group and preserves independent nested transforms', async ({
  page,
}) => {
  await load(page);
  const r = await page.evaluate(() => {
    editor.doc = DM.blank();
    const l = DM.node('layer', 'Layer'),
      outer = DM.node('group', 'Outer'),
      fill = DM.paint('fill', [1, 0, 0]),
      a = DM.shape('rect', 0, 0, 50, 50),
      b = DM.shape('ellipse', 100, 0, 50, 50);
    l.layerKind = 'shape';
    outer.children = [a, b, fill];
    l.children = [outer];
    editor.doc.layers = [l];
    editor.selection = [outer.id];
    Structure.ungroup(editor);
    const first = {
      outer: !!DM.find(editor.doc, outer.id),
      parent: DM.parent(editor.doc, a.id).id,
      color: DM.hex(DM.paints(editor.doc, a).fill.props['ADBE Vector Fill Color']),
    };
    const group = DM.node('group', 'Wrapper'),
      inner = DM.node('group', 'Inner');
    group.transform.rotation = 37;
    group.transform.position = [70, 120];
    inner.children = [DM.shape('rect', 0, 0, 40, 60), DM.paint('fill', [0, 0, 1])];
    inner.transform.rotation = -15;
    group.children = [inner];
    l.children.unshift(group);
    editor.selection = [group.id];
    const before = Geometry.bounds(editor.doc, [inner.id]);
    Structure.ungroup(editor);
    const after = Geometry.bounds(editor.doc, [inner.id]);
    return {
      first,
      layer: l.id,
      second: {
        outer: !!DM.find(editor.doc, group.id),
        parent: DM.parent(editor.doc, inner.id).id,
        before: [before.x, before.y, before.width, before.height],
        after: [after.x, after.y, after.width, after.height],
      },
    };
  });
  expect(r.first).toEqual({ outer: false, parent: r.layer, color: '#ff0000' });
  expect(r.second.outer).toBe(false);
  expect(r.second.parent).toBe(r.layer);
  r.second.after.forEach((v, i) => expect(v).toBeCloseTo(r.second.before[i], 5));
});

test('ungroup never silently deletes shared operators', async ({ page }) => {
  await load(page);
  const r = await page.evaluate(() => {
    editor.doc = DM.blank();
    const l = DM.node('layer', 'Layer'),
      g = DM.node('group', 'With operator'),
      op = DM.node('operator', 'Trim');
    op.matchName = 'ADBE Vector Filter - Trim';
    g.children = [DM.shape('rect', 0, 0, 50, 50), op];
    l.children = [g];
    editor.doc.layers = [l];
    editor.selection = [g.id];
    Structure.ungroup(editor);
    return { operator: !!DM.find(editor.doc, op.id), selected: editor.selection[0], group: g.id };
  });
  expect(r.operator).toBe(true);
  expect(r.selected).toBe(r.group);
});

test('splitting a group from a 3D layer retains projected position and native parent space', async ({
  page,
}) => {
  await load(page);
  const r = await page.evaluate(() => {
    editor.doc = DM.blank();
    const root = DM.node('layer', '3D Layer'),
      parent = DM.node('layer', 'Parent'),
      group = DM.node('group', 'Artwork');
    parent.source = { layerId: 9 };
    parent.threeD = true;
    parent.transform.position = [80, 30, 0];
    root.layerKind = 'shape';
    root.threeD = true;
    root.parentId = 9;
    root.transform.position = [100, 50, 200];
    root.transform.yRotation = 25;
    root.transform.opacity = 65;
    root.children = [group];
    group.transform.rotation = 20;
    group.transform.position = [40, 60];
    group.children = [DM.shape('rect', 0, 0, 180, 100), DM.paint('fill', [1, 0, 0])];
    editor.doc.layers = [root, parent];
    const world = Projection.layerWorld(editor.doc, root, false);
    root.parentTransforms3D = [DM.clone(parent.transform)];
    root.projection = { transform: DM.clone(root.transform), samples: [] };
    for (const z of [0, 256])
      for (const y of [0, 256])
        for (const x of [0, 256]) {
          const p = [0, 1, 2].map(
            (r) => world[r * 4] * x + world[r * 4 + 1] * y + world[r * 4 + 2] * z + world[r * 4 + 3],
          );
          root.projection.samples.push({
            local: [x, y, z],
            comp: [960 + p[0] / (1 + p[2] / 1000), 540 + p[1] / (1 + p[2] / 1000)],
          });
        }
    const before = Geometry.bounds(editor.doc, [group.id]);
    editor.selection = [group.id];
    Structure.split(editor, 'groups');
    const layer = DM.find(editor.doc, editor.selection[0]),
      after = Geometry.bounds(editor.doc, [group.id]);
    return {
      before: [before.x, before.y, before.width, before.height],
      after: [after.x, after.y, after.width, after.height],
      threeD: layer.threeD,
      parent: layer.parentId,
      opacity: layer.transform.opacity,
      transformSource: layer.transformSource,
      source: root.id,
    };
  });
  r.after.forEach((v, i) => expect(v).toBeCloseTo(r.before[i], 4));
  expect(r.threeD).toBe(true);
  expect(r.parent).toBe(9);
  expect(r.opacity).toBe(65);
  expect(r.transformSource).toBe(r.source);
});
