// ClassDiagram — a UML class diagram. Layout is layered by inheritance depth: a
// Kahn-style relax over ONLY the inheritance/implements edges ranks every subclass one
// layer below its parent (SysArchDiagram's ranking technique, restricted to the hierarchy
// edges so an association can never flip a parent under its child), then each layer
// grid-flows into centred rows. Relation lines trim at box borders with the same capped
// rim-trim SysArchDiagram uses — each end eats at most 40% of the centre distance — and
// terminal glyphs are drawn as explicit rotated paths (hollow triangle, filled/hollow
// diamond, open arrow) rather than markers, so every UML arrowhead orients exactly along
// its own edge with no marker-orientation pitfalls.
import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ClassDiagramProps, UmlClass, UmlRelation, ClassRelationKind } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { fitText, type FitTextResult } from '../../lib/fitText';
import { BlockEmpty } from '../../lib/BlockEmpty';

type Props = ClassDiagramProps & { delay?: number };

const VIEW_W = 1000;
const BOX_W = 200;
const H_GAP = 40;
const V_GAP = 78; // between layers — room for edge labels and glyphs
const ROW_GAP = 46; // between wrapped rows inside one layer
const PAD = 24;
const PER_ROW = Math.floor((VIEW_W - PAD * 2 + H_GAP) / (BOX_W + H_GAP));
const NAME_F = 15;
// The stage caps the 1000-unit viewBox at 760px, so a user unit renders at ~0.76 CSS pixels —
// «interface» at 11 units came out under the ~9px legibility floor. STEREO_H is the band the
// stereotype line owns at the top of the header, sized to hold it.
const STEREO_F = 13;
const STEREO_H = 17;
const MEMBER_F = 12;
// Shrink-to-fit floor, in viewBox USER UNITS. .ucd-stage caps the 1000-unit viewBox at 760px, so
// one unit is 0.76 screen px and anything under ~11.9 lands below the 9px legibility floor. The
// three fit sites below used 9/10/11, which would have painted 6.8/7.6/8.4px the moment a long
// name triggered the shrink path — the fixture never does, so nothing caught it. Past this, text
// wraps and the box grows (heights are derived from lines.length) rather than shrinking further.
const MIN_LEGIBLE_F = 12;
const TEXT_W = BOX_W - 20;

const STEREOTYPES = new Set(['interface', 'abstract', 'enum']);
const RELATION_KINDS = new Set<ClassRelationKind>([
  'inheritance',
  'implements',
  'composition',
  'aggregation',
  'association',
  'dependency',
]);

interface CleanClass {
  name: string;
  stereotype?: 'interface' | 'abstract' | 'enum';
  fields: string[];
  methods: string[];
}

/** Flatten a member list that may arrive objectified ({text: "+ x"} for "+ x") or as a
 *  lone string where an array was expected. */
function toLines(input: unknown): string[] {
  const arr = Array.isArray(input) ? input : typeof input === 'string' && input ? [input] : [];
  return arr
    .map((m) => {
      if (typeof m === 'string') return m;
      if (m && typeof m === 'object') {
        const o = m as Record<string, unknown>;
        const t = o.text ?? o.name ?? o.label;
        return typeof t === 'string' ? t : '';
      }
      return '';
    })
    .filter(Boolean);
}

function normalizeClasses(input: unknown): CleanClass[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((raw, i): CleanClass | null => {
      if (typeof raw === 'string') return { name: raw, fields: [], methods: [] };
      if (!raw || typeof raw !== 'object') return null;
      const r = raw as Partial<UmlClass> & Record<string, unknown>;
      const name = typeof r.name === 'string' && r.name ? r.name : `Class${i + 1}`;
      const stereotype =
        typeof r.stereotype === 'string' && STEREOTYPES.has(r.stereotype)
          ? (r.stereotype as CleanClass['stereotype'])
          : undefined;
      return { name, stereotype, fields: toLines(r.fields), methods: toLines(r.methods) };
    })
    .filter((c): c is CleanClass => c !== null);
}

function normalizeRelations(input: unknown): UmlRelation[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((raw): UmlRelation | null => {
      if (!raw || typeof raw !== 'object') return null;
      const r = raw as Partial<UmlRelation> & Record<string, unknown>;
      if (typeof r.from !== 'string' || typeof r.to !== 'string' || !r.from || !r.to) return null;
      const kind = RELATION_KINDS.has(r.kind as ClassRelationKind)
        ? (r.kind as ClassRelationKind)
        : 'association';
      const label = typeof r.label === 'string' && r.label ? r.label : undefined;
      return { from: r.from, to: r.to, kind, label };
    })
    .filter((r): r is UmlRelation => r !== null);
}

