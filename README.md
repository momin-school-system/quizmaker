# QuizMaker

Create a quiz, share one link, get instant auto-marked results.
**No server. No database. No account. No hosting bill — ever.**

---

## How it works

The unusual bit: **the whole quiz travels inside the share link.**

```
Teacher builds a quiz
        ↓
   one long link  ──  also rendered as a QR code
        ↓
Student opens it on any phone  →  answers  →  marked instantly
        ↓
   short result code
        ↓
Teacher pastes the codes back  →  class results table  →  CSV
```

There is nothing in the middle to break. No API to go down, no database to
suspend, no credits to run out. A student's phone needs only the link.

## Features

**Building**
- Multiple choice (2–8 options), True/False, Short answer
- Marks per question, optional explanation shown after marking
- Time limit with live countdown and auto-submit
- Pass mark, shuffle questions, shuffle options, one question per page
- Reorder, duplicate and delete questions

**Taking** (what the student sees)
- Mobile-first, no horizontal scrolling, large tap targets
- Progress bar and answered counter
- Answers saved as you go — reload or close the tab and they come back
- Warning before submitting with blanks, and before leaving mid-attempt
- Instant marking, pass/fail, question-by-question review

**Results** (what the teacher gets)
- Paste result codes in a batch; duplicates ignored, bad codes reported
- Average, highest, lowest, pass rate
- CSV export for the gradebook
- Backup/restore the whole library as a JSON file

**Marking is forgiving where it should be:** short answers ignore capitals,
extra spaces and a trailing full stop. Give alternatives with `|`
(`Mars | Planet Mars`).

---

## Deploy it free on GitHub Pages

**1. Create an empty repo** on GitHub called `quizmaker`. Don't add a README.

**2. Push this folder**

```bash
cd quizmaker
git remote add origin https://github.com/YOUR-USERNAME/quizmaker.git
git branch -M main
git push -u origin main
```

**3. Turn Pages on** — repo → **Settings** → **Pages** → **Source: GitHub Actions**

**4. Wait for the green tick** in the **Actions** tab (about a minute).

Your site: `https://YOUR-USERNAME.github.io/quizmaker/`

Every later push to `main` redeploys automatically. The workflow runs the test
suite first, so a broken change never reaches the live site.

> GitHub Pages has no usage meter, no credits and no sleep. It is static
> hosting, which is all this app needs.

---

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
```

## Tests

```bash
npm test         # 29 logic tests: marking, validation, link codec, CSV
```

Marking and the link codec are pure functions in `src/lib/`, tested directly —
including Urdu text, shuffling that must not break the answer key, and the
"index 0 is a real answer" trap.

```bash
npm i -D playwright && npx playwright install chromium
npm run test:e2e           # full teacher → student → results run in a browser
BASE_URL=http://127.0.0.1:8099/quizmaker npm run test:e2e   # against a built copy
```

The end-to-end test opens the student link in a **separate browser profile**
with empty storage, which is what proves the quiz really does travel in the URL.

---

## Project layout

```
quizmaker/
├─ .github/workflows/deploy.yml   test → build → publish to Pages
├─ src/
│  ├─ lib/
│  │  ├─ model.js      quiz shape, validation, marking   (pure, tested)
│  │  ├─ codec.js      pack a quiz into a URL            (pure, tested)
│  │  ├─ store.js      localStorage library
│  │  └─ csv.js        CSV export
│  └─ pages/           Home · Builder · Share · Take · Results
└─ tests/
   ├─ logic.test.mjs   29 unit tests
   └─ e2e.mjs          browser run-through
```

---

## Known limits — read before relying on it

- **Quizzes live in the browser that made them.** Clear site data and they are
  gone. Use **Download backup** on the home page; keep the file.
- **Results arrive as codes, not automatically.** There is no server to collect
  them, so students must send the code. That is the trade for zero hosting cost.
- **Very long quizzes can't make a QR code.** Roughly 30+ wordy questions
  outgrow it; the link still works, so share it by message instead. The app
  tells you when this happens.
- **Answers are inside the link.** Someone technical could decode it. Fine for
  classwork; don't post the link publicly before a formal exam.
- Short answers are matched as text, so a misspelling counts as wrong. List
  alternatives with `|`.

## License

MIT
