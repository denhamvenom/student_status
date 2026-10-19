import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

// Layout evidence uses fictional review fixtures, not authenticated backend proof.
const browser = await chromium.launch({ ...(process.env.INVITE_CHECK_BROWSER ? {executablePath:process.env.INVITE_CHECK_BROWSER} : {channel:'msedge'}), headless: true });
const failures = [];
const results = [];
const baseUrl = process.env.INVITE_CHECK_BASE_URL ?? 'http://127.0.0.1:5173';
const routes = [
  { path: '/parents?review=student', name: 'student-parents', heading: 'Parents', control: 'Parent email' },
  { path: '/enroll?review=coach', name: 'coach-parent-access', heading: 'Parent invitations', control: 'Allow new parent invitations' },
  { path: '/invite-parent?review=parent', name: 'parent-acceptance', heading: 'Parent invitation', control: 'Your relationship to the student' },
];
await mkdir('test-results', { recursive: true });
try {
  for (const {width,theme} of [{width:390,theme:'dark'},{width:1440,theme:'light'}]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme });
      const page = await context.newPage();
      page.on('pageerror', error => failures.push(`${width}/${theme}: ${error.message}`));
      for (const route of routes) {
        await page.goto(`${baseUrl}${route.path}`);
        await expect(page.getByRole('heading', { level: 1, name: route.heading, exact: true })).toBeVisible();
        await expect(route.name === 'coach-parent-access' ? page.getByRole('checkbox', { name: route.control, exact: true }) : page.getByLabel(route.control, { exact: true })).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        if (overflow) failures.push(`${route.name}/${width}/${theme}: horizontal overflow`);
        if (route.name === 'student-parents') {await expect(page.getByText('The private invitation is sent to this email.', { exact: false })).toBeVisible();await expect(page.getByRole('button',{name:/Resend in/})).toBeDisabled();await expect(page.getByRole('button',{name:/Share|Copy/})).toHaveCount(0)}
        if (route.name === 'parent-acceptance') await expect(page.getByRole('button', { name: 'Accept invitation', exact: true })).toBeDisabled();
        if (route.name === 'coach-parent-access') await expect(page.getByRole('button', { name: 'Revoke access', exact: true })).toBeDisabled();
        await page.screenshot({ path: `test-results/invites-${route.name}-${width}-${theme}.png`, fullPage: true });
        results.push({ name: route.name, width, theme, overflow, mode: 'synthetic layout only' });
      }
      await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/invite-parent`);
  await expect(page.getByRole('heading', { name: 'Link unavailable', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept invitation', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Email', {exact:true})).toBeVisible();
  results.push({ name: 'missing-token', mode: 'unauthenticated live landing' });
  await context.close();
  await writeFile('test-results/parent-invites-browser-check.json', JSON.stringify({ results, failures }, null, 2));
  console.log(JSON.stringify({ pages: results.length, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
} finally { await browser.close(); }
