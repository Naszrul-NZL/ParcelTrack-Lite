export async function register() {
 if(process.env.NEXT_RUNTIME==='nodejs'){
  const { getSettings }=await import('./server/core/settings');getSettings();
 }
}
