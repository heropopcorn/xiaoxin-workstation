import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

function readOverlayService(): string {
  return fs.readFileSync(
    path.join(import.meta.dir, 'service.ts'),
    'utf8',
  );
}

function extractMethod(serviceSource: string, methodName: string): string {
  const methodStart = serviceSource.indexOf(methodName);
  expect(methodStart).toBeGreaterThanOrEqual(0);
  const methodEnd = serviceSource.indexOf('\n  private ', methodStart + 1);
  expect(methodEnd).toBeGreaterThan(methodStart);
  return serviceSource.slice(methodStart, methodEnd);
}

describe('overlay local runtime contract', () => {
  test('typed submit continues when the selected scope has no executable refs', () => {
    const ensureTarget = extractMethod(
      readOverlayService(),
      'private async ensureExecutableContextForTarget',
    );

    expect(ensureTarget).not.toContain(
      'Overlay target context did not produce executable browser or native CUA refs for the selected scope.',
    );
    expect(ensureTarget).toContain('launching without attached-target control');
  });

  test('keeps enabled overlay active when this distribution has no overlay server', () => {
    const applySettings = extractMethod(readOverlayService(), 'private async applySettings');

    expect(applySettings).not.toContain(
      'Disabled because this distribution does not configure an overlay server',
    );
    expect(applySettings).toContain('await this.activateRuntime()');
    expect(applySettings).toContain('this.refreshHotkeyRegistration()');
    expect(applySettings).toContain('hasHostedOverlayServer: Boolean(this.baseUrl)');
  });
});
