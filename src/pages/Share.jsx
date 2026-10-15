import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import { getQuiz } from '../lib/store.js';
import { encodeQuiz, buildShareUrl, QR_COMFORTABLE_LIMIT } from '../lib/codec.js';
import { totalPoints, formatDuration } from '../lib/model.js';
import { safeFilename } from '../lib/csv.js';

// Above this a QR code becomes a dense grid that phone cameras struggle with.
const QR_HARD_LIMIT = 2200;

export default function Share() {
  const { id } = useParams();
  const [quiz, setQuiz] = useState(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const qrBox = useRef(null);

  useEffect(() => {
    const found = getQuiz(id);
    if (!found) return setError('That quiz no longer exists.');
    setQuiz(found);

    let cancelled = false;
    encodeQuiz(found)
      .then((payload) => !cancelled && setUrl(buildShareUrl(payload)))
      .catch((e) => !cancelled && setError(e.message));
    return () => { cancelled = true; };
  }, [id]);

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API needs a secure context; fall back to a selectable prompt.
      window.prompt('Copy this link:', text);
    }
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  }

  function downloadQr() {
    const canvas = qrBox.current?.querySelector('canvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${safeFilename(quiz.title)}-qr.png`;
    a.click();
  }

  async function shareSheet() {
    try {
      await navigator.share({ title: quiz.title, text: `Take the quiz: ${quiz.title}`, url });
    } catch {
      /* user dismissed, or unsupported — the copy button covers it */
    }
  }

  if (error) {
    return (
      <div className="card center">
        <h2>Nothing to share</h2>
        <p className="muted">{error}</p>
        <Link className="btn primary" to="/">Back to my quizzes</Link>
      </div>
    );
  }
  if (!quiz || !url) return <p className="muted center pad">Preparing the link…</p>;

  const tooLongForQr = url.length > QR_HARD_LIMIT;
  const denseQr = !tooLongForQr && url.length > QR_COMFORTABLE_LIMIT;

  return (
    <>
      <div className="page-head no-print">
        <div>
          <h1>Share “{quiz.title}”</h1>
          <p className="muted">
            {quiz.questions.length} questions · {totalPoints(quiz)} marks ·{' '}
            {quiz.timeLimit ? formatDuration(quiz.timeLimit) : 'no time limit'}
          </p>
        </div>
        <Link className="btn" to="/">Done</Link>
      </div>

      <section className="card explain-card no-print">
        <h2>How this works</h2>
        <ol className="steps">
          <li>The whole quiz is packed <strong>inside the link itself</strong> — there is no server and no database.</li>
          <li>Students open the link, or scan the QR code, and answer on any phone. No app, no account.</li>
          <li>They are marked instantly and get a short <strong>result code</strong>.</li>
          <li>They send you that code; you paste it into <strong>Results</strong> to build your class list.</li>
        </ol>
      </section>

      <section className="card printable">
        <h2 className="print-title">{quiz.title}</h2>

        {tooLongForQr ? (
          <div className="warn no-print">
            <strong>This quiz is too long for a QR code.</strong>
            <p>
              Share the link below instead (WhatsApp, Google Classroom, email). To get a scannable QR,
              shorten the question text or split the paper into two shorter quizzes.
            </p>
          </div>
        ) : (
          <div className="qr-wrap" ref={qrBox}>
            <QRCodeCanvas value={url} size={240} level="L" marginSize={2} bgColor="#ffffff" fgColor="#0b1020" />
          </div>
        )}

        {denseQr && (
          <p className="hint center no-print">
            This QR is dense. Display it large on a screen, or print at full page size, so cameras can read it.
          </p>
        )}

        <p className="print-only print-url">{url}</p>

        <label className="field no-print">
          <span>Student link</span>
          <textarea className="link-box" readOnly rows={3} value={url} onFocus={(e) => e.target.select()} />
          <small className="hint">{url.length.toLocaleString()} characters</small>
        </label>

        <div className="actions no-print">
          <button className="btn primary" onClick={() => copy(url, 'link')}>
            {copied === 'link' ? '✓ Copied' : 'Copy link'}
          </button>
          <a className="btn" href={url} target="_blank" rel="noreferrer">Open as a student</a>
          {typeof navigator !== 'undefined' && navigator.share && (
            <button className="btn" onClick={shareSheet}>Share…</button>
          )}
          {!tooLongForQr && <button className="btn" onClick={downloadQr}>Download QR</button>}
          {!tooLongForQr && <button className="btn" onClick={() => window.print()}>Print QR sheet</button>}
        </div>
      </section>

      <section className="card no-print">
        <h2>Before you send it out</h2>
        <ul className="checklist">
          <li>Open the link yourself once and take the quiz — it is the fastest way to spot a typo.</li>
          <li>Editing the quiz creates a <strong>new</strong> link. Re-share it; old links keep the old questions.</li>
          <li>Anyone with the link can take the quiz, and the answers travel inside it — do not post it publicly before an exam.</li>
        </ul>
        <div className="actions">
          <Link className="btn" to={`/preview/${quiz.id}`}>Preview</Link>
          <Link className="btn" to={`/edit/${quiz.id}`}>Edit quiz</Link>
          <Link className="btn" to={`/results/${quiz.id}`}>Collect results</Link>
        </div>
      </section>
    </>
  );
}
