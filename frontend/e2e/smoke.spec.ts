import { expect, test, type Page } from '@playwright/test';

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
}

async function expectFullyInViewport(page: Page, locator: ReturnType<Page['locator']>) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box, 'element should have a layout box').not.toBeNull();
  expect(viewport).not.toBeNull();
  if (!box || !viewport) return;
  expect(box.width).toBeGreaterThan(8);
  expect(box.height).toBeGreaterThan(8);
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('app-shell').waitFor();
});

test('loads, creates a questionnaire, opens editors and a dialog', async ({ page }, testInfo) => {
  await expectNoHorizontalOverflow(page);
  await expectFullyInViewport(page, page.getByTestId('toolbar-new'));
  await expectFullyInViewport(page, page.getByTestId('toolbar-settings'));

  const explorer = page.getByTestId('package-explorer');
  const toggle = page.getByTestId('explorer-toggle');
  if (testInfo.project.name === 'desktop') {
    await expect(toggle).toBeHidden();
    await expect(explorer).toBeVisible();
  } else {
    await expect(explorer).toBeHidden();
    await toggle.click();
    await expect(explorer).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await toggle.click();
    await expect(explorer).toBeHidden();
  }

  await expect(page).toHaveScreenshot('empty.png');

  await page.getByTestId('toolbar-new').click();
  const createDialog = page.getByRole('dialog');
  await expect(createDialog).toBeVisible();
  await expectFullyInViewport(page, createDialog);
  await expectNoHorizontalOverflow(page);

  const inputs = createDialog.locator('input');
  await inputs.nth(0).fill('Demokartlegging');
  await inputs.nth(1).fill('DEMO');
  await createDialog.locator('button.bg-cw-blue').click();
  await expect(createDialog).toBeHidden();

  await expect(page.locator('input[value="DEMO"]')).toBeVisible();
  await expectFullyInViewport(page, page.getByTestId('subtab-questionnaire'));
  await page.locator('button.border-dashed').first().click();
  await expectNoHorizontalOverflow(page);
  await expect(page).toHaveScreenshot('questionnaire.png');

  for (const id of ['calculation', 'translation', 'report'] as const) {
    const tab = page.getByTestId(`subtab-${id}`);
    await tab.scrollIntoViewIfNeeded();
    await tab.click();
    await expect(tab).toHaveAttribute('class', /border-cw-blue/);
    await expectFullyInViewport(page, tab);
    await expectNoHorizontalOverflow(page);
  }
  await expect(page).toHaveScreenshot('report.png');

  await page.getByTestId('subtab-translation').click();
  await expectNoHorizontalOverflow(page);
  await expect(page).toHaveScreenshot('translation.png');

  await page.getByTestId('toolbar-settings').click();
  const settings = page.getByRole('dialog');
  await expect(settings).toBeVisible();
  await expectFullyInViewport(page, settings);
  await expectFullyInViewport(page, settings.locator('button.bg-cw-blue'));
  await expectNoHorizontalOverflow(page);
  await expect(page).toHaveScreenshot('settings.png');
});
