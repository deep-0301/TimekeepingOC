/**
 * Turning a Supabase auth failure into something an operator can act on.
 *
 * When the auth server answers with a body the client cannot interpret - an
 * empty object, most often, from a 500 - supabase-js puts the stringified
 * body in `message`. That reaches the screen as a bare `{}`, which tells the
 * person nothing and tells whoever has to fix it even less: no status, no
 * code, nothing to search for.
 *
 * So a message that carries no words is replaced by one that does, and the
 * status and code are kept alongside it. The wording says plainly that this
 * is the server's end and not something to fix by retyping a password.
 */

interface AuthErrorish {
  message?: string;
  status?: number;
  code?: string;
  name?: string;
}

/** A message made only of punctuation and braces says nothing. */
function saysNothing(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed === "") return true;
  if (/^[{}[\]()\s,:"']*$/.test(trimmed)) return true;
  // `{"foo":1}` is a body, not a sentence: no letters outside the syntax.
  const wrapped = /^[[{][\s\S]*[\]}]$/.test(trimmed);
  return wrapped && !/[A-Za-z]{3,}\s+[A-Za-z]{3,}/.test(trimmed);
}

export function describeAuthError(error: unknown): string {
  const e = (error ?? {}) as AuthErrorish;
  const message = typeof e.message === "string" ? e.message : "";

  if (message && !saysNothing(message)) return message;

  const detail = [
    e.status ? `HTTP ${e.status}` : null,
    e.code ? `code ${e.code}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    "The sign-up server rejected the request without saying why" +
    (detail ? ` (${detail})` : "") +
    ". Nothing is wrong with what you typed. This usually means the account " +
    "database refused to create the user - check the Supabase auth logs."
  );
}
