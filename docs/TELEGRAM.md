# Telegram: notifications, second factor, support

One bot does three jobs. **You create the bot; the server only needs five values.** Nothing here was tested against the real Telegram (no bot existed): everything was verified against a local test double of the Bot API — see "What was verified".

| Job | What happens |
|---|---|
| **Notifications** | Everything that happens in the system arrives in your Telegram chat: server start, errors and outages, sign-ins and administrator actions, new students, payments (paid / failed / refunded), uploads and virus findings, support messages |
| **Second factor** | An administrator signs in with the password **and** either the **Google Authenticator** code **or** a one-time code sent to Telegram — both always work |
| **Support** | `/support` page: your Telegram contact (`@mirzaxojayevas`) + a message form delivered to your Telegram. People may also write to the bot directly — those messages reach you too |

## 1. Create the bot (5 minutes, on your phone)
1. In Telegram open **@BotFather** → `/newbot` → give it a name and a username ending in `bot` (e.g. `acca_usa_bot`).
2. BotFather answers with a **token** (`123456789:AA…`). It is a password: keep it in your password manager; never send it in chat or put it in Git.
3. Open your new bot and press **Start** (a bot can only write to you after you did).

## 2. Put the values on the server (`/etc/acca-usa/acca-usa.env`, mode 0640)
```
TELEGRAM_BOT_TOKEN=…                 # from BotFather
TELEGRAM_BOT_USERNAME=acca_usa_bot   # without @
TELEGRAM_WEBHOOK_SECRET=…            # you invent it: 24+ random letters/digits (openssl rand -hex 20)
TELEGRAM_CHAT_ID=…                   # step 3
SUPPORT_TELEGRAM=mirzaxojayevas      # the contact shown on /support (without @)
# optional
TELEGRAM_EVENTS=system,security,users,payments,content,support   # default: all
TELEGRAM_PII=masked                  # masked (default): s***@gmail.com · full: whole e-mail address in messages
```
The server refuses to start if the set is half-filled or malformed (it names the variable, never the value).

## 3. Connect the webhook and find your chat id
```bash
sudo -u acca bash -c 'set -a; . /etc/acca-usa/acca-usa.env; set +a; cd /srv/acca-usa && npm run telegram:setup'
```
It checks the token, registers `https://YOUR.DOMAIN/api/telegram/webhook` (with the secret), sets the commands and — if `TELEGRAM_CHAT_ID` is known — sends a test message.
**First run:** `TELEGRAM_CHAT_ID` is still empty. Open the bot in Telegram and press **Start** (or write `/id`): the bot answers with `Chat id: 123456789`. Put that number into `TELEGRAM_CHAT_ID`, `sudo systemctl restart acca-usa-web`, run the command again → "test message sent".
A **group** works too: add the bot to a group, write `/id@your_bot` there; the group id starts with `-`.
`npm run preflight` also checks the bot (token valid, webhook registered).

## 4. Second factor for administrators
1. The administrator signs in and enrols the **authenticator app** (mandatory first step, as before).
2. *Admin → Security → Telegram → Connect Telegram*: Telegram opens, press **Start**. The page shows "Telegram is connected".
3. At the next sign-in, after the password: enter the authenticator code **or** press **"Send the code to my Telegram"** and enter that code.
Rules: the code has 6 digits, works **once**, expires in **5 minutes**, a newer code cancels the older one, 5 wrong tries kill it, at most 3 codes per 10 minutes; only a keyed hash is stored; every send is in the audit log. Disconnect: same page. A lost phone: `npm run admin:mfa-reset` (operator, audited).
Security note: a Telegram account is only as safe as its owner's Telegram login — turn on Telegram's own *Two-Step Verification* (Settings → Privacy and Security).

## 5. What you will receive
`⚙️ system` server started · errors (e-mail, storage, database, payments, antivirus) · `🔐 security` every sign-in, failed second factor, administrator action · `👤 users` new students · `💰 payments` paid / failed / refunded with amount · `📚 content` uploads, virus found, processing problems, content edits · `💬 support` form and bot messages.
Floods are bounded: identical events within 10 minutes are merged ("+N similar"), at most 20 messages a minute (the rest are counted). Messages contain facts only — never passwords, codes, tokens, payment keys or the text of a student's answers.
Health alerts of the server itself (site down, disk full, certificate, backup too old) come from `deploy/monitoring/monitor.sh` — give it the same bot: `ALERT_TELEGRAM_TOKEN` = the token, `ALERT_TELEGRAM_CHAT` = the chat id (`/etc/acca-usa/monitor.env`).

## 6. Privacy — decide consciously
Telegram servers are outside Uzbekistan. With `TELEGRAM_PII=masked` (default) messages carry names and masked e-mail addresses only; `full` sends whole addresses. Student names and support messages do leave the country. Ask your lawyer whether the privacy policy must mention it (`docs/LEGAL.md`), and keep `LEGAL_DATA_LOCATION` truthful.

## What was verified (and what was not)
* `npm run test:telegram` — test double of the Bot API: message format and HTML escaping, categories, merging and flood limits, no throw on outages, the token never in logs, the bot's `/start <token>`, `/id`, forwarding and flood rules, the webhook secret, code and token helpers.
* `npm run test:production` against the real server + PostgreSQL + the test double: linking through the admin page and `/start`, the refused request without secret, the token working once, sign-in with a Telegram code (wrong code refused, once only, newer code replaces the older, the authenticator still works), support form (escaped, honeypot, rate limit), notifications (start, sign-up with masked e-mail, sign-ins) and that **no secret reached any message**.
* **Not tested:** the real Telegram servers, delivery speed, `setWebhook` against Telegram, group chats, and the deep link opening the Telegram app on a phone.
