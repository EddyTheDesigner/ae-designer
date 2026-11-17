(function (g) {
  'use strict';
  class Bridge {
    constructor() {
      this.cs = window.__adobe_cep__ ? new CSInterface() : null;
      this.connected = !!this.cs;
      this.busy = false;
      this.instance = DM.uid();
      this.listeners = [];
      this.channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ae-designer-v1') : null;
      if (this.channel) this.channel.onmessage = (e) => this.receive(e.data);
      if (this.cs) {
        this.cs.addEventListener('com.edm.aedesigner.message', (e) => {
          try {
            this.receive(JSON.parse(e.data));
          } catch (err) {
            console.error(err);
          }
        });
        this.setupKeys();
        this.cs.setPanelFlyoutMenu(
          '<Menu><MenuItem Id="layers" Label="Open Layers panel" Enabled="true" Checked="false"/><MenuItem Id="properties" Label="Open Properties panel" Enabled="true" Checked="false"/></Menu>',
        );
        this.cs.addEventListener('com.adobe.csxs.events.flyoutMenuClicked', (e) => {
          const id = e.data.menuId;
          if (id === 'layers' || id === 'properties')
            this.cs.requestOpenExtension('com.edm.aedesigner.' + id, '');
        });
      }
    }
    setupKeys() {
      const mac = /Mac/.test(navigator.platform),
        codes = mac
          ? [
              0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26,
              27, 28, 29, 30, 31, 32, 33, 34, 35, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51,
              53, 115, 117, 123, 124, 125, 126,
            ]
          : Array.from({ length: 222 }, (_, i) => i + 8),
        keys = [];
      codes.forEach((keyCode) => {
        for (let flags = 0; flags < 8; flags++) {
          // Never claim Command, or Windows Save/Save As.
          if (!mac && keyCode === 83 && flags & 1) continue;
          keys.push({
            keyCode,
            ctrlKey: !!(flags & 1),
            shiftKey: !!(flags & 2),
            altKey: !!(flags & 4),
            metaKey: false,
          });
        }
      });
      try {
        this.cs.registerKeyEventsInterest(JSON.stringify(keys));
      } catch (e) {
        console.warn(e);
      }
    }
    receive(data) {
      if (data.origin === this.instance) return;
      this.listeners.forEach((fn) => fn(data));
    }
    on(fn) {
      this.listeners.push(fn);
    }
    send(type, payload) {
      const data = { origin: this.instance, type, payload };
      if (this.cs) {
        const e = new CSEvent('com.edm.aedesigner.message', 'APPLICATION');
        e.data = JSON.stringify(data);
        this.cs.dispatchEvent(e);
      } else if (this.channel) this.channel.postMessage(data);
    }
    eval(script) {
      return new Promise((resolve, reject) => {
        if (!this.cs) return reject(Error('Open AE Designer inside After Effects to pull or push.'));
        this.cs.evalScript(script, (r) => {
          if (r === 'EvalScript error.')
            reject(
              Error(
                'After Effects could not run the host script. Restart the panel and check that the extension is installed completely.',
              ),
            );
          else resolve(r);
        });
      });
    }
    async call(method, payload) {
      if (this.busy) throw Error('Wait for the current After Effects operation.');
      this.busy = true;
      try {
        const id = 'r' + Date.now().toString(36);
        const encoded = encodeURIComponent(JSON.stringify(payload || {}));
        await this.eval('DMHost.start("' + id + '")');
        for (let i = 0; i < encoded.length; i += 24000)
          await this.eval('DMHost.receive("' + id + '","' + encoded.slice(i, i + 24000) + '")');
        const raw = await this.eval('DMHost.execute("' + id + '","' + method + '")');
        const r = JSON.parse(raw);
        if (!r.ok) {
          const e = Error(r.error || 'After Effects operation failed.');
          e.code = r.code;
          throw e;
        }
        return r.data;
      } finally {
        this.busy = false;
      }
    }
    openURL(url) {
      if (this.cs) this.cs.openURLInDefaultBrowser(url);
      else window.open(url, '_blank', 'noopener');
    }
  }
  g.Bridge = Bridge;
})(window);
