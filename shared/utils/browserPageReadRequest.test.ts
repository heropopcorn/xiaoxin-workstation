import { describe, expect, test } from 'bun:test';
import {
  extractBrowserTabRefsFromWorkstationContext,
  messageLooksLikeBrowserPageReadRequest,
} from './browserPageReadRequest';

describe('messageLooksLikeBrowserPageReadRequest', () => {
  test('matches the natural Chinese page-content question', () => {
    expect(messageLooksLikeBrowserPageReadRequest('当前浏览器页面是什么内容')).toBe(true);
    expect(messageLooksLikeBrowserPageReadRequest('我浏览器当前页面内容是啥')).toBe(true);
    expect(messageLooksLikeBrowserPageReadRequest('看看浏览器')).toBe(true);
  });

  test('matches English page-content questions', () => {
    expect(messageLooksLikeBrowserPageReadRequest('what is on the current browser page')).toBe(true);
    expect(messageLooksLikeBrowserPageReadRequest("what's on the page")).toBe(true);
    expect(messageLooksLikeBrowserPageReadRequest('read the current page')).toBe(true);
  });

  test('ignores hidden workstation context when deciding intent', () => {
    const message = [
      '<workstation-context>',
      'Browser-Control Tabs:',
      '  - 小忻 (https://xiaoxin.jenshin.cn/login) [tab_ref: chrome-tab:1] [active]',
      '</workstation-context>',
      '当前浏览器页面是什么内容',
    ].join('\n');
    expect(messageLooksLikeBrowserPageReadRequest(message)).toBe(true);
  });

  test('does not match unrelated document work', () => {
    expect(messageLooksLikeBrowserPageReadRequest('Edit the document.')).toBe(false);
    expect(messageLooksLikeBrowserPageReadRequest('Write a landing page in HTML')).toBe(false);
  });
});

describe('extractBrowserTabRefsFromWorkstationContext', () => {
  test('prefers the active tab and accepts tab_id or tab_ref labels', () => {
    const message = [
      'Browser-Control Tabs:',
      '  - Google (https://google.com) [tab_id: b1]',
      '  - 小忻 (https://xiaoxin.jenshin.cn/login) [tab_ref: profile:chrome-tab:9] [active]',
    ].join('\n');

    expect(extractBrowserTabRefsFromWorkstationContext(message)).toEqual([
      'profile:chrome-tab:9',
      'b1',
    ]);
  });
});
