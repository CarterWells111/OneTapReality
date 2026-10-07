// Local developer verification only. Chrome must use a separate profile and CDP port.
const fs = require('node:fs');
const path = require('node:path');
async function connect(port = 9382) {
  const url = process.argv[2] || 'http://127.0.0.1:8094/';
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const tab = tabs.find(t => t.type === 'page' && t.url.startsWith(url))
    ?? await (await fetch(`http://127.0.0.1:${port}/json/new?${url}`, { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0; const pending = new Map(); const errors = [];
  ws.onmessage = event => {
    const data = JSON.parse(event.data);
    if (data.id) { const promise = pending.get(data.id); pending.delete(data.id); if (data.error) promise.reject(data.error); else promise.resolve(data.result); }
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const request = ++id; pending.set(request, { resolve, reject }); ws.send(JSON.stringify({ id: request, method, params })); });
  await send('Runtime.enable'); await send('Page.enable');
  errors.length = 0;
  return { send, errors, close: () => ws.close() };
}
async function main() {
  const client = await connect();
  try {
    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    const state = await client.send('Runtime.evaluate', { expression: 'JSON.stringify({title:document.title,text:document.body.innerText,inputs:[...document.querySelectorAll("input")].map(x=>({label:x.getAttribute("aria-label"),placeholder:x.placeholder})),svg:document.querySelectorAll("svg").length,isolated:crossOriginIsolated})', returnByValue: true });
    console.log(state.result.value);
    if (process.argv.includes('--exercise')) {
      await client.send('Page.reload', { ignoreCache: false });
      await new Promise(resolve => setTimeout(resolve, 750));
      const evaluate = async expression => {
        const result = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        return result.result.value;
      };
      const waitFor = async expression => {
        for (let i = 0; i < 40; i++) {
          const value = await evaluate(expression);
          if (value) return value;
          await new Promise(resolve => setTimeout(resolve, 250));
        }
        throw new Error(`Browser condition did not become true: ${expression}`);
      };
      await waitFor('document.querySelector("[data-testid=global-map-content]") !== null');
      await evaluate('document.querySelector("[aria-label=查看全球]").click()');
      await new Promise(resolve => setTimeout(resolve, 600));
      for (const name of ['London', 'Shanghai', 'New York', 'Sydney', 'Cape Town', 'Lima']) {
        await evaluate('document.querySelector("input").focus()');
        await client.send('Input.insertText', { text: name });
        await waitFor('document.querySelector("[aria-label^=搜索跳转至]") !== null');
        const cityName = await evaluate('document.querySelector("[aria-label^=搜索跳转至]").innerText');
        await evaluate('document.querySelector("[aria-label^=搜索跳转至]").click()');
        await new Promise(resolve => setTimeout(resolve, 600));
        const marker = await evaluate('(() => { const map=document.querySelector("[data-testid=global-map-workspace]").getBoundingClientRect(); return [...document.querySelectorAll("[data-testid^=global-marker-]")].map(e=>({id:e.dataset.testid,label:e.getAttribute("aria-label"),rect:e.getBoundingClientRect()})).find(e=>e.rect.x>=map.x&&e.rect.y>=map.y&&e.rect.right<=map.right&&e.rect.bottom<=map.bottom); })()');
        if (!marker) {
          throw new Error(`No visible marker after searching ${name}`);
        }
        await evaluate(`document.querySelector('[data-testid="${marker.id}"]').click()`);
        const selection = await evaluate('document.querySelector("[aria-label=选中的地点]").innerText');
        if (selection !== marker.id.slice('global-marker-'.length) || !marker.label.startsWith(cityName + '，')) throw new Error(`Marker click failed for ${name}`);
        console.log(JSON.stringify({ region: name, marker: marker.label, selection }));
      }
      await evaluate('document.querySelector("[aria-label=查看全球]").click()');
      await new Promise(resolve => setTimeout(resolve, 600));
      const beforePan = await evaluate('document.querySelector("svg").parentElement.style.transform');
      const map = await evaluate('(() => {const r=document.querySelector("[data-testid=global-map-workspace]").getBoundingClientRect();return {x:r.x+100,y:r.y+r.height/2};})()');
      await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: map.x, y: map.y, button: 'left', clickCount: 1 });
      for (let step = 1; step <= 3; step++) {
        await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: map.x + step * 40, y: map.y + step * 10, button: 'left', buttons: 1 });
        await new Promise(resolve => setTimeout(resolve, 80));
      }
      await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: map.x + 120, y: map.y + 40, button: 'left', clickCount: 1 });
      await new Promise(resolve => setTimeout(resolve, 500));
      const afterPan = await evaluate('document.querySelector("svg").parentElement.style.transform');
      if (afterPan === beforePan || /NaN|Infinity/.test(afterPan)) throw new Error('Pan did not move the camera');
      await evaluate('document.querySelector("[aria-label=放大全球地图]").click()');
      await new Promise(resolve => setTimeout(resolve, 500));
      const afterZoom = await evaluate('document.querySelector("svg").parentElement.style.transform');
      if (afterZoom === afterPan || /NaN|Infinity/.test(afterZoom)) throw new Error('Zoom did not change the camera');
      await evaluate('document.querySelector("[aria-label=缩小全球地图]").click()');
      await new Promise(resolve => setTimeout(resolve, 500));
      await evaluate('document.querySelector("[aria-label=查看全球]").click()');
      await new Promise(resolve => setTimeout(resolve, 500));
      console.log(JSON.stringify({ pan: 'verified', zoom: 'verified', beforePan, afterPan, afterZoom, markerCount: await evaluate('document.querySelectorAll("[data-testid^=global-marker-]").length') }));
    }
    const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
    const file = path.resolve('.data/global-map/browser-preview.png');
    fs.writeFileSync(file, Buffer.from(screenshot.data, 'base64'));
    console.log(JSON.stringify({ screenshot: file, errors: [...new Set(client.errors)].slice(0, 5), errorCount: client.errors.length }));
    if (client.errors.length) process.exitCode = 1;
  } finally { client.close(); }
}
main().catch(error => { console.error(error.message || error); process.exitCode = 1; });
