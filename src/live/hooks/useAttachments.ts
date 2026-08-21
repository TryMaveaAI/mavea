// useAttachments — files staged for the next turn (the chips above the composer), plus the guard
// that encodes picked files into attachments and the count/size/type rejection copy. `turnHadFiles`
// rides along here too: it records whether the most recent turn was sent with files, so the
// evidence panel can be honest about what (if anything) grounded the answer. All self-contained
// staging state — it never reads or writes the turn loop; the composer and submit path call into it.
import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { fileToAttachment, MAX_ATTACHMENTS, type Attachment } from '../attachments';

export interface UseAttachments {
  /** Files staged for the next turn (shown as chips above the composer, cleared on send). */
  attached: Attachment[];
  setAttached: Dispatch<SetStateAction<Attachment[]>>;
  /** The first rejection reason for a too-large/unsupported/over-limit pick (null when clear). */
  attachError: string | null;
  setAttachError: Dispatch<SetStateAction<string | null>>;
  /** Whether the most recent turn was sent with files attached (drives evidence-panel copy). */
  turnHadFiles: boolean;
  setTurnHadFiles: Dispatch<SetStateAction<boolean>>;
  /** Encode picked files into staged attachments, enforcing the guards and surfacing rejections.
   *  Resolves to what was ACTUALLY staged, so a caller that picked files for a purpose can act on
   *  them straight away rather than waiting a render for `attached` to catch up. */
  onFiles: (files: File[]) => Promise<Attachment[]>;
  /** Drop a staged attachment by index. */
  removeAttachment: (idx: number) => void;
}

export function useAttachments(): UseAttachments {
  const [attached, setAttached] = useState<Attachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  // Whether the most recent turn was sent with files attached (drives evidence-panel copy).
  const [turnHadFiles, setTurnHadFiles] = useState(false);

  // Encode picked files into staged attachments, enforcing the count/size/type guards and
  // surfacing the first rejection reason so a too-large or unsupported file isn't silent.
  const onFiles = useCallback(
    async (files: File[]): Promise<Attachment[]> => {
      setAttachError(null);
      const room = MAX_ATTACHMENTS - attached.length;
      if (room <= 0) {
        setAttachError(`You can attach up to ${MAX_ATTACHMENTS} files.`);
        return [];
      }
      const next: Attachment[] = [];
      let rejected: string | null = null;
      for (const file of files.slice(0, room)) {
        const res = await fileToAttachment(file);
        if (res.ok && res.attachment) next.push(res.attachment);
        else if (!rejected) {
          const isDoc = /\.(pdf|docx|pptx|xlsx)$/i.test(file.name);
          rejected =
            res.error === 'too-large'
              ? `"${file.name}" is too large (max ${isDoc ? 40 : 10} MB).`
              : `"${file.name}" isn't a supported type (images, PDF, Office docs, or text/data files like CSV, TXT, Markdown, JSON).`;
        }
      }
      if (files.length > room) rejected = `Only the first ${room} file(s) were added.`;
      if (next.length) setAttached((cur) => [...cur, ...next]);
      if (rejected) setAttachError(rejected);
      return next;
    },
    [attached.length],
  );

  const removeAttachment = useCallback((idx: number) => {
    setAttached((cur) => cur.filter((_, i) => i !== idx));
  }, []);

  return {
    attached,
    setAttached,
    attachError,
    setAttachError,
    turnHadFiles,
    setTurnHadFiles,
    onFiles,
    removeAttachment,
  };
}
