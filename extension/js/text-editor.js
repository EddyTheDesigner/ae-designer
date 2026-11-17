(function (g) {
  'use strict';
  const D = DM,
    G = Geometry,
    P = paper;
  function create(e, start, end) {
    const n = D.node('text', 'Text');
    n.layerKind = 'text';
    const box = start.getDistance(end) > 10 / P.view.zoom;
    n.text = {
      text: '',
      font: 'ArialMT',
      fontFamily: 'Arial',
      fontStyle: 'Regular',
      fontSize: 72,
      leading: 86.4,
      autoLeading: true,
      tracking: 0,
      kerning: 0,
      applyFill: true,
      fillColor: e.lastFill,
      applyStroke: false,
      strokeColor: [0, 0, 0],
      strokeWidth: 1,
      strokeOverFill: false,
      horizontalScale: 100,
      verticalScale: 100,
      baselineShift: 0,
      allCaps: false,
      smallCaps: false,
      ligature: true,
      hindiDigits: false,
      lineJoinType: 0,
      paintOrder: 'Fill Over Stroke',
      baselineOption: 'Normal',
      tsume: 0,
      spaceBefore: 0,
      spaceAfter: 0,
      startIndent: 0,
      endIndent: 0,
      firstLineIndent: 0,
      justification: 'left',
      direction: 'left-to-right',
      boxText: box,
      boxTextSize: [Math.max(10, Math.abs(end.x - start.x)), Math.max(10, Math.abs(end.y - start.y))],
    };
    n.transform.position = [Math.min(start.x, end.x), Math.min(start.y, end.y)];
    e.doc.layers.unshift(n);
    e.selection = [n.id];
    return n;
  }
  function begin(e, node, before) {
    if (e.inlineText) e.inlineText.finish();
    if (node.meta.text?.expression) {
      e.notice('Text is expression-driven.');
      return;
    }
    const base = before || e.history.begin(),
      t = node.text,
      box = document.createElement('textarea');
    box.className = 'canvas-text-editor';
    box.spellcheck = false;
    box.value = t.text;
    box.setAttribute('aria-label', 'Edit text on canvas');
    document.getElementById('viewport').appendChild(box);
    const session = { nodeId: node.id, box, finish, cancel, refresh };
    e.inlineText = session;
    function refresh() {
      const n = D.find(e.doc, node.id);
      if (!n) return;
      const tx = n.text,
        m = P.view.matrix.appended(G.world(e.doc, n)),
        pos = m.transform([0, 0]),
        size = tx.fontSize || 48,
        leading = tx.autoLeading ? size * 1.2 : tx.leading || size * 1.2;
      box.style.transformOrigin = '0 0';
      box.style.left = '0';
      box.style.top = '0';
      box.style.transform =
        'matrix(' + [m.a, m.b, m.c, m.d, pos.x, pos.y - (tx.boxText ? 0 : size * 0.8) * m.d].join(',') + ')';
      box.style.fontFamily = tx.fontFamily || tx.font || 'Arial';
      box.style.fontSize = size + 'px';
      box.style.lineHeight = leading + 'px';
      box.style.letterSpacing = ((tx.tracking || 0) * size) / 1000 + 'px';
      box.style.color = tx.applyFill === false ? 'transparent' : D.hex(tx.fillColor || [1, 1, 1]);
      box.style.webkitTextStroke = tx.applyStroke
        ? (tx.strokeWidth || 1) + 'px ' + D.hex(tx.strokeColor || [0, 0, 0])
        : '';
      box.style.textAlign =
        tx.justification === 'center' ? 'center' : tx.justification === 'right' ? 'right' : 'left';
      box.style.direction = tx.direction === 'right-to-left' ? 'rtl' : 'ltr';
      box.style.width = (tx.boxText ? tx.boxTextSize[0] : Math.max(200, box.scrollWidth + size)) + 'px';
      box.style.height = (tx.boxText ? tx.boxTextSize[1] : Math.max(leading + 4, box.scrollHeight)) + 'px';
    }
    function done() {
      box.remove();
      e.inlineText = null;
      e.render();
    }
    function finish() {
      if (e.inlineText !== session) return;
      const n = D.find(e.doc, node.id);
      if (n) {
        n.text.text = box.value;
        n.name = box.value.slice(0, 30) || 'Text';
        if (!box.value && !before) {
        } else if (!box.value && !base.doc.layers.some((x) => x.id === node.id)) D.remove(e.doc, node.id);
      }
      e.history.commit(base, 'Edit text');
      done();
      e.changed();
    }
    function cancel() {
      if (e.inlineText !== session) return;
      e.doc = base.doc;
      done();
      e.changed();
    }
    box.oninput = () => {
      const n = D.find(e.doc, node.id);
      n.text.text = box.value;
      refresh();
      e.renderCanvas();
    };
    box.onkeydown = (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Escape') {
        ev.preventDefault();
        finish();
      }
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
        ev.preventDefault();
        finish();
      }
    };
    box.onpointerdown = (ev) => ev.stopPropagation();
    box.onblur = () => {
      if (!e.modalOpen) finish();
    };
    e.render();
    refresh();
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
    return session;
  }
  function fields(ui, n, nodes) {
    const e = ui.e,
      tx = nodes.filter((x) => x.type === 'text'),
      fonts = e.fonts || [],
      families = [...new Set(fonts.map((x) => x.family))].sort(),
      family =
        n.text.fontFamily || fonts.find((x) => x.name === n.text.font)?.family || n.text.font || 'Arial';
    let char = '';
    char += ui.field(
      'Font family',
      family,
      (v) => {
        const font = fonts.find((f) => f.family === v) || { family: v, name: v, style: 'Regular' };
        e.edit('Font family', () =>
          tx.forEach((x) =>
            Object.assign(x.text, { font: font.name, fontFamily: font.family, fontStyle: font.style }),
          ),
        );
      },
      { wide: true },
    );
    const styleList = fonts.filter((f) => f.family === family);
    char += ui.field(
      'Style',
      n.text.fontStyle || 'Regular',
      (v) => {
        const font = styleList.find((f) => f.style === v);
        e.edit('Font style', () =>
          tx.forEach((x) =>
            Object.assign(x.text, { font: font?.name || x.text.font, fontStyle: font?.style || v }),
          ),
        );
      },
      {
        choices: styleList.length
          ? styleList.map((f) => f.style)
          : ['Regular', 'Bold', 'Italic', 'Bold Italic'],
      },
    );
    char += '<button data-cmd="refresh-fonts" class="sub-label">Refresh installed fonts</button>';
    [
      ['fontSize', 'Size'],
      ['leading', 'Leading'],
      ['autoLeading', 'Auto'],
      ['kerning', 'Kerning'],
      ['tracking', 'Tracking'],
      ['applyFill', 'Fill'],
      ['applyStroke', 'Stroke'],
      ['strokeWidth', 'Stroke Width'],
      ['verticalScale', 'Vertical Scale'],
      ['horizontalScale', 'Horizontal Scale'],
      ['baselineShift', 'Baseline Shift'],
      ['tsume', 'Tsume'],
      ['allCaps', 'All Caps'],
      ['smallCaps', 'Small Caps'],
      ['ligature', 'Ligatures'],
      ['hindiDigits', 'Hindi Digits'],
    ].forEach(([key, label]) => (char += ui.prop(tx, key, label, {}, 'text')));
    ['fillColor', 'strokeColor'].forEach(
      (key) =>
        (char += ui.field(
          key === 'fillColor' ? 'Fill Color' : 'Stroke Color',
          D.hex(n.text[key] || [0, 0, 0]),
          (v) =>
            e.property({
              ids: tx.map((x) => x.id),
              target: 'text',
              key,
              value: D.rgb(v),
              label: 'Text color',
            }),
          { color: true },
        )),
    );
    char += ui.prop(
      tx,
      'lineJoinType',
      'Stroke Join',
      {
        choices: [
          [0, 'Miter Join'],
          [1, 'Round Join'],
          [2, 'Bevel Join'],
        ],
      },
      'text',
    );
    char += ui.prop(
      tx,
      'paintOrder',
      'Paint Order',
      {
        choices: [
          'Fill Over Stroke',
          'Stroke Over Fill',
          'All Fills Over All Strokes',
          'All Strokes Over All Fills',
        ],
      },
      'text',
    );
    char += ui.prop(
      tx,
      'baselineOption',
      'Baseline',
      { choices: ['Normal', 'Superscript', 'Subscript'] },
      'text',
    );
    let paragraph = ui.prop(
      tx,
      'justification',
      'Alignment',
      {
        choices: n.text.boxText
          ? ['left', 'center', 'right', 'full-last-left', 'full-last-center', 'full-last-right', 'full']
          : ['left', 'center', 'right'],
      },
      'text',
    );
    [
      ['startIndent', 'Left Indent'],
      ['endIndent', 'Right Indent'],
      ['firstLineIndent', 'First Line Indent'],
      ['spaceBefore', 'Space Before'],
      ['spaceAfter', 'Space After'],
    ].forEach(([key, label]) => (paragraph += ui.prop(tx, key, label, {}, 'text')));
    paragraph += ui.prop(
      tx,
      'direction',
      'Direction',
      { choices: ['left-to-right', 'right-to-left'] },
      'text',
    );
    return ui.section('Character', char) + ui.section('Paragraph', paragraph);
  }
  function bind(ui, el) {
    const e = ui.e,
      field = [...el.querySelectorAll('.field')].find(
        (x) => x.querySelector('label')?.textContent === 'Font family',
      );
    if (!field) return;
    const input = field.querySelector('input'),
      list = document.createElement('datalist');
    list.id = 'installed-fonts';
    list.innerHTML = [...new Set((e.fonts || []).map((f) => f.family))]
      .sort()
      .map((f) => '<option value="' + f.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '">')
      .join('');
    field.appendChild(list);
    input.setAttribute('list', list.id);
  }
  function pathOf(n) {
    const t = n.text || {},
      group = new P.Group({ insert: false }),
      size = t.fontSize || 48,
      leading = t.autoLeading ? size * 1.2 : t.leading || size * 1.2,
      family = t.fontFamily || t.font || 'Arial',
      weight = /bold/i.test(t.fontStyle || '') ? 'bold' : 'normal';
    let content = t.text || '';
    if (t.allCaps) content = content.toUpperCase();
    if (t.hindiDigits) content = content.replace(/[0-9]/g, (c) => String.fromCharCode(0x660 + Number(c)));
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = weight + ' ' + size + 'px "' + family + '"';
    const tracking = ((t.tracking || 0) * size) / 1000,
      measureWidth = (s) => measure.measureText(s).width + Math.max(0, s.length - 1) * tracking,
      lines = [],
      width = t.boxText ? t.boxTextSize[0] : Infinity;
    content.split(/\r\n|\r|\n/).forEach((paragraph) => {
      if (!t.boxText) {
        lines.push(paragraph);
        return;
      }
      let line = '';
      paragraph.split(/(\s+)/).forEach((word) => {
        if (line && measureWidth(line + word) > width - (t.startIndent || 0) - (t.endIndent || 0)) {
          lines.push(line.trimEnd());
          line = word.trimStart();
        } else line += word;
      });
      lines.push(line);
    });
    lines.forEach((line, index) => {
      const indent = (t.startIndent || 0) + (index === 0 ? t.firstLineIndent || 0 : 0),
        lineWidth = measureWidth(line),
        full = t.justification?.startsWith('full'),
        justify =
          full && line.includes(' ') && index < lines.length - 1
            ? Math.max(0, (width - indent - (t.endIndent || 0) - lineWidth) / line.split(' ').length)
            : 0;
      let x =
          indent +
          (t.justification === 'center'
            ? (t.boxText ? width - lineWidth : -lineWidth) / 2
            : t.justification === 'right'
              ? t.boxText
                ? width - lineWidth
                : -lineWidth
              : 0),
        y = index * leading + (t.boxText ? size * 0.8 : 0) + (t.spaceBefore || 0) - (t.baselineShift || 0);
      const reverse = t.direction === 'right-to-left',
        chars = reverse ? [...line].reverse() : [...line];
      chars.forEach((ch) => {
        const small = t.smallCaps && ch !== ch.toUpperCase(),
          glyph = small ? ch.toUpperCase() : ch,
          baseline = t.baselineOption,
          scale = baseline === 'Superscript' || baseline === 'Subscript' ? 0.6 : 1;
        const text = new P.PointText({
          point: [
            x,
            y + (baseline === 'Superscript' ? -size * 0.35 : baseline === 'Subscript' ? size * 0.2 : 0),
          ],
          content: glyph,
          fontFamily: family,
          fontWeight: weight,
          fontSize: size * (small ? 0.75 : 1) * scale,
          fillColor: t.applyFill === false ? null : t.fillColor || [1, 1, 1],
          strokeColor: t.applyStroke ? t.strokeColor || [0, 0, 0] : null,
          strokeWidth: t.strokeWidth || 0,
          insert: false,
        });
        text.strokeJoin = ['miter', 'round', 'bevel'][t.lineJoinType || 0];
        group.addChild(text);
        x += measureWidth(ch) + tracking + (ch === ' ' ? justify : 0);
      });
    });
    group.scale((t.horizontalScale || 100) / 100, (t.verticalScale || 100) / 100, [0, 0]);
    return group;
  }
  g.TextEditor = { create, begin, fields, bind, pathOf };
})(window);
