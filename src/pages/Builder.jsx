import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { blankQuiz, blankQuestion, validateQuiz, totalPoints, TYPE_LABEL } from '../lib/model.js';
import { getQuiz, saveQuiz } from '../lib/store.js';

export default function Builder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState(null);
  const [errors, setErrors] = useState([]);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!id) return setQuiz(blankQuiz());
    const found = getQuiz(id);
    if (found) setQuiz(found);
    else setMissing(true);
  }, [id]);

  if (missing) {
    return (
      <div className="card center">
        <h2>Quiz not found</h2>
        <p className="muted">It may have been deleted, or saved in a different browser.</p>
        <Link className="btn primary" to="/">Back to my quizzes</Link>
      </div>
    );
  }
  if (!quiz) return <p className="muted center pad">Loading…</p>;

  /* ------------------------------- helpers ------------------------------- */

  const patch = (changes) => setQuiz((q) => ({ ...q, ...changes }));

  const patchQuestion = (qid, changes) =>
    setQuiz((q) => ({
      ...q,
      questions: q.questions.map((item) => (item.id === qid ? { ...item, ...changes } : item)),
    }));

  const changeType = (qid, type) =>
    setQuiz((q) => ({
      ...q,
      questions: q.questions.map((item) =>
        item.id === qid
          ? { ...blankQuestion(type), id: item.id, prompt: item.prompt, points: item.points, explanation: item.explanation }
          : item
      ),
    }));

  const addQuestion = (type) => {
    const question = blankQuestion(type);
    setQuiz((q) => ({ ...q, questions: [...q.questions, question] }));
    // Let React paint the new card before scrolling to it.
    requestAnimationFrame(() => {
      document.getElementById(`q-${question.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const removeQuestion = (qid) =>
    setQuiz((q) => ({ ...q, questions: q.questions.filter((item) => item.id !== qid) }));

  const move = (index, delta) =>
    setQuiz((q) => {
      const target = index + delta;
      if (target < 0 || target >= q.questions.length) return q;
      const questions = [...q.questions];
      [questions[index], questions[target]] = [questions[target], questions[index]];
      return { ...q, questions };
    });

  function save(event) {
    event.preventDefault();
    const problems = validateQuiz(quiz);
    setErrors(problems);
    if (problems.length) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const saved = saveQuiz(quiz);
    navigate(`/share/${saved.id}`);
  }

  /* -------------------------------- render ------------------------------- */

  return (
    <form onSubmit={save} noValidate>
      <div className="page-head">
        <div>
          <h1>{id ? 'Edit quiz' : 'Create a quiz'}</h1>
          <p className="muted">
            {quiz.questions.length} question{quiz.questions.length === 1 ? '' : 's'} · {totalPoints(quiz)} marks
          </p>
        </div>
        <button className="btn primary" type="submit">Save &amp; share</button>
      </div>

      {errors.length > 0 && (
        <div className="error" role="alert">
          <strong>Fix these first:</strong>
          <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}

      <section className="card">
        <label className="field">
          <span>Quiz title</span>
          <input
            value={quiz.title}
            placeholder="e.g. Chapter 3 — Photosynthesis"
            onChange={(e) => patch({ title: e.target.value })}
            autoFocus
          />
        </label>

        <label className="field">
          <span>Description (optional)</span>
          <textarea
            rows={2}
            value={quiz.description}
            placeholder="Shown to students before they start."
            onChange={(e) => patch({ description: e.target.value })}
          />
        </label>

        <div className="row">
          <label className="field">
            <span>Time limit (minutes)</span>
            <input
              type="number"
              min="0"
              step="1"
              value={quiz.timeLimit ? Math.round(quiz.timeLimit / 60) : 0}
              onChange={(e) => patch({ timeLimit: Math.max(0, Number(e.target.value) || 0) * 60 })}
            />
            <small className="hint">0 = no limit</small>
          </label>

          <label className="field">
            <span>Pass mark (%)</span>
            <input
              type="number"
              min="0"
              max="100"
              value={quiz.passMark}
              onChange={(e) => patch({ passMark: Number(e.target.value) })}
            />
          </label>
        </div>

        <fieldset className="options-group">
          <legend>Options</legend>
          <Check label="Shuffle the question order" checked={quiz.shuffleQuestions} onChange={(v) => patch({ shuffleQuestions: v })} />
          <Check label="Shuffle multiple-choice options" checked={quiz.shuffleOptions} onChange={(v) => patch({ shuffleOptions: v })} />
          <Check label="Show one question at a time" checked={quiz.onePerPage} onChange={(v) => patch({ onePerPage: v })} />
          <Check label="Show correct answers after submitting" checked={quiz.showReview} onChange={(v) => patch({ showReview: v })} />
        </fieldset>
      </section>

      {quiz.questions.map((question, index) => (
        <section className="card question" key={question.id} id={`q-${question.id}`}>
          <div className="question-head">
            <span className="qnum">Q{index + 1}</span>

            <label className="inline-field">
              <span className="sr-only">Question type</span>
              <select value={question.type} onChange={(e) => changeType(question.id, e.target.value)}>
                {Object.entries(TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>

            <label className="inline-field">
              <span className="sr-only">Marks</span>
              <input
                className="marks"
                type="number"
                min="1"
                value={question.points}
                onChange={(e) => patchQuestion(question.id, { points: Math.max(1, Number(e.target.value) || 1) })}
                title="Marks for this question"
              />
            </label>

            <span className="spacer" />

            <button type="button" className="icon" onClick={() => move(index, -1)} disabled={index === 0} title="Move up" aria-label={`Move question ${index + 1} up`}>↑</button>
            <button type="button" className="icon" onClick={() => move(index, 1)} disabled={index === quiz.questions.length - 1} title="Move down" aria-label={`Move question ${index + 1} down`}>↓</button>
            <button type="button" className="icon danger" onClick={() => removeQuestion(question.id)} disabled={quiz.questions.length === 1} title="Delete question" aria-label={`Delete question ${index + 1}`}>✕</button>
          </div>

          <label className="field">
            <span>Question</span>
            <textarea
              rows={2}
              value={question.prompt}
              placeholder="Type the question here"
              onChange={(e) => patchQuestion(question.id, { prompt: e.target.value })}
            />
          </label>

          {question.type === 'mcq' && (
            <McqEditor question={question} onPatch={(c) => patchQuestion(question.id, c)} />
          )}

          {question.type === 'tf' && (
            <div className="field">
              <span>Correct answer</span>
              <div className="pills">
                {[true, false].map((value) => (
                  <label key={String(value)} className={question.correct === value ? 'pill active' : 'pill'}>
                    <input
                      type="radio"
                      name={`tf-${question.id}`}
                      checked={question.correct === value}
                      onChange={() => patchQuestion(question.id, { correct: value })}
                    />
                    {value ? 'True' : 'False'}
                  </label>
                ))}
              </div>
            </div>
          )}

          {question.type === 'sa' && (
            <label className="field">
              <span>Accepted answers</span>
              <input
                value={(question.answers || []).join(' | ')}
                placeholder="Mars | Planet Mars"
                onChange={(e) =>
                  patchQuestion(question.id, {
                    answers: e.target.value.split('|').map((s) => s.trim()).filter(Boolean),
                  })
                }
              />
              <small className="hint">
                Separate alternatives with <code>|</code>. Capitals, extra spaces and a trailing full stop are ignored when marking.
              </small>
            </label>
          )}

          <label className="field">
            <span>Explanation (optional)</span>
            <input
              value={question.explanation}
              placeholder="Shown after the student submits"
              onChange={(e) => patchQuestion(question.id, { explanation: e.target.value })}
            />
          </label>
        </section>
      ))}

      <div className="add-row">
        {Object.entries(TYPE_LABEL).map(([type, label]) => (
          <button key={type} type="button" className="btn" onClick={() => addQuestion(type)}>+ {label}</button>
        ))}
      </div>

      <div className="add-row sticky-save">
        <button className="btn primary" type="submit">Save &amp; share</button>
        <Link className="btn" to="/">Cancel</Link>
      </div>
    </form>
  );
}

/* ------------------------------ subcomponents ----------------------------- */

function Check({ label, checked, onChange }) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function McqEditor({ question, onPatch }) {
  const setOption = (index, value) => {
    const options = [...question.options];
    options[index] = value;
    onPatch({ options });
  };

  const removeOption = (index) => {
    const options = question.options.filter((_, i) => i !== index);
    onPatch({
      options,
      correctIndex:
        question.correctIndex === index ? 0 : question.correctIndex > index ? question.correctIndex - 1 : question.correctIndex,
    });
  };

  return (
    <div className="field">
      <span>Options — select the correct one</span>
      <div className="options">
        {question.options.map((option, index) => (
          <div className={question.correctIndex === index ? 'option-row correct' : 'option-row'} key={index}>
            <label className="radio-wrap">
              <input
                type="radio"
                name={`correct-${question.id}`}
                checked={question.correctIndex === index}
                onChange={() => onPatch({ correctIndex: index })}
              />
              <span className="sr-only">Mark option {index + 1} as correct</span>
            </label>
            <input
              value={option}
              placeholder={`Option ${index + 1}`}
              onChange={(e) => setOption(index, e.target.value)}
            />
            <button
              type="button"
              className="icon"
              onClick={() => removeOption(index)}
              disabled={question.options.length <= 2}
              title="Remove option"
              aria-label={`Remove option ${index + 1}`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      {question.options.length < 8 && (
        <button type="button" className="btn small" onClick={() => onPatch({ options: [...question.options, ''] })}>
          + Add option
        </button>
      )}
    </div>
  );
}
