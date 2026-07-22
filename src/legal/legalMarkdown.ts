export type MarkdownBlock = { kind: 'paragraph'; text: string } | { kind: 'list'; items: string[] };

interface MarkdownSection {
  number: number;
  title: string;
  blocks: MarkdownBlock[];
}

export interface ParsedLegalDocument {
  title: string;
  effectiveDate?: string;
  intro: MarkdownBlock[];
  sections: MarkdownSection[];
}

function blocks(lines: string[]): MarkdownBlock[] {
  const result: MarkdownBlock[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }
    if (line.startsWith('- ')) {
      const items: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('- ')) {
        items.push(lines[index].trim().slice(2));
        index += 1;
      }
      result.push({ kind: 'list', items });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const candidate = lines[index].trim();
      if (!candidate || candidate.startsWith('## ') || candidate.startsWith('- ')) break;
      paragraph.push(candidate);
      index += 1;
    }
    if (paragraph.length) result.push({ kind: 'paragraph', text: paragraph.join(' ') });
  }
  return result;
}

export function parseLegalMarkdown(markdown: string): ParsedLegalDocument {
  const lines = markdown.replace(/\r\n?/g, '\n').trim().split('\n');
  const titleLine = lines.shift()?.trim() ?? '';
  if (!titleLine.startsWith('# ')) throw new Error('Legal document must begin with an H1');

  const title = titleLine.slice(2).trim();
  let effectiveDate: string | undefined;
  const introLines: string[] = [];
  const sections: MarkdownSection[] = [];
  let index = 0;

  while (index < lines.length && !lines[index].startsWith('## ')) {
    const line = lines[index];
    const effective = line.match(/^Effective:\s*(.+)$/i);
    if (effective) effectiveDate = effective[1].trim();
    else introLines.push(line);
    index += 1;
  }

  while (index < lines.length) {
    const heading = lines[index].trim();
    if (!heading.startsWith('## ')) {
      index += 1;
      continue;
    }
    const rawTitle = heading.slice(3).trim();
    const numbered = rawTitle.match(/^(\d+)\.\s+(.+)$/);
    index += 1;
    const content: string[] = [];
    while (index < lines.length && !lines[index].startsWith('## ')) {
      content.push(lines[index]);
      index += 1;
    }
    sections.push({
      number: numbered ? Number(numbered[1]) : sections.length + 1,
      title: numbered ? numbered[2] : rawTitle,
      blocks: blocks(content),
    });
  }

  return { title, effectiveDate, intro: blocks(introLines), sections };
}
