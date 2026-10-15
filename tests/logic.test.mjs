import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeQuiz,
  validateQuiz,
  gradeQuiz,
  isCorrect,
  normalizeText,
  prepareAttempt,
  totalPoints,
  formatDuration,
} from '../src/lib/model.js';

import {
  encodeQuiz,
  decodeQuiz,
  encodeResult,
  decodeResult,
  toCompact,
  fromCompact,
  bytesToB64url,
  b64urlToBytes,
  buildShareUrl,
} from '../src/lib/codec.js';

import { toCsv } from '../src/lib/csv.js';

/* ------------------------------- fixtures -------------------------------- */

const quiz = normalizeQuiz({
  id: 'fixture',
  title: 'Mixed quiz',
  description: 'Covers every question type',
  timeLimit: 600,
  passMark: 60,
  showReview: true,
  questions: [
    { id: 'q1', type: 'mcq', prompt: 'Capital of Japan?', points: 1, options: ['Osaka', 'Tokyo', 'Kyoto'], correctIndex: 1 },
    { id: 'q2', type: 'tf', prompt: 'Water boils at 100C at sea level.', points: 1, correct: true },
    { id: 'q3', type: 'sa', prompt: 'Red planet?', points: 2, answers: ['Mars', 'Planet Mars'] },
  ],
});

/* -------------------------------- marking -------------------------------- */

test('marks a perfect attempt', () => {
  const r = gradeQuiz(quiz, { q1: 1, q2: true, q3: 'Mars' });
  assert.equal(r.score, 4);
  assert.equal(r.total, 4);
  assert.equal(r.percent, 100);
  assert.equal(r.correctCount, 3);
  assert.equal(r.passed, true);
});

test('marks an empty attempt as zero, not a crash', () => {
  const r = gradeQuiz(quiz, {});
  assert.equal(r.score, 0);
  assert.equal(r.percent, 0);
  assert.equal(r.passed, false);
  assert.equal(r.breakdown.length, 3);
  assert.equal(r.breakdown[0].givenText, null);
});

test('awards per-question marks, not one mark per question', () => {
  const r = gradeQuiz(quiz, { q3: 'Mars' }); // the 2-point question only
  assert.equal(r.score, 2);
  assert.equal(r.percent, 50);
});

test('short answers ignore case, spacing and edge punctuation', () => {
  const q = quiz.questions[2];
  for (const given of ['Mars', 'mars', '  MARS  ', 'mars.', '"Mars"', 'planet   mars']) {
    assert.equal(isCorrect(q, given), true, `expected "${given}" to be accepted`);
  }
  for (const given of ['Venus', 'mar', '', null, undefined]) {
    assert.equal(isCorrect(q, given), false, `expected "${given}" to be rejected`);
  }
});

test('normalizeText does not swallow inner punctuation', () => {
  assert.equal(normalizeText("it's here!"), "it's here");
});

test('index 0 counts as an answer (falsy-value trap)', () => {
  const r = gradeQuiz(quiz, { q1: 0 });
  assert.equal(r.breakdown[0].givenText, 'Osaka');
  assert.equal(r.breakdown[0].correct, false);
});

test('true/false accepts booleans and strings but not blanks', () => {
  const q = quiz.questions[1];
  assert.equal(isCorrect(q, true), true);
  assert.equal(isCorrect(q, 'true'), true);
  assert.equal(isCorrect(q, false), false);
  assert.equal(isCorrect(q, undefined), false);
});

test('pass mark is respected', () => {
  const strict = { ...quiz, passMark: 90 };
  assert.equal(gradeQuiz(strict, { q1: 1, q2: true }).passed, false); // 50%
  assert.equal(gradeQuiz(strict, { q1: 1, q2: true, q3: 'Mars' }).passed, true); // 100%
});

/* ------------------------------- shuffling ------------------------------- */

test('shuffling options keeps the correct answer correct', () => {
  const shuffleQuiz = { ...quiz, shuffleOptions: true };
  // A deterministic generator makes this test reproducible.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  for (let i = 0; i < 50; i++) {
    const attempt = prepareAttempt(shuffleQuiz, rand);
    const mcq = attempt.questions.find((q) => q.id === 'q1');
    assert.equal(mcq.options[mcq.correctIndex], 'Tokyo');
    assert.equal(mcq.options.length, 3);
  }
});

