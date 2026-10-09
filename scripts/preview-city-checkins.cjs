// Local visual harness: real map UI and artwork; an in-memory check-in adapter.
// SQLite/owner lifecycle is exercised separately by the repository/hook tests.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname,'..');
const preview = path.join(root,'.tmp-mapdata','city-checkins-preview');
fs.mkdirSync(preview,{recursive:true});
const dependencies = require('../package.json').dependencies;
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const blocks = [
  escapeRegex(path.join(root,'.data'))+'[\\\\/]',
  escapeRegex(path.join(root,'.tmp-mapdata'))+'[\\\\/].*chrome-profile[\\\\/]',
  escapeRegex(path.join(root,'dist'))+'[\\\\/]',
];
fs.writeFileSync(path.join(preview,'package.json'),JSON.stringify({name:'city-checkins-local-preview',version:'1.0.0',private:true,main:'index.tsx',dependencies:Object.fromEntries(['expo','react','react-native','react-native-web'].map(key=>[key,dependencies[key]]))},null,2));
fs.writeFileSync(path.join(preview,'app.json'),JSON.stringify({expo:{name:'City check-ins local preview',slug:'city-checkins-local-preview',web:{bundler:'metro'}}}));
fs.writeFileSync(path.join(preview,'metro.config.js'),`
const path=require('node:path');
const {getDefaultConfig}=require('expo/metro-config');
const config=getDefaultConfig(__dirname);
const root=${JSON.stringify(root)};
config.watchFolders=[root];
config.resolver.nodeModulesPaths=[path.join(root,'node_modules')];
config.resolver.blockList=${JSON.stringify(blocks)}.map(source=>new RegExp(source));
module.exports=config;
`);
fs.writeFileSync(path.join(preview,'index.tsx'),`
import {registerRootComponent} from 'expo';
import * as React from 'react';
import {View,Text} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {Asset} from 'expo-asset';
import {appFontSources} from '../../src/features/typography/fonts';
import {CityCheckinMap} from '../../src/features/cities/city-checkin-map';
import {getCityCheckinMapImage} from '../../src/features/cities/city-checkin-map-images';
import {getCityCheckinSpots} from '../../src/features/cities/city-checkin-spots';
import {cityContent} from '../../src/features/cities/city-content';
function Preview(){
 const [loaded,setLoaded]=React.useState(false);
 const [fontError,setFontError]=React.useState('');
 React.useEffect(()=>{let active=true;void Promise.all(Object.entries(appFontSources).map(async([family,source])=>{
   // Browser FontFace verifies the actual local font bytes without Expo Web's
   // fixed observer timeout for large CJK fonts. The app font loader is unchanged.
   const asset=Asset.fromModule(source);const response=await fetch(asset.uri);
   if(!response.ok)throw new Error('Local font request failed: '+family);
   const face=new FontFace(family,await response.arrayBuffer());await face.load();document.fonts.add(face);
 })).then(()=>{if(active)setLoaded(true);}).catch(e=>{if(active)setFontError(String(e.message));});return()=>{active=false;};},[]);
 const [city,setCity]=React.useState(new URLSearchParams(window.location.search).get('city')||'beijing');
 const [visitedSpotIds,setIds]=React.useState<string[]>([]);
 const [navigation,setNavigation]=React.useState('');
 const source=getCityCheckinMapImage(city);
 React.useEffect(()=>{(window as any).__cityCheckinQA={city,spots:getCityCheckinSpots(city),loaded,fontError};(window as any).__cityCheckinSetCity=(next:string)=>{setCity(next);setIds([]);};},[city,loaded,fontError]);
 if(!loaded)return <Text>{fontError||'正在加载本地字体…'}</Text>;
 return <SafeAreaProvider><View style={{flex:1}}>{source ? <CityCheckinMap key={city} city={city} name={cityContent[city].name} source={source}
 checkins={{visitedSpotIds,isReady:true,isSaving:false,error:'',retry:()=>{},setVisited:async(id,visited)=>{setIds(ids=>visited?[...new Set([...ids,id])]:ids.filter(s=>s!==id));}}}
 onClose={()=>setNavigation('返回')} onCityAlbums={()=>setNavigation('/city/'+city)} onNewAlbum={()=>setNavigation('/memory/new?city='+city)}/> : <Text>城市相册 /city/{city}</Text>}
 {!!navigation&&<Text accessibilityLabel="预览导航结果">{navigation}</Text>}</View></SafeAreaProvider>;
}
registerRootComponent(Preview);
`);
if (!process.argv.includes('--prepare-only')) {
  const exporting=process.argv.includes('--export');
  const args=exporting ? ['export','--platform','web','--output-dir',path.join(root,'.data/city-checkins/preview-web')] : ['start',preview,'--web','--localhost','--port',process.env.CITY_CHECKINS_PREVIEW_PORT || '8095'];
  const child=spawn(process.execPath,[path.join(root,'node_modules/expo/bin/cli'),...args],{cwd:exporting?preview:root,stdio:'inherit',env:{...process.env,EXPO_NO_TELEMETRY:'1'}});
  child.on('exit',code=>{process.exitCode=code??1;});
}
