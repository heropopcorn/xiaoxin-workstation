import { existsSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

export type OfficeExtensionArch = 'darwin-arm64' | 'darwin-x64' | 'windows-x64';

export const OO_EDITORS_FALLBACK_RELEASE_TAG = 'v1.0.40';

export const OO_EDITORS_FALLBACK_ASSET_NAMES: Record<OfficeExtensionArch, string> = {
  'darwin-arm64': 'oo-editors-darwin-arm64.zip',
  'darwin-x64': 'oo-editors-darwin-x64.zip',
  'windows-x64': 'oo-editors-windows-x64.zip',
};

export function buildOoEditorsFallbackDownloadUrl(
  arch: OfficeExtensionArch,
  repository: string,
  tag: string = OO_EDITORS_FALLBACK_RELEASE_TAG,
): string {
  const assetName = OO_EDITORS_FALLBACK_ASSET_NAMES[arch];
  return `https://github.com/${repository}/releases/download/${tag}/${assetName}`;
}

export function isDocumentEngineRoot(dir: string): boolean {
  return existsSync(join(dir, 'server.js')) && existsSync(join(dir, 'package.json'));
}

export function resolveDocumentEngineRoot(dir: string): string | null {
  if (!existsSync(dir)) {
    return null;
  }

  try {
    if (!statSync(dir).isDirectory()) {
      return null;
    }
  } catch {
    return null;
  }

  if (isDocumentEngineRoot(dir)) {
    return resolve(dir);
  }

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }

  const matches = entries
    .map((name) => join(dir, name))
    .filter((child) => {
      try {
        return statSync(child).isDirectory() && isDocumentEngineRoot(child);
      } catch {
        return false;
      }
    });

  return matches.length === 1 ? resolve(matches[0]) : null;
}