test('shuffling questions keeps every question exactly once', () => {
  const attempt = prepareAttempt({ ...quiz, shuffleQuestions: true });
  assert.deepEqual([...attempt.questions.map((q) => q.id)].sort(), ['q1', 'q2', 'q3']);
});

test('shuffling does not mutate the stored quiz', () => {
  const before = JSON.stringify(quiz);
  prepareAttempt({ ...quiz, shuffleOptions: true, shuffleQuestions: true });
  assert.equal(JSON.stringify(quiz), before);
});

/* ------------------------------ validation ------------------------------- */

test('a good quiz validates clean', () => {
  assert.deepEqual(validateQuiz(quiz), []);
});

test('validation catches the realistic mistakes', () => {
  const broken = normalizeQuiz({
    title: '',
    questions: [
      { type: 'mcq', prompt: '', options: ['only one', ''], correctIndex: 0 },
      { type: 'sa', prompt: 'No answers given', answers: [] },
    ],
  });
  const errors = validateQuiz(broken);
  assert.ok(errors.some((e) => e.includes('title')));
  assert.ok(errors.some((e) => e.includes('Question 1')));
  assert.ok(errors.some((e) => e.includes('Question 2')));
});

test('normalizing repairs bad input instead of throwing', () => {
  const q = normalizeQuiz({ questions: [{ type: 'mcq', options: ['a'], correctIndex: 99, points: -5 }] });
  assert.equal(q.questions[0].options.length, 2); // padded to a minimum of two
  assert.equal(q.questions[0].correctIndex, 0); // out-of-range index clamped
  assert.equal(q.questions[0].points, 1); // negative marks clamped
  assert.equal(q.title, 'Untitled quiz');
});

test('totalPoints adds the marks, not the questions', () => {
  assert.equal(totalPoints(quiz), 4);
});

/* -------------------------------- codec ---------------------------------- */

test('base64url round-trips arbitrary bytes', () => {
  const bytes = new Uint8Array(1000).map((_, i) => i % 256);
  assert.deepEqual(b64urlToBytes(bytesToB64url(bytes)), bytes);
});

test('base64url output is URL-safe', () => {
  const encoded = bytesToB64url(new Uint8Array([251, 255, 254, 253]));
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
});

test('compact form round-trips without losing anything that matters', () => {
  const back = fromCompact(toCompact(quiz));
  assert.equal(back.title, quiz.title);
  assert.equal(back.timeLimit, quiz.timeLimit);
  assert.equal(back.passMark, quiz.passMark);
  assert.equal(back.questions.length, 3);
  assert.equal(back.questions[0].options[back.questions[0].correctIndex], 'Tokyo');
  assert.equal(back.questions[1].correct, true);
  assert.deepEqual(back.questions[2].answers, ['Mars', 'Planet Mars']);
});

test('a shared quiz marks identically to the original', async () => {
  const shared = await decodeQuiz(await encodeQuiz(quiz));
  const responses = { q1: 1, q2: true, q3: 'mars' };
  const a = gradeQuiz(quiz, responses);
  const b = gradeQuiz(shared, responses);
  assert.equal(b.score, a.score);
  assert.equal(b.percent, a.percent);
});

test('settings survive the link', async () => {
  const fancy = { ...quiz, shuffleQuestions: true, shuffleOptions: true, onePerPage: true, showReview: false };
  const back = await decodeQuiz(await encodeQuiz(fancy));
  assert.equal(back.shuffleQuestions, true);
  assert.equal(back.shuffleOptions, true);
  assert.equal(back.onePerPage, true);
  assert.equal(back.showReview, false);
});

test('unicode survives the link', async () => {
  const urdu = normalizeQuiz({
    title: 'پاکستان کا دارالحکومت',
    questions: [{ type: 'mcq', prompt: 'دارالحکومت کون سا ہے؟', options: ['کراچی', 'اسلام آباد'], correctIndex: 1 }],
  });
  const back = await decodeQuiz(await encodeQuiz(urdu));
  assert.equal(back.title, 'پاکستان کا دارالحکومت');
  assert.equal(back.questions[0].options[1], 'اسلام آباد');
});

