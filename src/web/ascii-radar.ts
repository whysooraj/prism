import type { LayoutNode, NodeRect } from '../types.js';

export function generateAsciiRadar(
  root: LayoutNode,
  viewport: { width: number; height: number },
  cols = 80,
  rows = 24
): string {
  // Initialize empty grid with spaces
  const grid: string[][] = Array.from({ length: rows }, () => Array(cols).fill(' '));

  // Frame borders
  for (let c = 0; c < cols; c++) {
    grid[0][c] = '-';
    grid[rows - 1][c] = '-';
  }
  for (let r = 0; r < rows; r++) {
    grid[r][0] = '|';
    grid[r][cols - 1] = '|';
  }
  grid[0][0] = '+';
  grid[0][cols - 1] = '+';
  grid[rows - 1][0] = '+';
  grid[rows - 1][cols - 1] = '+';

  // Map coordinates from viewport (e.g. 1440x900) to grid (80x24)
  const scaleX = (cols - 2) / Math.max(1, viewport.width);
  const scaleY = (rows - 2) / Math.max(1, viewport.height);

  function toGridX(px: number): number {
    return Math.max(1, Math.min(cols - 2, 1 + Math.round(px * scaleX)));
  }

  function toGridY(py: number): number {
    return Math.max(1, Math.min(rows - 2, 1 + Math.round(py * scaleY)));
  }

  // Draw nodes from root down
  function renderNode(node: LayoutNode, depth: number) {
    if (depth > 6) return;
    const { rect, tag, textSnippet } = node;

    if (rect.width > 10 && rect.height > 8 && rect.y < viewport.height) {
      const gx1 = toGridX(rect.x);
      const gy1 = toGridY(rect.y);
      const gx2 = toGridX(rect.x + rect.width);
      const gy2 = toGridY(rect.y + rect.height);

      const isInteractive = ['button', 'a', 'input'].includes(tag);

      // Draw container outline if large enough
      if (gx2 - gx1 >= 4 && gy2 - gy1 >= 2) {
        for (let c = gx1; c <= gx2; c++) {
          if (grid[gy1][c] === ' ') grid[gy1][c] = isInteractive ? '=' : '.';
          if (grid[gy2][c] === ' ') grid[gy2][c] = isInteractive ? '=' : '.';
        }
        for (let r = gy1; r <= gy2; r++) {
          if (grid[r][gx1] === ' ') grid[r][gx1] = isInteractive ? '|' : ':';
          if (grid[r][gx2] === ' ') grid[r][gx2] = isInteractive ? '|' : ':';
        }
      }

      // Draw label or text snippet inside box
      const label = isInteractive
        ? `[${textSnippet ? textSnippet.slice(0, 15) : tag}]`
        : textSnippet
        ? textSnippet.slice(0, Math.max(4, gx2 - gx1 - 1))
        : '';

      if (label && gx1 + 1 < cols - 2) {
        const textRow = Math.min(rows - 2, gy1 + 1);
        for (let i = 0; i < label.length && gx1 + 1 + i < cols - 1; i++) {
          grid[textRow][gx1 + 1 + i] = label[i];
        }
      }
    }

    for (const child of node.children) {
      renderNode(child, depth + 1);
    }
  }

  renderNode(root, 0);

  return grid.map((row) => row.join('')).join('\n');
}
