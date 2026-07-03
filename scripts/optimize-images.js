const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public', 'assets');
const KB = n => (n / 1024).toFixed(1) + 'KB';

async function run() {
  const jobs = [
    {
      file: path.join(ROOT, 'favicon.png'),
      // 512 square logo used as favicon + apple-touch-icon + 38px nav mark.
      // Keep 512 for retina apple icon; compress hard with palette quantization.
      build: img => img.resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
                       .png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 }),
      out: 'png'
    },
    {
      file: path.join(ROOT, 'Logo.png'),
      // 1536x1024 brand logo (schema.org logo + blog hero fallback). Cap at 600w.
      build: img => img.resize({ width: 600, withoutEnlargement: true })
                       .png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 }),
      out: 'png'
    },
    {
      file: path.join(ROOT, '..', 'images', 'og-image.jpg'),
      // OG share image — spec size is 1200x630. Resize + mozjpeg q82.
      build: img => img.resize(1200, 630, { fit: 'cover', position: 'centre' })
                       .jpeg({ quality: 82, mozjpeg: true }),
      out: 'jpg'
    }
  ];

  for (const j of jobs) {
    if (!fs.existsSync(j.file)) { console.log('SKIP (missing):', j.file); continue; }
    const before = fs.statSync(j.file).size;
    const bak = j.file + '.bak';
    if (!fs.existsSync(bak)) fs.copyFileSync(j.file, bak); // backup original once
    const buf = await j.build(sharp(bak)).toBuffer();      // read from backup (pristine source)
    if (buf.length < before) {
      fs.writeFileSync(j.file, buf);
      console.log(`OK  ${path.basename(j.file)}: ${KB(before)} -> ${KB(buf.length)}  (-${(100 - buf.length / before * 100).toFixed(0)}%)`);
    } else {
      console.log(`KEEP ${path.basename(j.file)}: optimized (${KB(buf.length)}) not smaller than original (${KB(before)})`);
    }
  }
}
run().catch(e => { console.error(e); process.exit(1); });
