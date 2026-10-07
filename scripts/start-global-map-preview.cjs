// A local-only component preview. It does not mount auth, SQLite or API routes.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const repo = path.resolve(__dirname, '..');
const directory = path.join(repo, '.tmp-mapdata/global-map-preview');
fs.mkdirSync(directory, { recursive: true });
const packageJson = require('../package.json');
fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({
  name: 'global-map-local-preview', version: '1.0.0', private: true, main: 'index.tsx',
  dependencies: Object.fromEntries(['expo', 'react', 'react-native', 'react-native-web'].map(name => [name, packageJson.dependencies[name]])),
}, null, 2));
fs.writeFileSync(path.join(directory, 'app.json'), JSON.stringify({ expo: { name: 'Global Map local preview', slug: 'global-map-local-preview', web: { bundler: 'metro' } } }));
const escapedRepo = repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
fs.writeFileSync(path.join(directory, 'metro.config.js'), `
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
const root = ${JSON.stringify(repo)};
config.watchFolders = [root];
config.resolver.nodeModulesPaths = [path.join(root, 'node_modules')];
config.resolver.blockList = [new RegExp(${JSON.stringify(escapedRepo + '[\\\\/]\\.data[\\\\/]')}), new RegExp(${JSON.stringify(escapedRepo + '[\\\\/]\\.tmp-mapdata[\\\\/]global-map-.*chrome-profile[\\\\/]')})];
module.exports = config;
`);
fs.writeFileSync(path.join(directory, 'index.tsx'), `
import { registerRootComponent } from 'expo';
import * as React from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { GlobalCityMap } from '../../src/features/cities/global-city-map';
import { getGlobalSearchEntries } from '../../src/features/cities/global-map-search';
import { getCityStats } from '../../src/features/cities/city-stats';
import { ChinaCityMap } from '../../src/features/cities/city-map';
import { useFonts } from 'expo-font';
import { headingFontFamily, appFontSources } from '../../src/features/typography/fonts';
function Preview() {
 useFonts({ [headingFontFamily]: appFontSources[headingFontFamily] });
 const [reference, setReference] = React.useState(false);
 const [query, setQuery] = React.useState('');
 const [target, setTarget] = React.useState<string>();
 const [selected, setSelected] = React.useState('');
 const entries = getGlobalSearchEntries().filter(e => query && e.terms.includes(query.toLowerCase())).slice(0,8);
 return <GestureHandlerRootView style={{flex:1}}><View style={{flex:1,padding:12,backgroundColor:'#EFE2CF'}}>
 <View style={{flexDirection:'row',gap:12,paddingVertical:8}}><Pressable accessibilityLabel="国内地图参照" onPress={()=>setReference(true)}><Text>国内地图参照</Text></Pressable><Pressable accessibilityLabel="国际地图预览" onPress={()=>setReference(false)}><Text>国际地图预览</Text></Pressable></View>
 <Text style={{fontSize:24,paddingVertical:8,fontFamily:headingFontFamily}}>{reference ? '国内旅行地图' : '全球旅行地图'}</Text>
 <TextInput accessibilityLabel="搜索城市" placeholder="搜索全球城市" value={query} onChangeText={setQuery} style={{padding:12,backgroundColor:'#fff8ee'}} />
 {entries.map(e => <Pressable key={e.id} accessibilityLabel={'搜索跳转至'+e.name} onPress={()=>{setTarget(e.id);setQuery('');}} style={{padding:10}}><Text>{e.name}</Text></Pressable>)}
 {reference ? <ChinaCityMap stats={getCityStats([])} variant="workspace" interactive onCityPress={setSelected} /> : <GlobalCityMap stats={getCityStats([])} variant="workspace" targetCity={target} onTargetReached={()=>setTarget(undefined)} interactive onCityPress={setSelected} />}
 <Text accessibilityLabel="选中的地点">{selected}</Text>
 </View></GestureHandlerRootView>;
}
registerRootComponent(Preview);
`);
if (!process.argv.includes('--prepare-only')) {
  const result = spawnSync(process.execPath, [require.resolve('expo/bin/cli'), 'start', '--port', '8094', '--max-workers', '2'], { cwd: directory, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
