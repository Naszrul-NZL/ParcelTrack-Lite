import { test,expect } from '@playwright/test';
test('M1-PH1-TC11/15 local production foundation and private headers',async({page,request})=>{
 await page.goto('/');await expect(page.getByRole('heading',{level:1})).toHaveText('Your parcels, in one place.');
 await expect(page.getByRole('link',{name:'Track a parcel',exact:true}).first()).toBeVisible();
 const response=await request.get('/api/v1/health');expect(response.ok()).toBe(true);expect(response.headers()['cache-control']).toContain('no-store');expect(response.headers()['x-content-type-options']).toBe('nosniff');expect(response.headers()['content-security-policy-report-only']).toContain('nonce-');
 await page.getByRole('link',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{level:1})).toHaveText('Sign in');await expect(page.getByText('Account sign-in will be connected in Phase 2.',{exact:false})).toBeVisible();
});
test('M3-PH1-T02 phone layout has no horizontal overflow',async({page})=>{await page.goto('/');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);});
test('M1-PH1-TC15 rejects an untrusted Host',async({request})=>{const response=await request.get('/api/v1/health',{headers:{host:'untrusted.example'}});expect(response.status()).toBe(400);});
