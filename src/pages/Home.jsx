import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listQuizzes, deleteQuiz, duplicateQuiz, exportLibrary, importLibrary, resultsForQuiz } from '../lib/store.js';
import { totalPoints, formatDuration } from '../lib/model.js';
import { downloadText } from '../lib/csv.js';

export default function Home() {
  const [quizzes, setQuizzes] = useState([]);
  const [notice, setNotice] = useState('');
  const fileInput = useRef(null);
  const navigate = useNavigate();

  const refresh = () => setQuizzes(listQuizzes());
  useEffect(refresh, []);

  function remove(quiz) {
    if (!confirm(`Delete "${quiz.title}"?\n\nIts collected results will be deleted too. This cannot be undone.`)) return;
    deleteQuiz(quiz.id);
    refresh();
  }

  function duplicate(quiz) {
    const copy = duplicateQuiz(quiz.id);
    refresh();
    if (copy) navigate(`/edit/${copy.id}`);
  }

  function backup() {
    downloadText(`quizmaker-backup-${new Date().toISOString().slice(0, 10)}.json`, exportLibrary(), 'application/json');
    setNotice('Backup downloaded. Keep it somewhere safe — clearing your browser data erases your quizzes.');
  }

  async function restore(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const { quizzes: n, results } = importLibrary(await file.text());
      refresh();
      setNotice(`Restored ${n} quiz${n === 1 ? '' : 'zes'}${results ? ` and ${results} result${results === 1 ? '' : 's'}` : ''}.`);
    } catch (e) {
      setNotice(`Could not read that file: ${e.message}`);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My quizzes</h1>
          <p className="muted">Build a quiz, share one link, get marked results back.</p>
        </div>
        <Link className="btn primary" to="/new">+ New quiz</Link>
      </div>

      {notice && (
        <p className="notice" role="status">
          {notice} <button className="link-btn" onClick={() => setNotice('')}>Dismiss</button>
        </p>
      )}

      {quizzes.length === 0 ? (
        <div className="card center">
          <h2>No quizzes yet</h2>
          <p className="muted">Create your first quiz — it takes about a minute.</p>
          <Link className="btn primary" to="/new">Create a quiz</Link>
        </div>
      ) : (
        <div className="grid">
          {quizzes.map((quiz) => {
            const count = resultsForQuiz(quiz.id).length;
            return (
              <article className="card quiz-card" key={quiz.id}>
                <h2>{quiz.title}</h2>
                {quiz.description && <p className="muted clamp">{quiz.description}</p>}

                <ul className="meta">
                  <li>{quiz.questions.length} question{quiz.questions.length === 1 ? '' : 's'}</li>
                  <li>{totalPoints(quiz)} marks</li>
                  <li>{quiz.timeLimit ? formatDuration(quiz.timeLimit) : 'No time limit'}</li>
                  {count > 0 && <li className="hi">{count} result{count === 1 ? '' : 's'}</li>}
                </ul>

                <div className="actions">
                  <Link className="btn primary" to={`/share/${quiz.id}`}>Share</Link>
                  <Link className="btn" to={`/preview/${quiz.id}`}>Preview</Link>
                  <Link className="btn" to={`/edit/${quiz.id}`}>Edit</Link>
                  <Link className="btn" to={`/results/${quiz.id}`}>Results</Link>
                  <button className="btn" onClick={() => duplicate(quiz)}>Duplicate</button>
                  <button className="btn danger" onClick={() => remove(quiz)}>Delete</button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <section className="card backup">
        <div>
          <h2>Backup</h2>
          <p className="muted">
            Quizzes live in this browser only. Clearing site data, or switching device, loses them —
            so download a backup now and again.
          </p>
        </div>
        <div className="actions">
          <button className="btn" onClick={backup}>Download backup</button>
          <button className="btn" onClick={() => fileInput.current?.click()}>Restore from file</button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            onChange={restore}
            hidden
          />
        </div>
      </section>
    </>
  );
}
