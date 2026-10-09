// Serves only the task's exported static visual harness on loopback.
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const root=path.resolve(__dirname,'../.data/city-checkins/preview-web');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.ttf':'font/ttf','.woff':'font/woff','.woff2':'font/woff2','.json':'application/json'};
if(!fs.existsSync(path.join(root,'index.html')))throw new Error('Export the local preview first; see CITY-CHECKINS.md');
http.createServer((request,response)=>{
  let file;
  try{file=path.resolve(root,'.'+decodeURIComponent(new URL(request.url,'http://localhost').pathname));}catch{response.writeHead(400).end();return;}
  if(file!==root&&!file.startsWith(root+path.sep)){response.writeHead(403).end();return;}
  if(file===root)file=path.join(root,'index.html');
  fs.stat(file,(error,stat)=>{
    if(error||!stat.isFile()){response.writeHead(404).end();return;}
    response.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-store'});
    const stream=fs.createReadStream(file);stream.on('error',()=>response.destroy());stream.pipe(response);
  });
}).listen(Number(process.env.CITY_CHECKINS_PREVIEW_PORT||8095),'localhost',()=>console.log('City check-in static preview at http://localhost:'+(process.env.CITY_CHECKINS_PREVIEW_PORT||8095)));
