import { afterEach, describe, expect, it, vi } from 'vitest';

// jsdom has no Trusted Types, so these drive the module against a recording stand-in for
// `window.trustedTypes`: what matters is which policies exist, what each lets through, and that a
// browser without the API gets plain strings from every helper.
type Rules = {
  createHTML?: (input: string, sink?: string) => string | null;
  createScriptURL?: (input: string, sink?: string) => string | null;
};

function installFactory() {
  const policies = new Map<string, Rules>();
  const factory = {
    createPolicy(name: string, rules: Rules) {
      if (policies.has(name)) throw new TypeError(`duplicate policy ${name}`);
      policies.set(name, rules);
      return {
        createHTML: (input: string) => ({ trusted: rules.createHTML!(input), policy: name }),
      };
    },
  };
  Object.defineProperty(window, 'trustedTypes', { value: factory, configurable: true });
  return policies;
}

async function freshModule() {
  vi.resetModules();
  return import('../src/lib/trustedTypes');
}

afterEach(() => {
  Reflect.deleteProperty(window, 'trustedTypes');
});

describe('Trusted Types policies', () => {
  it('creates exactly the policies the CSP names, once each', async () => {
    const policies = installFactory();
    const { POLICY_NAMES } = await freshModule();
    expect([...policies.keys()].sort()).toEqual([...POLICY_NAMES].sort());
  });

  it('mints sanitized markup through the `mavea` policy and inert parses through `mavea-inert`', async () => {
    installFactory();
    const { trustedHtml, markupLiteral } = await freshModule();
    expect(trustedHtml(markupLiteral`<b>ok</b>`)).toEqual({
      trusted: '<b>ok</b>',
      policy: 'mavea',
    });
  });

  it('hands back plain strings where the browser has no Trusted Types', async () => {
    const { trustedHtml, markupLiteral, parseInert } = await freshModule();
    expect(trustedHtml(markupLiteral`<i>x</i>`)).toBe('<i>x</i>');
    expect(parseInert('<p>hi</p>', 'text/html').body.textContent).toBe('hi');
  });

  it('refuses a template with a substitution — only reviewed literal text is markup', async () => {
    const { markupLiteral } = await freshModule();
    const tag = markupLiteral as unknown as (s: TemplateStringsArray, ...v: unknown[]) => string;
    expect(() => tag`<b>${'<img src=x onerror=alert(1)>'}</b>`).toThrow(TypeError);
  });
});

describe('the default policy — what third-party code may put in a sink', () => {
  it('passes text and inert markup through unchanged', async () => {
    const { inertMarkupOrNull } = await freshModule();
    for (const markup of [
      '',
      '100&nbsp;km',
      '&#215;',
      '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a>',
      '<!DOCTYPE html><meta charset="UTF-8"><title></title><body>',
      '<svg><symbol id="i"><path d="M0 0h1"/></symbol></svg>',
    ]) {
      expect(inertMarkupOrNull(markup)).toBe(markup);
    }
  });

  it('refuses anything that can run or navigate', async () => {
    const { inertMarkupOrNull } = await freshModule();
    for (const markup of [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '<a href=" java\tscript:alert(1)">x</a>',
      '<iframe srcdoc="<script>1</script>"></iframe>',
      '<meta http-equiv="refresh" content="0;url=https://evil.example">',
      '<svg><a xlink:href="javascript:alert(1)">x</a></svg>',
      '<svg><set attributeName="href" to="javascript:alert(1)"/></svg>',
      '<template><img src=x onerror=alert(1)></template>',
      '<base href="https://evil.example/">',
      '<object data="data:text/html,<script>1</script>"></object>',
    ]) {
      expect(inertMarkupOrNull(markup)).toBeNull();
    }
  });

  it('accepts a same-origin or same-origin blob script URL and refuses any other', async () => {
    const { sameOriginScriptUrlOrNull } = await freshModule();
    const origin = window.location.origin;
    expect(sameOriginScriptUrlOrNull('/assets/worker-abc.js')).toBe('/assets/worker-abc.js');
    expect(sameOriginScriptUrlOrNull(`${origin}/sw.js`)).toBe(`${origin}/sw.js`);
    expect(sameOriginScriptUrlOrNull(`blob:${origin}/5b1d`)).toBe(`blob:${origin}/5b1d`);
    expect(sameOriginScriptUrlOrNull('https://cdn.example/x.js')).toBeNull();
    expect(sameOriginScriptUrlOrNull('blob:https://cdn.example/5b1d')).toBeNull();
    expect(sameOriginScriptUrlOrNull('data:text/javascript,alert(1)')).toBeNull();
    expect(sameOriginScriptUrlOrNull('javascript:alert(1)')).toBeNull();
  });
});
