import { Routes, Route, Link, NavLink, useLocation } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Builder from './pages/Builder.jsx';
import Share from './pages/Share.jsx';
import Take from './pages/Take.jsx';
import Results from './pages/Results.jsx';

export default function App() {
  const { pathname } = useLocation();
  // Students arriving on a share link get a clean page: no teacher navigation.
  const studentMode = pathname.startsWith('/t/');

  return (
    <div className="app">
      <header className="topbar">
        <Link to={studentMode ? '#' : '/'} className="brand" aria-label="QuizMaker home">
          <span className="brand-mark" aria-hidden="true">Q</span>
          <span>QuizMaker</span>
        </Link>

        {!studentMode && (
          <nav className="nav" aria-label="Main">
            <NavLink to="/" end>My quizzes</NavLink>
            <NavLink to="/new">Create</NavLink>
          </nav>
        )}
      </header>

      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/new" element={<Builder />} />
          <Route path="/edit/:id" element={<Builder />} />
          <Route path="/share/:id" element={<Share />} />
          <Route path="/preview/:id" element={<Take />} />
          <Route path="/t/:payload" element={<Take />} />
          <Route path="/results/:id" element={<Results />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      {!studentMode && (
        <footer className="footer">
          Everything is saved in this browser. No account, no server.
        </footer>
      )}
    </div>
  );
}

function NotFound() {
  return (
    <div className="card center">
      <h2>Page not found</h2>
      <p className="muted">That link does not point anywhere in QuizMaker.</p>
      <Link className="btn primary" to="/">Go to my quizzes</Link>
    </div>
  );
}
