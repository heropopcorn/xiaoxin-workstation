import { afterEach, describe, expect, test } from 'bun:test';
import { DEFAULT_BROWSER_ACCESS_POLICY } from '../../shared/browserAccessPolicy';
import type {
  BrowserControlConnection,
  BrowserControlPageElementInventory,
  BrowserControlStatus,
} from '../../shared/types/browserControl';
import {
  assistBrowserPageReadTurn,
  formatBrowserPageSnapshotForPrompt,
  setBrowserPageReadAssistDepsForTest,
} from './browserPageReadAssist';

afterEach(() => {
  setBrowserPageReadAssistDepsForTest(null);
});

function pageInventory(): BrowserControlPageElementInventory {
  return {
    tabRef: 'chrome-z:chrome-tab:12',
    chromeTabId: 12,
    browserProfilePolicyId: 'chrome-z',
    origin: 'https://xiaoxin.jenshin.cn',
    frames: [{
      frameId: 1,
      chromeDocumentId: 'doc-1',
      url: 'https://xiaoxin.jenshin.cn/login',
      documentRevision: 'rev-1',
      viewport: {
        width: 1280,
        height: 720,
        scrollX: 0,
        scrollY: 0,
        devicePixelRatio: 1,
        screenBounds: null,
      },
      selectionText: '',
      totalElementCount: 3,
      returnedElementCount: 3,
      truncatedElementCount: 0,
      elements: [
        {
          refId: 'e1',
          index: 0,
          tagName: 'h1',
          role: 'heading',
          name: '小忻',
          text: '小忻',
          value: null,
          inputType: null,
          checked: null,
          disabled: false,
          editable: false,
          clickable: false,
          bounds: { x: 0, y: 0, width: 100, height: 32 },
        },
        {
          refId: 'e2',
          index: 1,
          tagName: 'input',
          role: 'textbox',
          name: '账号',
          text: '',
          value: '',
          inputType: 'text',
          checked: null,
          disabled: false,
          editable: true,
          clickable: true,
          bounds: { x: 0, y: 40, width: 200, height: 32 },
        },
        {
          refId: 'e3',
          index: 2,
          tagName: 'button',
          role: 'button',
          name: '登录',
          text: '登录',
          value: null,
          inputType: null,
          checked: null,
          disabled: false,
          editable: false,
          clickable: true,
          bounds: { x: 0, y: 80, width: 80, height: 32 },
        },
      ],
    }],
  };
}

function connectedStatus(): BrowserControlStatus {
  const connection: BrowserControlConnection = {
    extensionId: 'pebbngnfojnignonigcnkdilknapkgid',
    stableKey: 'chrome-z',
    profileId: 'chrome-z',
    browserName: 'Chrome',
    version: '1',
    activeSessions: 1,
    targets: [],
    browserWindows: [{
      windowId: 1,
      focused: true,
      type: 'normal',
      state: 'normal',
      tabs: [{
        tabRef: 'chrome-z:chrome-tab:12',
        chromeTabId: 12,
        windowId: 1,
        index: 0,
        active: true,
        highlighted: true,
        pinned: false,
        title: '小忻',
        url: 'https://xiaoxin.jenshin.cn/login',
        status: 'complete',
        controlState: 'observable',
      }],
    }],
    focusedWindowId: 1,
    activeTabRef: 'chrome-z:chrome-tab:12',
    focusedWindow: null,
    activeTab: null,
  };

  return {
    relay: {
      phase: 'ready',
      version: '0.0.123',
      runtimeDir: null,
      relayLogPath: null,
      relayCdpLogPath: null,
      ownsRelayProcess: true,
      lastError: null,
      reachable: true,
      endpoint: 'http://127.0.0.1:19988',
    },
    connections: [connection],
    profiles: [],
    connectedBrowsers: 1,
    activeSessions: 1,
  };
}

describe('formatBrowserPageSnapshotForPrompt', () => {
  test('renders labeled controls for the model', () => {
    const snapshot = formatBrowserPageSnapshotForPrompt(pageInventory());
    expect(snapshot).toContain('Observed page snapshot');
    expect(snapshot).toContain('tab_ref: chrome-z:chrome-tab:12');
    expect(snapshot).toContain('- heading "小忻"');
    expect(snapshot).toContain('- textbox "账号" type=text');
    expect(snapshot).toContain('- button "登录"');
  });
});

describe('assistBrowserPageReadTurn', () => {
  test('leaves unrelated turns unchanged and does not inspect', async () => {
    let inspected = false;
    setBrowserPageReadAssistDepsForTest({
      inspectPage: async () => {
        inspected = true;
        return pageInventory();
      },
    });

    const message = 'Edit the document.';
    expect(await assistBrowserPageReadTurn(message)).toBe(message);
    expect(inspected).toBe(false);
  });

  test('attaches a live page snapshot for a natural page-content question', async () => {
    setBrowserPageReadAssistDepsForTest({
      ensureRelay: async () => {},
      getPolicy: async () => ({
        ...DEFAULT_BROWSER_ACCESS_POLICY,
        permissions: {
          ...DEFAULT_BROWSER_ACCESS_POLICY.permissions,
          read: { mode: 'all', allowedPatterns: [] },
        },
      }),
      getStatus: async () => connectedStatus(),
      inspectPage: async () => pageInventory(),
    });

    const message = [
      '<workstation-context>',
      'Browser-Control Tabs:',
      '  - 小忻 (https://xiaoxin.jenshin.cn/login) [tab_ref: chrome-z:chrome-tab:12] [active]',
      '</workstation-context>',
      '当前浏览器页面是什么内容',
    ].join('\n');

    const assisted = await assistBrowserPageReadTurn(message);
    expect(assisted).toContain('Observed page snapshot');
    expect(assisted).toContain('- button "登录"');
    expect(assisted).toContain('当前浏览器页面是什么内容');
    expect(assisted).toContain('</workstation-context>');
  });

  test('does not inspect when browser read policy is ask', async () => {
    let inspected = false;
    setBrowserPageReadAssistDepsForTest({
      ensureRelay: async () => {},
      getPolicy: async () => DEFAULT_BROWSER_ACCESS_POLICY,
      getStatus: async () => connectedStatus(),
      inspectPage: async () => {
        inspected = true;
        return pageInventory();
      },
    });

    const message = [
      '<workstation-context>',
      'Browser-Control Tabs:',
      '  - 小忻 (https://xiaoxin.jenshin.cn/login) [tab_ref: chrome-z:chrome-tab:12] [active]',
      '</workstation-context>',
      '当前浏览器页面是什么内容',
    ].join('\n');

    expect(await assistBrowserPageReadTurn(message)).toBe(message);
    expect(inspected).toBe(false);
  });
});
