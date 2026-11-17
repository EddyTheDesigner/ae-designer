(function (g) {
  'use strict';
  function toolbar(ui) {
    const e = ui.e,
      bar = document.getElementById('toolbar'),
      select = bar.querySelector('#transform-mode');
    if (select && select.tagName === 'SELECT') {
      const b = document.createElement('button');
      b.id = 'transform-mode';
      b.className = 'optional';
      b.title = 'Transform Mode: ' + e.transformMode;
      b.innerHTML = icon('transform-mode');
      b.onclick = () =>
        ui.menu(
          b,
          ['Combined', 'Individual: Comp', 'Individual: Object'].map((v) => ({
            label: v,
            run: () => {
              e.transformMode = v;
              e.render();
            },
          })),
        );
      select.replaceWith(b);
    }
    if (e.tool === 'offset') {
      const button = document.createElement('button');
      button.id = 'offset-options';
      button.title = 'Offset Path options';
      button.innerHTML = icon('settings');
      button.onclick = async () => {
        const values = await ui.fields('Offset Path options', {
          Join: e.offsetJoin || 'round',
          'Miter limit': e.offsetMiter || 4,
        });
        if (values) {
          e.offsetJoin = ['round', 'miter', 'bevel'].includes(values.Join) ? values.Join : 'round';
          e.offsetMiter = Math.max(1, +values['Miter limit'] || 4);
        }
      };
      bar.querySelector('.toolbar-options').appendChild(button);
    }
    const more = bar.querySelector('#more-tools');
    more.onclick = () =>
      ui.menu(more, [
        ...Object.keys(TOOL_NAMES).map((id) => ({ label: TOOL_NAMES[id], run: () => ui.chooseTool(id) })),
        null,
        { label: 'Path actions…', run: () => ui.pathMenu(more) },
        { label: 'Snapping', cmd: 'snap' },
        { label: 'Show transform box', cmd: 'toggle-box' },
        ...['Combined', 'Individual: Comp', 'Individual: Object'].map((v) => ({
          label: v,
          run: () => {
            e.transformMode = v;
            e.render();
          },
        })),
      ]);
    [
      ['pull', 'pull-selected', 'Pull selected'],
      ['push', 'push-new', 'Push as new'],
    ].forEach(([primary, secondary, label]) => {
      const b = bar.querySelector('[data-cmd="' + primary + '"]');
      if (!b) return;
      const triangle = document.createElement('span');
      triangle.className = 'host-triangle';
      b.appendChild(triangle);
      const menu = () => ui.menu(b, [{ label, cmd: secondary }]);
      let timer;
      b.addEventListener('pointerdown', (ev) => {
        if (!bar.classList.contains('fold-host')) return;
        if (ev.target === triangle) {
          ev.preventDefault();
          ev.stopPropagation();
          menu();
        } else
          timer = setTimeout(() => {
            b.dataset.suppress = '1';
            menu();
          }, 400);
      });
      b.addEventListener('pointerup', () => clearTimeout(timer));
      b.addEventListener(
        'click',
        (ev) => {
          if (b.dataset.suppress || ev.target === triangle) {
            ev.stopPropagation();
            delete b.dataset.suppress;
          }
        },
        true,
      );
    });
    if (ui.floating) {
      const tools = bar.querySelector('#tools');
      document.querySelector('#viewport > #tools')?.remove();
      if (tools) ui.floatToolbar();
    }
    cancelAnimationFrame(ui.toolbarFrame);
    ui.toolbarFrame = requestAnimationFrame(() => fitToolbar(ui));
  }
  function fitToolbar(ui) {
    const bar = document.getElementById('toolbar'),
      more = bar.querySelector('#more-tools');
    if (!more) return;
    bar.classList.remove('compact-labels', 'fold-host', 'overflow-path', 'overflow-options');
    bar.querySelectorAll('.tools .tool').forEach((x) => (x.style.display = ''));
    more.style.display = 'none';
    const overflow = () => bar.scrollWidth > bar.clientWidth + 1;
    if (overflow()) bar.classList.add('compact-labels');
    if (overflow()) bar.classList.add('fold-host');
    if (overflow()) {
      more.style.display = 'flex';
      bar.classList.add('overflow-path');
    }
    if (overflow()) bar.classList.add('overflow-options');
    const buttons = [...bar.querySelectorAll('.tools .tool')];
    for (let i = buttons.length - 1; i > 0 && overflow(); i--) {
      more.style.display = 'flex';
      buttons[i].style.display = 'none';
    }
  }
  function properties(ui, el) {
    const e = ui.e,
      sections = [...el.children];
    ['Align', 'Fill & Stroke'].forEach((title) => {
      const section = sections.find((s) => s.dataset.section === title);
      if (section) el.appendChild(section);
    });
    sections
      .filter((s) => !['Align', 'Fill & Stroke', 'Colors'].includes(s.dataset.section))
      .forEach((s) => el.appendChild(s));
    const colors = sections.find((s) => s.dataset.section === 'Colors');
    if (colors) el.appendChild(colors);
    const paints = el.querySelector('[data-section="Fill & Stroke"]');
    if (paints) {
      ['Fill', 'Stroke'].forEach((kind) => {
        const rows = [...paints.querySelectorAll(':scope > .field')],
          color = rows.find((r) => r.querySelector('label')?.textContent === kind + ' Color'),
          type = rows.find((r) => r.querySelector('label')?.textContent === kind + ' Type');
        if (color && type) {
          const values = color.querySelector('.values'),
            drop = document.createElement('button');
          drop.className = 'paint-eyedropper';
          drop.title = 'Pick ' + kind.toLowerCase();
          drop.innerHTML = icon('eyedropper');
          drop.onclick = () => {
            e.eyedropperKind = kind.toLowerCase();
            e.previousTool = e.tool;
            e.setTool('eyedropper');
          };
          values.appendChild(drop);
          values.appendChild(type.querySelector('select'));
          type.remove();
        }
      });
      [...paints.querySelectorAll('.field')]
        .filter((r) => ['Line Cap', 'Line Join'].includes(r.querySelector('label')?.textContent))
        .forEach((row) => {
          const select = row.querySelector('select'),
            box = document.createElement('div');
          box.className = 'segmented';
          const cap = row.querySelector('label').textContent === 'Line Cap';
          [...select.options].forEach((o, i) => {
            const b = document.createElement('button');
            b.className = o.selected ? 'active' : '';
            b.title = o.textContent;
            b.innerHTML = icon((cap ? 'cap-' : 'join-') + i);
            b.onclick = () => {
              select.value = o.value;
              select.dispatchEvent(new Event('change'));
            };
            box.appendChild(b);
          });
          select.hidden = true;
          select.parentElement.appendChild(box);
        });
    }
    el.querySelectorAll('[data-gradient-select]').forEach(
      (b) => (b.onclick = () => e.select(b.dataset.gradientSelect.split(','))),
    );
    el.querySelectorAll('[data-color-select]').forEach(
      (b) =>
        (b.onclick = () => {
          const ids = [];
          DM.walk(e.doc.layers, (n) => {
            if (
              n.type === 'text' &&
              ['fillColor', 'strokeColor'].some(
                (k) => n.text[k] && DM.hex(n.text[k]) === b.dataset.colorSelect,
              )
            )
              ids.push(n.id);
            if (!DM.isShape(n)) return;
            const paints = DM.paints(e.doc, n);
            if (
              Object.values(paints).some(
                (p) =>
                  p &&
                  Object.entries(p.props).some(
                    ([k, v]) => k.endsWith(' Color') && DM.hex(v) === b.dataset.colorSelect,
                  ),
              )
            )
              ids.push(n.id);
          });
          e.select(ids);
        }),
    );
    const align = el.querySelector('[data-section="Align"]');
    if (align) {
      const select = align.querySelector('select'),
        box = document.createElement('div');
      box.className = 'button-row align-targets';
      [...select.options].forEach((o, i) => {
        const b = document.createElement('button');
        b.title = o.textContent;
        b.className = o.selected ? 'active' : '';
        b.innerHTML = icon(['box', 'anchor', 'composition'][i]);
        b.onclick = () => {
          select.value = o.value;
          select.dispatchEvent(new Event('change'));
          ui.renderProperties();
        };
        box.appendChild(b);
      });
      select.closest('.field').replaceWith(box);
      const row = align.querySelector('.button-row');
      const center = document.createElement('button');
      center.title = 'Align center';
      center.innerHTML = icon('anchor');
      center.onclick = () => e.align('center');
      row.appendChild(center);
      if (e.selection.length < 2)
        align.querySelectorAll('[data-cmd="distribute"]').forEach((b) => b.parentElement.remove());
    }
  }
  g.WorkspaceUI = { toolbar, fitToolbar, properties };
})(window);
