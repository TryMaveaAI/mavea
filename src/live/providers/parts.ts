// parts.ts — turn (user text + attachments) into each provider's native user-message shape.
// The four wire formats differ (Anthropic blocks, OpenAI content array, Gemini parts), so
// each gets a builder; the SHARED rule lives here once: an image goes as a native image part
// on every vision provider, a PDF goes as a native document part only where the provider
// reads documents (Anthropic, Gemini), and anything a provider can't read is appended to the
// text as an honest note rather than dropped — so an attach action never silently no-ops.
import type { Attachment } from '../attachments';
import { isImage, isPdf } from '../attachments';

/** PDFs a given provider can't read natively become this line, kept in the text so the
 *  model knows the user attached something it simply can't see. No fabricated content. */
function unreadableNote(unreadable: Attachment[]): string {
  if (!unreadable.length) return '';
  const names = unreadable.map((a) => `"${a.name}"`).join(', ');
  return `\n\n[The user attached ${names}, which this model can't read directly. Answer from the question text, and say if you'd need its contents.]`;
}

// ── Anthropic: content is an array of blocks (text / image / document). Claude reads PDFs
//    natively via a `document` block, so both images and PDFs go as real parts. ──
type AnthropicBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: string; data: string } };

export function anthropicUserContent(
  text: string,
  attachments?: Attachment[],
): string | AnthropicBlock[] {
  if (!attachments?.length) return text;
  const parts: AnthropicBlock[] = [];
  const unreadable: Attachment[] = [];
  for (const a of attachments) {
    if (isImage(a))
      parts.push({ type: 'image', source: { type: 'base64', media_type: a.mime, data: a.data } });
    else if (isPdf(a))
      parts.push({
        type: 'document',
        source: { type: 'base64', media_type: a.mime, data: a.data },
      });
    else unreadable.push(a); // Office/text/data files aren't native parts here — note them, don't drop them
  }
  parts.push({ type: 'text', text: text + unreadableNote(unreadable) });
  return parts;
}

// ── OpenAI (and OpenAI-compatible gateways): content is an array of {type:'text'|'image_url'}.
//    The chat API reads images but NOT raw PDFs, so a PDF degrades to the text note. ──
type OpenAIPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export function openaiUserContent(text: string, attachments?: Attachment[]): string | OpenAIPart[] {
  if (!attachments?.length) return text;
  const images = attachments.filter(isImage);
  const unreadable = attachments.filter((a) => !isImage(a)); // PDFs etc. — chat API can't read
  if (!images.length) return text + unreadableNote(unreadable);
  const parts: OpenAIPart[] = images.map((a) => ({
    type: 'image_url',
    image_url: { url: `data:${a.mime};base64,${a.data}` },
  }));
  parts.push({ type: 'text', text: text + unreadableNote(unreadable) });
  return parts;
}

// ── OpenAI Responses API (and xAI's Responses-style API): a message's `content` is an
//    array of {type:'input_text'|'input_image'} parts — distinct type names from Chat
//    Completions' {type:'text'|'image_url'}, and image_url is a bare string, not nested.
//    `detail` is a REQUIRED field on input_image (missing it 400s); 'auto' matches the
//    provider's own default so it doesn't change anything the Chat Completions path did. ──
type ResponsesPart =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string; detail: 'auto' };

export function openaiResponsesUserContent(
  text: string,
  attachments?: Attachment[],
): ResponsesPart[] {
  const images = (attachments ?? []).filter(isImage);
  const unreadable = (attachments ?? []).filter((a) => !isImage(a)); // PDFs etc. — can't read here either
  const parts: ResponsesPart[] = images.map((a) => ({
    type: 'input_image',
    detail: 'auto',
    image_url: `data:${a.mime};base64,${a.data}`,
  }));
  parts.push({ type: 'input_text', text: text + unreadableNote(unreadable) });
  return parts;
}

// ── Gemini: a user turn is { role, parts: [...] }; an attachment is an `inlineData` part.
//    Gemini reads both images and PDFs inline, so both go as real parts. ──
type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export function geminiUserParts(text: string, attachments?: Attachment[]): GeminiPart[] {
  if (!attachments?.length) return [{ text }];
  const parts: GeminiPart[] = [];
  const unreadable: Attachment[] = [];
  for (const a of attachments) {
    if (isImage(a) || isPdf(a)) parts.push({ inlineData: { mimeType: a.mime, data: a.data } });
    else unreadable.push(a); // Office/text/data files aren't native parts here — note them, don't drop them
  }
  parts.push({ text: text + unreadableNote(unreadable) });
  return parts;
}

// ── Text-only models (a non-vision model behind an OpenAI-compatible gateway): every
//    attachment becomes a text note. Returns the augmented user string. ──
export function textOnlyUser(text: string, attachments?: Attachment[]): string {
  if (!attachments?.length) return text;
  return text + unreadableNote(attachments);
}
