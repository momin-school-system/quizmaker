import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { decodeQuiz, encodeResult } from '../lib/codec.js';
import { getQuiz } from '../lib/store.js';
import { gradeQuiz, prepareAttempt, totalPoints, formatDuration } from '../lib/model.js';
import { saveProgress, loadProgress, clearProgress } from '../lib/store.js';

/**
 * One component serves two audiences:
 *   /preview/:id  — the teacher checking their own quiz (no result code)
 *   /t/:payload   — a student on a shared link (result code at the end)
 */
export default function Take() {
  const { id, payload } = useParams();
  const isPreview = Boolean(id);

  const [quiz, setQuiz] = useState(null);
  const [error, setError] = useState('');
  const [stage, setStage] = useState('intro'); // intro | running | done
  const [name, setName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [responses, setResponses] = useState({});
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState(null);
  const [resultCode, setResultCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(null);

  const startedAt = useRef(null);
  const token = useMemo(() => (isPreview ? null : `t${(payload || '').slice(0, 24)}`), [isPreview, payload]);

  /* ------------------------------- loading ------------------------------- */

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const loaded = isPreview ? getQuiz(id) : await decodeQuiz(payload);
        if (cancelled) return;
        if (!loaded) return setError('That quiz is not saved in this browser.');
        setQuiz(loaded);
      } catch (e) {
        if (!cancelled) setError(e.message || 'This link could not be opened.');
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id, payload, isPreview]);

  // The attempt gets its own shuffled copy, built once per quiz load.
  const attempt = useMemo(() => (quiz ? prepareAttempt(quiz) : null), [quiz]);
  const questions = attempt?.questions ?? [];

  /* ------------------------------ submitting ----------------------------- */

  const submit = useCallback(
    async (auto = false) => {
      if (!attempt || stage === 'done') return;

      const unanswered = questions.filter((q) => {
        const value = responses[q.id];
        return value === undefined || value === null || value === '';
      }).length;

      if (!auto && unanswered > 0) {
        const ok = confirm(
          `You have ${unanswered} unanswered question${unanswered === 1 ? '' : 's'}.\n\nSubmit anyway?`
        );
        if (!ok) return;
      }

      const graded = gradeQuiz(attempt, responses);
      const timeTaken = startedAt.current ? (Date.now() - startedAt.current) / 1000 : 0;

      setResult({ ...graded, timeTaken, autoSubmitted: auto });
      setStage('done');
      if (token) clearProgress(token);

      if (!isPreview) {
        try {
          setResultCode(
            await encodeResult({
              quizTitle: attempt.title,
              name: name.trim() || 'Anonymous',
              studentId: studentId.trim(),
              score: graded.score,
              total: graded.total,
              timeTaken,
              submittedAt: new Date().toISOString(),
              answers: questions.map((q) => responses[q.id] ?? null),
            })
          );
        } catch {
          setResultCode('');
        }
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [attempt, questions, responses, stage, name, studentId, isPreview, token]
  );

  /* -------------------------------- timer -------------------------------- */

  useEffect(() => {
    if (stage !== 'running' || !attempt?.timeLimit) return undefined;

    const deadline = startedAt.current + attempt.timeLimit * 1000;
    const tick = () => {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) submit(true);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [stage, attempt, submit]);

  /* ------------------------- resume an interruption ----------------------- */

  useEffect(() => {
    if (!token || !attempt || stage !== 'intro') return;
    const saved = loadProgress(token);
    if (saved?.responses && Object.keys(saved.responses).length) {
      setResponses(saved.responses);
      setName(saved.name || '');
      setStudentId(saved.studentId || '');
      setResumed(true);
    }
  }, [token, attempt, stage]);

  useEffect(() => {
    if (stage !== 'running' || !token) return;
    saveProgress(token, { responses, name, studentId, savedAt: Date.now() });
  }, [responses, name, studentId, stage, token]);

  // Warn before closing the tab mid-attempt.
  useEffect(() => {
    if (stage !== 'running') return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [stage]);

  /* -------------------------------- screens ------------------------------- */

  if (error) {
    return (
      <div className="card center">
        <h2>This quiz could not be opened</h2>
        <p className="muted">{error}</p>
        <p className="hint">
          If the link was sent in a message, make sure you copied all of it — share links are long and
          chat apps sometimes cut them short.
        </p>
        <Link className="btn" to="/">Go to QuizMaker</Link>
      </div>
    );
  }

  if (!attempt) return <p className="muted center pad">Loading quiz…</p>;

  /* --- intro --- */
  if (stage === 'intro') {
    return (
      <div className="card intro">
        <h1>{attempt.title}</h1>
        {attempt.description && <p className="muted">{attempt.description}</p>}

        <ul className="meta big">
          <li><strong>{questions.length}</strong> questions</li>
          <li><strong>{totalPoints(attempt)}</strong> marks</li>
          <li><strong>{attempt.timeLimit ? formatDuration(attempt.timeLimit) : 'No limit'}</strong> time</li>
          <li>Pass at <strong>{attempt.passMark}%</strong></li>
        </ul>

        {isPreview && <p className="notice">Preview mode — this does not produce a result code.</p>}
        {resumed && <p className="notice">We found your unfinished answers and restored them.</p>}

        {!isPreview && (
          <>
            <label className="field">
              <span>Your name</span>
              <input value={name} placeholder="e.g. Ayesha Khan" onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span>Roll number / class (optional)</span>
              <input value={studentId} placeholder="e.g. 9-B 14" onChange={(e) => setStudentId(e.target.value)} />
            </label>
          </>
        )}

        {attempt.timeLimit > 0 && (
          <p className="warn-inline">
            The timer starts when you press Start and submits automatically at zero.
          </p>
        )}

        <button
          className="btn primary big-btn"
          onClick={() => {
            startedAt.current = Date.now();
            setStage('running');
          }}
        >
          Start
        </button>
      </div>
    );
  }

  /* --- results --- */
  if (stage === 'done' && result) {
    return (
      <>
        <div className="card scorecard">
          <div className={result.passed ? 'score pass' : 'score fail'}>
            <span>{result.percent}%</span>
          </div>
          <div>
            <h1>{result.passed ? 'Passed' : 'Not passed'}</h1>
            <p className="muted">
              {result.correctCount} of {result.questionCount} correct · {result.score}/{result.total} marks ·{' '}
              {formatDuration(result.timeTaken)}
            </p>
            {result.autoSubmitted && <p className="notice">Time ran out, so your answers were submitted automatically.</p>}
          </div>
        </div>

        {!isPreview && resultCode && (
          <section className="card">
            <h2>Send this to your teacher</h2>
            <p className="muted">Copy the code below and send it to your teacher so your score is recorded.</p>
            <textarea className="code-box" readOnly rows={3} value={resultCode} onFocus={(e) => e.target.select()} />
            <div className="actions">
              <button
                className="btn primary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(resultCode);
                  } catch {
                    window.prompt('Copy your result code:', resultCode);
                  }
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? '✓ Copied' : 'Copy result code'}
              </button>
              {typeof navigator !== 'undefined' && navigator.share && (
                <button
                  className="btn"
                  onClick={() =>
                    navigator
                      .share({ title: `${attempt.title} — result`, text: `${name || 'Student'}: ${result.score}/${result.total}\n\n${resultCode}` })
                      .catch(() => {})
                  }
                >
                  Send…
                </button>
              )}
            </div>
          </section>
        )}

        {attempt.showReview ? (
          result.breakdown.map((item, i) => (
            <section className={item.correct ? 'card review ok' : 'card review bad'} key={item.questionId}>
              <h3>
                <span className="qnum">Q{i + 1}</span>
                {item.prompt}
                <span className={item.correct ? 'tag ok' : 'tag bad'}>
                  {item.correct ? '✓ Correct' : '✗ Incorrect'} · {item.points}/{item.maxPoints}
                </span>
              </h3>
              <p><strong>Your answer:</strong> {item.givenText ?? <em>left blank</em>}</p>
              {!item.correct && <p><strong>Correct answer:</strong> {item.correctAnswer}</p>}
              {item.explanation && <p className="explain">{item.explanation}</p>}
            </section>
          ))
        ) : (
          <p className="muted center pad">Your teacher has chosen not to show the correct answers.</p>
        )}

        <div className="add-row">
          {isPreview && <Link className="btn primary" to={`/edit/${id}`}>Edit this quiz</Link>}
          {isPreview && <Link className="btn" to="/">My quizzes</Link>}
          {!isPreview && (
            <button
              className="btn"
              onClick={() => {
                setResponses({});
                setResult(null);
                setResultCode('');
                setIndex(0);
                setStage('intro');
              }}
            >
              Try again
            </button>
          )}
        </div>
      </>
    );
  }

  /* --- running --- */
  const answeredCount = questions.filter((q) => {
    const v = responses[q.id];
    return v !== undefined && v !== null && v !== '';
  }).length;

  const visible = attempt.onePerPage ? [questions[index]] : questions;
  const lowTime = secondsLeft !== null && attempt.timeLimit > 0 && secondsLeft <= Math.max(30, attempt.timeLimit * 0.1);

  return (
    <>
      <div className="runner-bar">
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={answeredCount}>
          <div className="progress-fill" style={{ width: `${(answeredCount / questions.length) * 100}%` }} />
        </div>
        <div className="runner-meta">
          <span>{answeredCount} of {questions.length} answered</span>
          {attempt.timeLimit > 0 && secondsLeft !== null && (
            <span className={lowTime ? 'clock low' : 'clock'} role="timer" aria-live="off">
              {formatDuration(secondsLeft)} left
            </span>
          )}
        </div>
      </div>

      {visible.map((question) => {
        const position = questions.indexOf(question);
        return (
          <section className="card question" key={question.id}>
            <h3>
              <span className="qnum">Q{position + 1}</span>
              {question.prompt}
              <span className="pts">{question.points} mark{question.points === 1 ? '' : 's'}</span>
            </h3>

            {question.type === 'mcq' &&
              question.options.map((option, oi) => (
                <label key={oi} className={String(responses[question.id]) === String(oi) ? 'choice selected' : 'choice'}>
                  <input
                    type="radio"
                    name={question.id}
                    checked={String(responses[question.id]) === String(oi)}
                    onChange={() => setResponses((r) => ({ ...r, [question.id]: oi }))}
                  />
                  <span className="choice-badge">{String.fromCharCode(65 + oi)}</span>
                  <span>{option}</span>
                </label>
              ))}

            {question.type === 'tf' &&
              [true, false].map((value) => (
                <label key={String(value)} className={responses[question.id] === value ? 'choice selected' : 'choice'}>
                  <input
                    type="radio"
                    name={question.id}
                    checked={responses[question.id] === value}
                    onChange={() => setResponses((r) => ({ ...r, [question.id]: value }))}
                  />
                  <span className="choice-badge">{value ? 'T' : 'F'}</span>
                  <span>{value ? 'True' : 'False'}</span>
                </label>
              ))}

            {question.type === 'sa' && (
              <input
                className="short"
                value={responses[question.id] ?? ''}
                placeholder="Type your answer"
                onChange={(e) => setResponses((r) => ({ ...r, [question.id]: e.target.value }))}
              />
            )}
          </section>
        );
      })}

      {attempt.onePerPage ? (
        <div className="add-row">
          <button className="btn" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>← Previous</button>
          {index < questions.length - 1 ? (
            <button className="btn primary" onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}>Next →</button>
          ) : (
            <button className="btn primary" onClick={() => submit(false)}>Submit answers</button>
          )}
        </div>
      ) : (
        <div className="add-row">
          <button className="btn primary big-btn" onClick={() => submit(false)}>Submit answers</button>
        </div>
      )}
    </>
  );
}
