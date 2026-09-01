import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const basePath = path.join(root, 'product.json');
const packagePath = path.join(root, 'package.json');
const overlayPath = path.join(root, 'distribution', 'product.xiaoxin.json');
const builderPath = path.join(root, 'distribution', 'electron-builder.xiaoxin.yml');
const windowsGatePath = path.join(root, 'scripts', 'xiaoxin-windows-gate.ps1');

const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const overlay = JSON.parse(fs.readFileSync(overlayPath, 'utf8'));
const builder = fs.readFileSync(builderPath, 'utf8');

assert.equal(overlay.nameShort, 'Xiaoxin');
assert.equal(overlay.nameLong, 'Xiaoxin Workstation');
assert.equal(overlay.applicationName, 'xiaoxin-workstation');
assert.equal(overlay.dataFolderName, '.xiaoxin-workstation');
assert.notEqual(overlay.dataFolderName, base.dataFolderName);
assert.notEqual(overlay.win32MutexName, base.win32MutexName);
assert.notEqual(overlay.win32AppUserModelId, base.win32AppUserModelId);
assert.notEqual(overlay.urlProtocol, base.urlProtocol);

for (const key of [
  'win32x64AppId',
  'win32arm64AppId',
  'win32x64UserAppId',
  'win32arm64UserAppId',
]) {
  assert.match(overlay[key], /^\{\{[0-9A-F-]{36}\}$/);
  assert.notEqual(overlay[key], base[key]);
}

assert.equal(overlay.distribution.id, 'xiaoxin');
assert.equal(overlay.distribution.hostedApiBaseUrl, '');
assert.equal(overlay.distribution.auth.provider, 'none');
assert.equal(overlay.distribution.auth.url, '');
assert.equal(overlay.distribution.auth.anonKey, '');
assert.equal(overlay.distribution.telemetry.sentryDsn, '');
assert.equal(overlay.distribution.telemetry.eventsUrl, '');
assert.equal(overlay.distribution.telemetry.eventsAnonKey, '');
assert.equal(overlay.distribution.updates.provider, 'none');
assert.equal(overlay.distribution.updates.endpoint, '');
assert.equal(overlay.distribution.documentEngine.releaseRepository, '');

assert.match(builder, /^extends: \.\/electron-builder\.yml$/m);
assert.match(builder, /^appId: com\.xinmed\.xiaoxin\.workstation$/m);
assert.match(builder, /^productName: Xiaoxin Workstation$/m);
assert.match(builder, /^\s+- xiaoxin-workstation$/m);
assert.match(builder, /^\s+output: dist-xiaoxin$/m);
assert.match(builder, /^\s+perMachine: false$/m);
assert.match(builder, /^\s+allowElevation: false$/m);
assert.match(builder, /^publish: null$/m);

assert.match(packageJson.scripts['package:smoke:xiaoxin'], /electron-builder\.xiaoxin\.yml/);
assert.match(packageJson.scripts['package:smoke:xiaoxin'], /--dist-dir dist-xiaoxin/);
assert.match(packageJson.scripts['package:smoke:official'], /package:smoke:xiaoxin/);

const serializedOverlay = JSON.stringify(overlay).toLowerCase();
for (const forbidden of [
  'sb_publishable_',
  'service_role',
  'sk-proj-',
  'begin private key',
  'workstationupdater',
  'neyguovvcjxfzhqpkicj',
]) {
  assert.equal(serializedOverlay.includes(forbidden), false, `forbidden value in Xiaoxin overlay: ${forbidden}`);
}

if (process.platform === 'win32') {
  const parserCommand = [
    '$tokens = $null',
    '$errors = $null',
    '[System.Management.Automation.Language.Parser]::ParseFile($env:XIAOXIN_GATE_SCRIPT, [ref]$tokens, [ref]$errors) | Out-Null',
    'if ($errors.Count -gt 0) { $errors | ForEach-Object { Write-Error $_.Message }; exit 1 }',
  ].join('; ');
  const parser = spawnSync('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    parserCommand,
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      XIAOXIN_GATE_SCRIPT: windowsGatePath,
    },
  });
  assert.equal(parser.status, 0, parser.stderr || parser.stdout || 'PowerShell parser failed');
}

console.log('Xiaoxin distribution overlay verified.');
