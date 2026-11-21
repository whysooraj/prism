import type { LayoutNode, NodeRect } from '../types.js';

export function generateWireframeSvg(
  root: LayoutNode,
  viewport: { width: number; height: number }
): string {
  const elements: string[] = [];

  function traverse(node: LayoutNode, depth: number) {
    if (depth > 6) return;
    const { rect, tag, classes, styles } = node;

    // Only draw elements that have meaningful dimensions within viewport
    if (rect.width > 2 && rect.height > 2 && rect.y < viewport.height * 2) {
      const isInteractive = ['button', 'a', 'input', 'select', 'textarea'].includes(tag);
      const strokeColor = isInteractive ? '#3b82f6' : '#71717a';
      const strokeWidth = isInteractive ? 1.5 : 0.75;
      const strokeDash = isInteractive ? 'none' : '2,2';
      const fillColor = isInteractive ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255, 255, 255, 0.02)';
      const radius = styles.borderRadius && styles.borderRadius !== '0px' ? 4 : 0;

      elements.push(
        `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" ` +
        `rx="${radius}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}" ` +
        `stroke-dasharray="${strokeDash}" />`
      );

      // Label major blocks
      if (rect.width > 60 && rect.height > 24 && depth <= 3) {
        const label = `${tag}${classes.length ? '.' + classes[0] : ''} (${Math.round(rect.width)}x${Math.round(rect.height)})`;
        elements.push(
          `<text x="${rect.x + 4}" y="${rect.y + 12}" fill="${strokeColor}" font-size="9" font-family="monospace">` +
          `${escapeXml(label)}</text>`
        );
      }
    }

    for (const child of node.children) {
      traverse(child, depth + 1);
    }
  }

  traverse(root, 0);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewport.width} ${viewport.height}" ` +
    `width="${viewport.width}" height="${viewport.height}" style="background: #09090b;">\n` +
    elements.join('\n') +
    '\n</svg>'
  );
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
