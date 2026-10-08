import "server-only";
import type { EmailMessage, EmailProvider, EmailResult } from "./contracts";

/** Demo / test provider: nothing leaves the process. The outbox lets smoke tests prove which e-mail WOULD have been sent. */
const g = globalThis as unknown as { __accaOutbox?: EmailMessage[] };
const outbox = () => (g.__accaOutbox ??= []);

export const demoOutbox = {
  all: () => [...outbox()],
  clear: () => { outbox().length = 0; },
};

export class DemoEmailProvider implements EmailProvider {
  readonly name = "demo" as const;
  async send(message: EmailMessage): Promise<EmailResult> {
    outbox().push(message);
    if (outbox().length > 200) outbox().shift();
    return { ok: true };
  }
}