interface MemberFit {
  fit: FitTextResult;
  h: number;
}
interface PlacedBox {
  cls: CleanClass;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  nameFit: FitTextResult;
  headerH: number;
  fieldFits: MemberFit[];
  fieldsH: number;
  methodFits: MemberFit[];
  methodsH: number;
}

function fitMember(text: string): MemberFit {
  const fit = fitText(text, {
    maxWidth: TEXT_W,
    fontSize: MEMBER_F,
    minFontSize: MIN_LEGIBLE_F,
    maxLines: 2,
    lineHeight: 1.25,
  });
  return { fit, h: fit.lines.length * fit.lineHeightPx + 3 };
}

/** Rank by inheritance depth: relax rank(child) ≥ rank(parent) + 1 over ONLY the
 *  hierarchy edges (child --▷ parent), bounded by class count so a cyclic input ends. */
function rankByInheritance(classes: CleanClass[], relations: UmlRelation[]): Map<string, number> {
  const rank = new Map<string, number>();
  for (const c of classes) rank.set(c.name, 0);
  const hier = relations.filter((r) => r.kind === 'inheritance' || r.kind === 'implements');
  for (let pass = 0; pass < classes.length; pass++) {
    let moved = false;
    for (const e of hier) {
      if (!rank.has(e.from) || !rank.has(e.to)) continue;
      const next = (rank.get(e.to) ?? 0) + 1;
      if (next > (rank.get(e.from) ?? 0) && next < classes.length) {
        rank.set(e.from, next);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return rank;
}

/** Point on `box`'s border along the line toward (tx, ty), with SysArchDiagram's cap: the
 *  trim never eats more than 40% of the centre distance, so two trimmed endpoints of a
 *  tightly-packed pair can never cross and silently reverse the drawn direction. */
function rectRim(box: PlacedBox, tx: number, ty: number): { x: number; y: number } {
  const dx = tx - box.cx;
  const dy = ty - box.cy;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  const hw = box.w / 2 + 4;
  const hh = box.h / 2 + 4;
  const scale = Math.max(Math.abs(ux) / hw, Math.abs(uy) / hh);
  const r = Math.min(scale > 0 ? 1 / scale : hw, dist * 0.4);
  return { x: box.cx + ux * r, y: box.cy + uy * r };
}

const HEADER_TINT: Record<string, string> = {
  interface: 'color-mix(in oklab, var(--insight) 14%, var(--surface-elevated-2))',
  abstract: 'color-mix(in oklab, var(--presence) 12%, var(--surface-elevated-2))',
  enum: 'color-mix(in oklab, var(--warning) 14%, var(--surface-elevated-2))',
  none: 'var(--surface-elevated-2)',
};

/** How far short of the glyph tip the line stops, so a hollow glyph is never crossed. */
const GLYPH_INSET: Record<ClassRelationKind, number> = {
  inheritance: 13,
  implements: 13,
  composition: 17,
  aggregation: 17,
  association: 0,
  dependency: 0,
};

function TerminalGlyph({
  kind,
  x,
  y,
  angle,
}: {
  kind: ClassRelationKind;
  x: number;
  y: number;
  angle: number;
}) {
  const tf = `translate(${x} ${y}) rotate(${angle})`;
  switch (kind) {
    case 'inheritance':
    case 'implements':
      return <path d="M0 0 L-14 -8 L-14 8 Z" className="ucd-tri" transform={tf} />;
    case 'composition':
      return <path d="M0 0 L-9 -6 L-18 0 L-9 6 Z" className="ucd-di ucd-di-fill" transform={tf} />;
    case 'aggregation':
      return <path d="M0 0 L-9 -6 L-18 0 L-9 6 Z" className="ucd-di" transform={tf} />;
    case 'dependency':
      return <path d="M-11 -7 L0 0 L-11 7" className="ucd-open" transform={tf} />;
    default:
      return null;
  }
}

export function ClassDiagram({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  classes,
  relations,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;

  const cleanClasses = useMemo(() => normalizeClasses(classes), [classes]);
  const cleanRelations = useMemo(() => normalizeRelations(relations), [relations]);

  const { placed, byName, vbH } = useMemo(() => {
    const boxes: PlacedBox[] = cleanClasses.map((cls) => {
      const nameFit = fitText(cls.name, {
        maxWidth: TEXT_W,
        fontSize: NAME_F,
        minFontSize: MIN_LEGIBLE_F,
        maxLines: 2,
        lineHeight: 1.2,
        bold: true,
      });
      const headerH =
        10 + (cls.stereotype ? STEREO_H : 0) + nameFit.lines.length * nameFit.lineHeightPx + 8;
      const fieldFits = cls.fields.map(fitMember);
      const methodFits = cls.methods.map(fitMember);
      // UML draws all three compartments even when empty — a thin band keeps the silhouette.
      const fieldsH = fieldFits.length ? 7 + fieldFits.reduce((a, m) => a + m.h, 0) + 5 : 10;
      const methodsH = methodFits.length ? 7 + methodFits.reduce((a, m) => a + m.h, 0) + 5 : 10;
      return {
        cls,
        x: 0,
        y: 0,
        w: BOX_W,
        h: headerH + fieldsH + methodsH,
        cx: 0,
        cy: 0,
        nameFit,
        headerH,
        fieldFits,
        fieldsH,
        methodFits,
        methodsH,
      };
    });

    const rank = rankByInheritance(cleanClasses, cleanRelations);
    const layers = new Map<number, PlacedBox[]>();
    for (const b of boxes) {
      const r = rank.get(b.cls.name) ?? 0;
      if (!layers.has(r)) layers.set(r, []);
      layers.get(r)!.push(b);
    }

    let y = PAD;
    for (const key of [...layers.keys()].sort((a, b) => a - b)) {
      const layer = layers.get(key)!;
      for (let start = 0; start < layer.length; start += PER_ROW) {
        const row = layer.slice(start, start + PER_ROW);
        const rowW = row.length * BOX_W + (row.length - 1) * H_GAP;
        let x = (VIEW_W - rowW) / 2;
        let rowH = 0;
        for (const b of row) {
          b.x = x;
          b.y = y;
          b.cx = x + b.w / 2;
          b.cy = y + b.h / 2;
          x += BOX_W + H_GAP;
          rowH = Math.max(rowH, b.h);
        }
        y += rowH + ROW_GAP;
      }
      y += V_GAP - ROW_GAP;
    }

    return {
      placed: boxes,
      byName: new Map(boxes.map((b) => [b.cls.name, b])),
      vbH: Math.max(200, y - V_GAP + PAD),
    };
  }, [cleanClasses, cleanRelations]);

  return (
    <div
      className="card reveal dg-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {placed.length === 0 ? (
        <BlockEmpty message="No classes to diagram" />
      ) : (
        <div className="dg-stage ucd-stage">
          <svg viewBox={`0 0 ${VIEW_W} ${vbH}`} className="dg-svg" role="img" aria-label={title}>
            {/* relations under the boxes; labels re-drawn on top after them */}
            {cleanRelations.map((rel, i) => {
              const a = byName.get(rel.from);
              const b = byName.get(rel.to);
              if (!a || !b || a === b) return null;
              const s = rectRim(a, b.cx, b.cy);
              const t = rectRim(b, a.cx, a.cy);
              const ang = (Math.atan2(t.y - s.y, t.x - s.x) * 180) / Math.PI;
              const dashed = rel.kind === 'implements' || rel.kind === 'dependency';
              // Diamonds decorate the WHOLE (`from`) end; triangles/arrows the `to` end.
              const atStart = rel.kind === 'composition' || rel.kind === 'aggregation';
              const inset = GLYPH_INSET[rel.kind];
              const len = Math.hypot(t.x - s.x, t.y - s.y) || 1;
              const ux = (t.x - s.x) / len;
              const uy = (t.y - s.y) / len;
              const x1 = atStart ? s.x + ux * inset : s.x;
              const y1 = atStart ? s.y + uy * inset : s.y;
              const x2 = atStart ? t.x : t.x - ux * inset;
              const y2 = atStart ? t.y : t.y - uy * inset;
              return (
                <g key={`r${i}`}>
                  <line
                    className="ucd-edge"
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    strokeDasharray={dashed ? '6 5' : undefined}
                  />
                  {atStart ? (
                    <TerminalGlyph kind={rel.kind} x={s.x} y={s.y} angle={ang + 180} />
                  ) : (
                    <TerminalGlyph kind={rel.kind} x={t.x} y={t.y} angle={ang} />
                  )}
                </g>
              );
            })}

            {placed.map((b, bi) => {
              const stereoTint = HEADER_TINT[b.cls.stereotype ?? 'none'];
              const nameY0 = b.y + 10 + (b.cls.stereotype ? STEREO_H : 0);
              const fieldsTop = b.y + b.headerH;
              const methodsTop = fieldsTop + b.fieldsH;
              let fy = fieldsTop + 7;
              let my = methodsTop + 7;
              return (
                <g key={`${b.cls.name}-${bi}`}>
                  <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={5} className="ucd-box" />
                  <path
                    d={`M ${b.x} ${b.y + b.headerH} v ${-b.headerH + 5} a 5 5 0 0 1 5 -5 h ${b.w - 10} a 5 5 0 0 1 5 5 v ${b.headerH - 5} z`}
                    className="ucd-header"
                    style={{ fill: stereoTint }}
                  />
                  <line x1={b.x} y1={fieldsTop} x2={b.x + b.w} y2={fieldsTop} className="ucd-sep" />
                  <line
                    x1={b.x}
                    y1={methodsTop}
                    x2={b.x + b.w}
                    y2={methodsTop}
                    className="ucd-sep"
                  />
                  {b.cls.stereotype && (
                    <text
                      x={b.cx}
                      y={b.y + 10 + STEREO_H / 2}
                      className="ucd-stereo"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={STEREO_F}
                    >
                      {`«${b.cls.stereotype}»`}
                    </text>
                  )}
                  <text
                    className={b.cls.stereotype === 'abstract' ? 'ucd-name ucd-italic' : 'ucd-name'}
                    textAnchor="middle"
                    fontSize={b.nameFit.fontSize}
                  >
                    {b.nameFit.lines.map((ln, j) => (
                      <tspan
                        key={j}
                        x={b.cx}
                        y={nameY0 + (j + 0.5) * b.nameFit.lineHeightPx}
                        dominantBaseline="middle"
                      >
                        {ln}
                      </tspan>
                    ))}
                  </text>
                  {b.fieldFits.map((m, j) => {
                    const top = fy;
                    fy += m.h;
                    return (
                      <text key={`f${j}`} className="ucd-member" fontSize={m.fit.fontSize}>
                        {m.fit.lines.map((ln, k) => (
                          <tspan
                            key={k}
                            x={b.x + 10}
                            y={top + (k + 0.5) * m.fit.lineHeightPx}
                            dominantBaseline="middle"
                          >
                            {ln}
                          </tspan>
                        ))}
                      </text>
                    );
                  })}
                  {b.methodFits.map((m, j) => {
                    const top = my;
                    my += m.h;
                    return (
                      <text key={`m${j}`} className="ucd-member" fontSize={m.fit.fontSize}>
                        {m.fit.lines.map((ln, k) => (
                          <tspan
                            key={k}
                            x={b.x + 10}
                            y={top + (k + 0.5) * m.fit.lineHeightPx}
                            dominantBaseline="middle"
                          >
                            {ln}
                          </tspan>
                        ))}
                      </text>
                    );
                  })}
                </g>
              );
            })}

            {/* relation labels last, so a box fill can never paint over one */}
            {cleanRelations.map((rel, i) => {
              if (!rel.label) return null;
              const a = byName.get(rel.from);
              const b = byName.get(rel.to);
              if (!a || !b || a === b) return null;
              const s = rectRim(a, b.cx, b.cy);
              const t = rectRim(b, a.cx, a.cy);
              // Shrink-to-fit, never char-cap: the label wraps to two lines then shrinks.
              const fit = fitText(rel.label, {
                maxWidth: 170,
                fontSize: 14,
                minFontSize: MIN_LEGIBLE_F,
                maxLines: 2,
                lineHeight: 1.15,
                bold: true,
              });
              const mx = (s.x + t.x) / 2;
              const my = (s.y + t.y) / 2 - 14 - ((fit.lines.length - 1) * fit.lineHeightPx) / 2;
              return (
                <text
                  key={`l${i}`}
                  className="dg-edge-label"
                  textAnchor="middle"
                  fontSize={fit.fontSize}
                >
                  {fit.lines.map((ln, j) => (
                    <tspan key={j} x={mx} y={my + j * fit.lineHeightPx} dominantBaseline="middle">
                      {ln}
                    </tspan>
                  ))}
                </text>
              );
            })}
          </svg>
        </div>
      )}

      {footer && <div className="dg-foot" dangerouslySetInnerHTML={richInnerHtml(footer)} />}
    </div>
  );
}
