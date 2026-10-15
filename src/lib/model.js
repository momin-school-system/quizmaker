/**
 * Quiz model, validation and marking.
 *
 * Everything in this file is a pure function of its inputs — no browser APIs,
 * no storage, no React. That is deliberate: it is the part that must never be
 * wrong, so it is unit-tested in tests/logic.test.mjs.
 */

export const TYPES = /** @type {const} */ (['mcq', 'tf', 'sa']);

export const TYPE_LABEL = {
  mcq: 'Multiple choice',
  tf: 'True / False',
  sa: 'Short answer',
};

export const uid = () =>
  (globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

/* ------------------------------- factories ------------------------------- */

export function blankQuestion(type = 'mcq') {
  const base = { id: uid(), type, prompt: '', points: 1, explanation: '' };
  if (type === 'mcq') return { ...base, options: ['', '', '', ''], correctIndex: 0 };
  if (type === 'tf') return { ...base, correct: true };
  return { ...base, answers: [] };
}

export function blankQuiz() {
  return {
    id: uid(),
    title: '',
    description: '',
    timeLimit: 0, // seconds; 0 = untimed
    passMark: 60, // percent
    shuffleQuestions: false,
    shuffleOptions: false,
    onePerPage: false,
    showReview: true, // show correct answers after submitting
    questions: [blankQuestion()],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/* ------------------------------ normalising ------------------------------ */

const int = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

export function normalizeQuestion(raw = {}) {
  const type = TYPES.includes(raw.type) ? raw.type : 'mcq';
  const q = {
    id: raw.id || uid(),
    type,
    prompt: String(raw.prompt ?? '').trim(),
    points: Math.max(1, int(raw.points, 1)),
    explanation: String(raw.explanation ?? '').trim(),
  };

  if (type === 'mcq') {
    const options = (Array.isArray(raw.options) ? raw.options : []).map((o) => String(o ?? ''));
    while (options.length < 2) options.push('');
    q.options = options.slice(0, 8);
    const i = int(raw.correctIndex, 0);
    q.correctIndex = i >= 0 && i < q.options.length ? i : 0;
  } else if (type === 'tf') {
    q.correct = raw.correct === true || raw.correct === 'true' || raw.correct === 1;
  } else {
    q.answers = (Array.isArray(raw.answers) ? raw.answers : String(raw.answers ?? '').split('|'))
      .map((a) => String(a).trim())
      .filter(Boolean);
  }
  return q;
}

export function normalizeQuiz(raw = {}) {
  const now = new Date().toISOString();
  return {
    id: raw.id || uid(),
    title: String(raw.title ?? '').trim() || 'Untitled quiz',
    description: String(raw.description ?? '').trim(),
    timeLimit: Math.max(0, int(raw.timeLimit, 0)),
    passMark: Math.min(100, Math.max(0, int(raw.passMark, 60))),
    shuffleQuestions: !!raw.shuffleQuestions,
    shuffleOptions: !!raw.shuffleOptions,
    onePerPage: !!raw.onePerPage,
    showReview: raw.showReview !== false,
    questions: (Array.isArray(raw.questions) ? raw.questions : []).map(normalizeQuestion),
    createdAt: raw.createdAt || now,
    updatedAt: now,
  };
}

/* ------------------------------- validation ------------------------------ */

/** @returns {string[]} human-readable problems; empty array means ready to share. */
export function validateQuiz(quiz) {
  const errors = [];
  // normalizeQuiz() substitutes 'Untitled quiz' for a blank title, so checking
  // for emptiness alone would let an unnamed quiz through.
  const title = String(quiz.title ?? '').trim();
  if (!title || title === 'Untitled quiz') errors.push('The quiz needs a title.');
  if (!quiz.questions?.length) errors.push('Add at least one question.');

  quiz.questions?.forEach((q, i) => {
    const n = i + 1;
    if (!String(q.prompt ?? '').trim()) errors.push(`Question ${n}: write the question text.`);
    if (!(q.points >= 1)) errors.push(`Question ${n}: marks must be at least 1.`);

    if (q.type === 'mcq') {
      const filled = (q.options || []).filter((o) => String(o).trim());
      if (filled.length < 2) errors.push(`Question ${n}: needs at least two answer options.`);
      if (!String(q.options?.[q.correctIndex] ?? '').trim())
        errors.push(`Question ${n}: the option marked correct is empty.`);
    }
    if (q.type === 'sa' && !(q.answers || []).length)
      errors.push(`Question ${n}: add at least one accepted answer.`);
  });

  return errors;
}

export const totalPoints = (quiz) =>
  (quiz.questions || []).reduce((sum, q) => sum + (Number(q.points) || 0), 0);

/* -------------------------------- marking -------------------------------- */

/** Loose comparison for short answers: case, spacing and edge punctuation are ignored. */
export const normalizeText = (s) =>
  String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'(.,!?-]+|[\s"')\.,!?-]+$/g, '');

