/**
 * Share-link codec.
 *
 * The entire quiz is packed into the URL, so a student's phone needs no server,
 * no database and no account — just the link. To keep links short enough to put
 * in a QR code we:
 *
 *   1. rewrite the quiz as positional arrays with no key names,
 *   2. deflate it (CompressionStream, built into modern browsers),
 *   3. base64url it so it is safe inside a URL.
 *
 * A one-character prefix records how it was packed, so old links keep working
 * if the format gains a version later.
 *
 *   C = deflate-raw + base64url
 *   P = plain JSON + base64url   (fallback for browsers without CompressionStream)
 *
 * Results use the same machinery with prefixes R / S, which is how a student
 * hands a score back to the teacher without any network call.
 */

import { normalizeQuiz, normalizeQuestion } from './model.js';

/* ------------------------------ base64url -------------------------------- */

const te = new TextEncoder();
const td = new TextDecoder();

export function bytesToB64url(bytes) {
  let binary = '';
  const CHUNK = 0x8000; // avoid "too many arguments" on big payloads
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlToBytes(text) {
  const b64 = String(text).replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/* ----------------------------- compression ------------------------------- */

const canCompress =
  typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function pack(value, compressedPrefix, plainPrefix) {
  const bytes = te.encode(JSON.stringify(value));
  const plain = plainPrefix + bytesToB64url(bytes);
  if (!canCompress) return plain;

  try {
    const compressed = compressedPrefix + bytesToB64url(await deflate(bytes));
    // Deflate adds a header, so on very small quizzes the "compressed" form is
    // actually longer. Always hand back whichever link is shorter.
    return compressed.length < plain.length ? compressed : plain;
  } catch {
    return plain;
  }
}

async function unpack(payload, compressedPrefix, plainPrefix) {
  const text = String(payload || '').trim();
  if (!text) throw new Error('This link is empty.');

  const prefix = text[0];
  const body = text.slice(1);

  if (prefix === plainPrefix) return JSON.parse(td.decode(b64urlToBytes(body)));
  if (prefix === compressedPrefix) {
    if (!canCompress) throw new Error('This browser is too old to open compressed links.');
    return JSON.parse(td.decode(await inflate(b64urlToBytes(body))));
  }
  throw new Error('This does not look like a QuizMaker link.');
}

/* --------------------------- compact quiz form --------------------------- */

const FLAG = { shuffleQuestions: 1, shuffleOptions: 2, onePerPage: 4, showReview: 8 };
const TYPE_CODE = { mcq: 0, tf: 1, sa: 2 };
const CODE_TYPE = ['mcq', 'tf', 'sa'];

export function toCompact(quiz) {
  const flags =
    (quiz.shuffleQuestions ? FLAG.shuffleQuestions : 0) |
    (quiz.shuffleOptions ? FLAG.shuffleOptions : 0) |
    (quiz.onePerPage ? FLAG.onePerPage : 0) |
    (quiz.showReview !== false ? FLAG.showReview : 0);

  const questions = quiz.questions.map((q) => {
    const head = [TYPE_CODE[q.type] ?? 0, q.prompt, q.points, q.explanation || ''];
    if (q.type === 'mcq') return [...head, q.correctIndex, q.options];
    if (q.type === 'tf') return [...head, q.correct ? 1 : 0];
    return [...head, q.answers];
  });

  return [1, quiz.title, quiz.description || '', quiz.timeLimit || 0, quiz.passMark ?? 60, flags, questions];
}

export function fromCompact(arr) {
  if (!Array.isArray(arr) || arr[0] !== 1) throw new Error('Unsupported quiz link version.');
  const [, title, description, timeLimit, passMark, flags, questions] = arr;

  return normalizeQuiz({
    // A shared quiz is identified by its content, not by the author's local id.
    id: 'shared',
    title,
    description,
    timeLimit,
    passMark,
    shuffleQuestions: !!(flags & FLAG.shuffleQuestions),
    shuffleOptions: !!(flags & FLAG.shuffleOptions),
    onePerPage: !!(flags & FLAG.onePerPage),
    showReview: !!(flags & FLAG.showReview),
    questions: (questions || []).map((q, i) => {
      const [typeCode, prompt, points, explanation, extra, extra2] = q;
      const type = CODE_TYPE[typeCode] || 'mcq';
      const base = { id: `q${i + 1}`, type, prompt, points, explanation };
      if (type === 'mcq') return normalizeQuestion({ ...base, correctIndex: extra, options: extra2 });
      if (type === 'tf') return normalizeQuestion({ ...base, correct: extra === 1 });
      return normalizeQuestion({ ...base, answers: extra });
    }),
  });
}

export const encodeQuiz = (quiz) => pack(toCompact(quiz), 'C', 'P');
export const decodeQuiz = async (payload) => fromCompact(await unpack(payload, 'C', 'P'));

/* -------------------------- compact result form -------------------------- */
/*
 * A result code is what a student reads out, messages, or pastes back to the
 * teacher. It carries the marks plus the raw answers, so the teacher can see
 * exactly what was answered without any shared database.
 */

export function resultToCompact(result) {
  return [
    1,
    result.quizTitle,
    result.name || '',
    result.studentId || '',
    result.score,
    result.total,
    Math.round(result.timeTaken || 0),
    Math.round(new Date(result.submittedAt).getTime() / 1000),
    result.answers || [],
  ];
}

export function resultFromCompact(arr) {
  if (!Array.isArray(arr) || arr[0] !== 1) throw new Error('Unsupported result code version.');
  const [, quizTitle, name, studentId, score, total, timeTaken, epoch, answers] = arr;
  return {
    quizTitle: String(quizTitle ?? ''),
    name: String(name ?? '') || 'Anonymous',
    studentId: String(studentId ?? ''),
    score: Number(score) || 0,
    total: Number(total) || 0,
    percent: Number(total) > 0 ? Math.round((Number(score) / Number(total)) * 100) : 0,
    timeTaken: Number(timeTaken) || 0,
    submittedAt: new Date((Number(epoch) || 0) * 1000).toISOString(),
    answers: Array.isArray(answers) ? answers : [],
  };
}

export const encodeResult = (result) => pack(resultToCompact(result), 'R', 'S');
export const decodeResult = async (code) => resultFromCompact(await unpack(code, 'R', 'S'));

/* --------------------------------- links --------------------------------- */

/** Base URL of the app, without any hash route — works at any sub-path. */
export function appBaseUrl(loc = globalThis.location) {
  return `${loc.origin}${loc.pathname}${loc.search}`;
}

export const buildShareUrl = (payload, loc) => `${appBaseUrl(loc)}#/t/${payload}`;

/**
 * QR codes become hard to scan on a phone once they carry much more than this.
 * Past the limit we tell the teacher to share the link instead of printing it.
 */
export const QR_COMFORTABLE_LIMIT = 1200;
