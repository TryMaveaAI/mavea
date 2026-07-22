// export.ts — generate an OKF (Open Knowledge Format) bundle from the user's concept graph.
// Each concept node becomes a markdown file with YAML frontmatter; all files are concatenated
// into a single portable markdown document the user can save and open in any editor, commit
// to git, or feed to another AI agent. No external dependencies — just string assembly.
import type { MemoryNode } from './store';

function isoDate(ms: number): string {
  if (!ms) return '';
  try {
    return new Date(ms).toISOString().split('T')[0];
  } catch {
    return '';
  }
}

/** Build one OKF markdown file for a concept node. */
function nodeToMarkdown(node: MemoryNode): string {
  const date = isoDate(node.updatedAt);
  const front = date
    ? `---\nconcept: ${node.concept}\nupdated: ${date}\n---`
    : `---\nconcept: ${node.concept}\n---`;
  return `${front}\n\n${node.body}`;
}

/**
 * Generate a portable OKF markdown bundle from the user's concept nodes.
 * The bundle is a single string with a header block, then one section per node separated by
 * "---" dividers — easy to split back into individual files, diff in git, or copy into Cursor.
 */
export function buildOKFBundle(nodes: readonly MemoryNode[]): string {
  if (!nodes.length) return '';
  const ordered = [...nodes].sort((a, b) => {
    if (a.concept === 'profile') return -1;
    if (b.concept === 'profile') return 1;
    return a.concept.localeCompare(b.concept);
  });
  const sections = ordered.map(nodeToMarkdown);
  return sections.join('\n\n---\n\n');
}

/** Download the OKF bundle as a `.md` file. No-op when there are no nodes. */
export function downloadOKFBundle(nodes: readonly MemoryNode[]): void {
  const content = buildOKFBundle(nodes);
  if (!content) return;
  try {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mavea-memory.md';
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    /* download unavailable in this context */
  }
}
