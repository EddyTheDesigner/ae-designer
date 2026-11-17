(function (g) {
  'use strict';
  const D = DM,
    clamp = (v) => Math.max(0, Math.min(1, v));
  function render(ui, n, nodes) {
    const e = ui.e,
      v = Gradients.normalize(n),
      ids = nodes.map((x) => x.id),
      kind = n.type === 'gradientStroke' ? 'stroke' : 'fill';
    const edit = (label, fn) =>
      e.edit(label, () =>
        ids.forEach((id) => {
          const p = D.find(e.doc, id);
          if (p) fn(Gradients.normalize(p));
        }),
      );
    let html = ui.field('Gradient', v.type, (x) => edit('Gradient type', (s) => (s.type = x)), {
      choices: [
        ['linear', 'Linear'],
        ['radial', 'Radial'],
      ],
    });
    const colors = Array.from({ length: 33 }, (_, i) => {
      const s = Gradients.sample(v, i / 32);
      return `rgba(${s.rgb.map((x) => Math.round(x * 255)).join(',')},${s.alpha}) ${(i / 32) * 100}%`;
    }).join(',');
    html += `<div class="gradient-editor" data-gradient-owner="${n.id}" data-gradient-ids="${ids.join(',')}" data-gradient-kind="${kind}"><div class="gradient-ramp-bar" style="background:linear-gradient(to right,${colors})"></div>`;
    ['alphaStops', 'stops'].forEach((track, row) => {
      html += `<div class="gradient-track ${row ? 'color-track' : 'alpha-track'}" data-track="${track}">`;
      v[track].forEach((s, i) => {
        const selected =
          e.gradientStop &&
          e.gradientStop.id === n.id &&
          e.gradientStop.track === track &&
          e.gradientStop.index === i;
        html += `<button class="ramp-stop ${selected ? 'selected' : ''}" tabindex="0" data-ramp-stop="${i}" style="left:${s.position * 100}%;--stop:${row ? s.color : `rgb(${s.opacity * 2.55},${s.opacity * 2.55},${s.opacity * 2.55})`}" title="${row ? 'Color' : 'Opacity'} stop ${i + 1}"></button>`;
        if (v[track][i + 1])
          html += `<button class="ramp-midpoint" data-midpoint="${i}" style="left:${(s.position + (v[track][i + 1].position - s.position) * s.midpoint) * 100}%" title="Midpoint"></button>`;
      });
      html += '</div>';
    });
    html +=
      '</div><div class="button-row"><button data-gradient-reverse="' +
      n.id +
      '">Reverse gradient</button></div>';
    const sel =
        e.gradientStop && e.gradientStop.id === n.id
          ? e.gradientStop
          : { id: n.id, track: 'stops', index: 0 },
      stop = v[sel.track][sel.index];
    if (stop) {
      const isColor = sel.track === 'stops';
      html += ui.field(
        isColor ? 'Color' : 'Opacity',
        isColor ? stop.color : stop.opacity,
        (x) =>
          edit('Gradient stop', (s) => {
            const p = s[sel.track][sel.index];
            if (p) {
              p[isColor ? 'color' : 'opacity'] = x;
              if (isColor) delete p.rgb;
            }
          }),
        isColor ? { color: true } : { unit: '%' },
      );
      html += ui.field(
        'Location',
        stop.position * 100,
        (x) =>
          edit('Gradient stop position', (s) => {
            const stop = s[sel.track][sel.index];
            stop.position = clamp(x / 100);
            s[sel.track].sort((a, b) => a.position - b.position);
            e.gradientStop = { id: n.id, track: sel.track, index: s[sel.track].indexOf(stop) };
          }),
        { unit: '%' },
      );
    }
    ['start', 'end'].forEach(
      (k) =>
        (html += ui.field(k === 'start' ? 'Start' : 'End', v[k], (x) =>
          edit('Gradient ' + k, (s) => (s[k] = x)),
        )),
    );
    const dx = v.end[0] - v.start[0],
      dy = v.end[1] - v.start[1];
    html += ui.field(
      'Scale',
      100,
      (x) => edit('Scale gradient', (s) => (s.end = s.start.map((a, i) => a + ((s.end[i] - a) * x) / 100))),
      { unit: '%' },
    );
    html += ui.field(
      'Rotation',
      (Math.atan2(dy, dx) * 180) / Math.PI,
      (x) =>
        edit('Rotate gradient', (s) => {
          const len = Math.hypot(s.end[0] - s.start[0], s.end[1] - s.start[1]),
            a = (x * Math.PI) / 180;
          s.end = [s.start[0] + Math.cos(a) * len, s.start[1] + Math.sin(a) * len];
        }),
      { unit: '°' },
    );
    if (v.type === 'radial') {
      html += ui.field(
        'Highlight',
        v.highlight,
        (x) => edit('Gradient highlight', (s) => (s.highlight = Math.max(-99.9, Math.min(99.9, x)))),
        { unit: '%' },
      );
      html += ui.field(
        'Highlight angle',
        v.highlightAngle,
        (x) => edit('Gradient highlight angle', (s) => (s.highlightAngle = x)),
        { unit: '°' },
      );
    }
    return html;
  }
  function bind(ui, el) {
    const e = ui.e;
    el.querySelectorAll('[data-gradient-owner]').forEach((box) => {
      const id = box.dataset.gradientOwner,
        ids = box.dataset.gradientIds.split(','),
        paint = () => D.find(e.doc, id),
        apply = (fn) => {
          const source = D.clone(Gradients.normalize(paint()));
          fn(source);
          ids.forEach((id) => {
            const n = D.find(e.doc, id);
            if (n) n.gradient = D.clone(source);
          });
        };
      box.querySelectorAll('[data-track]').forEach((track) => {
        const key = track.dataset.track;
        track.onpointerdown = (ev) => {
          if (ev.button !== 0) return;
          ev.preventDefault();
          ev.stopPropagation();
          const rect = track.getBoundingClientRect(),
            pos = clamp((ev.clientX - rect.left) / rect.width),
            token = ev.target.closest('[data-ramp-stop],[data-midpoint]');
          if (!token) {
            e.edit('Add gradient stop', () =>
              apply((v) => {
                const s = Gradients.sample(v, pos);
                v[key].push(
                  key === 'stops'
                    ? { position: pos, color: D.hex(s.rgb), midpoint: 0.5 }
                    : { position: pos, opacity: s.alpha * 100, midpoint: 0.5 },
                );
                v[key].sort((a, b) => a.position - b.position);
              }),
            );
            return;
          }
          const midpoint = token.dataset.midpoint !== undefined,
            index = +(midpoint ? token.dataset.midpoint : token.dataset.rampStop),
            base = e.history.begin();
          e.gradientStop = { id, track: key, index };
          token.focus();
          token.setPointerCapture(ev.pointerId);
          let moved = false,
            remove = false;
          token.onpointermove = (mv) => {
            moved = true;
            const at = clamp((mv.clientX - rect.left) / rect.width);
            remove = !midpoint && Math.abs(mv.clientY - (rect.top + rect.height / 2)) > 36;
            apply((v) => {
              const a = v[key];
              if (midpoint)
                a[index].midpoint = clamp(
                  (at - a[index].position) / Math.max(1e-6, a[index + 1].position - a[index].position),
                );
              else a[index].position = at;
            });
            token.style.left = at * 100 + '%';
            token.style.opacity = remove ? '.25' : '1';
            e.renderCanvas();
          };
          token.onpointerup = () => {
            token.onpointermove = null;
            token.onpointerup = null;
            if (moved) {
              apply((v) => {
                const stop = v[key][index];
                if (remove && v[key].length > 2) v[key].splice(index, 1);
                v[key].sort((a, b) => a.position - b.position);
                e.gradientStop = { id, track: key, index: Math.max(0, v[key].indexOf(stop)) };
              });
              e.history.commit(base, 'Edit gradient stops');
              e.changed();
            } else {
              ui.renderProperties();
            }
          };
        };
        track.ondblclick = (ev) => {
          const mid = ev.target.closest('[data-midpoint]'),
            stop = ev.target.closest('[data-ramp-stop]');
          if (mid)
            e.edit('Reset midpoint', () => apply((v) => (v[key][+mid.dataset.midpoint].midpoint = 0.5)));
          else if (stop && key === 'stops') {
            e.gradientStop = { id, track: key, index: +stop.dataset.rampStop };
            ui.renderProperties();
            [...document.querySelectorAll('#properties .field')]
              .find((row) => row.querySelector('label')?.textContent === 'Color')
              ?.querySelector('input[type=color]')
              ?.click();
          }
        };
        track.onkeydown = (ev) => {
          const token = ev.target.closest('[data-ramp-stop]');
          if (!token) return;
          const index = +token.dataset.rampStop;
          if (['Delete', 'Backspace', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(ev.key)) {
            ev.preventDefault();
            ev.stopPropagation();
            e.edit('Gradient stop', () =>
              apply((v) => {
                if (ev.key === 'Delete' || ev.key === 'Backspace') {
                  if (v[key].length > 2) v[key].splice(index, 1);
                } else
                  v[key][index].position = clamp(
                    v[key][index].position +
                      (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown' ? -1 : 1) *
                        (ev.shiftKey ? 0.1 : 0.01),
                  );
                v[key].sort((a, b) => a.position - b.position);
              }),
            );
          }
        };
      });
      el.querySelector(`[data-gradient-reverse="${id}"]`).onclick = () =>
        e.edit('Reverse gradient', () => apply(Gradients.reverse));
    });
  }
  g.GradientUI = { render, bind };
})(window);
