# Gue Doang?

Prototype mobile-first polling dilema sehari-hari Indonesia. Static HTML/CSS/ES modules, no runtime dependencies or paid services. Built separately from Rame; Rame files and port 4173 are untouched.

## Run

Requires Node.js 20+ (verified on Node 26).

```sh
npm test
npm run build
npm run preview
```

Preview: `http://localhost:4174`. Override with `PORT=4180 npm run preview`. Build copies only `index.html` and `src/{app.js,core.js,style.css}` to `dist/`; tests, screenshots, and README are not published. No dependency installation needed.

## Vercel-ready, NOT deployed

`vercel.json` specifies static output `dist`, build command `npm run build`, and basic response/security headers. Import the directory as a project to deploy after approval; a domain can be connected later. No account, plan, domain purchase, or provisioning was performed. Parent agent handles the temporary tunnel. This document makes no claim about current provider pricing/limits.

## Features

- Six clearly labeled example polls, all with zero initial votes.
- Topic filters: Sehari-hari, Duit, Hubungan, Kerja, Makanan, Pertemanan.
- Create validated question (10–180 characters), 2–4 distinct options (1–60 each).
- One browser-local choice per poll, optional short reason (160 characters).
- Local results, percentages, and own reason. No fictional user activity.
- Clipboard permalink with manual-copy fallback. URL fragment carries validated question/options; votes and reasons never enter the link.
- Canvas PNG personal-choice card: 1080px wide, content-aware height. Before voting, export the question; after voting, export only your selected answer and optional reason. No aggregate statistics on the card; explicit local-demo disclosure. Unicode-aware wrapping. Emoji appearance depends on installed fonts.
- Local report reason, hide, persistence, restore. No claim of an active moderator.
- Native accessible dialogs, semantic controls, focus outlines, reduced-motion handling, mobile layouts.
- User content uses `textContent` / text nodes, never `innerHTML`. Imported links are size/shape validated; conflicting poll identity is rejected.

## Important limitations

**Browser-local demo, NOT a shared polling service.** Data lives in localStorage on the current origin. Each device, browser, private window, and different temporary tunnel origin has independent data. Clearing storage resets votes and deduplication. Multi-tab simultaneous writes are not transaction-safe. Storage failures warn and leave only in-memory state. No authentication or server-side enforcement exists.

A recipient can open the same question, but does not receive your votes/reason and does not contribute to a collective tally. URL fragments are encoding, not encryption or authenticated signatures: do not place secrets or personal information in questions/options. The local report queue is not transmitted anywhere. Raw shared URLs are long and have only generic social preview metadata, not server-generated poll previews.

PNG export is client-side. Font rendering and download UI vary across devices. Tested in desktop Chromium with mobile viewport, not a physical iOS device.

## Verification

```sh
npm test                   # native Node test runner, 4 tests
npm run build              # 4 static public files
python3 tests/browser_qa.py # optional: requires Python Playwright + Chromium
```

Browser QA uses isolated temporary browser contexts and does not seed real visitor storage. Covers create with four options, optional reason, vote/results, reload/deduplication, copy link, recipient without shared votes, actual PNG download/signature, report/hide/reload/restore, topic filters, literal HTML injection, 390px/320px overflow, and desktop render. Evidence: `qa/results.json`, `qa/mobile-home.png`, `qa/mobile-results.png`, `qa/desktop-home.png`, `qa/result-card.png`.

## Next step for real collective voting

Add a server API and shared database with polls/options/votes/reasons/reports, server validation, transactional vote uniqueness, rate limits, abuse controls and moderation queue. Decide anonymous identity vs sign-in honestly (browser-only identity cannot prevent determined repeat votes). Add privacy/retention policy, pagination, server OG cards, deletion/report review workflow, and deployment-specific security review. Replace—not supplement—the demo local tally with authoritative aggregate data before calling this a live public poll.
