import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getQuiz, resultsForQuiz, addResult, deleteResult } from '../lib/store.js';
import { decodeResult } from '../lib/codec.js';
import { formatDuration } from '../lib/model.js';
import { toCsv, downloadText, safeFilename } from '../lib/csv.js';

export default function Results() {
  const { id } = useParams();
  const [quiz, setQuiz] = useState(null);
  const [results, setResults] = useState([]);
  const [codes, setCodes] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setQuiz(getQuiz(id));
    setResults(resultsForQuiz(id));
  }, [id]);

  const stats = useMemo(() => {
    if (!results.length) return null;
    const percents = results.map((r) => r.percent);
    const pass = quiz?.passMark ?? 60;
    return {
      count: results.length,
      average: Math.round(percents.reduce((a, b) => a + b, 0) / percents.length),
      best: Math.max(...percents),
      lowest: Math.min(...percents),
      passRate: Math.round((percents.filter((p) => p >= pass).length / percents.length) * 100),
    };
  }, [results, quiz]);

  async function addCodes(event) {
    event.preventDefault();
    const lines = codes.split(/[\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return;

    setBusy(true);
    let added = 0;
    let duplicates = 0;
    const failed = [];

    for (const line of lines) {
      try {
        const decoded = await decodeResult(line);
        const stored = addResult({ ...decoded, quizId: id });
        if (stored) added++;
        else duplicates++;
      } catch {
        failed.push(line.length > 18 ? `${line.slice(0, 18)}…` : line);
      }
    }

    setResults(resultsForQuiz(id));
    setCodes('');
    setBusy(false);
    setFeedback({ added, duplicates, failed });
  }

  function exportCsv() {
    const rows = [
      ['Name', 'Roll number', 'Score', 'Total marks', 'Percent', 'Result', 'Time taken', 'Submitted'],
      ...results.map((r) => [
        r.name,
        r.studentId,
        r.score,
        r.total,
        `${r.percent}%`,
        r.percent >= (quiz?.passMark ?? 60) ? 'Pass' : 'Fail',
        formatDuration(r.timeTaken),
        new Date(r.submittedAt).toLocaleString(),
      ]),
    ];
    downloadText(`${safeFilename(quiz?.title)}-results.csv`, toCsv(rows), 'text/csv;charset=utf-8');
  }

  function remove(result) {
    if (!confirm(`Remove ${result.name}'s result?`)) return;
    deleteResult(result.id);
    setResults(resultsForQuiz(id));
  }

  if (!quiz) {
    return (
      <div className="card center">
        <h2>Quiz not found</h2>
        <p className="muted">It may have been deleted from this browser.</p>
        <Link className="btn primary" to="/">Back to my quizzes</Link>
      </div>
    );
  }

  const passMark = quiz.passMark ?? 60;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{quiz.title}</h1>
          <p className="muted">Results you have collected</p>
        </div>
        <div className="actions">
          <Link className="btn" to={`/share/${id}`}>Share link</Link>
          {results.length > 0 && <button className="btn primary" onClick={exportCsv}>Export CSV</button>}
        </div>
      </div>

      <form className="card" onSubmit={addCodes}>
        <h2>Add result codes</h2>
        <p className="muted">
          Paste the codes your students sent you — one per line, or all at once. Duplicates are ignored,
          so it is safe to paste the same batch twice.
        </p>
        <textarea
          className="code-box"
          rows={4}
          value={codes}
          placeholder={'RXXXXXXXXXXXXXXXX…\nRYYYYYYYYYYYYYYYY…'}
          onChange={(e) => setCodes(e.target.value)}
        />
        <div className="actions">
          <button className="btn primary" disabled={busy || !codes.trim()}>
            {busy ? 'Reading…' : 'Add results'}
          </button>
        </div>

        {feedback && (
          <div className="notice" role="status">
            {feedback.added > 0 && <div>✓ Added {feedback.added} result{feedback.added === 1 ? '' : 's'}.</div>}
            {feedback.duplicates > 0 && <div>{feedback.duplicates} already recorded, skipped.</div>}
            {feedback.failed.length > 0 && (
              <div>
                ✗ Could not read {feedback.failed.length}: {feedback.failed.join(', ')}.
                <br />
                <small>Result codes start with R or S. Make sure the whole code was copied.</small>
              </div>
            )}
          </div>
        )}
      </form>

      {stats && (
        <div className="stats">
          <Stat label="Students" value={stats.count} />
          <Stat label="Average" value={`${stats.average}%`} />
          <Stat label="Highest" value={`${stats.best}%`} />
          <Stat label="Lowest" value={`${stats.lowest}%`} />
          <Stat label="Pass rate" value={`${stats.passRate}%`} />
        </div>
      )}

      {results.length === 0 ? (
        <p className="muted center pad">No results yet. Share the quiz, then paste the codes students send back.</p>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Score</th>
                <th>Percent</th>
                <th>Time</th>
                <th>Submitted</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.name}</strong>
                    {r.studentId && <div className="muted small">{r.studentId}</div>}
                  </td>
                  <td>{r.score}/{r.total}</td>
                  <td><span className={r.percent >= passMark ? 'badge pass' : 'badge fail'}>{r.percent}%</span></td>
                  <td>{formatDuration(r.timeTaken)}</td>
                  <td className="muted small">{new Date(r.submittedAt).toLocaleString()}</td>
                  <td><button className="icon danger" onClick={() => remove(r)} aria-label={`Remove ${r.name}`}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
