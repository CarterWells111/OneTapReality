import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

it('requires regenerated pinyin data whenever the full registry changes', () => {
  expect(() => execFileSync(process.execPath,[join(process.cwd(),'scripts/generate-city-pinyin.cjs'),'--check'])).not.toThrow();
});
it('uses explicit place-name readings and handles future Latin names', () => {
  const output=execFileSync(process.execPath,['-e',
    "const {keyForName}=require('./scripts/generate-city-pinyin.cjs');process.stdout.write(JSON.stringify(['长春','长沙','重庆','厦门','São Paulo'].map(keyForName)))",
  ],{cwd:process.cwd(),encoding:'utf8'});
  expect(JSON.parse(output)).toEqual(['changchun','changsha','chongqing','xiamen','saopaulo']);
});
