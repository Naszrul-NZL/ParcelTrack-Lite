import sharp from 'sharp';
import { deflateSync } from 'node:zlib';
export interface FileFixture { id:string; filename:string; bytes:Buffer; expected:'clean'|'PROOF_INVALID'|'PROOF_TOO_LARGE' }
function chunk(type:string,data:Buffer) {
 const content=Buffer.concat([Buffer.from(type),data]);let crc=0xffffffff;
 for(const byte of content){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
 const size=Buffer.alloc(4),checksum=Buffer.alloc(4);size.writeUInt32BE(data.length);checksum.writeUInt32BE((crc^0xffffffff)>>>0);
 return Buffer.concat([size,content,checksum]);
}
function png(width:number,height:number,animated=false) {
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
 const animation=Buffer.alloc(8);animation.writeUInt32BE(2);
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),...(animated?[chunk('acTL',animation)]:[]),chunk('IDAT',deflateSync(Buffer.from([0,21,46,72]))),chunk('IEND',Buffer.alloc(0))]);
}
export async function fileFixtures():Promise<FileFixture[]> {
 const jpg=await sharp({create:{width:8,height:8,channels:3,background:'#152e48'}}).withMetadata({exif:{IFD0:{Artist:'synthetic-canary'}}}).jpeg().toBuffer();
 const image=png(1,1);
 const gif=Buffer.from('47494638396101000100800000000000ffffff21f90400010000002c000000000100010000020244010021f90400010000002c00000000010001000002024401003b','hex');
 return [
  {id:'valid-jpg',filename:'photo.jpg',bytes:jpg,expected:'clean'},
  {id:'valid-png',filename:'photo.png',bytes:image,expected:'clean'},
  {id:'oversize',filename:'large.jpg',bytes:Buffer.alloc(3*1024*1024+1),expected:'PROOF_TOO_LARGE'},
  {id:'huge-dimensions',filename:'huge.png',bytes:png(100000,100000),expected:'PROOF_INVALID'},
  {id:'corrupt-jpeg',filename:'broken.jpg',bytes:Buffer.from([255,216,255,0]),expected:'PROOF_INVALID'},
  {id:'truncated-png',filename:'truncated.png',bytes:image.subarray(0,30),expected:'PROOF_INVALID'},
  {id:'animated-gif',filename:'animated.gif',bytes:gif,expected:'PROOF_INVALID'},
  {id:'animated-png',filename:'animated.png',bytes:png(1,1,true),expected:'PROOF_INVALID'},
  {id:'appended-script',filename:'trailing.jpg',bytes:Buffer.concat([jpg,Buffer.from('<script>synthetic-canary</script>')]),expected:'clean'},
  {id:'double-extension',filename:'shell.php.jpg',bytes:jpg,expected:'PROOF_INVALID'},
  {id:'php-extension',filename:'photo.php',bytes:jpg,expected:'PROOF_INVALID'},
  {id:'renamed-php',filename:'renamed.jpg',bytes:Buffer.from('<?php /* harmless fixture */ ?>'),expected:'PROOF_INVALID'},
  {id:'renamed-text',filename:'text.png',bytes:Buffer.from('synthetic text'),expected:'PROOF_INVALID'},
  {id:'renamed-svg',filename:'vector.png',bytes:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>/* harmless */</script></svg>'),expected:'PROOF_INVALID'},
  {id:'empty',filename:'empty.jpg',bytes:Buffer.alloc(0),expected:'PROOF_INVALID'},
  {id:'null-name',filename:'image\0.jpg',bytes:jpg,expected:'PROOF_INVALID'},
  {id:'long-name',filename:'a'.repeat(260)+'.jpg',bytes:jpg,expected:'PROOF_INVALID'},
 ];
}
