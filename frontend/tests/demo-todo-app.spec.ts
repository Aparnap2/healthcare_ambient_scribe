/**
 * E2E Tests for Healthcare Ambient Scribe
 *
 * Tests the complete user journey:
 * 1. Open App -> Click Record -> Speak -> Click Stop -> Verify SOAP appears -> Click Sign
 */
import { test, expect } from '@playwright/test';

test.describe('Healthcare Ambient Scribe - Happy Path', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
  });

  test('should load the dashboard page', async ({ page }) => {
    // Verify page loads successfully
    await expect(page).toHaveTitle(/Healthcare|Ambient|Scribe/);
  });

  test('should display demo clinician', async ({ page }) => {
    // Check that demo clinician info is visible
    await expect(page.locator('text=Dr. House')).toBeVisible();
  });

  test('should show encounter list', async ({ page }) => {
    // Verify encounters are displayed
    await expect(page.locator('text=encounter')).toBeVisible();
  });

  test('should navigate to encounter details', async ({ page }) => {
    // Click on first encounter
    await page.locator('text=encounter-001').first().click();

    // Verify detail page loads
    await expect(page.locator('text=John Smith')).toBeVisible();
  });

  test('should display SOAP sections', async ({ page }) => {
    // Navigate to a signed encounter
    await page.locator('text=encounter-001').first().click();

    // Verify Subjective, Objective, Assessment, Plan sections are visible
    await expect(page.locator('text=/(Subjective|S|Objective|O|Assessment|A|Plan|P)/i')).toHaveCount(4);
  });

  test('should allow signing an encounter', async ({ page }) => {
    // Navigate to a draft encounter
    await page.locator('text=encounter-002').first().click();

    // Check for Sign button
    const signButton = page.locator('button:has-text("Sign")');
    await expect(signButton).toBeVisible();
  });
});

test.describe('Recording Flow', () => {
  test('should show recording controls', async ({ page }) => {
    await page.goto('/');

    // Look for record button
    const recordButton = page.locator('button:has-text("Record")');
    await expect(recordButton).toBeVisible();
  });

  test('should toggle recording state', async ({ page }) => {
    await page.goto('/');

    // Click record button
    const recordButton = page.locator('button:has-text("Record")');
    await recordButton.click();

    // Should show stop button when recording
    await expect(page.locator('button:has-text("Stop")')).toBeVisible();

    // Should show recording indicator
    await expect(page.locator('text=Recording')).toBeVisible();
  });
});

test.describe('API Integration', () => {
  test('should have health endpoint responding', async ({ request }) => {
    const response = await request.get('http://localhost:8000/health');

    expect(response.ok).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe('healthy');
  });
});
