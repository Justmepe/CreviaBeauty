const { chromium } = require('@playwright/test');
const article = { type:'crevia-article', title:'Reel API Check', slug:'reel-api-check', category:'Spot the Fake',
  intro:'x', sections:[{heading:'P',paragraphs:['x']}], cta_text:'c', cta_link:'/products',
  carousel:[{heading:'h',body:'b'},{heading:'h2',body:'b2'}],
  reel:[{shot:'Hold the bottle',say:'Real?'},{shot:'Batch code',say:'Check.'},{shot:'Spray',say:'8 hours.'}],
  social:{dm_keyword:'FAKE'} };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('http://localhost:3000/login',{waitUntil:'domcontentloaded'});
  await p.evaluate(()=>fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@creviabeauty.com',password:'admin123'})}).then(r=>r.json()));
  const proc = await p.evaluate(a => fetch('/api/admin/articles/process',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({raw:'```json\n'+JSON.stringify(a)+'\n```'})}).then(r=>r.json()), article);
  console.log('processed reel length:', proc.article.content.reel.length);
  const list = await p.evaluate(()=>fetch('/api/admin/articles').then(r=>r.json()));
  const a = list.find(x=>x.slug==='reel-api-check');
  console.log('admin list returns reel (what the UI renders):', a && Array.isArray(a.reel) ? a.reel.length+' shots, first="'+a.reel[0].shot+'"' : 'MISSING');
  if (a) await p.evaluate(id=>fetch('/api/admin/articles/'+id,{method:'DELETE'}), a.id);
  console.log('cleaned');
  await b.close();
})().catch(e=>console.error('FAIL:',e.message));
