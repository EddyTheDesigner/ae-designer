#include "../vendor/json2.js"
#include "native.jsx"
#include "rigs.jsx"
/* ES3 host: all mutations are explicitly requested by Push and wrapped in one undo group.
   Source property indices are used only after validating the original hierarchy. */
var DMHost = (function () {
  var requests = {},
    baseline = null,
    session = String(new Date().getTime()),
    count = 0;
  function uid() {
    return 'ae-' + session + '-' + ++count;
  }
  function clone(x) {
    return JSON.parse(JSON.stringify(x));
  }
  function same(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  function identity() {
    return { position: [0, 0], anchor: [0, 0], scale: [100, 100], rotation: 0, skew: 0, skewAxis: 0, opacity: 100 };
  }
  function make(type, name) {
    return {
      id: uid(),
      type: type,
      name: name,
      visible: true,
      locked: false,
      props: {},
      meta: {},
      transform: identity(),
      children: [],
      label: 9,
      matchName: ''
    };
  }
  function active() {
    var c = app.project.activeItem;
    if (!(c instanceof CompItem)) throw Error('Open a composition in After Effects first.');
    return c;
  }
  function projectPath() {
    return app.project.file ? app.project.file.fsName : null;
  }
  function stack(c) {
    var a = [];
    for (var i = 1; i <= c.numLayers; i++) a.push(c.layer(i).id);
    return a;
  }
  function shapeValue(v) {
    return { vertices: v.vertices, inTangents: v.inTangents, outTangents: v.outTangents, closed: v.closed };
  }
  function meta(p, time) {
    var m = { keys: p.numKeys || 0, expression: false, atKey: false };
    try {
      m.expression = p.expressionEnabled;
    } catch (e) {}
    try {
      m.atKey = p.numKeys > 0 && Math.abs(p.keyTime(p.nearestKeyIndex(time)) - time) < 0.00001;
    } catch (e) {}
    return m;
  }
  function readValue(p, t) {
    var v = p.valueAtTime(t, false);
    if (p.propertyValueType === PropertyValueType.SHAPE) return shapeValue(v);
    if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean' || v instanceof Array) return v;
    return null;
  }
  function props(p, n, t, prefix) {
    for (var i = 1; i <= p.numProperties; i++) {
      var q = p.property(i),
        key = prefix ? prefix + '/' + q.matchName : q.matchName;
      if (q.propertyType === PropertyType.PROPERTY) {
        try {
          var v = readValue(q, t);
          if (v !== null) {
            n.props[key] = v;
            n.meta[key] = meta(q, t);
          }
        } catch (e) {}
      } else if (q.matchName !== 'ADBE Vectors Group' && q.matchName !== 'ADBE Vector Transform Group') {
        props(q, n, t, key);
      }
    }
  }
  var tm = {
    position: 'ADBE Position',
    anchor: 'ADBE Anchor Point',
    scale: 'ADBE Scale',
    rotation: 'ADBE Rotate Z',
    xRotation:'ADBE Rotate X',
    yRotation:'ADBE Rotate Y',
    orientation:'ADBE Orientation',
    opacity: 'ADBE Opacity'
  };
  var vm = {
    position: 'ADBE Vector Position',
    anchor: 'ADBE Vector Anchor',
    scale: 'ADBE Vector Scale',
    rotation: 'ADBE Vector Rotation',
    opacity: 'ADBE Vector Group Opacity',
    skew: 'ADBE Vector Skew',
    skewAxis: 'ADBE Vector Skew Axis'
  };
  function readTransform(group, n, t, isLayer) {
    var map = isLayer ? tm : vm;
    for (var key in map) {
      var p = group.property(map[key]);
      if (p) {
        try {
          n.transform[key] = readValue(p, t);
          n.meta['transform.' + key] = meta(p, t);
        } catch (e) {}
      }
    }
  }
  function typeOf(m) {
    var map = {
      'ADBE Vector Group': 'group',
      'ADBE Vector Shape - Rect': 'rect',
      'ADBE Vector Shape - Ellipse': 'ellipse',
      'ADBE Vector Shape - Star': 'star',
      'ADBE Vector Shape - Group': 'path',
      'ADBE Vector Graphic - Fill': 'fill',
      'ADBE Vector Graphic - Stroke': 'stroke',
      'ADBE Vector Graphic - G-Fill': 'gradientFill',
      'ADBE Vector Graphic - G-Stroke': 'gradientStroke'
    };
    return map[m] || 'operator';
  }
  function readContents(contents, t, prefix, layer) {
    var a = [];
    for (var i = 1; i <= contents.numProperties; i++) {
      var q = contents.property(i),
        n = make(typeOf(q.matchName), q.name);
      n.matchName = q.matchName;
      n.source = { path: prefix.concat([i]) };
      try {
        n.visible = q.enabled;
      } catch (e) {}
      props(q, n, t, '');
      if(n.type==='gradientFill'||n.type==='gradientStroke'){var gc=q.property('ADBE Vector Grad Colors');n.meta['ADBE Vector Grad Colors']=meta(gc,t);try{n.gradientDescriptor=DMNative.descriptor(gc,layer,n.type==='gradientStroke'?'stroke':'fill');}catch(e){}}
      if(n.type==='stroke'||n.type==='gradientStroke'){n.dashes=[];for(var dk in n.props)if(/ADBE Vector Stroke (Dash|Gap) [0-9]+$/.test(dk))n.dashes.push(n.props[dk]);n.dashOffset=n.props['ADBE Vector Stroke Dashes/ADBE Vector Stroke Offset']||0;}
      if (n.type === 'group') {
        n.children = readContents(q.property('ADBE Vectors Group'), t, n.source.path.concat(['ADBE Vectors Group']), layer);
        readTransform(q.property('ADBE Vector Transform Group'), n, t, false);
      }
      a.push(n);
    }
    return a;
  }
  function readText(layer,t){
 var p=layer.property('ADBE Text Properties').property('ADBE Text Document'),v=p.valueAtTime(t,false),o={},keys=['text','font','fontFamily','fontStyle','fontSize','leading','autoLeading','tracking','kerning','applyFill','fillColor','applyStroke','strokeColor','strokeWidth','strokeOverFill','horizontalScale','verticalScale','baselineShift','allCaps','smallCaps','ligature','tsume','spaceBefore','spaceAfter','startIndent','endIndent','firstLineIndent'];
 for(var i=0;i<keys.length;i++)try{o[keys[i]]=v[keys[i]];}catch(ignore){}
 var just=['LEFT_JUSTIFY','CENTER_JUSTIFY','RIGHT_JUSTIFY','FULL_JUSTIFY_LASTLINE_LEFT','FULL_JUSTIFY_LASTLINE_CENTER','FULL_JUSTIFY_LASTLINE_RIGHT','FULL_JUSTIFY_LASTLINE_FULL'],names=['left','center','right','full-last-left','full-last-center','full-last-right','full'];o.justification='left';for(i=0;i<just.length;i++)if(v.justification===ParagraphJustification[just[i]])o.justification=names[i];
 o.direction='left-to-right';try{if(v.direction===ParagraphDirection.DIRECTION_RIGHT_TO_LEFT)o.direction='right-to-left';}catch(ignore){}
 o.hindiDigits=false;try{o.hindiDigits=v.digitSet===DigitSet.HINDI_DIGITS;}catch(ignore){}
 o.lineJoinType=0;try{o.lineJoinType=v.lineJoinType===LineJoinType.LINE_JOIN_ROUND?1:v.lineJoinType===LineJoinType.LINE_JOIN_BEVEL?2:0;}catch(ignore){}
 o.baselineOption='Normal';try{o.baselineOption=v.fontBaselineOption===FontBaselineOption.FONT_FAUXED_SUPERSCRIPT?'Superscript':v.fontBaselineOption===FontBaselineOption.FONT_FAUXED_SUBSCRIPT?'Subscript':'Normal';}catch(ignore){}
 o.paintOrder=o.strokeOverFill?'Stroke Over Fill':'Fill Over Stroke';try{var order=layer.property('ADBE Text Properties').property('ADBE Text More Options').property('ADBE Text Render Order').valueAtTime(t,false);if(order===2)o.paintOrder='All Strokes Over All Fills';if(order===3)o.paintOrder='All Fills Over All Strokes';}catch(ignore){}
 try{o.boxText=v.boxText;if(v.boxText){o.boxTextSize=v.boxTextSize;o.boxTextPos=v.boxTextPos;}}catch(ignore){}
 return {value:o,meta:meta(p,t)};
}
  function maskName(v) {
    var keys = ['NONE', 'ADD', 'SUBTRACT', 'INTERSECT', 'LIGHTEN', 'DARKEN', 'DIFFERENCE'];
    for (var i = 0; i < keys.length; i++) if (v === MaskMode[keys[i]]) return keys[i].toLowerCase();
    return 'add';
  }
  function maskMode(v) {
    return typeof v === 'number' ? v : MaskMode[String(v).toUpperCase()] || MaskMode.ADD;
  }
  function readMask(m, t, index) {
    var n = make('mask', m.name);
    n.matchName = 'ADBE Mask Atom';
    n.source = { mask: index };
    props(m, n, t, '');
    n.mask = { mode: maskName(m.maskMode), inverted: m.inverted, color: m.color, rotoBezier: m.rotoBezier };
    n.locked = m.locked;
    return n;
  }
  function previewLayer(l,t,n){try{var source=l.source;n.preview={width:l.width,height:l.height};if(source&&source.mainSource&&source.mainSource.color){n.preview.color=source.mainSource.color;return;}if(!source)return;var temp=null,c=source instanceof CompItem?source:null,file=new File(Folder.temp.fsName+'/dm-preview-'+session+'-'+l.id+'.png');try{if(!c){temp=app.project.items.addComp('__AE Designer preview__',Math.max(1,l.width),Math.max(1,l.height),1,Math.max(1,source.duration||1),30);temp.layers.add(source);c=temp;}c.saveFrameToPng(Math.max(0,(t-l.startTime)*100/(l.stretch||100)),file);for(var wait=0;wait<20&&!file.exists;wait++)$.sleep(25);if(file.exists)n.previewFile=file.fsName;}finally{if(temp)temp.remove();}}catch(e){n.previewError=e.toString();}}
  function readLayer(l, t) {
    var n = make(l instanceof TextLayer ? 'text' : 'layer', l.name);
    n.layerKind = l instanceof ShapeLayer ? 'shape' : l instanceof TextLayer ? 'text' : 'other';
    n.source = { layerId: l.id, index: l.index };
    n.visible = l.enabled;
    n.locked = l.locked;
    n.label = l.label;
    n.threeD = l.threeDLayer;
    n.parentId = l.parent ? l.parent.id : null;
    if(l.parent)n.parentMatrix=DMNative.parentMatrix(l,t);
    n.blendMode = Number(l.blendingMode);
    readTransform(l.property('ADBE Transform Group'), n, t, true);
    var parent=l.parent,has3D=n.threeD;n.parentTransforms3D=[];while(parent){var parentNode=make('layer',parent.name);readTransform(parent.property('ADBE Transform Group'),parentNode,t,true);n.parentTransforms3D.unshift(parentNode.transform);if(parent.threeDLayer)has3D=true;parent=parent.parent;}
    if(has3D){var projectionComp=l.containingComp,previousTime=projectionComp?projectionComp.time:t;try{if(projectionComp)projectionComp.time=t;var samples=[],coordinates=[[0,0,0],[256,0,0],[0,256,0],[256,256,0],[0,0,256],[256,0,256],[0,256,256],[256,256,256]];for(var pi=0;pi<coordinates.length;pi++){var result=l.sourcePointToComp(coordinates[pi]);samples.push({local:coordinates[pi],comp:[result[0],result[1]]});}n.projection={transform:clone(n.transform),samples:samples};}catch(pe){n.projectionError=pe.toString();}finally{if(projectionComp)projectionComp.time=previousTime;}}
    if (n.layerKind === 'shape')
      n.children = readContents(l.property('ADBE Root Vectors Group'), t, ['ADBE Root Vectors Group'], l);
    if (n.type === 'text') {
      var tx = readText(l, t);
      n.text = tx.value;
      n.meta.text = tx.meta;
    }
    var masks = l.property('ADBE Mask Parade');
    if (masks) for (var i = 1; i <= masks.numProperties; i++) n.children.push(readMask(masks.property(i), t, i));
    if(n.layerKind==='other')previewLayer(l,t,n);
    try{for(var blend in BlendingMode)if(BlendingMode[blend]===l.blendingMode)n.blendName=blend;}catch(ignore){}
    DMRigs.read(l,n,t);
    return n;
  }
  function pull(args) {
    var c = active(),
      layers = args.selected ? c.selectedLayers : null,
      doc = {
        version: 1,
        name: c.name,
        width: c.width,
        height: c.height,
        background: c.bgColor,
        time: c.time,
        layers: [],
        guides: [],
        source: { project: projectPath(), dirty: app.project.dirty, compId: c.id, session: session, stack: stack(c) }
      };
    var notes = [];
    for (var i = 1; i <= c.numLayers; i++) {
      var l = c.layer(i),
        include = !args.selected;
      if (layers) {
        for (var j = 0; j < layers.length; j++) if (layers[j].id === l.id) include = true;
      }
      if(args.layerIds){include=false;for(var li=0;li<args.layerIds.length;li++)if(args.layerIds[li]===l.id)include=true;}
      if (!include || l.inPoint > c.time || l.outPoint <= c.time) continue;
      var masks = l.property('ADBE Mask Parade');
      if (!(l instanceof ShapeLayer) && !(l instanceof TextLayer) && !(masks && masks.numProperties)) continue;
      if (l instanceof TextLayer && parseFloat(app.version) < 24) {
        notes.push(l.name + ': text requires AE 2024 or newer.');
        continue;
      }
      var n = readLayer(l, c.time);
      if(n.projectionError)notes.push(l.name+': After Effects could not provide its projected coordinates. '+n.projectionError);
      doc.layers.push(n);
    }
    try {
      var guides = c.guides;
      for (var g = 0; g < guides.length; g++)
        doc.guides.push({ orientation: guides[g].orientationType, position: guides[g].position });
    } catch (e) {}
    baseline = clone(doc);
    return { document: doc, notes: notes };
  }
  var pullJob=null;
  function beginPull(args){var c=active(),saved=baseline,r=pull({layerIds:[]}),ids=[],selected=c.selectedLayers;baseline=saved;for(var i=1;i<=c.numLayers;i++){var layer=c.layer(i),include=!args.selected;if(args.selected)for(var j=0;j<selected.length;j++)if(selected[j].id===layer.id)include=true;if(!include||layer.inPoint>c.time||layer.outPoint<=c.time)continue;var masks=layer.property('ADBE Mask Parade');if(layer instanceof ShapeLayer||layer instanceof TextLayer||masks&&masks.numProperties)ids.push(layer.id);}pullJob={document:r.document,notes:[],ids:ids,at:0};return {document:clone(r.document),total:ids.length};}
  function pullNext(){if(!pullJob)throw Error('No pull is in progress.');var c=active(),job=pullJob;if(c.id!==job.document.source.compId||!same(stack(c),job.document.source.stack))throw Error('The composition changed during the pull. Pull again.');var layers=[];for(var count=0;count<3&&job.at<job.ids.length;count++){var layer=findLayer(c,job.ids[job.at++]);if(!layer)continue;if(layer instanceof TextLayer&&parseFloat(app.version)<24){job.notes.push(layer.name+': text requires AE 2024 or newer.');continue;}var n=readLayer(layer,job.document.time);layers.push(n);job.document.layers.push(n);}return {layers:layers,done:job.at,total:job.ids.length};}
  function finishPull(){if(!pullJob)throw Error('No pull is in progress.');baseline=clone(pullJob.document);var result={document:pullJob.document,notes:pullJob.notes};pullJob=null;return result;}
  function findLayer(c, id) {
    for (var i = 1; i <= c.numLayers; i++) if (c.layer(i).id === id) return c.layer(i);
    return null;
  }
  function byId(nodes, id) {
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].id === id) return nodes[i];
      var child = byId(nodes[i].children || [], id);
      if (child) return child;
    }
    return null;
  }
  function resolve(p, path) {
    for (var i = 0; i < path.length; i++) {
      p = p.property(path[i]);
      if (!p) return null;
    }
    return p;
  }
  function writeValue(p, v, t, label, notes) {
    if (!p) {
      notes.push(label + ': property is not available in this AE version.');
      return false;
    }
    try {
      if (p.expressionEnabled) {
        if(p.expression&&p.expression.indexOf('// AE Designer rig')===0)return true;
        notes.push(label + ': expression-driven value was left unchanged.');
        return false;
      }
      if (p.propertyValueType === PropertyValueType.SHAPE) {
        var s = new Shape();
        s.vertices = v.vertices;
        s.inTangents = v.inTangents;
        s.outTangents = v.outTangents;
        s.closed = v.closed;
        v = s;
      }
      if (p.numKeys > 0) p.setValueAtTime(t, v);
      else p.setValue(v);
      return true;
    } catch (e) {
      notes.push(label + ': ' + e.toString());
      return false;
    }
  }
  function applyProps(p,n,b,t,notes){for(var key in n.props){if(key==='ADBE Vector Grad Colors')continue;if((n.type==='gradientFill'||n.type==='gradientStroke')&&(key==='ADBE Vector Fill Color'||key==='ADBE Vector Stroke Color'))continue;if(!b||!same(n.props[key],b.props[key])){var target=ensureNested(p,key.split('/'));if(target&&target.expression&&target.expression.indexOf('// AE Designer rig')===0&&!n.rigControlled)target.expression='';writeValue(target,n.props[key],t,n.name+' / '+key,notes);}}
 if(b){for(var old in b.props)if(old.indexOf('ADBE Vector Stroke Dashes/')===0&&n.props[old]===undefined){var gone=resolve(p,old.split('/'));if(gone)gone.remove();}}
}
  function applyTransform(p,n,b,t,layer,notes){var map=layer?tm:vm;for(var key in map){var v=n.transform[key];if(v===undefined)continue;if(!b||!same(v,b.transform[key])){var prop=p.property(map[key]);if(key==='position'&&prop&&prop.dimensionsSeparated){for(var d=0;d<v.length;d++)writeValue(prop.getSeparationFollower(d),v[d],t,n.name+' / '+key,notes);}else writeValue(prop,v,t,n.name+' / '+key,notes);}}}
  function signature(nodes) {
    var a = [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.type === 'mask') continue;
      a.push(n.id + ':' + n.type);
      if (n.children.length) a.push(signature(n.children));
    }
    return a.join('|');
  }
  function hasAnimation(n) {
    for (var k in n.meta) if (n.meta[k].keys || n.meta[k].expression) return true;
    for (var i = 0; i < n.children.length; i++) if (hasAnimation(n.children[i])) return true;
    return false;
  }
  function ensureNested(p, path) {
    var curr = p;
    for (var i = 0; i < path.length; i++) {
      var next = curr.property(path[i]);
      if (!next && curr.canAddProperty(path[i])) next = curr.addProperty(path[i]);
      if (!next) return null;
      curr = next;
    }
    return curr;
  }
  function createContents(contents,nodes,t,notes,layer,asNew){for(var i=0;i<nodes.length;i++){var n=nodes[i];if(n.type==='mask')continue;try{var model=n,type=n.matchName;if(!type)throw Error('Missing native shape type.');if(asNew&&(n.type==='gradientFill'||n.type==='gradientStroke')){model=solidGradient(n);type=model.matchName;notes.push(n.name+': Push as new creates a solid using the gradient start color.');}var p=contents.addProperty(type);p.name=n.name;try{p.enabled=n.visible;}catch(e){}if(n.type==='group'){applyProps(p,model,null,t,notes);applyTransform(p.property('ADBE Vector Transform Group'),model,null,t,false,notes);createContents(p.property('ADBE Vectors Group'),n.children,t,notes,layer,asNew);}else{applyProps(p,model,null,t,notes);if(!asNew)applyGradient(layer,p,n,null,notes);}}catch(e){notes.push(n.name+': '+e.toString());}}}
  function applyExisting(l,n,b,t,notes){var p=resolve(l,n.source.path);if(!p){notes.push(n.name+': source property is missing.');return;}try{if(n.name!==b.name)p.name=n.name;if(n.visible!==b.visible)p.enabled=n.visible;}catch(e){notes.push(n.name+': '+e.toString());}applyProps(p,n,b,t,notes);if(n.type==='group')applyTransform(p.property('ADBE Vector Transform Group'),n,b,t,false,notes);applyGradient(l,p,n,b,notes);for(var i=0;i<n.children.length;i++){var old=byId(b.children,n.children[i].id);if(old)applyExisting(l,n.children[i],old,t,notes);}}
  function applyText(l,n,b,t,notes){
 if(b&&same(n.text,b.text))return;var p=l.property('ADBE Text Properties').property('ADBE Text Document');if(p.expressionEnabled){notes.push(n.name+': text is expression-driven.');return;}var v=p.valueAtTime(t,false),changed=false;
 var just={'left':'LEFT_JUSTIFY','center':'CENTER_JUSTIFY','right':'RIGHT_JUSTIFY','full-last-left':'FULL_JUSTIFY_LASTLINE_LEFT','full-last-center':'FULL_JUSTIFY_LASTLINE_CENTER','full-last-right':'FULL_JUSTIFY_LASTLINE_RIGHT','full':'FULL_JUSTIFY_LASTLINE_FULL'};
 for(var k in n.text){if(!n.text.hasOwnProperty(k)||b&&same(n.text[k],b.text[k])||k==='boxText'||k==='fontFamily'||k==='fontStyle'||k==='allCaps'||k==='smallCaps'||k==='paintOrder')continue;
 try{if(k==='justification')v.justification=ParagraphJustification[just[n.text[k]]||'LEFT_JUSTIFY'];else if(k==='direction')v.direction=n.text[k]==='right-to-left'?ParagraphDirection.DIRECTION_RIGHT_TO_LEFT:ParagraphDirection.DIRECTION_LEFT_TO_RIGHT;else if(k==='hindiDigits')v.digitSet=n.text[k]?DigitSet.HINDI_DIGITS:DigitSet.DEFAULT_DIGITS;else if(k==='lineJoinType')v.lineJoinType=[LineJoinType.LINE_JOIN_MITER,LineJoinType.LINE_JOIN_ROUND,LineJoinType.LINE_JOIN_BEVEL][n.text[k]];else if(k==='baselineOption')v.fontBaselineOption=n.text[k]==='Superscript'?FontBaselineOption.FONT_FAUXED_SUPERSCRIPT:n.text[k]==='Subscript'?FontBaselineOption.FONT_FAUXED_SUBSCRIPT:FontBaselineOption.FONT_NORMAL_BASELINE;else v[k]=n.text[k];changed=true;}catch(ex){notes.push(n.name+' / '+k+': '+ex.toString());}}
 if(!b||n.text.allCaps!==b.text.allCaps||n.text.smallCaps!==b.text.smallCaps)try{v.fontCapsOption=n.text.allCaps&&n.text.smallCaps?FontCapsOption.FONT_ALL_SMALL_CAPS:n.text.allCaps?FontCapsOption.FONT_ALL_CAPS:n.text.smallCaps?FontCapsOption.FONT_SMALL_CAPS:FontCapsOption.FONT_NORMAL_CAPS;changed=true;}catch(ex){notes.push(n.name+': font caps require AE 2024 or newer.');}
 if(n.text.paintOrder&&(!b||n.text.paintOrder!==b.text.paintOrder)){try{var order=n.text.paintOrder;v.strokeOverFill=order==='Stroke Over Fill'||order==='All Strokes Over All Fills';var render=l.property('ADBE Text Properties').property('ADBE Text More Options').property('ADBE Text Render Order');writeValue(render,order==='All Strokes Over All Fills'?2:order==='All Fills Over All Strokes'?3:1,t,n.name+' paint order',notes);changed=true;}catch(ex){notes.push(n.name+' paint order: '+ex.toString());}}
 if(changed)writeValue(p,v,t,n.name+' text',notes);
}
  function applyMasks(l,n,b,t,notes){var parade=l.property('ADBE Mask Parade'),desired=[],old=[],current=[],i,j;for(i=0;i<n.children.length;i++)if(n.children[i].type==='mask')desired.push(n.children[i]);if(b)for(i=0;i<b.children.length;i++)if(b.children[i].type==='mask'){old.push(b.children[i]);current.push(b.children[i].id);}for(i=0;i<desired.length;i++){var m=desired[i],base=byId(old,m.id),at=-1;for(j=0;j<current.length;j++)if(current[j]===m.id){at=j;break;}var p=at>=0?parade.property(at+1):parade.addProperty('ADBE Mask Atom');if(at<0){current.push(m.id);at=current.length-1;}try{p.locked=false;if(at!==i){p.moveTo(i+1);current.splice(at,1);current.splice(i,0,m.id);p=parade.property(i+1);}p.name=m.name;applyProps(p,m,base,t,notes);if(m.mask){p.maskMode=maskMode(m.mask.mode);p.inverted=m.mask.inverted;p.color=m.mask.color;p.rotoBezier=!!m.mask.rotoBezier;}p.locked=m.locked;}catch(e){notes.push(m.name+': '+e.toString());}}for(i=current.length-1;i>=desired.length;i--){var dead=parade.property(i+1);dead.locked=false;dead.remove();}}
  function solidGradient(n) {
    var copy=clone(n), stroke=n.type==='gradientStroke', col=n.gradient?n.gradient.stops[0].color:'#000000', props={};
    copy.type=stroke?'stroke':'fill';copy.matchName=stroke?'ADBE Vector Graphic - Stroke':'ADBE Vector Graphic - Fill';
    for(var k in n.props)if(k.indexOf('ADBE Vector Grad ')!==0)props[k]=n.props[k];
    props[stroke?'ADBE Vector Stroke Color':'ADBE Vector Fill Color']=[parseInt(col.substr(1,2),16)/255,parseInt(col.substr(3,2),16)/255,parseInt(col.substr(5,2),16)/255];copy.props=props;delete copy.gradient;return copy;
  }
  function applyGradient(layer,p,n,b,notes) {
    if(!n.gradientPreset||b&&same(n.gradient,b.gradient))return;
    var prop=p.property('ADBE Vector Grad Colors');
    if(!prop)return;
    if(prop.numKeys||prop.expressionEnabled){notes.push(n.name+': colors are edited in After Effects.');return;}
    try{DMNative.gradient(layer,prop,n.gradientPreset);}catch(e){notes.push(n.name+' / gradient: '+e.toString());}
  }
  function hydrateGradients(args) {
    if(!baseline)return false;
    for(var i=0;i<args.gradients.length;i++){var pair=args.gradients[i],n=byId(baseline.layers,pair.id);if(n)n.gradient=clone(pair.gradient);}
    return true;
  }
  function eachNode(nodes,fn,parent) { for(var i=0;i<nodes.length;i++){fn(nodes[i],parent);eachNode(nodes[i].children||[],fn,nodes[i]);} }
  function structuralContext(c,doc) {
    var ctx={snapshots:{},originals:{},parents:{},desiredParents:{},desired:{}};
    eachNode(doc.layers,function(n,p){ctx.desired[n.id]=n;ctx.desiredParents[n.id]=p?p.id:null;});
    if(!baseline)return ctx;
    for(var i=0;i<baseline.layers.length;i++){
      var base=baseline.layers[i],layer=findLayer(c,base.source.layerId);
      if(!layer)continue;
      eachNode(base.children,function(n,p){ctx.originals[n.id]=n;ctx.parents[n.id]=p?p.id:base.id;
        if(n.source&&n.source.path){var native=resolve(layer,n.source.path);if(!native||native.matchName!==n.matchName)throw Error(base.name+': the native Contents hierarchy changed. Pull again.');ctx.snapshots[n.id]=DMNative.capture(native);}
      });
    }
    // Moving an unreadable custom gradient is refused before any source is removed.
    eachNode(doc.layers,function(n){var old=ctx.originals[n.id];if(old&&ctx.parents[n.id]!==ctx.desiredParents[n.id])eachNode([n],function(x){if((x.type==='gradientFill'||x.type==='gradientStroke')&&!x.gradientPreset)throw Error(x.name+': its native gradient colors could not be read. Save the project and pull again before moving this group.');});});
    return ctx;
  }
  function topLayer(doc,id){for(var i=0;i<doc.layers.length;i++)if(doc.layers[i].id===id)return true;return false;}
  function shapeChildren(nodes) { var a=[];for(var i=0;i<nodes.length;i++)if(nodes[i].type!=='mask')a.push(nodes[i]);return a; }
  function syncContents(layer,path,nodes,oldNodes,t,notes,ctx,forceGradients) {
    var desired=shapeChildren(nodes), current=shapeChildren(oldNodes||[]), i,j,n,b,p,contents,idx;
    for(i=0;i<desired.length;i++){
      n=desired[i];b=ctx.originals[n.id]||null;idx=-1;
      for(j=0;j<current.length;j++)if(current[j].id===n.id&&current[j].matchName===n.matchName){idx=j;break;}
      contents=resolve(layer,path);
      var created=idx<0;
      if(idx<0){
        p=contents.addProperty(n.matchName);
        var snap=ctx.snapshots[n.id]||ctx.snapshots[n.duplicateOf];
        if(snap&&snap.matchName===n.matchName&&(b||n.type!=='group'))DMNative.restore(p,snap);
        idx=contents.numProperties-1;current.push(n);
      }
      if(idx!==i){contents.property(idx+1).moveTo(i+1);var moved=current.splice(idx,1)[0];current.splice(i,0,moved);}
      p=resolve(layer,path).property(i+1);p.name=n.name;try{p.enabled=n.visible;}catch(e){}
      applyProps(p,n,b,t,notes);
      if(n.type==='group'){
        applyTransform(p.property('ADBE Vector Transform Group'),n,b,t,false,notes);
        syncContents(layer,path.concat([i+1,'ADBE Vectors Group']),n.children,b?b.children:[],t,notes,ctx,forceGradients||created);
      }else applyGradient(layer,p,n,forceGradients||created?null:b,notes);
    }
    contents=resolve(layer,path);
    for(i=current.length-1;i>=desired.length;i--)contents.property(i+1).remove();
  }
  function preflight(c, doc, args) {
    if (!doc || doc.version !== 1 || !(doc.layers instanceof Array)) throw Error('Invalid document.');
    if (!args.asNew&&doc.source) {
      if (!baseline || !doc.source || doc.source.session !== session)
        throw Error('Push is paused. Reattach this draft or use Push as new.');
      if (doc.source.compId !== c.id || doc.source.project !== projectPath())
        throw Error('Activate the project and composition used for the pull.');
      if (!same(doc.source.stack, stack(c)) && !args.force) {
        var e = Error('The layer stack changed in After Effects.');
        e.code = 'STACK_CHANGED';
        throw e;
      }
    }
  }
  function push(args){
 var c=active(),doc=args.document,notes=[],landed=0,layerMap={},created=[];args.asNew=!!args.asNew||!doc.source;preflight(c,doc,args);
 var structural=!args.asNew&&doc.source&&baseline&&signature(doc.layers)!==signature(baseline.layers),ctx=structural?structuralContext(c,doc):null;
 app.beginUndoGroup('AE Designer: Push');
 try{
  for(var i=doc.layers.length-1;i>=0;i--){var n=doc.layers[i],b=!args.asNew&&doc.source&&baseline?byId(baseline.layers,n.id):null,l=b?findLayer(c,b.source.layerId):null;
   if(b&&!l){notes.push(n.name+': original layer was removed.');continue;}if(!b&&n.layerKind==='other'){notes.push(n.name+': Push as new cannot recreate its footage source.');continue;}
   if(l)layerMap[n.id]=l.id;if(b&&same(n,b))continue;var wasLocked=l?l.locked:false;
   try{
    if(!l){if(n.type==='text'){if(parseFloat(app.version)<24)throw Error('Text requires AE 2024 or newer.');l=n.text.boxText?c.layers.addBoxText(n.text.boxTextSize||[400,200],n.text.text):c.layers.addText(n.text.text);}else l=c.layers.addShape();created.push(l.id);layerMap[n.id]=l.id;}
    l.locked=false;l.name=n.name;l.enabled=n.visible;l.label=n.label||0;if(n.blendName&&typeof BlendingMode!=='undefined'&&BlendingMode[n.blendName]!==undefined)l.blendingMode=BlendingMode[n.blendName];else if(n.blendMode)l.blendingMode=n.blendMode;
    if(!b){l.threeDLayer=!!n.threeD;if(n.parentId&&!args.asNew){var par=findLayer(c,n.parentId);if(par)l.setParentWithJump(par);}}
    applyTransform(l.property('ADBE Transform Group'),n,b,doc.time,true,notes);
    if(n.type==='text')applyText(l,n,b,doc.time,notes);else if(n.layerKind!=='other'){
      if(args.asNew)createContents(l.property('ADBE Root Vectors Group'),n.children,doc.time,notes,l,true);
      else if(structural)syncContents(l,['ADBE Root Vectors Group'],n.children,b?b.children:[],doc.time,notes,ctx);
      else if(!b)createContents(l.property('ADBE Root Vectors Group'),n.children,doc.time,notes,l,false);
      else for(var j=0;j<n.children.length;j++)if(n.children[j].type!=='mask'){var old=byId(b.children,n.children[j].id);if(old)applyExisting(l,n.children[j],old,doc.time,notes);}
    }
    applyMasks(l,n,b,doc.time,notes);DMRigs.write(l,n,doc.time,notes);l.locked=n.locked;landed++;
   }catch(e){notes.push(n.name+': '+e.toString());try{l.locked=wasLocked;}catch(ignore){}}
  }
  if(!args.asNew&&doc.source&&baseline&&!notes.length){for(i=baseline.layers.length-1;i>=0;i--){var original=baseline.layers[i];if(!topLayer(doc,original.id)){var dead=findLayer(c,original.source.layerId);if(dead){dead.locked=false;dead.remove();landed++;}}}}
  if(!notes.length&&structural){var ids=[],originalIds={},ordered=[],at=0,last=-1;for(i=0;i<doc.layers.length;i++)if(layerMap[doc.layers[i].id])ids.push(layerMap[doc.layers[i].id]);for(i=0;i<baseline.layers.length;i++)originalIds[baseline.layers[i].source.layerId]=true;
    for(i=0;i<baseline.source.stack.length;i++){var oldId=baseline.source.stack[i];if(originalIds[oldId]){if(at<ids.length)ordered.push(ids[at++]);last=ordered.length;}else if(findLayer(c,oldId))ordered.push(oldId);}
    if(last<0)last=0;while(at<ids.length)ordered.splice(last++,0,ids[at++]);
    for(i=ordered.length-1;i>=0;i--){var reorder=findLayer(c,ordered[i]),next=i+1<ordered.length?findLayer(c,ordered[i+1]):null;if(!reorder)continue;var lock=reorder.locked;reorder.locked=false;if(next){if(reorder.index!==next.index-1)reorder.moveBefore(next);}else if(reorder.index!==c.numLayers)reorder.moveToEnd();reorder.locked=lock;}
  }
  if(!args.asNew&&baseline&&!same(doc.guides,baseline.guides)||args.asNew&&doc.guides.length){try{if(!args.asNew)for(i=c.guides.length-1;i>=0;i--)c.removeGuide(i);for(i=0;i<doc.guides.length;i++)c.addGuide(doc.guides[i].orientation,Math.round(doc.guides[i].position));}catch(e){notes.push('Guides: '+e.toString());}}
 }finally{app.endUndoGroup();}
 var gradients=[],warnings=doc.transferWarnings||[];function gradientsAt(nodes,prefix,layerId){var index=0;for(var z=0;z<nodes.length;z++){var item=nodes[z];if(item.type==='mask')continue;index++;var path=prefix.concat([index]);if(item.gradient&&!args.asNew)gradients.push({layerId:layerId,path:path,gradient:item.gradient});if(item.type==='group')gradientsAt(item.children,path.concat(['ADBE Vectors Group']),layerId);}}for(i=0;i<doc.layers.length;i++)if(layerMap[doc.layers[i].id])gradientsAt(doc.layers[i].children,['ADBE Root Vectors Group'],layerMap[doc.layers[i].id]);for(i=notes.length-1;i>=0;i--)if(notes[i].indexOf('Push as new creates a solid')>=0)warnings.unshift(notes.splice(i,1)[0]);
 return {name:c.name,landed:landed,notes:notes,warnings:warnings,created:created,layerMap:layerMap,gradients:gradients,needsPull:true};
}
  function reattach(args) {
    var c = active(),
      s = args.document.source;
    if (!s || !s.project || s.project !== projectPath() || s.compId !== c.id)
      throw Error('Open the same saved project and composition, or use Push as new.');
    if (!same(s.stack, stack(c))) throw Error('The layer stack differs from the draft. Use Push as new.');
    var doc = args.document;
    baseline = clone(args.baseline);
    baseline.source.session = session;
    doc.source.session = session;
    return { document: doc };
  }
  function outlineText(args){var c=active(),n=args.node,original=n.source?findLayer(c,n.source.layerId):null,temp=null,shape=null,notes=[],selected=[],i;if(args.document.source&&args.document.source.compId!==c.id)throw Error('Activate the composition used for the pull.');for(i=1;i<=c.numLayers;i++){selected.push({id:c.layer(i).id,selected:c.layer(i).selected});c.layer(i).selected=false;}app.beginUndoGroup('AE Designer: Convert text to shapes');try{temp=original?original.duplicate():(n.text.boxText?c.layers.addBoxText(n.text.boxTextSize,n.text.text):c.layers.addText(n.text.text));temp.locked=false;temp.enabled=true;temp.name=n.name;applyText(temp,n,original?byId(baseline.layers,n.id):null,args.document.time,notes);applyTransform(temp.property('ADBE Transform Group'),n,null,args.document.time,true,notes);temp.selected=true;app.executeCommand(3781);for(i=0;i<c.selectedLayers.length;i++)if(c.selectedLayers[i] instanceof ShapeLayer){shape=c.selectedLayers[i];break;}if(!shape)throw Error('After Effects did not create shape outlines.');shape.name=n.name+' Outlines';temp.remove();temp=null;if(original)original.enabled=false;var model=readLayer(shape,args.document.time),source={project:projectPath(),dirty:app.project.dirty,compId:c.id,session:session,stack:stack(c)};if(!baseline){baseline=clone(args.document);baseline.layers=[];}for(i=baseline.layers.length-1;i>=0;i--)if(baseline.layers[i].id===n.id)baseline.layers.splice(i,1);baseline.layers.unshift(clone(model));baseline.source=clone(source);return {node:model,source:source,notes:notes};}finally{if(temp)try{temp.remove();}catch(ignore){}for(i=1;i<=c.numLayers;i++)c.layer(i).selected=false;for(i=0;i<selected.length;i++){var layer=findLayer(c,selected[i].id);if(layer)layer.selected=selected[i].selected;}app.endUndoGroup();}}
  function fonts() {
    var result = [];
    try {
      var groups = app.fonts.allFonts;
      for (var i = 0; i < groups.length; i++)
        for (var j = 0; j < groups[i].length; j++)
          result.push({
            name: groups[i][j].postScriptName,
            family: groups[i][j].familyName,
            style: groups[i][j].styleName
          });
    } catch (e) {}
    return result;
  }
  function shortcutFiles(){var version=String(app.version).split('.').slice(0,2).join('.'),mac=$.os.toLowerCase().indexOf('mac')>=0,base=new Folder(mac?'~/Library/Preferences/Adobe/After Effects/'+version:Folder.userData.fsName+'/Adobe/After Effects/'+version),folder=new Folder(base.fsName+'/aeks'),result=[],files=folder.exists?folder.getFiles('*.txt'):base.exists?base.getFiles('*Shortcuts*.txt'):[];files.sort(function(a,b){return Number(b.modified)-Number(a.modified);});for(var i=0;i<files.length;i++)try{if(files[i].length>2000000)continue;files[i].encoding='UTF-8';if(files[i].open('r')){var text=files[i].read();files[i].close();result.push({name:decodeURI(files[i].name),text:text});}}catch(ignore){}return result;}
  function execute(id, method) {
    try {
      var args = JSON.parse(decodeURIComponent(requests[id] || ''));
      delete requests[id];
      var result;
      if (method === 'pull') result = pull(args);
      else if(method==='beginPull')result=beginPull(args);
      else if(method==='pullNext')result=pullNext();
      else if(method==='finishPull')result=finishPull();
      else if(method==='cancelPull'){pullJob=null;result=true;}
      else if (method === 'push') result = push(args);
      else if (method === 'reattach') result = reattach(args);
      else if (method === 'fonts') result = fonts();
      else if(method==='shortcutFiles')result=shortcutFiles();
      else if(method==='outlineText')result=outlineText(args);
      else if (method === 'hydrateGradients') result = hydrateGradients(args);
      else if (method === 'info') result = { version: app.version, session: session };
      else if (method === 'undo') {
        app.executeCommand(16);
        result = true;
      } else throw Error('Unknown method.');
      return JSON.stringify({ ok: true, data: result });
    } catch (e) {
      delete requests[id];
      return JSON.stringify({ ok: false, error: e.toString(), code: e.code || null });
    }
  }
  return {
    start: function (id) {
      requests[id] = '';
      return 'ok';
    },
    receive: function (id, s) {
      requests[id] += s;
      return 'ok';
    },
    execute: execute
  };
})();
