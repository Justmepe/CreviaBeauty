const { chromium } = require('@playwright/test');
const SAMPLE = '```json\n' + JSON.stringify({
  type:'crevia-article', series:'Spot the Fake', title:'Reel UI Check', slug:'reel-ui-check',
  category:'Spot the Fake', intro:'Checking reel display.',
  sections:[{heading:'The Problem',paragraphs:['x']}], cta_text:'CTA', cta_link:'/products',
  carousel:[{heading:'Hook',body:'y'},{heading:'CTA',body:'comment FAKE'}],
  reel:[{shot:'Hold the bottle to camera',say:'Is your Sauvage real?'},{shot:'Zoom the batch code',say:'Check this first.'},{shot:'Spray test',say:'Real lasts 8 hours.'}],
  social:{dm_keyword:'FAKE'}
},null,2) + '\n```';
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('http://localhost:3000/login',{waitUntil:'domcontentloaded'});
  await p.evaluate(()=>fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@creviabeauty.com',password:'admin123'})}).then(r=>r.json()));
  await p.goto('http://localhost:3000/admin#content-studio',{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(2000);
  await p.fill('#cs-response', SAMPLE);
  await p.click('#cs-publish-btn');
  await p.waitForTimeout(2000);
  // go to carousel assets, find the deck, check reel
  await p.click('a[data-section="carousel-assets"]');
  await p.waitForTimeout(2000);
  const txt = await p.locator('#ca-list').innerText();
  console.log('Reel shot-list shown:', txt.includes('Reel shot-list'));
  console.log('shot text present:', txt.includes('Hold the bottle to camera'));
  // cleanup
  const arts = await p.evaluate(()=>fetch('/api/admin/articles').then(r=>r.json()));
  const a = arts.find(x=>x.slug==='reel-ui-check');
  if (a) await p.evaluate(id=>fetch('/api/admin/articles/'+id,{method:'DELETE'}), a.id);
  console.log('cleaned');
  await b.close();
})().catch(e=>console.error('FAIL:',e.message));
