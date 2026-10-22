import sharp from 'sharp';
import fs from 'node:fs';
import { sanitizeImage } from '../src/server/modules/delivery/images';
const bytes=await sharp({create:{width:1600,height:1200,channels:3,background:'#152e48'}}).withMetadata({exif:{IFD0:{Artist:'synthetic fixture'}}}).jpeg().toBuffer();
const before=process.memoryUsage().rss;const start=performance.now();
const result=await sanitizeImage(bytes);
const report={inputBytes:bytes.length,outputBytes:result.bytes.length,elapsedMs:Math.round(performance.now()-start),rssGrowthBytes:Math.max(0,process.memoryUsage().rss-before),node:process.version,sharp:sharp.versions.sharp,maxConcurrentImages:2,libvipsThreads:1,cacheMemoryMiB:16,notes:'Single synthetic 1.92 MP image on this local host. RSS delta is not peak RSS. Not a capacity guarantee.'};
fs.mkdirSync('.local/evidence',{recursive:true});fs.writeFileSync('.local/evidence/image-spike.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
