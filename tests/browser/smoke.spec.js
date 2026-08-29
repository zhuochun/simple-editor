import path from 'node:path';
import { expect, test } from '@playwright/test';

function captureRuntimeErrors(page) {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text());
    });
    return errors;
}

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        if (!sessionStorage.getItem('browserTestInitialized')) {
            localStorage.clear();
            localStorage.setItem('onboardingComplete', 'browser-test');
            sessionStorage.setItem('browserTestInitialized', 'true');
        }
    });
});

test('creates, persists, reloads, and opens a Card document', async ({ page }) => {
    const runtimeErrors = captureRuntimeErrors(page);
    await page.goto('/');

    await expect(page.locator('.project-item')).toHaveCount(1);
    await expect(page.locator('.column')).toHaveCount(3);

    await page.getByRole('button', { name: 'Add Card' }).click();
    const mapTextarea = page.locator('.card .card-content').first();
    await mapTextarea.fill('Browser smoke persistence');
    await mapTextarea.blur();

    await expect.poll(() => page.evaluate(() => (
        localStorage.getItem('writingToolProjects')?.includes('Browser smoke persistence')
    ))).toBe(true);

    await page.reload();
    await expect(page.locator('.card .card-content').first()).toHaveValue('Browser smoke persistence');

    await page.locator('.open-document-btn').first().click();
    await expect(page.locator('body')).toHaveClass(/document-mode/);
    await expect(page.locator('.document-card .card-content').first()).toHaveValue('Browser smoke persistence');

    await page.locator('.back-to-map-btn').click();
    await expect(page.locator('body')).not.toHaveClass(/document-mode/);
    expect(runtimeErrors).toEqual([]);
});

test('imports a project through the browser file chooser', async ({ page }) => {
    const runtimeErrors = captureRuntimeErrors(page);
    await page.goto('/');
    await page.locator('#import-project-btn').click();

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import File' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.resolve('examples/new-onboarding.json'));

    await expect(page.locator('.project-title', { hasText: 'Welcome' })).toBeVisible();
    await expect(page.locator('.project-item')).toHaveCount(2);
    expect(runtimeErrors).toEqual([]);
});
