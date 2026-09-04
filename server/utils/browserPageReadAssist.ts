import {
  doesBrowserAccessPolicyAllowUrl,
  type BrowserAccessPolicy,
} from '../../shared/browserAccessPolicy';
import type {
  BrowserControlConnection,
  BrowserControlPageElement,
  BrowserControlPageElementInventory,
  BrowserControlStatus,
} from '../../shared/types/browserControl';
import {
  extractBrowserTabRefsFromWorkstationContext,
  messageLooksLikeBrowserPageReadRequest,
} from '../../shared/utils/browserPageReadRequest';
import { WORKSTATION_CONTEXT_TAG } from '../../shared/utils/formatWorkstationContext';
import { getBrowserAccessPolicy } from '../configStore';
import { getBrowserAccessPolicyWithGrants } from './browserAccessGrants';
import {
  ensureBrowserExtensionRelayRunning,
  getBrowserControlPageElementInventory,
  getBrowserControlStatus,
} from './browserExtensionRelay';

const MAX_SNAPSHOT_ELEMENTS = 60;
const SNAPSHOT_HEADER = 'Observed page snapshot (live element inventory; this is page content, not the title/URL list):';

type BrowserPageReadAssistTab = {
  tabRef: string;
  url: string;
  profileId: string;
};

export type BrowserPageReadAssistDeps = {
  ensureRelay: () => Promise<void>;
  getPolicy: () => Promise<BrowserAccessPolicy>;
  getStatus: () => Promise<BrowserControlStatus>;
  inspectPage: (input: {
    tabRef: string;
    maxElementsPerFrame?: number;
  }) => Promise<BrowserControlPageElementInventory>;
};

const defaultDeps: BrowserPageReadAssistDeps = {
  ensureRelay: ensureBrowserExtensionRelayRunning,
  getPolicy: getBrowserAccessPolicy,
  getStatus: getBrowserControlStatus,
  inspectPage: getBrowserControlPageElementInventory,
};

let assistDeps: BrowserPageReadAssistDeps = defaultDeps;

export function setBrowserPageReadAssistDepsForTest(
  deps: Partial<BrowserPageReadAssistDeps> | null,
): void {
  assistDeps = deps
    ? { ...defaultDeps, ...deps }
    : defaultDeps;
}

export function formatBrowserPageSnapshotForPrompt(
  inventory: BrowserControlPageElementInventory,
): string {
  const lines: string[] = [
    SNAPSHOT_HEADER,
    `tab_ref: ${inventory.tabRef}`,
  ];
  if (inventory.origin) {
    lines.push(`origin: ${inventory.origin}`);
  }

  let remaining = MAX_SNAPSHOT_ELEMENTS;
  for (const frame of inventory.frames) {
    if (remaining <= 0) {
      break;
    }
    lines.push(`frame ${frame.frameId}: ${frame.url || inventory.origin || ''}`);
    for (const element of frame.elements) {
      if (remaining <= 0) {
        break;
      }
      const rendered = formatSnapshotElement(element);
      if (!rendered) {
        continue;
      }
      lines.push(rendered);
      remaining -= 1;
    }
  }

  if (lines.length <= 3) {
    lines.push('- (no labeled page controls were returned)');
  }

  return lines.join('\n');
}

export async function assistBrowserPageReadTurn(message: string | undefined): Promise<string | undefined> {
  if (!message || !messageLooksLikeBrowserPageReadRequest(message)) {
    return message;
  }

  try {
    const snapshot = await readAllowedBrowserPageSnapshot(message);
    if (!snapshot) {
      return message;
    }
    return insertIntoWorkstationContext(message, snapshot);
  } catch (error) {
    console.warn(
      '[BrowserPageReadAssist] Failed to attach a live page snapshot.',
      error instanceof Error ? error.message : error,
    );
    return insertIntoWorkstationContext(
      message,
      [
        'Live page inspect was not attached automatically.',
        'Use the visible shell tool (usually `exec_command`) with the interpreter_browser_page_inspect command from workstation context.',
        'Do not say browser page reading tools are missing from the tool list.',
      ].join('\n'),
    );
  }
}

