/**
 * Cleans up the JSON that AI chats tend to produce before parsing it:
 * markdown code fences, prose around the object, trailing commas and
 * smart quotes used as string delimiters.
 */
export function cleanAiJson(raw: string): string {
  let text = raw.trim();

  const fenced = /```(?:json|JSON)?\s*\n?([\s\S]*?)```/.exec(text);
  if (fenced?.[1] !== undefined) text = fenced[1].trim();

  // Drop prose before the first `{`/`[` and after the matching last `}`/`]`.
  const start = text.search(/[{[]/);
  if (start > 0) text = text.slice(start);
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (end >= 0 && end < text.length - 1) text = text.slice(0, end + 1);

  text = text.replace(/[“”]/g, '"');

  return removeTrailingCommas(text);
}

/** Removes commas directly before `}` or `]`, ignoring anything inside strings. */
function removeTrailingCommas(text: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += text[++i] ?? "";
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === ",") {
      const next = /\S/.exec(text.slice(i + 1));
      if (next && (next[0] === "}" || next[0] === "]")) continue;
    }
    out += ch;
  }
  return out;
}

export type LenientParseResult =
  { ok: true; value: unknown; cleaned: string } | { ok: false; error: string; cleaned: string };

export function parseLenientJson(raw: string): LenientParseResult {
  const cleaned = cleanAiJson(raw);
  if (cleaned === "") return { ok: false, error: "Nothing to parse", cleaned };
  try {
    return { ok: true, value: JSON.parse(cleaned), cleaned };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), cleaned };
  }
}
