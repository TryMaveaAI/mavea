// parseDiff.ts — a pure unified-diff parser. The diff text IS the ground truth, so this stays
// deterministic and dependency-free: it turns `git diff` / a `.diff` / `.patch` into a structured
// set of files and hunks that the ShipModel builder reads. It tolerates the common shapes (git's
// `diff --git` blocks, plain `--- / +++` unified diffs, new/deleted/renamed files, binary markers)
// and never throws — malformed input yields whatever files it could recover.

export type DiffLineKind = 'add' | 'del' | 'ctx';

export interface ParsedLine {
  t: DiffLineKind;
  /** The line content WITHOUT the leading +/-/space marker. */
  c: string;
}

export interface ParsedHunk {
  /** The @@ header, e.g. "@@ -12,7 +12,8 @@ function foo()". */
  header: string;
  lines: ParsedLine[];
}

export type FileStatus = 'added' | 'deleted' | 'modified' | 'renamed';

export interface ParsedFile {
  /** The post-image path (the new path), or the pre-image path for a deletion. */
  path: string;
  /** Set when the file was renamed/copied. */
  oldPath?: string;
  status: FileStatus;
  add: number;
  del: number;
  hunks: ParsedHunk[];
  binary: boolean;
}

export interface ParsedDiff {
  files: ParsedFile[];
  add: number;
  del: number;
}

/** Strip a leading a/ or b/ prefix git adds, and surrounding quotes. */
function cleanPath(p: string): string {
  let s = p.trim();
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  if (s.startsWith('a/') || s.startsWith('b/')) s = s.slice(2);
  return s;
}

function blankFile(): ParsedFile {
  return { path: '', status: 'modified', add: 0, del: 0, hunks: [], binary: false };
}

/** Parse a unified diff into files + hunks. Resilient to partial/odd input; never throws. */
export function parseUnifiedDiff(text: string): ParsedDiff {
  const files: ParsedFile[] = [];
  let cur: ParsedFile | null = null;
  let hunk: ParsedHunk | null = null;
  // Whether `cur` has already consumed its own "--- " line — so a second one (with no `diff --git`
  // header in between, i.e. a bare multi-file diff) is recognised as the START of the next file
  // instead of overwriting the current one's path/hunks in place.
  let sawPreImage = false;

  const flushHunk = (): void => {
    if (cur && hunk) cur.hunks.push(hunk);
    hunk = null;
  };
  const flushFile = (): void => {
    flushHunk();
    if (cur && (cur.path || cur.hunks.length)) files.push(cur);
    cur = null;
    sawPreImage = false;
  };

  const lines = text.split('\n');
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');

    // A new file block. git emits "diff --git a/x b/y"; a bare unified diff starts at "--- ".
    if (line.startsWith('diff --git')) {
      flushFile();
      cur = blankFile();
      const m = /^diff --git (.+?) (.+)$/.exec(line);
      if (m) {
        cur.oldPath = cleanPath(m[1] ?? '');
        cur.path = cleanPath(m[2] ?? '');
      }
      continue;
    }

    if (line.startsWith('new file mode')) {
      if (cur) cur.status = 'added';
      continue;
    }
    if (line.startsWith('deleted file mode')) {
      if (cur) cur.status = 'deleted';
      continue;
    }
    if (line.startsWith('rename from ')) {
      if (cur) {
        cur.status = 'renamed';
        cur.oldPath = cleanPath(line.slice('rename from '.length));
      }
      continue;
    }
    if (line.startsWith('rename to ')) {
      if (cur) cur.path = cleanPath(line.slice('rename to '.length));
      continue;
    }
    if (line.startsWith('Binary files') || line.startsWith('GIT binary patch')) {
      if (cur) cur.binary = true;
      continue;
    }
    if (line.startsWith('index ') || line.startsWith('similarity index')) {
      continue;
    }

    // The pre-image path. Start a new file here if there was no `diff --git` header (plain diff) —
    // or if the current file already saw its own "--- " (a second bare file starting straight after
    // the last one's hunks, with no `diff --git` line to mark the boundary).
    if (line.startsWith('--- ')) {
      const p = line.slice(4).trim();
      if (cur && sawPreImage) flushFile();
      if (!cur) cur = blankFile();
      sawPreImage = true;
      const path = p === '/dev/null' ? '' : cleanPath(p);
      if (path) cur.oldPath = path;
      if (p === '/dev/null') cur.status = 'added';
      continue;
    }
    if (line.startsWith('+++ ')) {
      const p = line.slice(4).trim();
      if (!cur) cur = blankFile();
      const path = p === '/dev/null' ? '' : cleanPath(p);
      if (path) cur.path = path;
      else if (cur.oldPath) cur.path = cur.oldPath; // deletion — keep the old path as the identity
      if (p === '/dev/null') cur.status = 'deleted';
      continue;
    }

    // A hunk header.
    if (line.startsWith('@@')) {
      flushHunk();
      hunk = { header: line, lines: [] };
      continue;
    }

    // Hunk body lines (only meaningful inside a hunk).
    if (hunk && cur) {
      if (line.startsWith('+')) {
        hunk.lines.push({ t: 'add', c: line.slice(1) });
        cur.add += 1;
      } else if (line.startsWith('-')) {
        hunk.lines.push({ t: 'del', c: line.slice(1) });
        cur.del += 1;
      } else if (line.startsWith(' ')) {
        hunk.lines.push({ t: 'ctx', c: line.slice(1) });
      } else if (line.startsWith('\\')) {
        // "\ No newline at end of file" — ignore.
      } else if (line === '') {
        hunk.lines.push({ t: 'ctx', c: '' });
      }
      continue;
    }
  }
  flushFile();

  // A file with no explicit path but a single side (rare) — drop empties defensively.
  const clean = files.filter((f) => f.path || f.oldPath);
  for (const f of clean) if (!f.path && f.oldPath) f.path = f.oldPath;

  const add = clean.reduce((n, f) => n + f.add, 0);
  const del = clean.reduce((n, f) => n + f.del, 0);
  return { files: clean, add, del };
}

/** A quick check: does this text look like a unified diff at all? Used to gate the paste UI. */
export function looksLikeDiff(text: string): boolean {
  return /^(diff --git |--- |\+\+\+ |@@ )/m.test(text) || /\n@@ .*@@/.test(text);
}