async function readAllowedBrowserPageSnapshot(message: string): Promise<string | null> {
  await assistDeps.ensureRelay();
  const [policy, status] = await Promise.all([
    assistDeps.getPolicy(),
    assistDeps.getStatus(),
  ]);
  const tab = resolveTabToInspect(message, status.connections);
  if (!tab) {
    return null;
  }

  const allowed = doesBrowserAccessPolicyAllowUrl(
    getBrowserAccessPolicyWithGrants(policy),
    tab.url,
    tab.profileId,
    'read',
  );
  if (!allowed) {
    return null;
  }

  const inventory = await assistDeps.inspectPage({
    tabRef: tab.tabRef,
    maxElementsPerFrame: MAX_SNAPSHOT_ELEMENTS,
  });
  return formatBrowserPageSnapshotForPrompt(inventory);
}

function resolveTabToInspect(
  message: string,
  connections: BrowserControlConnection[],
): BrowserPageReadAssistTab | null {
  const liveTabs = connections.flatMap((connection) => (
    connection.browserWindows.flatMap((browserWindow) => (
      browserWindow.tabs.map((tab) => ({
        tabRef: tab.tabRef,
        url: tab.url,
        profileId: connection.profileId,
        active: tab.active || connection.activeTabRef === tab.tabRef,
      }))
    ))
  ));
  const contextRefs = extractBrowserTabRefsFromWorkstationContext(message);

  if (contextRefs.length > 0) {
    const matched = liveTabs.find((tab) => tab.tabRef === contextRefs[0]);
    if (matched) {
      return matched;
    }
    return {
      tabRef: contextRefs[0],
      url: urlForContextTabRef(message, contextRefs[0]),
      profileId: liveTabs[0]?.profileId ?? '',
    };
  }

  return liveTabs.find((tab) => tab.active) ?? liveTabs[0] ?? null;
}

function urlForContextTabRef(message: string, tabRef: string): string {
  const escaped = tabRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = message.match(new RegExp(`\\((https?:\\/\\/[^)]+)\\)\\s*\\[(?:tab_ref|tab_id):\\s*${escaped}\\]`));
  return match?.[1] ?? '';
}

function formatSnapshotElement(element: BrowserControlPageElement): string | null {
  const label = (element.name || element.text || element.value || '').trim();
  if (!label && !element.clickable && !element.editable) {
    return null;
  }

  const parts: string[] = [`- ${element.role || element.tagName || 'element'}`];
  if (element.name) {
    parts.push(quoteSnapshotValue(element.name));
  }
  if (element.text && element.text !== element.name) {
    parts.push(`text=${quoteSnapshotValue(truncateSnapshotText(element.text))}`);
  }
  if (element.value) {
    parts.push(`value=${quoteSnapshotValue(truncateSnapshotText(element.value))}`);
  }
  if (element.inputType) {
    parts.push(`type=${element.inputType}`);
  }
  return parts.join(' ');
}

function quoteSnapshotValue(value: string): string {
  return JSON.stringify(value);
}

function truncateSnapshotText(value: string): string {
  return value.length > 80 ? `${value.slice(0, 80)}...` : value;
}

function insertIntoWorkstationContext(message: string, extra: string): string {
  const closeTag = `</${WORKSTATION_CONTEXT_TAG}>`;
  const closeIndex = message.lastIndexOf(closeTag);
  if (closeIndex === -1) {
    return `${message}\n\n<${WORKSTATION_CONTEXT_TAG}>\n${extra}\n</${WORKSTATION_CONTEXT_TAG}>`;
  }
  const before = message.slice(0, closeIndex).replace(/\s*$/, '');
  const after = message.slice(closeIndex);
  return `${before}\n\n${extra}\n${after}`;
}