test('links stay short enough to be useful', async () => {
  const payload = await encodeQuiz(quiz);
  assert.ok(payload.length < 400, `3-question link was ${payload.length} chars`);

  const big = normalizeQuiz({
    title: 'Twenty question paper',
    questions: Array.from({ length: 20 }, (_, i) => ({
      type: 'mcq',
      prompt: `Question number ${i + 1}: which of these is the correct option?`,
      points: 1,
      options: ['First option', 'Second option', 'Third option', 'Fourth option'],
      correctIndex: i % 4,
    })),
  });
  const bigPayload = await encodeQuiz(big);
  assert.ok(bigPayload.length < 1200, `20-question link was ${bigPayload.length} chars`);
});

test('packing always returns the shorter of compressed and plain', async () => {
  // Small quiz: deflate's header can outweigh the saving, so plain may win.
  const small = await encodeQuiz(quiz);
  assert.ok(['C', 'P'].includes(small[0]));

  // Large, repetitive quiz: compression must win, and win big.
  const big = normalizeQuiz({
    title: 'Long paper',
    questions: Array.from({ length: 30 }, (_, i) => ({
      type: 'mcq',
      prompt: `Question ${i + 1}: choose the correct option from the list below.`,
      points: 1,
      options: ['First option', 'Second option', 'Third option', 'Fourth option'],
      correctIndex: i % 4,
    })),
  });
  const packed = await encodeQuiz(big);
  const plainLength = JSON.stringify(toCompact(big)).length;
  assert.equal(packed[0], 'C', 'large quizzes should compress');
  assert.ok(packed.length < plainLength / 2, `packed ${packed.length} vs plain ${plainLength}`);
});

test('a corrupt link fails with a readable message', async () => {
  await assert.rejects(() => decodeQuiz('not-a-real-link'), /QuizMaker link/);
  await assert.rejects(() => decodeQuiz(''), /empty/);
});

test('result codes round-trip', async () => {
  const result = {
    quizTitle: 'Mixed quiz',
    name: 'Zain Ahmed',
    studentId: '11-B-07',
    score: 3,
    total: 4,
    timeTaken: 125,
    submittedAt: '2026-10-15T09:30:00.000Z',
    answers: [1, true, 'Mars'],
  };
  const back = await decodeResult(await encodeResult(result));
  assert.equal(back.name, 'Zain Ahmed');
  assert.equal(back.studentId, '11-B-07');
  assert.equal(back.score, 3);
  assert.equal(back.total, 4);
  assert.equal(back.percent, 75);
  assert.equal(back.timeTaken, 125);
  assert.deepEqual(back.answers, [1, true, 'Mars']);
  assert.equal(new Date(back.submittedAt).toISOString(), '2026-10-15T09:30:00.000Z');
});

test('a quiz link is rejected as a result code and vice versa', async () => {
  const quizPayload = await encodeQuiz(quiz);
  const resultCode = await encodeResult({
    quizTitle: 'x',
    score: 1,
    total: 1,
    submittedAt: new Date().toISOString(),
  });

  await assert.rejects(() => decodeResult(quizPayload), /result code|QuizMaker/);
  await assert.rejects(() => decodeQuiz(resultCode), /QuizMaker/);
});

test('share URLs work from a sub-path like GitHub Pages', () => {
  const url = buildShareUrl('ABC', {
    origin: 'https://someone.github.io',
    pathname: '/quizmaker/',
    search: '',
  });
  assert.equal(url, 'https://someone.github.io/quizmaker/#/t/ABC');
});

/* --------------------------------- misc ---------------------------------- */

test('CSV escapes commas, quotes and newlines', () => {
  const csv = toCsv([
    ['Name', 'Note'],
    ['Ali, Hassan', 'He said "hi"'],
    ['Line', 'one\ntwo'],
  ]);
  assert.ok(csv.includes('"Ali, Hassan"'));
  assert.ok(csv.includes('"He said ""hi"""'));
  assert.ok(csv.includes('"one\ntwo"'));
});

test('durations read naturally', () => {
  assert.equal(formatDuration(0), '0s');
  assert.equal(formatDuration(45), '45s');
  assert.equal(formatDuration(60), '1m 00s');
  assert.equal(formatDuration(125), '2m 05s');
});
