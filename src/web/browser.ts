import { chromium, type Browser, type BrowserContext } from 'playwright-core';
import * as fs from 'fs';

const CHROME_PATHS = [
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium'
];

function findBrowserPath(): string {
  for (const path of CHROME_PATHS) {
    if (fs.existsSync(path)) {
      return path;
    }
  }
  throw new Error('No Chrome or Chromium executable found on the system');
}

let sharedBrowser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (sharedBrowser && sharedBrowser.isConnected()) {
    return sharedBrowser;
  }

  const executablePath = findBrowserPath();
  sharedBrowser = await chromium.launch({
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--no-first-run',
      '--mute-audio'
    ]
  });

  return sharedBrowser;
}

export function isPrivateIpOrHost(hostname: string): boolean {
  const cleanHost = hostname.replace(/^\[|\]$/g, '').toLowerCase();

  if (
    cleanHost === 'localhost' ||
    cleanHost.endsWith('.localhost') ||
    cleanHost.endsWith('.local') ||
    cleanHost.endsWith('.internal')
  ) {
    return true;
  }

  // IPv4 checks
  const ipv4Match = cleanHost.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1).map(Number);
    if (octets[0] === 127) return true; // Loopback 127.0.0.0/8
    if (octets[0] === 10) return true; // Private 10.0.0.0/8
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true; // 172.16.0.0/12
    if (octets[0] === 192 && octets[1] === 168) return true; // 192.168.0.0/16
    if (octets[0] === 169 && octets[1] === 254) return true; // Link-local / AWS metadata
    if (octets[0] === 0) return true; // 0.0.0.0
  }

  // IPv6 loopback / unique local
  if (cleanHost === '::1' || cleanHost.startsWith('fc00:') || cleanHost.startsWith('fe80:')) {
    return true;
  }

  return false;
}

export async function createSafeContext(
  viewport = { width: 1440, height: 900 },
  allowLocalhost = false
): Promise<BrowserContext> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 ContextBridge/1.0',
    ignoreHTTPSErrors: true
  });

  if (!allowLocalhost) {
    await context.route('**/*', (route) => {
      try {
        const url = new URL(route.request().url());
        if (isPrivateIpOrHost(url.hostname)) {
          return route.abort('blockedbyclient');
        }
        return route.continue();
      } catch {
        return route.abort('failed');
      }
    });
  }

  return context;
}

export async function closeBrowser(): Promise<void> {
  if (sharedBrowser) {
    await sharedBrowser.close();
    sharedBrowser = null;
  }
}
