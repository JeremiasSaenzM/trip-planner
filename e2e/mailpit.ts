const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

type MailpitSearchResult = { messages: { ID: string }[] };
type MailpitMessage = { Text: string };

/**
 * Supabase's local stack never sends real email -- every outgoing
 * message goes to Mailpit instead (the "local_smtp" testing server in
 * supabase/config.toml, port 54324), which exposes a JSON API alongside
 * its web UI. There's no inbox to read by hand in CI, so this polls that
 * API for the most recent message to `email` and pulls the magic-link
 * URL out of its plain-text body (Supabase's default Magic Link template
 * renders {{ .ConfirmationURL }} as the login link).
 */
export async function getLatestMagicLink(email: string, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    if (search.ok) {
      const { messages } = (await search.json()) as MailpitSearchResult;
      if (messages.length > 0) {
        const detail = await fetch(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`);
        const { Text } = (await detail.json()) as MailpitMessage;
        const link = Text.match(/https?:\/\/\S+/)?.[0];
        if (link) return link;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`No magic-link email arrived for ${email} within ${timeoutMs}ms`);
}
