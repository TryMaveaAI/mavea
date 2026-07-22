import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { AbilityScores, StatBlockEntry, StatBlockProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = StatBlockProps & { delay?: number };

const ABILITY_ORDER: Array<[keyof AbilityScores, string]> = [
  ['str', 'STR'],
  ['dex', 'DEX'],
  ['con', 'CON'],
  ['int', 'INT'],
  ['wis', 'WIS'],
  ['cha', 'CHA'],
];

// floor((score − 10) / 2) — the one rule every d20-family system shares. Modifiers are always
// derived here so a hand-typed "+3" can never disagree with the 16 printed above it.
function abilityMod(score: number): string {
  const m = Math.floor((score - 10) / 2);
  return m < 0 ? `−${-m}` : `+${m}`;
}

function asFinite(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function asText(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

// A vital that should be a number (AC, HP) but may arrive as anything.
function vitalText(v: unknown): string {
  const n = asFinite(v);
  if (n !== null) return String(n);
  return asText(v) || '—';
}

function cleanEntries(list: unknown): StatBlockEntry[] {
  if (!Array.isArray(list)) return [];
  const out: StatBlockEntry[] = [];
  for (const raw of list) {
    if (typeof raw === 'string') {
      if (raw.trim()) out.push({ name: '', text: raw.trim() });
    } else if (raw && typeof raw === 'object') {
      const o = raw as Record<string, unknown>;
      const entryName = asText(o.name);
      const text = asText(o.text);
      if (entryName || text) out.push({ name: entryName, text });
    }
  }
  return out;
}

function joinList(list: unknown): string {
  if (typeof list === 'string') return list.trim();
  if (!Array.isArray(list)) return '';
  return list
    .map((s) => asText(s))
    .filter(Boolean)
    .join(', ');
}

// The tapered horizontal rule from a printed 5e stat block, redrawn as a token-colored polygon.
function Taper() {
  return (
    <svg className="sbk-rule" viewBox="0 0 400 5" preserveAspectRatio="none" aria-hidden="true">
      <polygon points="0,0 400,2.5 0,5" fill="currentColor" />
    </svg>
  );
}

function EntryList({ entries }: { entries: StatBlockEntry[] }) {
  return (
    <>
      {entries.map((e, i) => (
        <p key={i} className="sbk-entry">
          {e.name && <span className="sbk-entry-name">{e.name.replace(/\.$/, '')}.</span>}
          {e.name && e.text ? ' ' : ''}
          {e.text}
        </p>
      ))}
    </>
  );
}

// A system-neutral tabletop-RPG stat block in the classic 5e print layout: name and italic type
// line, tapered rules, AC/HP/Speed vitals, the six-ability table with derived modifiers, then
// traits and headed Actions/Reactions sections with bold-italic lead-ins.
export function StatBlock({
  title,
  icon = 'shield',
  iconColor = 'var(--presence)',
  name,
  meta,
  ac,
  hp,
  hpFormula,
  speed,
  abilities,
  saves,
  skills,
  senses,
  languages,
  challenge,
  traits,
  actions,
  reactions,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.shield;
  const ab: Partial<AbilityScores> =
    abilities && typeof abilities === 'object' && !Array.isArray(abilities) ? abilities : {};

  const traitList = cleanEntries(traits);
  const actionList = cleanEntries(actions);
  const reactionList = cleanEntries(reactions);

  const detailLines: Array<[string, string]> = [];
  const savesText = joinList(saves);
  const skillsText = joinList(skills);
  if (savesText) detailLines.push(['Saving Throws', savesText]);
  if (skillsText) detailLines.push(['Skills', skillsText]);
  if (asText(senses)) detailLines.push(['Senses', asText(senses)]);
  if (asText(languages)) detailLines.push(['Languages', asText(languages)]);
  if (asText(challenge)) detailLines.push(['Challenge', asText(challenge)]);

  const hasSections = traitList.length + actionList.length + reactionList.length > 0;
  const formula = asText(hpFormula);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <div className="sbk-panel">
        <div className="sbk-name">{asText(name) || '—'}</div>
        {asText(meta) && <div className="sbk-meta">{asText(meta)}</div>}

        <Taper />

        <div className="sbk-vitals">
          <div className="sbk-line">
            <strong>Armor Class</strong> {vitalText(ac)}
          </div>
          <div className="sbk-line">
            <strong>Hit Points</strong> {vitalText(hp)}
            {formula ? ` (${formula})` : ''}
          </div>
          {asText(speed) && (
            <div className="sbk-line">
              <strong>Speed</strong> {asText(speed)}
            </div>
          )}
        </div>

        <Taper />

        <div className="sbk-abilities">
          {ABILITY_ORDER.map(([key, label]) => {
            const score = asFinite(ab[key]);
            return (
              <div key={key} className="sbk-ab">
                <div className="sbk-ab-key">{label}</div>
                <div className="sbk-ab-score">{score !== null ? score : '—'}</div>
                <div className="sbk-ab-mod">{score !== null ? abilityMod(score) : ' '}</div>
              </div>
            );
          })}
        </div>

        {detailLines.length > 0 && (
          <div className="sbk-details">
            {detailLines.map(([label, value]) => (
              <div key={label} className="sbk-line">
                <strong>{label}</strong> {value}
              </div>
            ))}
          </div>
        )}

        {hasSections && (
          <>
            <Taper />
            <div className="sbk-sections">
              <EntryList entries={traitList} />
              {actionList.length > 0 && (
                <>
                  <div className="sbk-heading">Actions</div>
                  <EntryList entries={actionList} />
                </>
              )}
              {reactionList.length > 0 && (
                <>
                  <div className="sbk-heading">Reactions</div>
                  <EntryList entries={reactionList} />
                </>
              )}
            </div>
          </>
        )}
      </div>

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 12 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
