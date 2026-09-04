import { stripWorkstationContext } from './formatWorkstationContext';

const TAB_REF_PATTERN = /\[(?:tab_ref|tab_id):\s*([^\]]+)\](\s*\[active\])?/g;

const PAGE_READ_PATTERNS: readonly RegExp[] = [
  /当前.{0,16}(浏览器|页面|网页).{0,16}(内容|什么|啥)/i,
  /(浏览器|页面|网页).{0,12}(当前)?.{0,8}(内容|上看|里有什么|里是什么|是啥|是什么)/i,
  /看看.{0,12}(浏览器|页面|网页)/i,
  /what(?:'s| is) on (?:the )?(?:current )?(?:browser )?page/i,
  /(?:read|inspect|describe|look at) (?:the )?(?:current )?(?:browser )?page/i,
  /current (?:browser )?page(?: content)?/i,
  /page content/i,
];

export function userTextForBrowserPageIntent(message: string): string {
  return stripWorkstationContext(message);
}

export function messageLooksLikeBrowserPageReadRequest(message: string): boolean {
  const text = userTextForBrowserPageIntent(message).trim();
  if (!text) {
    return false;
  }

  return PAGE_READ_PATTERNS.some((pattern) => pattern.test(text));
}

export function extractBrowserTabRefsFromWorkstationContext(message: string): string[] {
  const regularRefs: string[] = [];
  const activeRefs: string[] = [];
  const seen = new Set<string>();

  for (const match of message.matchAll(TAB_REF_PATTERN)) {
    const tabRef = match[1]?.trim();
    if (!tabRef || seen.has(tabRef)) {
      continue;
    }
    seen.add(tabRef);
    if (match[2]) {
      activeRefs.push(tabRef);
    } else {
      regularRefs.push(tabRef);
    }
  }

  return [...activeRefs, ...regularRefs];
}
