import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=process.cwd();
const cwd=path.join(root,'deliverables/.build/extracted-demo');
const child=spawn(process.execPath,['serve-demo.mjs'],{cwd,windowsHide:true,stdio:['ignore','pipe','pipe']});
let errors='';child.stderr.on('data',d=>errors+=d);
try{
  const address=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Demo startup timed out: '+errors)),10000);child.stdout.on('data',buffer=>{const match=buffer.toString().match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});child.once('error',reject);});
  const response=await fetch(address);assert.equal(response.status,200);const html=await response.text();assert.ok(html.includes('<title>ParcelTrack Lite</title>'));
  const {chromium}=await import(pathToFileURL('C:/Users/mohdz/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
  const browser=await chromium.launch({headless:true});
  try{const page=await browser.newPage();await page.goto(address);await page.getByRole('heading',{name:'Sign in',exact:true}).waitFor();await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').innerText(),'Skip to content');await page.keyboard.press('Enter');assert.equal(await page.locator(':focus').getAttribute('id'),'main');await page.getByLabel('Username',{exact:true}).fill('seller.a');await page.getByLabel('Password',{exact:true}).fill('DemoOnly10!');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('heading',{name:'My parcels',exact:true}).waitFor();console.log('PASS Extracted demo starts without dependency installation, serves compiled assets, and signs in');console.log('PASS Keyboard skip link focuses the main content');}finally{await browser.close();}
  await fs.writeFile(path.join(root,'deliverables/.build/portable-qa.json'),JSON.stringify({passed:true,address,checks:['Extracted compiled assets','No dependency installation','Sample sign-in','Keyboard skip link'],scope:'Local frontend prototype only'},null,2));
}finally{child.kill();}
