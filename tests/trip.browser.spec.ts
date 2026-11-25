import { expect, test } from '@playwright/test';

test('create a trip, split a bill, inspect balances, and record repayment', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Start your trip' }).click();
  await page.getByLabel('Trip name').fill('Browser weekend');
  await page.getByRole('button', { name: 'Create trip' }).click();
  await expect(page.getByRole('heading', { name: 'Browser weekend' })).toBeVisible();

  for (const member of ['Dev', 'Isha', 'Kabir']) {
    await page.getByLabel('Member name').fill(member);
    await page.getByRole('button', { name: 'Add member' }).click();
    await expect(page.getByRole('checkbox', { name: member })).toBeChecked();
  }

  const expense = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Add expense' }) });
  const saveExpense = expense.getByRole('button', { name: 'Save expense' });
  await expense.getByLabel('Description').fill('Dinner');
  await expense.getByLabel(/Amount/).fill('1200');
  await expense.getByLabel('Category').selectOption('Food');
  await expense.getByLabel('Paid by').selectOption({ label: 'Dev' });
  await expense.getByRole('checkbox', { name: 'Dev' }).uncheck();
  await saveExpense.click();

  const tab = (name: string) => page.getByRole('navigation', { name: 'Trip views' }).getByRole('button', { name });
  await tab('Balances').click();
  const isha = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: 'Isha' }) });
  await expect(isha.locator('summary')).toContainText('600.00');
  await isha.locator('summary').click();
  await expect(isha.getByRole('listitem').filter({ hasText: 'Dinner' })).toContainText('600.00');

  await tab('Expenses').click();
  await expense.getByLabel('Description').fill('Dinner!');
  await expense.getByLabel(/Amount/).fill('1200');
  page.once('dialog', async dialog => {
    expect(dialog.message()).toMatch(/similar expense/i);
    await dialog.dismiss();
  });
  await saveExpense.click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('similar expense');
  await tab('Balances').click();
  await expect(isha.locator('summary')).toContainText('600.00');

  const payment = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Record an external payment' }) });
  await payment.getByLabel('From').selectOption({ label: 'Isha' });
  await payment.getByLabel('To').selectOption({ label: 'Dev' });
  await payment.getByLabel(/Amount/).fill('400');
  await payment.getByRole('button', { name: 'Record payment' }).click();
  await expect(isha.locator('summary')).toContainText('200.00');
  await isha.locator('summary').click();
  await expect(isha.getByRole('listitem').filter({ hasText: 'Payment sent' })).toContainText('400.00');

  await page.reload();
  await page.getByRole('button', { name: 'Browser weekend' }).click();
  await tab('Balances').click();
  await expect(isha.locator('summary')).toContainText('200.00');
});

test('mobile landing page reaches the dashboard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Splittrack.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('navigation').getByRole('link', { name: 'Open dashboard' }).click();
  await expect(page.getByLabel('Trip name')).toBeVisible();
});



test('living landscape can pause and the demo recalculates settlement', async ({ page }) => {
  await page.goto('/');
  const photo = page.locator('.landscape-photo');
  await expect(photo).toHaveCSS('animation-play-state', 'running');
  await page.getByRole('button', { name: 'Pause animation' }).click();
  await expect(photo).toHaveCSS('animation-play-state', 'paused');
  await page.getByRole('button', { name: 'Resume animation' }).click();
  await expect(photo).toHaveCSS('animation-play-state', 'running');

  await page.getByRole('link', { name: 'Explore live demo' }).click();
  const expenses = page.getByRole('tab', { name: 'Expenses' });
  await expenses.focus();
  await expenses.press('ArrowRight');
  const balance = page.getByRole('tab', { name: 'My balance' });
  await expect(balance).toBeFocused();
  await expect(balance).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'My balance' })).toContainText('₹2,400');
  await page.getByRole('slider', { name: /Simulate repayment/ }).press('End');
  await expect(page.getByText('Remaining due')).toContainText('₹0');

  await balance.focus();
  await balance.press('End');
  const settlement = page.getByRole('tabpanel', { name: 'Settle up' });
  await expect(settlement.getByText('2 transfers')).toBeVisible();
  await expect(settlement.getByText('Isha pays Dev')).toHaveCount(0);
  await expect(settlement.getByText('Kabir pays Dev')).toBeVisible();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(photo).toHaveCSS('animation-name', 'none');
  await expect(page.getByRole('button', { name: 'Pause animation' })).toBeHidden();
});


test('add a member email, see the map, and open sign-in', async ({ page }) => {
  await page.goto('/dashboard');
  await page.getByLabel('Trip name').fill('Mapped browser trip');
  await page.getByLabel('Destination city').fill('Coral Bay');
  await page.getByRole('button', { name: 'Create trip' }).click();
  await expect(page.getByRole('heading', { name: 'Mapped browser trip' })).toBeVisible();
  await page.getByLabel('Member name').fill('Dev');
  await page.getByLabel('Member email').fill('dev@example.test');
  await page.getByRole('button', { name: 'Add member' }).click();
  await expect(page.getByText(/member added to the local demo/i)).toBeVisible();
  await expect(page.getByText('dev@example.test')).toBeVisible();
  const expense = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Add expense' }) });
  await expense.getByLabel('Description').fill('Fictional hotel');
  await expense.getByLabel(/Amount/).fill('2000');
  await expense.getByLabel('Venue or address').fill('Lantern Lodge');
  await expense.getByRole('button', { name: 'Save expense' }).click();
  await expect(page.getByText('Fictional hotel')).toBeVisible();
  await page.getByRole('navigation', { name: 'Trip views' }).getByRole('button', { name: 'Map' }).click();
  await expect(page.getByRole('heading', { name: 'Expense map' })).toBeVisible();
  await expect(page.getByText('Fictional hotel', { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/Dev paid.*2,000/).first()).toBeVisible();
  await page.getByRole('navigation', { name: 'Trip views' }).getByRole('button', { name: 'Activity' }).click();
  await expect(page.getByText(/Dev paid.*Fictional hotel/)).toBeVisible();

  await page.getByRole('link', { name: 'Sign in with Google' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to Splittrack' })).toBeVisible();
});
