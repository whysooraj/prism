export interface StressFixture {
  id: string;
  name: string;
  category: string;
  html: string;
  expectedDetection: {
    defectKey: string;
    description: string;
  };
}

export const STRESS_FIXTURES: StressFixture[] = [
  // 1. Line height smaller than font size (descender collision/clipping)
  {
    id: 'descender-clipping',
    name: 'Typography Line Height Collapse (Descender Clipping)',
    category: 'typography',
    html: `
      <!DOCTYPE html><html><head><style>
        body { margin: 0; background: #fff; font-family: sans-serif; }
        .clipped-title {
          font-size: 32px;
          line-height: 20px; /* Line height < font size collapses descenders */
          color: #0f172a;
          overflow: hidden;
          height: 28px;
        }
      </style></head><body>
        <h1 class="clipped-title">Typography Jumping Quick Brown Fox</h1>
      </body></html>
    `,
    expectedDetection: {
      defectKey: 'collapsedLineHeight',
      description: 'Line height (20px) is smaller than font size (32px), causing descender truncation or overlap'
    }
  },

  // 2. Focus outline suppression without replacement
  {
    id: 'focus-outline-suppressed',
    name: 'Interactive Focus Outline Suppressed (A11y Defect)',
    category: 'accessibility',
    html: `
      <!DOCTYPE html><html><head><style>
        body { margin: 0; background: #fff; font-family: sans-serif; }
        .bad-btn {
          padding: 12px 24px;
          background: #3b82f6;
          color: #fff;
          border: none;
          outline: none; /* Outline stripped without focus alternative */
        }
        .bad-btn:focus {
          outline: none;
          box-shadow: none;
        }
      </style></head><body>
        <button class="bad-btn">Search Query</button>
      </body></html>
    `,
    expectedDetection: {
      defectKey: 'focusOutlineSuppressed',
      description: 'Interactive button suppresses focus outline without an accessible focus indicator'
    }
  },

  // 3. Low-contrast Disabled State (Indistinguishable from active button)
  {
    id: 'indistinguishable-disabled',
    name: 'Disabled State Indistinguishable From Active State',
    category: 'interactive',
    html: `
      <!DOCTYPE html><html><head><style>
        body { margin: 0; background: #fff; font-family: sans-serif; }
        .btn-active { background: #2563eb; color: #ffffff; padding: 12px 24px; border: none; }
        .btn-disabled { background: #2563eb; color: #ffffff; padding: 12px 24px; border: none; cursor: not-allowed; }
      </style></head><body>
        <button class="btn-active">Save Changes</button>
        <button class="btn-disabled" disabled>Save Changes</button>
      </body></html>
    `,
    expectedDetection: {
      defectKey: 'indistinguishableDisabled',
      description: 'Disabled button has identical visual styling to active button, causing affordance confusion'
    }
  },

  // 4. Sticky Header Overlap Without Padding
  {
    id: 'sticky-header-overlap',
    name: 'Fixed / Sticky Header Overlaps Top Content',
    category: 'layout',
    html: `
      <!DOCTYPE html><html><head><style>
        body { margin: 0; background: #fff; font-family: sans-serif; }
        nav { position: fixed; top: 0; left: 0; width: 100%; height: 72px; background: #0f172a; color: #fff; z-index: 100; }
        main { margin-top: 0px; /* Missing padding/margin for fixed header */ padding: 16px; }
        h1 { font-size: 24px; color: #000; }
      </style></head><body>
        <nav>Navigation Bar</nav>
        <main>
          <h1>Content Obscured Behind Nav</h1>
          <p>This heading is completely trapped underneath the fixed nav bar.</p>
        </main>
      </body></html>
    `,
    expectedDetection: {
      defectKey: 'fixedHeaderOcclusion',
      description: 'Fixed header with height 72px occludes top body content due to missing body/container offset'
    }
  }
];
