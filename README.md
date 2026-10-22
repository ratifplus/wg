# WG Chores

Chore schedule for a three-person WG: one toilet, one bathroom, one kitchen, the floors,
two fridges and the trash cans. Runs on Cloudflare Workers with a D1 database.

## How it works

- **No login.** You open the app and enter your email (and your name the first time).
  The email is remembered in the browser. The WG holds up to 3 people (`MAX_MEMBERS`).
- **The schedule starts** when the third person joins, or earlier if someone presses
  "Start now anyway". Weeks run Monday to Sunday from the week it started.
- **Jobs and rotation**, in the order people joined:

  | Job | How often | Due |
  | --- | --- | --- |
  | Take out the trash | every week, one person | Sunday |
  | Clean the kitchen (counters, tables, stove, sink) | every 2 weeks | second Sunday |
  | Clean the bathroom and toilet | every 2 weeks | second Sunday |
  | Clean the floors | every 2 weeks | second Sunday |
  | Clean both fridges | every month, one person | last day of the month |

  The three cleaning jobs are split one each, and everyone moves to the next job every
  cycle.
- **Emails** (sent daily at 07:00 UTC by a cron trigger):
  - "Your turn" when a job starts,
  - "Due today" on the due day,
  - "Overdue" every 2 days after the due day until the job is marked done.

  Every email has an **I've done it** button. It opens a page with one confirm button,
  so link scanners in mail clients can't tick a job off by opening the link.
- **Everyone sees everything**: current jobs with To do / Due today / Overdue / Done,
  who's up next, and recently finished jobs. You can mark your own jobs done (or undo)
  in the app too.
- **Removing a roommate** hands their open jobs to whoever the rotation now gives them
  to, and frees the spot for someone new.

## Code

- `src/schedule.ts`: rotation and reminder rules (pure functions, unit tested).
- `src/index.ts`: the Worker. API (`/api/*`), the email done link (`/done`) and the
  daily cron. It creates its own tables on first use, so there are no migrations.
- `src/email.ts`: email content.
- `public/`: the app (plain HTML, CSS and JS, no build step).

The done links are signed with a key the Worker generates and stores in D1 on first use,
so there are no secrets to configure. The address used in email links is taken from the
last request the app served.

```sh
npm install
npm test           # schedule rules
npm run typecheck
npm run dev        # local app; emails are written to .wrangler/tmp instead of sent
```

Try the cron locally with `npx wrangler dev --test-scheduled` and open
`http://localhost:8787/__scheduled`.

## Deploying

Everything is declared in `wrangler.jsonc`, including the `wg` D1 database (Western Europe).

Email goes out through Cloudflare Email Service from `wg@notify.tiph.agency`, reusing
the sending domain already set up for tiph.agency in the same Cloudflare account. To use
another address, change `allowed_sender_addresses` and `MAIL_FROM`; its domain must be
onboarded to Email Sending.

**Continuous deployment (recommended):** in the Cloudflare dashboard, go to Workers & Pages,
then Create, then Import a repository, and pick `ratifplus/wg`. Defaults are right:

| Setting | Value |
| --- | --- |
| Build command | *(none)* or `npm install` |
| Deploy command | `npx wrangler deploy` |

Every push to `main` then deploys.

**Manual:** `npx wrangler login` then `npm run deploy`.

After the first deploy, open the `*.workers.dev` URL (or add a custom domain such as
`wg.tiph.agency` under the Worker's Settings, then Domains & Routes) and send it to your
roommates.
