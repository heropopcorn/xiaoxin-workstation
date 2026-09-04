import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { describe, expect, test } from 'bun:test';

import {
  buildOoEditorsFallbackDownloadUrl,
  resolveDocumentEngineRoot,
} from './office-extension-source';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'oo-editors-source-'));
}

function writeEngineRoot(dir: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'server.js'), 'module.exports = {};\n');
  writeFileSync(join(dir, 'package.json'), '{"name":"oo-editors","version":"1.0.40"}\n');
}

describe('office-extension-source', () => {
  test('builds a GitHub release asset URL that does not use the rate-limited API', () => {
    expect(buildOoEditorsFallbackDownloadUrl('windows-x64', 'openinterpreter/oo-editors')).toBe(
      'https://github.com/openinterpreter/oo-editors/releases/download/v1.0.40/oo-editors-windows-x64.zip',
    );
  });

  test('resolves a flat extracted engine folder', () => {
    const dir = makeTempDir();
    writeEngineRoot(dir);

    expect(resolveDocumentEngineRoot(dir)).toBe(resolve(dir));
  });

  test('resolves a zip that unwraps into a single nested engine folder', () => {
    const dir = makeTempDir();
    writeEngineRoot(join(dir, 'oo-editors-windows-x64'));

    expect(resolveDocumentEngineRoot(dir)).toBe(resolve(join(dir, 'oo-editors-windows-x64')));
  });

  test('returns null when server.js is missing', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'package.json'), '{}\n');

    expect(resolveDocumentEngineRoot(dir)).toBeNull();
  });
});
