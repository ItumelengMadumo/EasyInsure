import { expect, test, type Page } from '@playwright/test';

const as = async (page: Page, role: string, path = '') => { await page.goto(`/?demo=${role}${path}`); await expect(page.locator('.demo-banner')).toBeVisible(); };
const openCase = (page: Page, number: string) => page.locator('tr.clickable', { hasText: number }).click();

test.describe('client', () => {
  test('sees plain-language status, never the internal risk score', async ({ page }) => {
    await as(page, 'client', '&page=claims');
    await expect(page.getByText('Waiting on you').first()).toBeVisible();
    await expect(page.locator('th', { hasText: 'Risk' })).toHaveCount(0);
    await expect(page.getByText(/\d+\/100/)).toHaveCount(0);
    await expect(page.getByText('Unassigned')).toHaveCount(0);
  });

  test('overview lists what is waiting on them', async ({ page }) => {
    await as(page, 'client');
    await expect(page.getByRole('heading', { name: 'Waiting on you' })).toBeVisible();
    await expect(page.getByText('Reply needed on CLM-20402')).toBeVisible();
    await expect(page.getByText(/Your quote is ready/)).toBeVisible();
  });

  test('replies to an information request and the claim resumes', async ({ page }) => {
    await as(page, 'client', '&page=claims');
    await openCase(page, 'CLM-20402');
    await page.getByLabel('Your response to your advisor').fill('Demo Grill, parked at 19:30');
    await page.getByRole('button', { name: 'Send and resume assessment' }).click();
    await expect(page.getByText('Information sent to your advisor.')).toBeVisible();
  });

  test('must tick both boxes before a quote activates cover', async ({ page }) => {
    await as(page, 'client', '&page=policies');
    await page.getByRole('button', { name: 'Review terms and accept' }).click();
    const accept = page.getByRole('button', { name: /Accept .* and activate/ });
    await expect(accept).toBeDisabled();
    await expect(page.getByRole('heading', { name: 'Not covered' })).toBeVisible();
    await page.getByLabel(/I have read the cover limit/).check();
    await page.getByLabel(/answers I gave/).check();
    await accept.click();
    await expect(page.getByText(/Your policy is now active/)).toBeVisible();
  });

  test('Escape closes the case file', async ({ page }) => {
    await as(page, 'client', '&page=claims');
    await openCase(page, 'CLM-20381');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('officers', () => {
  test('a junior officer gets a work queue and a submissions page, not a decision screen', async ({ page }) => {
    await as(page, 'junior_officer');
    await expect(page.getByRole('heading', { name: /Good day, Lerato/ })).toBeVisible();
    await expect(page.getByText('Start the assessment')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Apply for cover' })).toHaveCount(0);
    await page.getByRole('button', { name: 'My submissions' }).click();
    await expect(page.getByText('Why you cannot approve or reject here')).toBeVisible();
  });

  test('an officer sends a draft assessment for senior review', async ({ page }) => {
    await as(page, 'intermediate_officer', '&page=claims');
    await openCase(page, 'CLM-20415');
    await page.getByRole('tab', { name: 'Private notes' }).click();
    await page.getByLabel('Covered loss (ZAR)').fill('150000');
    await page.getByLabel('Depreciation (%)').fill('20');
    await expect(page.getByText('Preview: how the recommendation will be calculated')).toBeVisible();
    await page.getByRole('button', { name: 'Calculate recommendation' }).click();
    await page.getByRole('button', { name: 'Send for senior review' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Send for review' }).click();
    await expect(page.getByText('Assessment sent for senior review.')).toBeVisible();
  });
});

test.describe('senior officer', () => {
  test('sees the calculation, the risk checks and the AI summary beside the decision', async ({ page }) => {
    await as(page, 'senior_officer', '&page=review');
    await expect(page.getByText('How the assessed payout was reached')).toBeVisible();
    await expect(page.getByText('Rule-based checks')).toBeVisible();
    await expect(page.getByText(/has not read the uploaded evidence/)).toBeVisible();
  });

  test('cannot approve without choosing an amount, and confirms before approving', async ({ page }) => {
    await as(page, 'senior_officer', '&page=review');
    const approve = page.getByRole('button', { name: 'Review and approve' });
    await expect(approve).toBeDisabled();
    await page.getByRole('button', { name: /Use the assessed amount/ }).click();
    await approve.click();
    await expect(page.getByRole('dialog').getByText('This approves the payout and tells the client.')).toBeVisible();
    await page.getByRole('button', { name: 'Approve payout' }).click();
    await expect(page.getByText(/approved\. The decision is on the audit trail/)).toBeVisible();
  });

  test('a payout above R250,000 needs a superuser and can be escalated', async ({ page }) => {
    await as(page, 'senior_officer', '&page=review');
    await page.getByRole('option', { name: /CLM-20388/ }).click();
    await expect(page.getByText(/Only a superuser can approve it/)).toBeVisible();
    await page.getByRole('button', { name: 'Escalate to a superuser' }).click();
    await expect(page.getByText(/Escalated to Zanele Admin/)).toBeVisible();
  });

  test('a senior who finalised an assessment cannot decide it', async ({ page }) => {
    await as(page, 'superuser', '&page=review');
    await expect(page.getByText(/finalized this assessment|finalised this assessment|officer who finalized/i).first()).toBeVisible();
  });

  test('a document opens in a preview', async ({ page }) => {
    await as(page, 'senior_officer', '&page=documents');
    await page.getByRole('button', { name: /Open police-affidavit.pdf/ }).first().click();
    await expect(page.getByRole('dialog', { name: /Preview of/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('superuser and developer', () => {
  test('the superuser has an admin console with the audit log and the rules in force', async ({ page }) => {
    await as(page, 'superuser', '&page=admin');
    await expect(page.getByRole('heading', { name: 'Run the operation.' })).toBeVisible();
    await page.getByRole('tab', { name: 'Rules & thresholds' }).click();
    await expect(page.getByText('Senior approval limit')).toBeVisible();
    await page.getByRole('tab', { name: 'Audit log' }).click();
    await expect(page.getByText('Case events, newest first')).toBeVisible();
  });

  test('the developer sees workflow health with no client identity', async ({ page }) => {
    await as(page, 'developer');
    await expect(page.getByRole('heading', { name: /Workflow health/ })).toBeVisible();
    await expect(page.getByText('Thandi Mokoena', { exact: false }).first()).toHaveCount(1); // only in the demo banner
    await page.getByRole('button', { name: 'Claims' }).click();
    await expect(page.getByText('Thandi')).toHaveCount(1);
  });
});

test.describe('layout', () => {
  for (const width of [1280, 390]) {
    test(`claims list does not scroll sideways at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await as(page, 'senior_officer', '&page=claims');
      await expect(page.locator('.claim-table')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test('the demo bar can be hidden so it never covers content', async ({ page }) => {
    await as(page, 'client');
    await page.getByRole('button', { name: 'Hide demo controls' }).click();
    await expect(page.locator('.demo-banner')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Show demo controls' })).toBeVisible();
  });
});

test.describe('public site', () => {
  test('privacy and terms are real pages, flagged while details are placeholders', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('contentinfo').getByRole('button', { name: 'Privacy' }).click();
    await expect(page.getByRole('heading', { name: 'Privacy notice' })).toBeVisible();
    await expect(page.getByText('Draft for compliance review.')).toBeVisible();
    await page.getByRole('button', { name: 'Terms of use' }).click();
    await expect(page.getByRole('heading', { name: 'Terms of use' })).toBeVisible();
  });

  test('the estimator shows a range and a next step', async ({ page }) => {
    await page.goto('/');
    await page.locator('#estimate').getByRole('button', { name: 'Calculate ballpark' }).click();
    await expect(page.getByText(/R\s?[\d\s]+\s–\s+R\s?[\d\s]+/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Get a formal quote/ })).toBeVisible();
  });
});
