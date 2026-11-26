/**
 * Prism SSS-Tier Interactive Client Engine
 * 
 * Features:
 * 1. Interactive Layout Inspector Demo
 *    - Real-time CSS bounding metrics, padding, font-size, line-height, computed hex color.
 *    - Accurate WCAG AA / AAA contrast calculation engine with pass/fail badges.
 *    - DOM-to-Source correlation (`find_ui_source`) showing file path, line numbers, and React/AST component mapping.
 * 2. Interactive Codebase Symbol & Impact Tracer
 *    - Multi-target AST graph simulation (AuthSession, CheckoutButton, analyzeMetrics).
 *    - Structural caller/callee visualization, route bindings, file slices, and calculated risk score.
 * 3. Universal Installer Command Switcher
 *    - Global (-g -y), Local (-l -y), and Docker run modes with instant clipboard copy & toast notifications.
 * 4. Theme & High-Contrast Display Modes
 *    - Dark, Light, and Cyber/High-Contrast modes with keyboard shortcuts ('T' for theme, '1'-'4' for element selection).
 */

(function () {
  'use strict';

  // --- Utility Functions ---

  function parseRgb(colorStr) {
    if (!colorStr) return [0, 0, 0];
    const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (match) {
      return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
    }
    if (colorStr.startsWith('#')) {
      let hex = colorStr.slice(1);
      if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
      const num = parseInt(hex, 16);
      return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
    }
    return [0, 0, 0];
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  function getLuminance(r, g, b) {
    const a = [r, g, b].map(v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
  }

  function calculateContrastRatio(fgRgb, bgRgb) {
    const lum1 = getLuminance(...fgRgb);
    const lum2 = getLuminance(...bgRgb);
    const brightest = Math.max(lum1, lum2);
    const darkest = Math.min(lum1, lum2);
    return (brightest + 0.05) / (darkest + 0.05);
  }

  // --- Element Inspection Data Mockups ---
  const INSPECTOR_ELEMENTS = {
    navbar: {
      id: 'navbar',
      name: 'Global Header & Navigation',
      tag: '<header class="prism-nav">',
      sourcePath: 'src/components/Navigation.tsx:18',
      componentName: 'SiteHeader',
      metrics: {
        width: 1200,
        height: 64,
        padding: '16px 24px',
        margin: '0px 0px 32px 0px',
        fontSize: '14px',
        lineHeight: '20px',
        fontWeight: '500',
        textColor: '#f4f4f5',
        bgColor: '#121215',
        borderRadius: '8px',
        border: '1px solid #27272a'
      },
      ast: {
        parent: 'RootLayout (src/layouts/RootLayout.tsx:12)',
        children: ['LogoBrand', 'NavMenu', 'AgentBadges', 'InstallerCTA'],
        gitCommit: 'a8f9c12 (feat: responsive sticky navigation)'
      }
    },
    hero: {
      id: 'hero',
      name: 'Hero Display Headline',
      tag: '<h1 class="headline-primary">',
      sourcePath: 'src/components/Hero.tsx:42',
      componentName: 'HeroHeadline',
      metrics: {
        width: 780,
        height: 116,
        padding: '0px',
        margin: '0px 0px 24px 0px',
        fontSize: '48px',
        lineHeight: '56px',
        fontWeight: '700',
        textColor: '#ffffff',
        bgColor: '#09090b',
        borderRadius: '0px',
        border: 'none'
      },
      ast: {
        parent: 'HeroSection (src/components/Hero.tsx:15)',
        children: ['GradientTextSpan', 'SubheadingLead'],
        gitCommit: 'bc410d8 (fix: clamp headline scale on mobile)'
      }
    },
    cta: {
      id: 'cta',
      name: 'Universal Install Button',
      tag: '<button class="btn-primary-glow">',
      sourcePath: 'src/components/InstallerButton.tsx:29',
      componentName: 'QuickInstallButton',
      metrics: {
        width: 224,
        height: 48,
        padding: '12px 24px',
        margin: '16px 0px 0px 0px',
        fontSize: '15px',
        lineHeight: '22px',
        fontWeight: '600',
        textColor: '#ffffff',
        bgColor: '#2563eb',
        borderRadius: '6px',
        border: '1px solid #3b82f6'
      },
      ast: {
        parent: 'HeroActions (src/components/Hero.tsx:88)',
        children: ['TerminalIcon', 'ButtonLabel', 'CopyBadge'],
        gitCommit: '90ea13b (perf: memoize copy callback event)'
      }
    },
    card: {
      id: 'card',
      name: 'Telemetry Benchmark Card',
      tag: '<div class="card-pricing-spec">',
      sourcePath: 'src/components/BenchmarkCard.tsx:64',
      componentName: 'LatencyComparisonCard',
      metrics: {
        width: 360,
        height: 290,
        padding: '24px',
        margin: '16px',
        fontSize: '14px',
        lineHeight: '20px',
        fontWeight: '400',
        textColor: '#e4e4e7',
        bgColor: '#18181b',
        borderRadius: '12px',
        border: '1px solid #27272a'
      },
      ast: {
        parent: 'BenchmarkGrid (src/views/Benchmarks.tsx:31)',
        children: ['CardHeader', 'MetricBadgeList', 'SparklineChart'],
        gitCommit: 'e51b34c (refactor: token savings audit formula)'
      }
    }
  };

  // --- Impact Tracer Targets Mockups ---
  const TRACER_DATA = {
    AuthSession: {
      symbol: 'AuthSession',
      file: 'src/auth/session.ts:84',
      kind: 'Interface / Controller',
      riskScore: 84,
      riskLevel: 'HIGH',
      callers: [
        { name: 'handleApiAuthentication', file: 'src/server/middleware.ts:42', type: 'caller' },
        { name: 'verifyTokenBearer', file: 'src/auth/tokens.ts:109', type: 'caller' },
        { name: 'UserWorkspaceProvider', file: 'src/context/Workspace.tsx:65', type: 'caller' }
      ],
      callees: [
        { name: 'crypto.subtle.digest', file: 'node:crypto', type: 'callee' },
        { name: 'db.sessions.findUnique', file: 'src/db/client.ts:312', type: 'callee' },
        { name: 'invalidateSessionCache', file: 'src/cache/redis.ts:98', type: 'callee' }
      ],
      routes: [
        'POST /api/v1/auth/exchange',
        'GET /api/v1/session/current',
        'POST /api/v1/logout'
      ],
      summary: 'Critical authentication gateway. Changes directly impact token lifecycle, multi-tenant session validation, and all downstream authenticated API endpoints.'
    },
    CheckoutButton: {
      symbol: 'CheckoutButton',
      file: 'src/components/checkout/CheckoutButton.tsx:28',
      kind: 'React Component',
      riskScore: 48,
      riskLevel: 'MODERATE',
      callers: [
        { name: 'PricingTierCard', file: 'src/components/pricing/TierCard.tsx:102', type: 'caller' },
        { name: 'UpgradeModal', file: 'src/components/modals/UpgradeModal.tsx:76', type: 'caller' }
      ],
      callees: [
        { name: 'useStripeClient', file: 'src/hooks/useStripe.ts:14', type: 'callee' },
        { name: 'createCheckoutSession', file: 'src/api/stripe.ts:45', type: 'callee' },
        { name: 'trackConversionEvent', file: 'src/analytics/telemetry.ts:88', type: 'callee' }
      ],
      routes: [
        'POST /api/billing/create-session',
        'GET /checkout/success'
      ],
      summary: 'Primary conversion trigger. Directly invokes Stripe payment workflow and client telemetry hooks. Medium blast radius confined to checkout funnel.'
    },
    analyzeMetrics: {
      symbol: 'analyzeMetrics',
      file: 'src/inspector/metrics.ts:152',
      kind: 'Algorithm / Analytical Engine',
      riskScore: 24,
      riskLevel: 'LOW',
      callers: [
        { name: 'inspectLayoutNode', file: 'src/inspector/engine.ts:210', type: 'caller' },
        { name: 'generateAuditReport', file: 'src/audit/reporter.ts:55', type: 'caller' }
      ],
      callees: [
        { name: 'calculateBoundingBox', file: 'src/inspector/geometry.ts:34', type: 'callee' },
        { name: 'auditWCAGContrast', file: 'src/inspector/contrast.ts:82', type: 'callee' }
      ],
      routes: [
        'MCP tool: inspect_website',
        'MCP tool: inspect_page'
      ],
      summary: 'Pure mathematical computation helper. Validates layout box model dimensions and contrast compliance ratios. Low blast radius with 100% test coverage.'
    }
  };

  // --- DOM Elements Cache ---
  const state = {
    currentInspectTarget: 'navbar',
    currentTraceTarget: 'AuthSession',
    currentInstallScope: 'global',
    activeTheme: 'dark'
  };

  // --- Initializer & Event Listeners ---
  function init() {
    initLayoutInspector();
    initImpactTracer();
    initInstallerSwitcher();
    initThemeControls();
    initKeyboardShortcuts();
    setupToastContainer();
  }

  // --- 1. Layout Inspector Demo Component ---
  function initLayoutInspector() {
    const demoItems = document.querySelectorAll('[data-inspect-target]');
    demoItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = item.getAttribute('data-inspect-target');
        selectInspectorTarget(targetId);
      });

      item.addEventListener('mouseenter', () => {
        const targetId = item.getAttribute('data-inspect-target');
        updateInspectorHoverBadge(item, targetId);
      });
    });

    // Default selection
    selectInspectorTarget('navbar');
  }

  function selectInspectorTarget(targetId) {
    if (!INSPECTOR_ELEMENTS[targetId]) return;
    state.currentInspectTarget = targetId;

    // Highlight active element in preview
    document.querySelectorAll('[data-inspect-target]').forEach(el => {
      if (el.getAttribute('data-inspect-target') === targetId) {
        el.classList.add('prism-inspect-active');
        el.classList.remove('prism-inspect-inactive');
      } else {
        el.classList.remove('prism-inspect-active');
        el.classList.add('prism-inspect-inactive');
      }
    });

    renderInspectorPanel(INSPECTOR_ELEMENTS[targetId]);
  }

  function updateInspectorHoverBadge(itemEl, targetId) {
    const target = INSPECTOR_ELEMENTS[targetId];
    if (!target) return;
    const badge = document.getElementById('inspector-hover-tooltip');
    if (!badge) return;

    badge.textContent = `${target.tag} (${target.metrics.width}×${target.metrics.height}px)`;
    badge.style.display = 'block';
  }

  function renderInspectorPanel(data) {
    const nameEl = document.getElementById('inspect-element-name');
    const tagEl = document.getElementById('inspect-element-tag');
    const sourceEl = document.getElementById('inspect-source-link');
    const commitEl = document.getElementById('inspect-git-commit');
    const componentEl = document.getElementById('inspect-component-name');

    if (nameEl) nameEl.textContent = data.name;
    if (tagEl) tagEl.textContent = data.tag;
    if (sourceEl) {
      sourceEl.textContent = data.sourcePath;
      sourceEl.setAttribute('data-path', data.sourcePath);
    }
    if (commitEl) commitEl.textContent = data.ast.gitCommit;
    if (componentEl) componentEl.textContent = data.componentName;

    // Metrics
    const widthEl = document.getElementById('metric-width');
    const heightEl = document.getElementById('metric-height');
    const paddingEl = document.getElementById('metric-padding');
    const marginEl = document.getElementById('metric-margin');
    const fontEl = document.getElementById('metric-font');
    const lineHeightEl = document.getElementById('metric-line-height');
    const colorHexEl = document.getElementById('metric-color-hex');
    const colorBgHexEl = document.getElementById('metric-bg-hex');
    const colorSwatchEl = document.getElementById('metric-color-swatch');
    const colorBgSwatchEl = document.getElementById('metric-bg-swatch');

    if (widthEl) widthEl.textContent = `${data.metrics.width}px`;
    if (heightEl) heightEl.textContent = `${data.metrics.height}px`;
    if (paddingEl) paddingEl.textContent = data.metrics.padding;
    if (marginEl) marginEl.textContent = data.metrics.margin;
    if (fontEl) fontEl.textContent = `${data.metrics.fontSize} (${data.metrics.fontWeight})`;
    if (lineHeightEl) lineHeightEl.textContent = data.metrics.lineHeight;
    
    if (colorHexEl) colorHexEl.textContent = data.metrics.textColor;
    if (colorBgHexEl) colorBgHexEl.textContent = data.metrics.bgColor;
    if (colorSwatchEl) colorSwatchEl.style.backgroundColor = data.metrics.textColor;
    if (colorBgSwatchEl) colorBgSwatchEl.style.backgroundColor = data.metrics.bgColor;

    // Contrast Ratio Calculation
    const fgRgb = parseRgb(data.metrics.textColor);
    const bgRgb = parseRgb(data.metrics.bgColor);
    const contrastRatio = calculateContrastRatio(fgRgb, bgRgb);
    const ratioRounded = contrastRatio.toFixed(2);

    const ratioEl = document.getElementById('metric-contrast-ratio');
    const badgeEl = document.getElementById('metric-contrast-badge');
    const badgeAaaEl = document.getElementById('metric-contrast-aaa');

    if (ratioEl) ratioEl.textContent = `${ratioRounded}:1`;

    if (badgeEl) {
      if (contrastRatio >= 4.5) {
        badgeEl.textContent = 'PASS (AA)';
        badgeEl.className = 'prism-badge prism-badge-success';
      } else {
        badgeEl.textContent = 'FAIL (< 4.5)';
        badgeEl.className = 'prism-badge prism-badge-danger';
      }
    }

    if (badgeAaaEl) {
      if (contrastRatio >= 7.0) {
        badgeAaaEl.textContent = 'PASS (AAA)';
        badgeAaaEl.className = 'prism-badge prism-badge-success';
      } else {
        badgeAaaEl.textContent = 'FAIL (AAA)';
        badgeAaaEl.className = 'prism-badge prism-badge-muted';
      }
    }

    // AST Tree / Children
    const astTreeEl = document.getElementById('inspect-ast-tree');
    if (astTreeEl) {
      astTreeEl.innerHTML = `
        <div class="tree-parent"><span class="tree-icon">▲</span> ${escapeHtml(data.ast.parent)}</div>
        <div class="tree-node active"><span class="tree-icon">●</span> <strong>${escapeHtml(data.componentName)}</strong> &lt;${escapeHtml(data.tag.replace(/[<>]/g, ''))}&gt;</div>
        <div class="tree-children">
          ${data.ast.children.map(child => `<div class="tree-leaf"><span class="tree-branch">└─</span> ${escapeHtml(child)}</div>`).join('')}
        </div>
      `;
    }
  }

  // --- 2. Codebase Symbol & Impact Tracer Component ---
  function initImpactTracer() {
    const traceTabs = document.querySelectorAll('[data-trace-target]');
    traceTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        const symbolKey = tab.getAttribute('data-trace-target');
        selectTraceTarget(symbolKey);
      });
    });

    selectTraceTarget('AuthSession');
  }

  function selectTraceTarget(symbolKey) {
    const data = TRACER_DATA[symbolKey];
    if (!data) return;
    state.currentTraceTarget = symbolKey;

    // Update active tab styles
    document.querySelectorAll('[data-trace-target]').forEach(btn => {
      if (btn.getAttribute('data-trace-target') === symbolKey) {
        btn.classList.add('tab-active');
        btn.setAttribute('aria-selected', 'true');
      } else {
        btn.classList.remove('tab-active');
        btn.setAttribute('aria-selected', 'false');
      }
    });

    // Populate Symbol details
    const symNameEl = document.getElementById('tracer-symbol-name');
    const symFileEl = document.getElementById('tracer-symbol-file');
    const symKindEl = document.getElementById('tracer-symbol-kind');
    const symRiskScoreEl = document.getElementById('tracer-risk-score');
    const symRiskBadgeEl = document.getElementById('tracer-risk-badge');
    const symSummaryEl = document.getElementById('tracer-summary-text');

    if (symNameEl) symNameEl.textContent = data.symbol;
    if (symFileEl) symFileEl.textContent = data.file;
    if (symKindEl) symKindEl.textContent = data.kind;
    if (symRiskScoreEl) symRiskScoreEl.textContent = `${data.riskScore}/100`;
    if (symSummaryEl) symSummaryEl.textContent = data.summary;

    if (symRiskBadgeEl) {
      symRiskBadgeEl.textContent = data.riskLevel;
      if (data.riskLevel === 'HIGH') {
        symRiskBadgeEl.className = 'risk-badge risk-high';
      } else if (data.riskLevel === 'MODERATE') {
        symRiskBadgeEl.className = 'risk-badge risk-moderate';
      } else {
        symRiskBadgeEl.className = 'risk-badge risk-low';
      }
    }

    // Callers list
    const callersEl = document.getElementById('tracer-callers-list');
    if (callersEl) {
      callersEl.innerHTML = data.callers.map(item => `
        <li class="tracer-item caller">
          <div class="tracer-item-header">
            <span class="tracer-node-tag">caller</span>
            <code class="tracer-fn-name">${escapeHtml(item.name)}</code>
          </div>
          <div class="tracer-file-ref">${escapeHtml(item.file)}</div>
        </li>
      `).join('');
    }

    // Callees list
    const calleesEl = document.getElementById('tracer-callees-list');
    if (calleesEl) {
      calleesEl.innerHTML = data.callees.map(item => `
        <li class="tracer-item callee">
          <div class="tracer-item-header">
            <span class="tracer-node-tag">callee</span>
            <code class="tracer-fn-name">${escapeHtml(item.name)}</code>
          </div>
          <div class="tracer-file-ref">${escapeHtml(item.file)}</div>
        </li>
      `).join('');
    }

    // Routes list
    const routesEl = document.getElementById('tracer-routes-list');
    if (routesEl) {
      routesEl.innerHTML = data.routes.map(route => `
        <li class="tracer-route-badge">
          <code>${escapeHtml(route)}</code>
        </li>
      `).join('');
    }

    // Animated Graph visualization
    renderGraphCanvas(data);
  }

  function renderGraphCanvas(data) {
    const canvas = document.getElementById('tracer-graph-canvas');
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const textColor = isDark ? '#f4f4f5' : '#18181b';
    const subColor = isDark ? '#a1a1aa' : '#71717a';
    const lineColor = isDark ? 'rgba(59, 130, 246, 0.4)' : 'rgba(37, 99, 235, 0.3)';
    const nodeBg = isDark ? '#1e293b' : '#e2e8f0';
    const targetBg = isDark ? '#2563eb' : '#3b82f6';

    // Center target node
    const centerX = width / 2;
    const centerY = height / 2;

    // Draw Callers (Left side)
    const callerCount = data.callers.length;
    data.callers.forEach((c, idx) => {
      const cy = (height / (callerCount + 1)) * (idx + 1);
      const cx = width * 0.18;

      // Draw connecting curve
      ctx.beginPath();
      ctx.moveTo(cx + 60, cy);
      ctx.bezierCurveTo(centerX - 60, cy, cx + 60, centerY, centerX - 70, centerY);
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Node box
      ctx.fillStyle = nodeBg;
      roundRect(ctx, cx - 60, cy - 16, 120, 32, 6, true, false);
      ctx.fillStyle = textColor;
      ctx.font = '11px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.name.slice(0, 14), cx, cy);
    });

    // Draw Callees (Right side)
    const calleeCount = data.callees.length;
    data.callees.forEach((c, idx) => {
      const cy = (height / (calleeCount + 1)) * (idx + 1);
      const cx = width * 0.82;

      // Draw connecting curve
      ctx.beginPath();
      ctx.moveTo(centerX + 70, centerY);
      ctx.bezierCurveTo(centerX + 60, centerY, cx - 60, cy, cx - 60, cy);
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Node box
      ctx.fillStyle = nodeBg;
      roundRect(ctx, cx - 60, cy - 16, 120, 32, 6, true, false);
      ctx.fillStyle = textColor;
      ctx.font = '11px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.name.slice(0, 14), cx, cy);
    });

    // Center Node (Target Symbol)
    ctx.shadowColor = 'rgba(59, 130, 246, 0.4)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = targetBg;
    roundRect(ctx, centerX - 75, centerY - 22, 150, 44, 8, true, false);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(data.symbol, centerX, centerY - 4);

    ctx.font = '10px -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillText(data.kind, centerX, centerY + 10);
  }

  function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  // --- 3. Agent Installer Command Switcher ---
  const INSTALL_COMMANDS = {
    global: 'curl -fsSL https://raw.githubusercontent.com/whysooraj/prism/main/install.sh | bash -s -- -g -y',
    local: 'curl -fsSL https://raw.githubusercontent.com/whysooraj/prism/main/install.sh | bash -s -- -l -y',
    docker: 'docker run -d --name prism-mcp -p 8080:8080 -v $(pwd):/workspace ghcr.io/whysooraj/prism:latest'
  };

  function initInstallerSwitcher() {
    const tabs = document.querySelectorAll('[data-install-mode]');
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        const mode = tab.getAttribute('data-install-mode');
        switchInstallMode(mode);
      });
    });

    const copyBtn = document.getElementById('copy-installer-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', handleCopyInstallCommand);
    }

    const commandBlock = document.getElementById('installer-command-text');
    if (commandBlock) {
      commandBlock.addEventListener('click', handleCopyInstallCommand);
    }

    switchInstallMode('global');
  }

  function switchInstallMode(mode) {
    if (!INSTALL_COMMANDS[mode]) return;
    state.currentInstallScope = mode;

    document.querySelectorAll('[data-install-mode]').forEach(btn => {
      if (btn.getAttribute('data-install-mode') === mode) {
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
      } else {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
      }
    });

    const commandText = document.getElementById('installer-command-text');
    if (commandText) {
      commandText.textContent = INSTALL_COMMANDS[mode];
    }

    const noteText = document.getElementById('installer-scope-note');
    if (noteText) {
      if (mode === 'global') {
        noteText.textContent = 'Configures global MCP runtime across all detected agents (~/.claude.json, ~/.agents/skills/, Antigravity)';
      } else if (mode === 'local') {
        noteText.textContent = 'Scopes installation to current directory workspace only (./.agents/skills/, ./.cursor/mcp.json)';
      } else {
        noteText.textContent = 'Spawns isolated MCP server container with Playwright browser sandbox on port 8080';
      }
    }
  }

  async function handleCopyInstallCommand() {
    const cmd = INSTALL_COMMANDS[state.currentInstallScope];
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(cmd);
      } else {
        // Fallback for non-secure contexts
        const textarea = document.createElement('textarea');
        textarea.value = cmd;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      showToast('Copied installation command to clipboard!');

      const copyBtn = document.getElementById('copy-installer-btn');
      if (copyBtn) {
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = '✓ Copied';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.innerHTML = originalText;
          copyBtn.classList.remove('copied');
        }, 2200);
      }
    } catch (err) {
      showToast('Press Ctrl+C to copy command', 'warning');
    }
  }

  // --- 4. Theme & High-Contrast Mode ---
  function initThemeControls() {
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', toggleTheme);
    }

    // Check system preference or stored setting
    const savedTheme = localStorage.getItem('prism-theme') || 'dark';
    applyTheme(savedTheme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    let nextTheme = 'dark';
    if (current === 'dark') nextTheme = 'light';
    else if (current === 'light') nextTheme = 'high-contrast';
    else nextTheme = 'dark';

    applyTheme(nextTheme);
  }

  function applyTheme(themeName) {
    state.activeTheme = themeName;
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem('prism-theme', themeName);

    const themeLabel = document.getElementById('theme-toggle-label');
    if (themeLabel) {
      themeLabel.textContent = themeName.toUpperCase();
    }

    // Redraw dynamic graph canvas to match contrast palette
    const currentData = TRACER_DATA[state.currentTraceTarget];
    if (currentData) renderGraphCanvas(currentData);
  }

  // --- 5. Keyboard Shortcuts ---
  function initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Ignore if user is inside an input or textarea
      if (e.target.matches('input, textarea, select')) return;

      const key = e.key.toLowerCase();
      if (key === 't') {
        e.preventDefault();
        toggleTheme();
        showToast(`Theme switched to: ${state.activeTheme}`);
      } else if (key === '1') {
        selectInspectorTarget('navbar');
      } else if (key === '2') {
        selectInspectorTarget('hero');
      } else if (key === '3') {
        selectInspectorTarget('cta');
      } else if (key === '4') {
        selectInspectorTarget('card');
      } else if (key === 'c') {
        handleCopyInstallCommand();
      }
    });
  }

  // --- 6. Feedback Toast System ---
  function setupToastContainer() {
    let container = document.getElementById('prism-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'prism-toast-container';
      container.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 8px;
        pointer-events: none;
      `;
      document.body.appendChild(container);
    }
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('prism-toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `prism-toast prism-toast-${type}`;
    toast.style.cssText = `
      background: #18181b;
      color: #fafafa;
      border: 1px solid #3f3f46;
      border-radius: 6px;
      padding: 10px 16px;
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      display: flex;
      align-items: center;
      gap: 8px;
      pointer-events: auto;
      transform: translateY(12px);
      opacity: 0;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    if (type === 'warning') {
      toast.style.borderColor = '#f59e0b';
    }

    toast.innerHTML = `<span>⚡</span> <span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.transform = 'translateY(0)';
      toast.style.opacity = '1';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-8px)';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 250);
    }, 2800);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Self-execute on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export state & helpers to window for unit testing or integration hooks
  window.PrismApp = {
    state,
    selectInspectorTarget,
    selectTraceTarget,
    switchInstallMode,
    toggleTheme,
    calculateContrastRatio,
    parseRgb,
    INSPECTOR_ELEMENTS,
    TRACER_DATA,
    INSTALL_COMMANDS
  };
})();
