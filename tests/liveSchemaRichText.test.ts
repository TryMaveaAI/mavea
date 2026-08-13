import { validateLiveResponse, FRONTIER_BLOCK_TYPES } from '../src/engine/liveSchema';
import { sanitizeRichText, richInnerHtml } from '../src/lib/richText';

// Locks the security-sensitive boundary for the ai-family rich fields (whatchanged / reasoning /
// retrieval). Those fields are rendered via richInnerHtml, which sanitizes through a strict tag
// allow-list at the DOM boundary. They are therefore EXEMPT from the schema's tag-neutralization
// (RAW_TEXT_PROPS) — otherwise the model's <strong>/<em>/<code> would be mangled into guillemets
// before the render-time sanitizer ever ran, and the user would see literal "‹strong›" instead of
// formatting. The invariant: a field exempt from neutralizeTags MUST still be sanitized by
// richInnerHtml at render. These tests pin both halves — markup survives the schema, and the
// render sanitizer drops every XSS vector.
describe('ai-family rich fields — formatting survives the schema, XSS dies at render', () => {
  const allowed = new Set<string>([
    ...FRONTIER_BLOCK_TYPES,
    'whatchanged',
    'reasoning',
    'retrieval',
  ]);

  it('preserves <strong> in whatchanged before/after/footer + each diff line (no guillemets)', () => {
    const r = validateLiveResponse(
      {
        title: 'T',
        sub: '',
        narration: 'n',
        blocks: [
          {
            type: 'whatchanged',
            props: {
              title: 'Edit',
              before: 'use <strong>var</strong>',
              after: 'use <strong>const</strong>',
              footer: 'now <em>immutable</em>',
              diff: [
                { t: 'del', c: 'var <code>x</code>' },
                { t: 'add', c: 'const <code>x</code>' },
              ],
            },
          },
        ],
      },
      allowed,
    );
    const b = r!.blocks[0];
    if (b.type !== 'whatchanged') throw new Error('expected whatchanged');
    // The exempted HtmlString fields keep their real markup — not turned into ‹strong›.
    expect(b.props.before).toContain('<strong>');
    expect(b.props.after).toContain('<strong>');
    expect(b.props.footer).toContain('<em>');
    expect(b.props.diff[0].c).toContain('<code>');
    expect(b.props.diff[1].c).toContain('<code>');
    expect(JSON.stringify(b.props)).not.toContain('‹');
    expect(JSON.stringify(b.props)).not.toContain('›');
  });

  it('preserves <strong> in reasoning conclusion/footer + each step detail, neutralizes the summary', () => {
    const r = validateLiveResponse(
      {
        title: 'T',
        sub: '',
        narration: 'n',
        blocks: [
          {
            type: 'reasoning',
            props: {
              title: 'Why',
              conclusion: 'so <strong>yes</strong>',
              footer: 'see <em>note</em>',
              steps: [
                {
                  label: 'Step 1',
                  summary: 'a 2 < 3 comparison', // plain-text sibling — still neutralized
                  detail: 'because <strong>2 &lt; 3</strong>',
                },
              ],
            },
          },
        ],
      },
      allowed,
    );
    const b = r!.blocks[0];
    if (b.type !== 'reasoning') throw new Error('expected reasoning');
    expect(b.props.conclusion).toContain('<strong>');
    expect(b.props.footer).toContain('<em>');
    expect(b.props.steps[0].detail).toContain('<strong>');
    // A sibling field that is NOT rendered through richInnerHtml stays neutralized: its angle
    // brackets become guillemets so it can never form a tag if some renderer prints it raw.
    expect(b.props.steps[0].summary).toBe('a 2 ‹ 3 comparison');
  });

  it('preserves <strong> in retrieval footer + each chunk body, neutralizes the snippet', () => {
    const r = validateLiveResponse(
      {
        title: 'T',
        sub: '',
        narration: 'n',
        blocks: [
          {
            type: 'retrieval',
            props: {
              title: 'Sources',
              footer: 'top <strong>3</strong>',
              chunks: [
                {
                  source: 'doc.md',
                  score: 0.9,
                  snippet: 'a < b snippet', // plain-text sibling — still neutralized
                  body: 'full <strong>passage</strong>',
                },
              ],
            },
          },
        ],
      },
      allowed,
    );
    const b = r!.blocks[0];
    if (b.type !== 'retrieval') throw new Error('expected retrieval');
    expect(b.props.footer).toContain('<strong>');
    expect(b.props.chunks[0].body).toContain('<strong>');
    expect(b.props.chunks[0].snippet).toBe('a ‹ b snippet');
  });

  // Second invariant on the same exemption: skipping tag-neutralization must not also smuggle the
  // model's voice markup onto the card. It marks speech-risky spans as [[shown|said]] in whatever
  // field it is writing, and a block is never spoken.
  it('resolves voice annotations in raw prose fields while keeping their markup', () => {
    const r = validateLiveResponse(
      {
        title: 'T',
        sub: '',
        narration: 'n',
        blocks: [
          {
            type: 'stacktrace',
            props: {
              title: 'Crash',
              errorType: 'ThermalThrottleError',
              message: '[[CPU|C-P-U]] temperature exceeded 95 [[Celsius|celsius]].',
              fix: 'Cap the <strong>[[TDP|T-D-P]]</strong> and retry.',
              frames: [{ file: 'thermal.rs', line: 42 }],
            },
          },
        ],
      },
      new Set<string>([...FRONTIER_BLOCK_TYPES, 'stacktrace']),
    );
    const b = r!.blocks[0];
    if (b.type !== 'stacktrace') throw new Error('expected stacktrace');
    expect(b.props.message).toBe('CPU temperature exceeded 95 Celsius.');
    expect(b.props.fix).toBe('Cap the <strong>TDP</strong> and retry.');
  });

  it('leaves brackets alone where they are the field’s own syntax', () => {
    const code = 'if [[ -f a || -f b ]]; then\n  echo "[[nodiscard]]"\nfi';
    const r = validateLiveResponse(
      {
        title: 'T',
        sub: '',
        narration: 'n',
        blocks: [{ type: 'codeblock', props: { title: 'Guard', lang: 'bash', code } }],
      },
      new Set<string>([...FRONTIER_BLOCK_TYPES, 'codeblock']),
    );
    const b = r!.blocks[0];
    if (b.type !== 'codeblock') throw new Error('expected codeblock');
    expect(b.props.code).toBe(code);
  });

  it('renders sanitized bold and strips a malicious <img onerror> / <script> at the boundary', () => {
    // The render boundary (richInnerHtml) is what makes the exemption safe: it keeps the formatting
    // but removes the entire XSS surface — event-handler attributes, <script>, and any tag carrying
    // a URL. This is the guarantee that holds even if upstream neutralization is skipped.
    const attack =
      'safe <strong>bold</strong> <img src=x onerror="alert(1)"> <script>alert(2)</script>';
    const clean = sanitizeRichText(attack);
    expect(clean).toContain('<strong>bold</strong>');
    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('<img');
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('alert(1)'); // the <img onerror=…> handler payload is stripped with its tag
    // The <script> tag is removed; only its inert text survives (unwrap-keeps-text, asserted below),
    // and as plain text content it cannot execute.
    // richInnerHtml is the wrapper renderers actually call; it returns the same sanitized markup.
    expect(richInnerHtml(attack).__html).toBe(clean);
  });

  it('drops a javascript: link and an onload handler while keeping the inner text', () => {
    const attack = '<a href="javascript:alert(1)">click</a><div onload="evil()">body</div>';
    const clean = sanitizeRichText(attack);
    expect(clean).not.toContain('javascript:');
    expect(clean).not.toContain('href');
    expect(clean).not.toContain('onload');
    // disallowed/attribute-stripped tags unwrap to keep the user's words, never silently dropped
    expect(clean).toContain('click');
    expect(clean).toContain('body');
  });
});
