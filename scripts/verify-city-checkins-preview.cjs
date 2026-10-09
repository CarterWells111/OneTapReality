// Requires preview-city-checkins.cjs and a dedicated Chrome CDP port (default 9383).
// Exercises the real RN map component with its explicitly simulated storage adapter.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'docs/operations/assets/city-checkins');
const reportPath=path.join(root,'.data/city-checkins/visual-report.json');
const port=process.env.CITY_CHECKINS_CDP_PORT||'9383';
const base=`http://localhost:${process.env.CITY_CHECKINS_PREVIEW_PORT||'8095'}/`;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
  fs.mkdirSync(output,{recursive:true});fs.mkdirSync(path.dirname(reportPath),{recursive:true});
  const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  let target=targets.find(t=>t.type==='page'&&t.url.startsWith(base));
  if(!target)target=await(await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(base)}`,{method:'PUT'})).json();
  const socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let id=0;const pending=new Map();const exceptions=[];
  socket.onmessage=({data})=>{const message=JSON.parse(data);if(message.id){const p=pending.get(message.id);if(p){pending.delete(message.id);message.error?p.reject(new Error(JSON.stringify(message.error))):p.resolve(message.result);}}else if(message.method==='Runtime.exceptionThrown'){exceptions.push(message.params.exceptionDetails.text);}};
  const call=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
  const until=async(expression,message)=>{const end=Date.now()+60000;while(Date.now()<end){if(await evaluate(expression))return;await delay(150);}throw new Error(message);};
  const click=async(x,y)=>{await call('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});await delay(60);};
  const press=async(label,byText=false)=>{
    const r=await evaluate(`(()=>{const e=Array.from(document.querySelectorAll('[role="button"]')).find(e=>${byText?'e.textContent.trim()':'e.getAttribute("aria-label")'}===${JSON.stringify(label)}&&e.getBoundingClientRect().width>0);if(!e)return null;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    if(!r)throw new Error(`Missing button: ${label}`);await click(r.x,r.y);await delay(320);
  };
  const screenshot=async name=>{const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(shot.data,'base64'));};
  const reports=[];
  try{
    await call('Page.enable');await call('Runtime.enable');
    await call('Page.navigate',{url:base+'?city=beijing'});
    await until('window.__cityCheckinQA?.loaded&&!!window.__cityCheckinSetCity','Preview fonts did not load');
    for(const city of ['beijing','shanghai','chengdu','hangzhou','guangzhou','xian','wuhan','shenzhen','changsha','chongqing']){
      await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
      await evaluate(`window.__cityCheckinSetCity(${JSON.stringify(city)})`);
      await until(`window.__cityCheckinQA?.city===${JSON.stringify(city)}&&window.__cityCheckinQA.loaded&&!!document.querySelector('[data-testid="city-checkin-map-canvas"]')`,'Preview did not load '+city);
      await until(`(()=>{const i=document.querySelector('[data-testid="city-checkin-map-image"] img');return i?.complete&&i.naturalWidth===941&&i.naturalHeight===1672;})()`,'Original artwork did not load '+city);
      await evaluate('document.fonts.ready');await delay(200);
      const spots=await evaluate('window.__cityCheckinQA.spots');
      const imageFits=await evaluate(`(()=>{const i=document.querySelector('[data-testid="city-checkin-map-image"]').getBoundingClientRect(),c=document.querySelector('[data-testid="city-checkin-map-canvas"]').getBoundingClientRect();return Math.abs(i.width-c.width)<1&&Math.abs(i.height-c.height)<1;})()`);
      if(!imageFits)throw new Error('Image does not fill the contain viewport '+city);
      let hits=0;
      for(const [width,height] of [[390,844],[844,390]]){
        await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await delay(200);
        const box=await evaluate(`(()=>{const r=document.querySelector('[data-testid="city-checkin-map-canvas"]').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};})()`);
        const scale=Math.min(box.width/941,box.height/1672);
        const frame={x:box.x+(box.width-941*scale)/2,y:box.y+(box.height-1672*scale)/2,width:941*scale,height:1672*scale};
        for(const spot of spots){
          for(const type of ['marker','label']){
            const relative=type==='marker'?spot.marker:{x:spot.label.x+spot.label.width/2,y:spot.label.y+spot.label.height/2};
            await click(frame.x+relative.x*frame.width,frame.y+relative.y*frame.height);
            await delay(320);
            const actual=await evaluate(`document.querySelector('[role="heading"]')?.textContent`);
            if(actual!==spot.name)throw new Error(`${city} ${width} ${type}: expected ${spot.name}, got ${actual}`);
            hits++;
            if(width===390&&type==='marker')await press('标记已到访',true);
            await press('关闭景点详情');
          }
        }
        if(width===844&&city==='beijing')await screenshot('beijing-landscape');
      }
      await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(200);
      const text=await evaluate('document.body.innerText');
      if(!text.includes('已打卡 9 / 9'))throw new Error('Progress mismatch '+city);
      await screenshot(city);
      await press('打卡地图帮助');
      if(!await evaluate("document.body.innerText.includes('记录保存在本机')"))throw new Error('Missing help '+city);
      if(city==='beijing')await screenshot('help');
      await press('关闭帮助');
      await press('查看景点列表');
      if(city==='wuhan')await screenshot('wuhan-list');
      const first=spots[0];await press(`${first.number?first.number+' ':''}${first.name}，已打卡`);
      await press('取消打卡',true);await press('关闭景点详情');
      if(!await evaluate("document.body.innerText.includes('已打卡 8 / 9')"))throw new Error('Cancellation mismatch '+city);
      reports.push({city,hits,portrait:[390,844],landscape:[844,390],progress:'9 / 9 then 8 / 9',help:true,list:true});
      console.log(`${city}: ${hits} marker/name hits, progress/help/list/cancel passed`);
    }
    if(exceptions.length)throw new Error('Browser exceptions: '+exceptions.join(', '));
    fs.writeFileSync(reportPath,JSON.stringify({boundary:'Real RN UI/artwork; in-memory check-in adapter; not an iOS device or SQLite UI end-to-end test',reports,exceptions},null,2));
  }finally{socket.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