export function isCorrect(question, response) {
  if (response === undefined || response === null || response === '') return false;
  switch (question.type) {
    case 'mcq':
      return Number(response) === question.correctIndex;
    case 'tf':
      return (response === true || response === 'true') === question.correct;
    case 'sa':
      return (question.answers || []).some((a) => normalizeText(a) === normalizeText(response));
    default:
      return false;
  }
}

export function answerText(question, response) {
  if (response === undefined || response === null || response === '') return null;
  if (question.type === 'mcq') return question.options?.[Number(response)] ?? null;
  if (question.type === 'tf') return response === true || response === 'true' ? 'True' : 'False';
  return String(response);
}

export function correctAnswerText(question) {
  if (question.type === 'mcq') return question.options?.[question.correctIndex] ?? '';
  if (question.type === 'tf') return question.correct ? 'True' : 'False';
  return (question.answers || []).join('  /  ');
}

/**
 * Mark a set of responses keyed by question id.
 * @returns {{breakdown: object[], score: number, total: number, percent: number,
 *            correctCount: number, questionCount: number, passed: boolean}}
 */
export function gradeQuiz(quiz, responses = {}) {
  const breakdown = (quiz.questions || []).map((q) => {
    const given = responses[q.id];
    const correct = isCorrect(q, given);
    return {
      questionId: q.id,
      prompt: q.prompt,
      type: q.type,
      given: given ?? null,
      givenText: answerText(q, given),
      correct,
      correctAnswer: correctAnswerText(q),
      explanation: q.explanation || '',
      points: correct ? q.points : 0,
      maxPoints: q.points,
    };
  });

  const score = breakdown.reduce((s, b) => s + b.points, 0);
  const total = breakdown.reduce((s, b) => s + b.maxPoints, 0);
  const percent = total > 0 ? Math.round((score / total) * 100) : 0;

  return {
    breakdown,
    score,
    total,
    percent,
    correctCount: breakdown.filter((b) => b.correct).length,
    questionCount: breakdown.length,
    passed: percent >= (quiz.passMark ?? 60),
  };
}

/* -------------------------------- shuffling ------------------------------- */

/** Fisher–Yates on a copy. Deterministic when `rand` is supplied (used in tests). */
export function shuffled(array, rand = Math.random) {
  const out = [...array];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Prepare a quiz for one attempt, applying the shuffle settings.
 * Option shuffling rewrites `correctIndex` so marking stays correct.
 */
export function prepareAttempt(quiz, rand = Math.random) {
  let questions = quiz.questions.map((q) => {
    if (q.type !== 'mcq' || !quiz.shuffleOptions) return { ...q };
    const pairs = shuffled(
      q.options.map((text, i) => ({ text, wasCorrect: i === q.correctIndex })),
      rand
    );
    return {
      ...q,
      options: pairs.map((p) => p.text),
      correctIndex: pairs.findIndex((p) => p.wasCorrect),
    };
  });

  if (quiz.shuffleQuestions) questions = shuffled(questions, rand);
  return { ...quiz, questions };
}

/* --------------------------------- misc ---------------------------------- */

export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r}s`;
  return `${m}m ${String(r).padStart(2, '0')}s`;
}
