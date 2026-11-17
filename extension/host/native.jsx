/* Native property snapshots preserve keyframes, interpolation and expressions
   when a Contents item must move between indexed property groups. ES3. */
var DMNative = (function () {
  function attempt(fn, fallback) { try { return fn(); } catch (e) { return fallback; } }
  function capture(p) {
    var s = { matchName: p.matchName, name: p.name, enabled: attempt(function () { return p.enabled; }, true) }, i, k;
    if (p.propertyType !== PropertyType.PROPERTY) {
      s.children = [];
      for (i = 1; i <= p.numProperties; i++) s.children.push(capture(p.property(i)));
      return s;
    }
    s.expression = attempt(function () { return p.expression; }, '');
    s.expressionEnabled = attempt(function () { return p.expressionEnabled; }, false);
    s.keys = [];
    s.value = attempt(function () { return p.value; }, undefined);
    s.custom = s.value === undefined || p.propertyValueType === PropertyValueType.CUSTOM_VALUE || p.propertyValueType === PropertyValueType.NO_VALUE;
    if(s.custom)return s;
    for (i = 1; i <= p.numKeys; i++) {
      k = { time: p.keyTime(i), value: p.keyValue(i) };
      k.inType = attempt(function () { return p.keyInInterpolationType(i); });
      k.outType = attempt(function () { return p.keyOutInterpolationType(i); });
      k.inEase = attempt(function () { return p.keyInTemporalEase(i); });
      k.outEase = attempt(function () { return p.keyOutTemporalEase(i); });
      k.temporalContinuous = attempt(function () { return p.keyTemporalContinuous(i); });
      k.temporalAutoBezier = attempt(function () { return p.keyTemporalAutoBezier(i); });
      k.inSpatial = attempt(function () { return p.keyInSpatialTangent(i); });
      k.outSpatial = attempt(function () { return p.keyOutSpatialTangent(i); });
      k.spatialContinuous = attempt(function () { return p.keySpatialContinuous(i); });
      k.spatialAutoBezier = attempt(function () { return p.keySpatialAutoBezier(i); });
      k.roving = attempt(function () { return p.keyRoving(i); });
      k.label = attempt(function () { return p.keyLabel(i); });
      s.keys.push(k);
    }
    return s;
  }
  function restore(p, s) {
    var i, q, k;
    attempt(function () { p.name = s.name; });
    attempt(function () { p.enabled = s.enabled; });
    if (s.children) {
      for (i = 0; i < s.children.length; i++) {
        var child = s.children[i];
        q = p.property(child.matchName);
        // Indexed contents can contain repeated match names. Rebuild just this copied subtree.
        if (p.propertyType === PropertyType.INDEXED_GROUP && p.canAddProperty(child.matchName)) q = p.addProperty(child.matchName);
        if (q) restore(q, child);
      }
      return;
    }
    if (s.custom) return;
    if (s.keys.length) {
      for (i = 0; i < s.keys.length; i++) p.setValueAtTime(s.keys[i].time, s.keys[i].value);
      for (i = 0; i < s.keys.length; i++) {
        k = s.keys[i];
        var j = p.nearestKeyIndex(k.time);
        if (k.inType !== undefined) attempt(function () { p.setInterpolationTypeAtKey(j, k.inType, k.outType); });
        if (k.inEase) attempt(function () { p.setTemporalEaseAtKey(j, k.inEase, k.outEase); });
        if (k.temporalContinuous !== undefined) attempt(function () { p.setTemporalContinuousAtKey(j, k.temporalContinuous); });
        if (k.temporalAutoBezier !== undefined) attempt(function () { p.setTemporalAutoBezierAtKey(j, k.temporalAutoBezier); });
        if (k.inSpatial) attempt(function () { p.setSpatialTangentsAtKey(j, k.inSpatial, k.outSpatial); });
        if (k.spatialContinuous !== undefined) attempt(function () { p.setSpatialContinuousAtKey(j, k.spatialContinuous); });
        if (k.spatialAutoBezier !== undefined) attempt(function () { p.setSpatialAutoBezierAtKey(j, k.spatialAutoBezier); });
        if (k.roving !== undefined) attempt(function () { p.setRovingAtKey(j, k.roving); });
        if (k.label !== undefined) attempt(function () { p.setLabelAtKey(j, k.label); });
      }
    } else p.setValue(s.value);
    if (s.expression) { p.expression = s.expression; p.expressionEnabled = s.expressionEnabled; }
  }
  function decode(s) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', out = '', buffer = 0, bits = 0, i, v;
    for (i = 0; i < s.length; i++) { v = chars.indexOf(s.charAt(i)); if (v < 0) continue; buffer = (buffer << 6) | v; bits += 6; if (bits >= 8) { bits -= 8; out += String.fromCharCode((buffer >> bits) & 255); } }
    return out;
  }
  function gradient(layer, property, encoded) {
    var c = layer.containingComp, selections = [], i, j, props, path, q, file;
    for (i = 1; i <= c.numLayers; i++) {
      var l = c.layer(i), item = { layer: l, selected: l.selected, paths: [] };
      props = l.selectedProperties;
      for (j = 0; j < props.length; j++) { path = []; q = props[j]; while (q && q.parentProperty) { path.unshift(q.propertyIndex); q = q.parentProperty; } if (q && q.propertyIndex) path.unshift(q.propertyIndex); item.paths.push(path); }
      selections.push(item);
      for (j = props.length - 1; j >= 0; j--) attempt((function (p) { return function () { p.selected = false; }; })(props[j]));
      l.selected = false;
    }
    file = new File(Folder.temp.fsName + '/dm-gradient-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000000) + '.ffx');
    try {
      file.encoding = 'BINARY';
      if (!file.open('w')) throw Error('Enable Allow Scripts to Write Files and Access Network in AE preferences.');
      file.write(decode(encoded)); file.close();
      layer.selected = true; property.selected = true;
      layer.applyPreset(file);
    } finally {
      attempt(function () { file.close(); file.remove(); });
      for (i = 1; i <= c.numLayers; i++) { props = c.layer(i).selectedProperties; for (j = props.length - 1; j >= 0; j--) attempt((function (p) { return function () { p.selected = false; }; })(props[j])); c.layer(i).selected = false; }
      for (i = 0; i < selections.length; i++) {
        var saved = selections[i];
        attempt((function (s) { return function () { s.layer.selected = s.selected; }; })(saved));
        for (j = 0; j < saved.paths.length; j++) { q = saved.layer; path = saved.paths[j]; for (var z = 0; z < path.length && q; z++) q = q.property(path[z]); if (q) attempt((function (p) { return function () { p.selected = true; }; })(q)); }
      }
    }
  }
  // Standard affine matrices use [a,b,c,d,tx,ty], matching Paper.js.
  function mul(a, b) { return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]]; }
  function layerMatrix(l, t) {
    var tr = l.property('ADBE Transform Group'), p = tr.property('ADBE Position').valueAtTime(t,false), a = tr.property('ADBE Anchor Point').valueAtTime(t,false), s = tr.property('ADBE Scale').valueAtTime(t,false), r = tr.property('ADBE Rotate Z').valueAtTime(t,false)*Math.PI/180, co = Math.cos(r), si = Math.sin(r);
    return [co*s[0]/100,si*s[0]/100,-si*s[1]/100,co*s[1]/100,p[0]-co*s[0]/100*a[0]+si*s[1]/100*a[1],p[1]-si*s[0]/100*a[0]-co*s[1]/100*a[1]];
  }
  function parentMatrix(l, t) { var m = [1,0,0,1,0,0], parents = [], p = l.parent, i; while (p) { parents.unshift(p); p = p.parent; } for (i=0;i<parents.length;i++) m=mul(m,layerMatrix(parents[i],t)); return m; }
  function descriptor(p, layer, kind) {
    var indices = [], names = [], q = p;
    while (q && q.parentProperty) { indices.unshift(q.propertyIndex); names.unshift(q.matchName); q = q.parentProperty; }
    if (q && q.propertyIndex) { indices.unshift(q.propertyIndex); names.unshift(q.matchName); }
    return { compId: layer.containingComp.id, layerId: layer.id, layerIndex: layer.index, kind: kind, propertyIndexPath: indices, matchNamePath: names };
  }
  return { capture: capture, restore: restore, gradient: gradient, parentMatrix: parentMatrix, descriptor: descriptor };
})();
