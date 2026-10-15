/**
 * Local library. Everything lives in this browser's localStorage — there is no
 * server to go down, but also no sync between devices, which is why sharing
 * happens through links and result codes instead.
 */

import { normalizeQuiz, uid } from './model.js';

const KEY_QUIZZES = 'quizmaker.v2.quizzes';
const KEY_RESULTS = 'quizmaker.v2.results';
const KEY_PROGRESS = 'quizmaker.v2.progress';

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Quota exceeded, or storage blocked (private mode on some browsers).
    return false;
  }
};

/* -------------------------------- quizzes -------------------------------- */

const DEMO = normalizeQuiz({
  id: 'demo-general-knowledge',
  title: 'Sample Quiz — General Knowledge',
  description: 'A ready-made example showing all three question types. Edit or delete it freely.',
  timeLimit: 300,
  passMark: 60,
  showReview: true,
  questions: [
    {
      id: 'd1',
      type: 'mcq',
      prompt: 'What is the capital of Pakistan?',
      points: 1,
      options: ['Karachi', 'Lahore', 'Islamabad', 'Peshawar'],
      correctIndex: 2,
      explanation: 'Islamabad replaced Karachi as the capital in 1967.',
    },
    {
      id: 'd2',
      type: 'tf',
      prompt: 'The Indus is the longest river in Pakistan.',
      points: 1,
      correct: true,
      explanation: 'The Indus runs about 3,180 km.',
    },
    {
      id: 'd3',
      type: 'sa',
      prompt: 'Which planet is known as the Red Planet?',
      points: 2,
      answers: ['Mars'],
      explanation: 'Iron oxide on the surface gives Mars its colour.',
    },
  ],
});

export function listQuizzes() {
  const stored = read(KEY_QUIZZES, null);
  if (stored === null) {
    write(KEY_QUIZZES, [DEMO]);
    return [DEMO];
  }
  return Array.isArray(stored) ? stored : [];
}

export const getQuiz = (id) => listQuizzes().find((q) => q.id === id) || null;

export function saveQuiz(quiz) {
  const quizzes = listQuizzes();
  const clean = normalizeQuiz(quiz);
  const i = quizzes.findIndex((q) => q.id === clean.id);
  if (i === -1) quizzes.push(clean);
  else quizzes[i] = { ...clean, createdAt: quizzes[i].createdAt };
  write(KEY_QUIZZES, quizzes);
  return clean;
}

export function deleteQuiz(id) {
  write(KEY_QUIZZES, listQuizzes().filter((q) => q.id !== id));
  write(KEY_RESULTS, listResults().filter((r) => r.quizId !== id));
}

export function duplicateQuiz(id) {
  const original = getQuiz(id);
  if (!original) return null;
  return saveQuiz({
    ...original,
    id: uid(),
    title: `${original.title} (copy)`,
    createdAt: new Date().toISOString(),
    questions: original.questions.map((q) => ({ ...q, id: uid() })),
  });
}

/* -------------------------- collected results ---------------------------- */

export const listResults = () => read(KEY_RESULTS, []);

export const resultsForQuiz = (quizId) =>
  listResults()
    .filter((r) => r.quizId === quizId)
    .sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));

/** Returns false when the same student + score + time was already collected. */
export function addResult(result) {
  const results = listResults();
  const fingerprint = (r) => `${r.name}|${r.studentId}|${r.score}|${r.submittedAt}`;
  if (results.some((r) => fingerprint(r) === fingerprint(result))) return false;
  results.push({ id: uid(), ...result });
  write(KEY_RESULTS, results);
  return true;
}

export function deleteResult(id) {
  write(KEY_RESULTS, listResults().filter((r) => r.id !== id));
}

/* ------------------------- in-progress answers --------------------------- */

const progressKey = (token) => `${KEY_PROGRESS}.${token}`;

export const saveProgress = (token, data) => write(progressKey(token), data);
export const loadProgress = (token) => read(progressKey(token), null);
export const clearProgress = (token) => {
  try {
    localStorage.removeItem(progressKey(token));
  } catch {
    /* ignore */
  }
};

/* ------------------------------ backup file ------------------------------ */

export const exportLibrary = () =>
  JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), quizzes: listQuizzes(), results: listResults() }, null, 2);

/** @returns {{quizzes: number, results: number}} how many items were merged in */
export function importLibrary(json) {
  const data = JSON.parse(json);
  const incoming = Array.isArray(data) ? data : data.quizzes || [];
  if (!Array.isArray(incoming)) throw new Error('That file does not contain any quizzes.');

  const quizzes = listQuizzes();
  const byId = new Map(quizzes.map((q) => [q.id, q]));
  let added = 0;
  for (const raw of incoming) {
    const quiz = normalizeQuiz(raw);
    if (byId.has(quiz.id)) quiz.id = uid();
    quizzes.push(quiz);
    added++;
  }
  write(KEY_QUIZZES, quizzes);

  let addedResults = 0;
  for (const r of data.results || []) if (addResult(r)) addedResults++;

  return { quizzes: added, results: addedResults };
}
