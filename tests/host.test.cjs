const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
// A deliberately small AE mock checks host safety contracts; it is not an AE emulator.
function host(){
 const context=vm.createContext({console});
 vm.runInContext(`
 var writes=[],begins=0,ends=0;
 var PropertyType={PROPERTY:1,NAMED_GROUP:2,INDEXED_GROUP:3},PropertyValueType={SHAPE:7,CUSTOM_VALUE:99,NO_VALUE:100};
 var ParagraphJustification={LEFT_JUSTIFY:1,CENTER_JUSTIFY:2,RIGHT_JUSTIFY:3};
 function Shape(){};
 function Prop(matchName,value,children){this.matchName=matchName;this.name=matchName;this._value=value;this._children=children||[];this.propertyType=children?2:1;this.numProperties=this._children.length;this.numKeys=0;this.expressionEnabled=false;this.enabled=true;this.propertyValueType=1;}
 Prop.prototype.property=function(key){if(typeof key==='number')return this._children[key-1];for(var i=0;i<this._children.length;i++)if(this._children[i].matchName===key)return this._children[i];return null;};
 Prop.prototype.valueAtTime=function(){return this._value;};
 Prop.prototype.setValue=function(v){writes.push({name:this.matchName,value:v,kind:'static'});this._value=v;};
 Prop.prototype.setValueAtTime=function(t,v){writes.push({name:this.matchName,value:v,time:t,kind:'key'});this._value=v;};
 Object.defineProperty(Prop.prototype,'value',{get:function(){return this._value;}});
 Prop.prototype.keyValue=function(){return this._value;};
 Prop.prototype.keyInInterpolationType=function(){return 2;};Prop.prototype.keyOutInterpolationType=function(){return 2;};
 Prop.prototype.remove=function(){if(!this._owner)throw Error('No owner');this._owner._children.splice(this._owner._children.indexOf(this),1);this._owner.numProperties=this._owner._children.length;};
 Prop.prototype.moveTo=function(i){var a=this._owner._children;a.splice(a.indexOf(this),1);a.splice(i-1,0,this);};
 Prop.prototype.canAddProperty=function(){return true;};
 Prop.prototype.addProperty=function(name){var children=name==='ADBE Vector Group'?[new Prop('ADBE Vectors Group',null,[]),new Prop('ADBE Vector Transform Group',null,[])]:[];var p=new Prop(name,null,children);p._owner=this;this._children.push(p);this.numProperties=this._children.length;return p;};
 var oldProperty=Prop.prototype.property;Prop.prototype.property=function(key){var p=oldProperty.call(this,key);if(p)p._owner=this;return p;};
 Prop.prototype.nearestKeyIndex=function(){return 1;};Prop.prototype.keyTime=function(){return 0;};
 function ShapeLayer(){this.id=42;this.name='Test';this.index=1;this.enabled=true;this.locked=false;this.label=9;this.threeDLayer=false;this.parent=null;this.blendingMode=1;this.inPoint=0;this.outPoint=20;
 this.size=new Prop('ADBE Vector Rect Size',[100,100]);this.pos=new Prop('ADBE Vector Rect Position',[0,0]);
 this.rect=new Prop('ADBE Vector Shape - Rect',null,[this.size,this.pos,new Prop('ADBE Vector Rect Roundness',0)]);
 this.contents=new Prop('ADBE Root Vectors Group',null,[this.rect]);
 this.transform=new Prop('ADBE Transform Group',null,[new Prop('ADBE Position',[0,0]),new Prop('ADBE Anchor Point',[0,0]),new Prop('ADBE Scale',[100,100]),new Prop('ADBE Rotate Z',0),new Prop('ADBE Opacity',100)]);
 this.masks=new Prop('ADBE Mask Parade',null,[]);}
 ShapeLayer.prototype.property=function(n){return n==='ADBE Root Vectors Group'?this.contents:n==='ADBE Transform Group'?this.transform:n==='ADBE Mask Parade'?this.masks:null;};
 function TextLayer(){};function CompItem(){this.id=7;this.name='Comp';this.width=1920;this.height=1080;this.time=2.5;this.bgColor=[0,0,0];this.numLayers=1;this.guides=[];this.testLayer=new ShapeLayer();this.selectedLayers=[this.testLayer];}
 CompItem.prototype.layer=function(i){return i===1?this.testLayer:null;};var comp=new CompItem();var app={version:'24.0',project:{activeItem:comp,file:{fsName:'/test/project.aep'}},beginUndoGroup:function(){begins++;},endUndoGroup:function(){ends++;},executeCommand:function(){}};
 `,context);
 vm.runInContext(fs.readFileSync(require.resolve('../extension/host/native.jsx'),'utf8'),context);
 vm.runInContext(fs.readFileSync(require.resolve('../extension/host/rigs.jsx'),'utf8'),context);
 vm.runInContext(fs.readFileSync(require.resolve('../extension/host/index.jsx'),'utf8').replace(/^#include.*$/mg,''),context);
 return {ctx:context,call(method,args={}){context.payload=encodeURIComponent(JSON.stringify(args));context.method=method;return JSON.parse(vm.runInContext(`DMHost.start('test');DMHost.receive('test',payload);DMHost.execute('test',method);`,context));}};
}
test('pull is read-only and records source composition and time',()=>{const h=host(),r=h.call('pull');assert.equal(r.ok,true);assert.equal(r.data.document.time,2.5);assert.equal(r.data.document.source.compId,7);assert.equal(h.ctx.writes.length,0);assert.equal(h.ctx.begins,0);});
test('push changes only edited native values in one balanced undo group',()=>{const h=host(),doc=h.call('pull').data.document;doc.layers[0].children[0].props['ADBE Vector Rect Size']=[200,120];const r=h.call('push',{document:doc});assert.equal(r.ok,true);assert.equal(r.data.notes.length,0);assert.equal(h.ctx.writes.length,1);assert.equal(h.ctx.writes[0].name,'ADBE Vector Rect Size');assert.equal(h.ctx.begins,1);assert.equal(h.ctx.ends,1);});
test('animated edits create a key at the original pull time',()=>{const h=host();h.ctx.comp.testLayer.size.numKeys=1;const doc=h.call('pull').data.document;doc.layers[0].children[0].props['ADBE Vector Rect Size']=[200,120];h.ctx.comp.time=9;h.call('push',{document:doc});assert.equal(h.ctx.writes[0].kind,'key');assert.equal(h.ctx.writes[0].time,2.5);});
test('expression-driven native properties are preserved and reported',()=>{const h=host();h.ctx.comp.testLayer.size.expressionEnabled=true;const doc=h.call('pull').data.document;doc.layers[0].children[0].props['ADBE Vector Rect Size']=[200,120];const r=h.call('push',{document:doc});assert.match(r.data.notes.join(' '),/expression/);assert.equal(h.ctx.writes.length,0);});
test('changed layer stack is rejected before opening an undo group',()=>{const h=host(),doc=h.call('pull').data.document;h.ctx.comp.testLayer.id=99;const r=h.call('push',{document:doc});assert.equal(r.ok,false);assert.equal(r.code,'STACK_CHANGED');assert.equal(h.ctx.begins,0);});
test('different composition cannot receive an ordinary push',()=>{const h=host(),doc=h.call('pull').data.document;h.ctx.comp.id=99;assert.equal(h.call('push',{document:doc}).ok,false);assert.equal(h.ctx.begins,0);});
test('ordinary push preserves native layer lock state',()=>{const h=host();h.ctx.comp.testLayer.locked=true;const doc=h.call('pull').data.document;doc.layers[0].name='Changed';h.call('push',{document:doc});assert.equal(h.ctx.comp.testLayer.locked,true);});
test('explicit deletion can remove animated shapes without rebuilding surviving contents',()=>{const h=host();h.ctx.comp.testLayer.size.numKeys=1;const doc=h.call('pull').data.document;doc.layers[0].children=[];const r=h.call('push',{document:doc});assert.equal(r.ok,true);assert.deepEqual(r.data.notes,[]);assert.equal(h.ctx.comp.testLayer.contents.numProperties,0);});
test('reordering shapes preserves the same native property objects and animation',()=>{const h=host();vm.runInContext("var second=new Prop('ADBE Vector Shape - Ellipse',null,[]);comp.testLayer.contents._children.push(second);comp.testLayer.contents.numProperties=2;comp.testLayer.size.numKeys=1;",h.ctx);const original=h.ctx.comp.testLayer.rect;const doc=h.call('pull').data.document;doc.layers[0].children.reverse();const r=h.call('push',{document:doc});assert.equal(r.ok,true);assert.deepEqual(r.data.notes,[]);assert.equal(h.ctx.comp.testLayer.contents._children[1],original);assert.equal(original.property('ADBE Vector Rect Size').numKeys,1);assert.equal(h.ctx.writes.length,0);});

test('canceling a progressive pull leaves the previous native baseline intact',()=>{const h=host(),original=h.call('pull').data.document;const start=h.call('beginPull',{selected:false});assert.equal(start.ok,true);assert.equal(start.data.total,1);assert.equal(start.data.document.layers.length,0);assert.equal(h.call('pullNext').data.done,1);assert.equal(h.call('cancelPull').ok,true);original.layers[0].children[0].props['ADBE Vector Rect Size']=[160,120];const pushed=h.call('push',{document:original});assert.equal(pushed.ok,true);assert.deepEqual(pushed.data.notes,[]);assert.equal(h.ctx.writes.length,1);});
test('a layer-stack change aborts a progressive pull before any native write',()=>{const h=host();assert.equal(h.call('beginPull').ok,true);h.ctx.comp.testLayer.id=99;const r=h.call('pullNext');assert.equal(r.ok,false);assert.match(r.error,/composition changed/);assert.equal(h.ctx.writes.length,0);assert.equal(h.ctx.begins,0);});
test('native layer blend names round-trip through the actual enum values',()=>{const h=host();vm.runInContext('var BlendingMode={NORMAL:1,SCREEN:7};',h.ctx);const doc=h.call('pull').data.document;assert.equal(doc.layers[0].blendName,'NORMAL');doc.layers[0].blendName='SCREEN';const r=h.call('push',{document:doc});assert.deepEqual(r.data.notes,[]);assert.equal(h.ctx.comp.testLayer.blendingMode,7);});
test('removing the first mask preserves the second native mask and its animation',()=>{const h=host();vm.runInContext("var MaskMode={NONE:0,ADD:1,SUBTRACT:2,INTERSECT:3,LIGHTEN:4,DARKEN:5,DIFFERENCE:6};function addMask(name){var opacity=new Prop('ADBE Mask Opacity',100);opacity.numKeys=1;var mask=new Prop('ADBE Mask Atom',null,[opacity]);mask.name=name;mask.maskMode=1;mask.inverted=false;mask.color=[1,0,0];mask.locked=false;mask.rotoBezier=false;return mask;}var mask1=addMask('First'),mask2=addMask('Second');comp.testLayer.masks._children=[mask1,mask2];comp.testLayer.masks.numProperties=2;",h.ctx);const doc=h.call('pull').data.document;doc.layers[0].children=doc.layers[0].children.filter(n=>n.name!=='First');const r=h.call('push',{document:doc});assert.equal(r.ok,true);assert.deepEqual(r.data.notes,[]);assert.equal(h.ctx.comp.testLayer.masks._children[0],h.ctx.mask2);assert.equal(h.ctx.mask2.property('ADBE Mask Opacity').numKeys,1);assert.equal(h.ctx.writes.length,0);});
