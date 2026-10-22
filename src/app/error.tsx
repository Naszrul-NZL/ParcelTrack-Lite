'use client';
export default function ErrorPage({reset}:{error:Error;reset:()=>void}){return <div role="alert"><h1>Unable to load this page.</h1><p>Please try again.</p><button onClick={reset}>Try again</button></div>;}
