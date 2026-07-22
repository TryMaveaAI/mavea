// A row of small chips reading a scoreboard/standings widget's real per-game or per-team state —
// no invented W/L "form" letters, since neither Game nor StandingRow actually records that; the
// chip just surfaces the real score or record string, accented when the widget marked it notable.
import type { ReactElement } from 'react';
import type { FormChipItem } from '../tileModel';

interface FormChipsProps {
  items: FormChipItem[];
}

export function FormChips({ items }: FormChipsProps): ReactElement | null {
  if (items.length === 0) return null;
  return (
    <div className="tile-chips">
      {items.map((it, i) => (
        <span
          key={`${it.label}-${i}`}
          className={`tile-chip tile-chip--${it.tone}`}
          title={it.title}
        >
          {it.label}
        </span>
      ))}
    </div>
  );
}
