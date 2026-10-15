/**
 * End-to-end check of the real flow, in a real browser:
 *
 *   teacher builds a quiz → shares a link → a DIFFERENT browser profile (a
 *   student's phone, with its own empty storage) opens that link, sits the
 *   quiz, and gets a result code → the teacher pastes the code back and sees
 *   the correct marks.
 *
 * Run with the dev server up:  node tests/e2e.mjs
 */
import { chromium, devices } from 'playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const problems = [];
const check = (label, condition, detail = '') => {
  if (condition) console.log(`  ✓ ${label}`);
  else {
    console.log(`  ✗ ${label} ${detail}`);
    problems.push(`${label} ${detail}`.trim());
  }
};

const watchConsole = (page, who) =>
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (text.includes('favicon')) return;
    problems.push(`[${who}] console error: ${text}`);
  });

const browser = await chromium.launch();

try {
  /* ===================== TEACHER: build and share ====================== */
  console.log('\nTEACHER — desktop');
  const teacher = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const t = await teacher.newPage();
  watchConsole(t, 'teacher');

  await t.goto(`${BASE}/#/`);
  await t.waitForSelector('.quiz-card');
  check('sample quiz is seeded on first visit', await t.locator('.quiz-card').count() === 1);

  await t.getByRole('link', { name: '+ New quiz' }).click();
  await t.waitForSelector('form');

  await t.getByLabel('Quiz title').fill('Science Test — Chapter 4');
  await t.getByLabel('Description (optional)').fill('Ten minutes. Answer every question.');
  await t.getByLabel('Time limit (minutes)').fill('10');

  // Q1 — multiple choice
  const q1 = t.locator('.card.question').nth(0);
  await q1.getByLabel('Question', { exact: true }).fill('Which gas do plants absorb?');
  const opts = q1.locator('.option-row input[placeholder^="Option"]');
  await opts.nth(0).fill('Oxygen');
  await opts.nth(1).fill('Carbon dioxide');
  await opts.nth(2).fill('Nitrogen');
  await opts.nth(3).fill('Hydrogen');
  await q1.locator('.option-row').nth(1).locator('input[type=radio]').check();
  await q1.getByLabel('Explanation (optional)').fill('Plants take in CO2 for photosynthesis.');

  // Q2 — true / false
  await t.getByRole('button', { name: '+ True / False' }).click();
  const q2 = t.locator('.card.question').nth(1);
  await q2.getByLabel('Question', { exact: true }).fill('Photosynthesis happens in the roots.');
  await q2.getByText('False', { exact: true }).click();

  // Q3 — short answer, worth 2 marks
  await t.getByRole('button', { name: '+ Short answer' }).click();
  const q3 = t.locator('.card.question').nth(2);
  await q3.getByLabel('Question', { exact: true }).fill('Name the green pigment in leaves.');
  await q3.getByLabel('Accepted answers').fill('Chlorophyll');
  await q3.locator('.marks').fill('2');

  check('marks total updates live', (await t.locator('.page-head .muted').first().textContent()).includes('4 marks'));

  await t.getByRole('button', { name: 'Save & share' }).first().click();
  await t.waitForURL(/#\/share\//);
  check('saving lands on the share page', t.url().includes('/share/'));

  await t.waitForSelector('.link-box');
  const shareUrl = await t.locator('.link-box').inputValue();
  check('share link was generated', shareUrl.includes('#/t/'), `(${shareUrl.length} chars)`);
  check('QR code rendered', await t.locator('.qr-wrap canvas').count() === 1);

  const resultsUrl = `${BASE}/#/results/${t.url().split('/share/')[1]}`;

  /* ================ STUDENT: a different device entirely ================ */
  console.log('\nSTUDENT — iPhone-sized, separate storage');
  const studentCtx = await browser.newContext(devices['iPhone 13']);
  const s = await studentCtx.newPage();
  watchConsole(s, 'student');

  await s.goto(shareUrl);
  await s.waitForSelector('.intro');
  check('quiz opens with no shared storage or server', await s.locator('h1').textContent() === 'Science Test — Chapter 4');
  check('teacher navigation is hidden from students', await s.locator('.nav').count() === 0);
  check('marks and timing shown up front', (await s.locator('.meta.big').textContent()).includes('4'));

  await s.getByLabel('Your name').fill('Ayesha Khan');
  await s.getByLabel('Roll number / class (optional)').fill('9-B 14');
  await s.getByRole('button', { name: 'Start' }).click();

  await s.waitForSelector('.runner-bar');
  check('timer is running', (await s.locator('.clock').textContent()).includes('left'));

  const noOverflow = await s.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check('no horizontal scrolling on a phone', noOverflow);

  // Answer: Q1 right, Q2 wrong, Q3 right but sloppily typed.
  await s.locator('.card.question').nth(0).getByText('Carbon dioxide').click();
  await s.locator('.card.question').nth(1).getByText('True', { exact: true }).click();
  await s.locator('.card.question').nth(2).locator('input.short').fill('  chlorophyll. ');

  check('progress counter tracks answers', (await s.locator('.runner-meta').textContent()).includes('3 of 3'));

  await s.getByRole('button', { name: 'Submit answers' }).click();
  await s.waitForSelector('.scorecard');

  const percent = (await s.locator('.score').textContent()).trim();
  check('marks the sloppy short answer as correct', percent === '75%', `(got ${percent})`);
  check('pass/fail verdict shown', ['Passed', 'Not passed'].includes(await s.locator('.scorecard h1').textContent()));
  check('wrong answer is reviewed', await s.locator('.review.bad').count() === 1);
  check('explanation is shown', (await s.locator('.review').first().textContent()).includes('photosynthesis'));

  const resultCode = await s.locator('.code-box').inputValue();
  check('student gets a result code', resultCode.length > 10 && /^[RS]/.test(resultCode));

  /* ================== TEACHER: collect the result ====================== */
  console.log('\nTEACHER — collecting');
  await t.goto(resultsUrl);
  await t.waitForSelector('.code-box');
  await t.locator('.code-box').fill(resultCode);
  await t.getByRole('button', { name: 'Add results' }).click();
  await t.waitForSelector('.table tbody tr');

  const row = await t.locator('.table tbody tr').first().textContent();
  check('student appears in the results table', row.includes('Ayesha Khan'));
  check('roll number carried across', row.includes('9-B 14'));
  check('score is right', row.includes('3/4') && row.includes('75%'));
  check('average is computed', (await t.locator('.stats').textContent()).includes('75%'));

  // Pasting the same code twice must not double-count.
  await t.locator('.code-box').fill(resultCode);
  await t.getByRole('button', { name: 'Add results' }).click();
  await t.waitForTimeout(400);
  check('duplicate codes are ignored', await t.locator('.table tbody tr').count() === 1);

  // Rubbish input must not crash the page.
  await t.locator('.code-box').fill('this-is-not-a-code');
  await t.getByRole('button', { name: 'Add results' }).click();
  await t.waitForTimeout(400);
  check('bad codes are reported, not fatal', (await t.locator('.notice').textContent()).includes('Could not read'));

  /* ======================= edge cases ================================== */
  console.log('\nEDGE CASES');
  const e = await (await browser.newContext()).newPage();
  watchConsole(e, 'edge');

  await e.goto(`${BASE}/#/t/totally-broken-payload`);
  await e.waitForSelector('.card');
  check('a broken link shows a friendly message', (await e.locator('body').textContent()).includes('could not be opened'));

  await e.goto(`${BASE}/#/edit/does-not-exist`);
  await e.waitForSelector('.card');
  check('a missing quiz does not crash the editor', (await e.locator('body').textContent()).includes('Quiz not found'));

  await e.goto(`${BASE}/#/nowhere`);
  await e.waitForSelector('.card');
  check('unknown routes show a 404 card', (await e.locator('body').textContent()).includes('Page not found'));

  await e.goto(`${BASE}/#/new`);
  await e.getByRole('button', { name: 'Save & share' }).first().click();
  await e.waitForSelector('.error');
  const errorText = await e.locator('.error').textContent();
  check('empty quiz is blocked with specific errors', errorText.includes('title') && errorText.includes('Question 1'));

  await s.screenshot({ path: '/tmp/shot-student-result.png', fullPage: false });
  await t.screenshot({ path: '/tmp/shot-teacher-results.png', fullPage: false });
} finally {
  await browser.close();
}

console.log(`\n${'─'.repeat(52)}`);
if (problems.length) {
  console.log(`FAILED — ${problems.length} problem(s):`);
  problems.forEach((p) => console.log(`  • ${p}`));
  process.exit(1);
}
console.log('ALL END-TO-END CHECKS PASSED');
