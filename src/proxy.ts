import { NextRequest, NextResponse } from 'next/server';
export function proxy(request: NextRequest) {
  const nonce=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  const development=process.env.NODE_ENV==='development';
  const policy="default-src 'self'; script-src 'self' 'nonce-"+nonce+"'"+(development?" 'unsafe-eval'":"")+"; style-src 'self' "+(development?"'unsafe-inline'":"'nonce-"+nonce+"'")+"; img-src 'self' blob:; connect-src 'self'"+(development?' ws:':'')+"; form-action 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'";
  const headers=new Headers(request.headers);headers.set('x-nonce',nonce);headers.set('Content-Security-Policy',policy);
  const response=NextResponse.next({request:{headers}});
  response.headers.set('Content-Security-Policy-Report-Only',policy);
  response.headers.set('Referrer-Policy','no-referrer');response.headers.set('X-Content-Type-Options','nosniff');
  if(!request.nextUrl.pathname.startsWith('/_next/') && !request.nextUrl.pathname.match(/\.(?:png|svg|ico|css|js)$/))response.headers.set('Cache-Control','no-store');
  if(process.env.APP_ENV==='production')response.headers.set('Strict-Transport-Security','max-age=31536000');
  return response;
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};
