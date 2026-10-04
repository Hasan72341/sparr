import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useLocation,
  useParams,
} from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  Code2,
  FileText,
  FolderGit2,
  GraduationCap,
  History,
  Home,
  Lightbulb,
  Camera,
  Mic,
  Loader2,
  Menu,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Settings2,
  Shield,
  MessageSquare,
  Terminal,
  Trash2,
  TrendingUp,
  UserRound,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import type {
  Artifact,
  Assessment,
  Bootstrap,
  Difficulty,
  Language,
  Profile,
  Repository,
  RunResult,
  Session,
  SessionView,
  PracticeOptions,
  SebLaunch,
  Settings,
  TrackId,
} from "../shared/types";
import { ApiError, api, download, errorMessage, post, put } from "./api";
import { StrictSetup, StrictInterview } from "./strict";
import { preparationTemplates } from "../shared/preparation";

type AppContextValue = {
  data: Bootstrap;
  refresh: () => Promise<void>;
  setData: (update: (data: Bootstrap) => Bootstrap) => void;
};
const AppContext = createContext<AppContextValue | null>(null);
const useApp = () => useContext(AppContext)!;
const trackIcons: Record<TrackId, LucideIcon> = {
  swe: Code2,
  "quant-research": BarChart3,
  "quant-trading": TrendingUp,
  "quant-dev": Terminal,
  finance: Wallet,
  markets: Radio,
  ml: BrainCircuit,
};
const providerNames: Record<Settings["provider"], string> = {
  guided: "Guided practice",
  ollama: "Ollama",
  "openai-compatible": "OpenAI-compatible",
  codex: "Codex",
  claude: "Claude Code",
};
const stageNames: Record<NonNullable<Session["stage"]>, string> = {
  technical: "Technical interview",
  oa: "Timed OA",
  project: "Project defense",
  behavioral: "Behavioral reflection",
};
const dateLabel = (date: string) =>
  new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const durationLabel = (session: Session) =>
  `${session.durationMinutes} min · ${session.difficulty}`;
const verdictLabel = (verdict: Assessment["verdict"]) =>
  verdict.replaceAll("-", " ");

function Busy({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="loading-state" role="status">
      <Loader2 className="spin" size={22} />
      <span>{label}</span>
    </div>
  );
}
function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "error" | "success";
}) {
  return (
    <div
      className={`notice notice-${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {tone === "success" ? (
        <CheckCircle2 size={18} />
      ) : tone === "error" ? (
        <CircleHelp size={18} />
      ) : (
        <Lightbulb size={18} />
      )}
      <div>{children}</div>
    </div>
  );
}
function Empty({
  icon: Icon = BookOpen,
  title,
  children,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={27} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
function PageHeading({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
      {action && <div className="heading-action">{action}</div>}
    </header>
  );
}
function ConfirmDialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  onClose,
  busy,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  busy: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby="confirm-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
    >
      <div className="dialog-content">
        <span className="empty-icon">
          <Trash2 size={25} />
        </span>
        <h2 id="confirm-title">{title}</h2>
        <p>{children}</p>
        <div className="button-row">
          <button
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button danger" disabled={busy} onClick={onConfirm}>
            {busy && <Loader2 className="spin" size={16} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export function App() {
  const location = useLocation();
  const strictId = /^\/strict\/([^/]+)$/.exec(location.pathname)?.[1];
  const [data, setData] = useState<Bootstrap | null>(null);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const dataRevision = useRef(0);
  const refresh = useCallback(async () => {
    const revision = ++dataRevision.current;
    const result = await api<Bootstrap>("/bootstrap");
    if (revision !== dataRevision.current) return;
    setData(result);
    setError("");
  }, []);
  useEffect(() => {
    void refresh().catch((error) => setError(errorMessage(error)));
  }, [refresh]);
  if (!data)
    return (
      <div className="boot-screen">
        <Logo />
        {error ? (
          <>
            <Notice tone="error">{error}</Notice>
            <button
              className="button primary"
              onClick={() => {
                setError("");
                void refresh().catch((error) => setError(errorMessage(error)));
              }}
            >
              <RefreshCw size={17} />
              Try again
            </button>
          </>
        ) : (
          <Busy />
        )}
      </div>
    );
  const activeSessions = data.sessions.filter(
    (session) => session.status === "active",
  );
  return (
    <AppContext.Provider
      value={{
        data,
        refresh,
        setData: (update) => {
          // A completed local mutation supersedes any older pending snapshot.
          dataRevision.current++;
          setData((previous) => (previous ? update(previous) : previous));
        },
      }}
    >
      <div className={`app-shell ${strictId ? "strict-shell" : ""}`}>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
          <div className="sidebar-top">
            <Link
              to="/"
              className="brand-link"
              onClick={() => setMenuOpen(false)}
            >
              <Logo />
            </Link>
            <button
              className="icon-button mobile-close"
              aria-label="Close navigation"
              onClick={() => setMenuOpen(false)}
            >
              <X size={20} />
            </button>
          </div>
          <div className="sidebar-caption">WORKSPACE</div>
          <nav aria-label="Main navigation">
            {(
              [
                { to: "/", label: "Overview", icon: Home },
                { to: "/practice", label: "Practice", icon: GraduationCap },
                { to: "/history", label: "Session history", icon: History },
                { to: "/profile", label: "Profile", icon: UserRound },
                { to: "/projects", label: "Projects", icon: FolderGit2 },
              ] as const
            ).map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `nav-item ${isActive ? "active" : ""}`
                }
              >
                <Icon size={19} />
                <span>{label}</span>
                {to === "/history" && data.sessions.length > 0 && (
                  <span className="nav-count">{data.sessions.length}</span>
                )}
              </NavLink>
            ))}
          </nav>
          {activeSessions.length > 0 && (
            <div className="sidebar-active">
              <span className="live-dot" /> Interview in progress
              <Link
                to={`/sessions/${activeSessions[0].id}`}
                onClick={() => setMenuOpen(false)}
              >
                Resume session <ArrowRight size={15} />
              </Link>
            </div>
          )}
          <div className="sidebar-bottom">
            <div className="provider-card">
              <div className="provider-symbol">
                <MessageSquare size={18} />
              </div>
              <div>
                <strong>{providerNames[data.settings.provider]}</strong>
                <span>
                  {data.settings.provider === "guided"
                    ? "No model required"
                    : data.settings.model ||
                      (data.settings.provider === "claude"
                        ? "Local CLI"
                        : "Model not selected")}
                </span>
              </div>
            </div>
            <NavLink
              to="/settings"
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <Settings2 size={19} />
              Settings
            </NavLink>
            <div className="user-card">
              <span className="avatar">
                {data.profile.name
                  ? data.profile.name.slice(0, 1).toUpperCase()
                  : "S"}
              </span>
              <div>
                <strong>{data.profile.name || "Local profile"}</strong>
                <span>Placement preparation</span>
              </div>
              <Link
                to="/profile"
                className="icon-button"
                aria-label="Edit profile"
              >
                <ChevronRight size={17} />
              </Link>
            </div>
          </div>
        </aside>
        {menuOpen && (
          <button
            className="nav-backdrop"
            aria-label="Close navigation"
            onClick={() => setMenuOpen(false)}
          />
        )}
        <div className="main-shell">
          <div className="topbar">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span className="topbar-label">
              <span className="status-dot" /> Interview practice
            </span>
            <Link className="topbar-link" to="/settings">
              <Settings2 size={15} /> Configuration
            </Link>
          </div>
          <main id="main-content" className="main-content">
            <Routes>
              <Route path="/strict/:launchId" element={<StrictPage />} />
              <Route
                path="/strict/:launchId/quit"
                element={
                  <Empty
                    title="Strict interview closed"
                    action={
                      <Link className="button primary" to="/history">
                        View session history
                      </Link>
                    }
                  >
                    Saved results and any termination reason are in Session
                    history. You can close SEB with Command-Q if it did not exit
                    automatically.
                  </Empty>
                }
              />
              <Route path="/" element={<Dashboard />} />
              <Route path="/practice" element={<PracticeSetup />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/sessions/:id" element={<SessionPage />} />
              <Route path="/sessions/:id/report" element={<ReportPage />} />
              <Route
                path="*"
                element={
                  <Empty
                    title="Page not found"
                    action={
                      <Link className="button primary" to="/">
                        Go to overview
                      </Link>
                    }
                  >
                    Check the URL or return to the overview.
                  </Empty>
                }
              />
            </Routes>
          </main>
          <footer className="app-footer">
            <span>Sparr</span>
            <span>
              Local workspace <span className="footer-dot">·</span>{" "}
              {data.capabilities.platform === "darwin"
                ? "macOS"
                : data.capabilities.platform}
            </span>
          </footer>
        </div>
      </div>
    </AppContext.Provider>
  );
}
function Logo() {
  return (
    <div className="logo">
      <span className="logo-mark">
        <span />
        <span />
        <span />
      </span>
      <span>
        sparr<span className="logo-period">.</span>
      </span>
    </div>
  );
}

function Dashboard() {
  const { data } = useApp();
  const activeSession = data.sessions.find(
    (session) => session.status === "active",
  );
  const completed = data.sessions.filter(
    (session) => session.status === "completed",
  );
  const demonstrated = data.sessions
    .flatMap((session) => session.assessments)
    .filter((assessment) => assessment.verdict === "demonstrated").length;
  const latest = [...data.sessions]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3);
  return (
    <>
      <PageHeading
        eyebrow="WORKSPACE"
        title={
          data.profile.name
            ? `${data.profile.name.split(" ")[0]}’s workspace`
            : "Interview practice"
        }
      >
        Prepare for software, quant, finance, and ML interviews.
      </PageHeading>
      <section className="dashboard-hero">
        <div className="hero-copy">
          <span className="hero-eyebrow">
            {activeSession ? "IN PROGRESS" : "NEW SESSION"}
          </span>
          <h2>
            {activeSession
              ? "Continue your interview"
              : "Start a practice session"}
          </h2>
          <p>
            {activeSession
              ? "Your answers and saved draft are ready. The session timer continues while you are away."
              : "Choose a role and format. Work through questions, run your code, and review the feedback."}
          </p>
          <Link
            className="button primary"
            to={activeSession ? `/sessions/${activeSession.id}` : "/practice"}
          >
            {activeSession ? "Resume interview" : "Set up interview"}{" "}
            <ArrowRight size={18} />
          </Link>
          <span className="hero-footnote">
            {data.settings.provider === "guided"
              ? "Guided practice · no model required"
              : `Feedback: ${providerNames[data.settings.provider]}`}
          </span>
        </div>
        <nav className="workspace-shortcuts" aria-label="Interview preparation">
          <h3>Session material</h3>
          <Link to="/profile">
            <FileText size={20} />
            <span>
              <strong>Resume and goals</strong>
              <small>
                {data.profile.resumeText
                  ? "Resume saved"
                  : "Add your experience"}
              </small>
            </span>
            <ChevronRight size={16} />
          </Link>
          <Link to="/projects">
            <FolderGit2 size={20} />
            <span>
              <strong>Projects and documents</strong>
              <small>
                {data.repositories.length}{" "}
                {data.repositories.length === 1 ? "repository" : "repositories"}{" "}
                · {data.artifacts.length}{" "}
                {data.artifacts.length === 1 ? "document" : "documents"}
              </small>
            </span>
            <ChevronRight size={16} />
          </Link>
          <Link to="/settings">
            <Settings2 size={20} />
            <span>
              <strong>Feedback provider</strong>
              <small>{providerNames[data.settings.provider]}</small>
            </span>
            <ChevronRight size={16} />
          </Link>
        </nav>
      </section>
      <div className="stats-row">
        <div>
          <span className="stat-value">
            {completed.length}
            <small>{completed.length === 1 ? "session" : "sessions"}</small>
          </span>
          <span className="stat-label">Completed practice</span>
        </div>
        <div>
          <span className="stat-value">
            {demonstrated}
            <small>{demonstrated === 1 ? "answer" : "answers"}</small>
          </span>
          <span className="stat-label">Passed executable checks</span>
        </div>
        <div>
          <span className="stat-value">
            {data.repositories.length + data.artifacts.length}
            <small>
              {data.repositories.length + data.artifacts.length === 1
                ? "project"
                : "projects"}
            </small>
          </span>
          <span className="stat-label">
            Imported repositories and documents
          </span>
        </div>
      </div>
      <section className="section">
        <div className="section-heading">
          <div>
            <h2>Interview tracks</h2>
            <p>Choose the role you are preparing for.</p>
          </div>
          <Link className="text-link" to="/practice">
            Explore all tracks <ArrowRight size={16} />
          </Link>
        </div>
        <div className="track-preview-grid">
          {data.tracks.map((track) => {
            const Icon = trackIcons[track.id];
            return (
              <Link
                key={track.id}
                to={`/practice?track=${track.id}`}
                className={`track-preview track-${track.id}`}
              >
                <span className="track-icon">
                  <Icon size={23} />
                </span>
                <h3>{track.shortName}</h3>
                <p>{track.description}</p>
                <span className="track-preview-action">
                  Start practice <ArrowUpRight size={16} />
                </span>
              </Link>
            );
          })}
        </div>
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <h2>Recent sessions</h2>
            <p>Resume an interview or open its report.</p>
          </div>
          <Link to="/history" className="text-link">
            View history <ArrowRight size={16} />
          </Link>
        </div>
        {latest.length ? (
          <div className="session-list">
            {latest.map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </div>
        ) : (
          <div className="first-session">
            <span className="empty-icon">
              <BookOpen size={24} />
            </span>
            <div>
              <h3>No sessions yet</h3>
              <p>Your first session and feedback will appear here.</p>
            </div>
            <Link className="button secondary" to="/practice">
              Start practising <ArrowRight size={16} />
            </Link>
          </div>
        )}
      </section>
      <div className="profile-callout">
        <FileText size={26} />
        <div>
          <h3>
            {data.profile.resumeText ? "Resume and goals" : "Add your resume"}
          </h3>
          <p>
            {data.profile.resumeText
              ? "Review your resume and goals before the next session."
              : "Use your experience as the basis for project questions."}
          </p>
        </div>
        <Link to="/profile" className="text-link">
          {data.profile.resumeText ? "Review profile" : "Set up your profile"}{" "}
          <ArrowRight size={16} />
        </Link>
      </div>
    </>
  );
}

function SessionRow({
  session,
  onDelete,
}: {
  session: Session;
  onDelete?: () => void;
}) {
  const { data } = useApp();
  const track = data.tracks.find((track) => track.id === session.track);
  const Icon = trackIcons[session.track];
  return (
    <div className="session-row">
      <span className={`track-icon track-${session.track}`}>
        <Icon size={21} />
      </span>
      <div className="session-row-name">
        <Link
          to={`/sessions/${session.id}${session.status === "active" ? "" : "/report"}`}
        >
          {track?.name || session.track}
        </Link>
        <span>
          {dateLabel(session.createdAt)} <span className="bullet">·</span>{" "}
          {durationLabel(session)}
        </span>
      </div>
      <span className={`badge status-${session.status}`}>
        {session.status === "active" ? "In progress" : session.status}
      </span>
      <span className="session-question-count">
        {session.assessments.length} assessed
      </span>
      <Link
        className="icon-button"
        aria-label={
          session.status === "active" ? "Resume session" : "View report"
        }
        to={`/sessions/${session.id}${session.status === "active" ? "" : "/report"}`}
      >
        <ArrowUpRight size={19} />
      </Link>
      {onDelete && (
        <button
          className="icon-button"
          aria-label={`Delete ${track?.shortName || session.track} session from ${dateLabel(session.createdAt)}`}
          onClick={onDelete}
        >
          <Trash2 size={17} />
        </button>
      )}
    </div>
  );
}

function SebLauncher({
  options,
  disabled,
}: {
  options: PracticeOptions;
  disabled: boolean;
}) {
  const [generated, setGenerated] = useState<{
    launch: SebLaunch;
    selection: string;
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const selection = JSON.stringify(options);
  const launch =
    generated?.selection === selection ? generated.launch : undefined;
  async function generate() {
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      setGenerated({
        launch: await post<SebLaunch>("/seb/launches", options),
        selection,
      });
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(launch!.launchUrl);
      setCopied(true);
    } catch {
      inputRef.current?.select();
      setError("Press Command-C to copy the selected link.");
    }
  }
  return (
    <section className="seb-launcher" aria-labelledby="seb-launch-title">
      <h3 id="seb-launch-title">Open in Safe Exam Browser</h3>
      <p>
        Generate a link for these interview settings. The timer starts when you
        choose Start practice in SEB.
      </p>
      <p>
        Install{" "}
        <a
          className="text-link"
          href="https://safeexambrowser.org/download_en.html#MacOSX"
          target="_blank"
          rel="noreferrer"
        >
          SEB for macOS
        </a>{" "}
        and keep Sparr running on this Mac. Your configured coding agent
        continues on the server. SEB may close other apps; Terminal and iTerm2
        are allowed.
      </p>
      <button
        type="button"
        className="button secondary full-width"
        onClick={generate}
        disabled={disabled || busy}
      >
        {busy ? <Loader2 className="spin" size={16} /> : <Shield size={16} />}
        {busy
          ? "Generating link…"
          : launch
            ? "Generate a new SEB link"
            : "Generate SEB link"}
      </button>
      {launch && (
        <div
          className="seb-link-result"
          role="region"
          aria-label="Generated SEB link"
        >
          <a className="button primary full-width" href={launch.launchUrl}>
            Launch Safe Exam Browser <ArrowUpRight size={16} />
          </a>
          <label className="field">
            <span>SEB launch link</span>
            <input
              ref={inputRef}
              readOnly
              value={launch.launchUrl}
              onFocus={(event) => event.target.select()}
            />
          </label>
          <div className="seb-link-actions">
            <button type="button" className="button secondary" onClick={copy}>
              {copied ? "Copied" : "Copy link"}
            </button>
            <a
              className="text-link"
              href={launch.configUrl}
              download="sparr-practice.seb"
            >
              Download .seb
            </a>
          </div>
          <p role="status">
            Valid until{" "}
            {new Date(launch.expiresAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            or until Sparr restarts. If the browser does not open SEB, download
            and open the .seb file. Quit any existing SEB session first.
          </p>
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <p className="field-help">
        Practice configuration: app switching, VMs, extra displays, and manual
        quit are allowed. This does not enable strict mode.
      </p>
    </section>
  );
}

function PracticeSetup() {
  const { search } = useLocation();
  const id = new URLSearchParams(search).get("seb");
  const [loaded, setLoaded] = useState<{
    id: string;
    launch?: SebLaunch;
    error?: string;
  }>();
  useEffect(() => {
    if (!id) return;
    let canceled = false;
    api<SebLaunch>(`/seb/launches/${encodeURIComponent(id)}`).then(
      (launch) => {
        if (!canceled) setLoaded({ id, launch });
      },
      (error) => {
        if (!canceled) setLoaded({ id, error: errorMessage(error) });
      },
    );
    return () => {
      canceled = true;
    };
  }, [id]);
  if (!id) return <PracticeForm />;
  if (loaded?.id !== id) return <Busy label="Loading interview settings…" />;
  if (loaded.error)
    return (
      <>
        <PageHeading eyebrow="PRACTICE" title="SEB link unavailable">
          Generate a new link to continue.
        </PageHeading>
        <Notice tone="error">{loaded.error}</Notice>
        <Link className="button primary" to="/practice">
          Back to Practice
        </Link>
      </>
    );
  return <PracticeForm key={id} launch={loaded.launch} />;
}

function PracticeForm({ launch }: { launch?: SebLaunch }) {
  const { data, refresh } = useApp();
  const navigate = useNavigate();
  const queryTrack = new URLSearchParams(window.location.search).get("track");
  const [track, setTrack] = useState<TrackId>(
    launch?.options.track ||
      data.tracks.find((item) => item.id === queryTrack)?.id ||
      "swe",
  );
  const [difficulty, setDifficulty] = useState<Difficulty>(
    launch?.options.difficulty || "intermediate",
  );
  const [duration, setDuration] = useState(
    launch?.options.durationMinutes || 20,
  );
  const [repositoryId, setRepositoryId] = useState(
    launch?.options.repositoryId ||
      data.repositories.find(
        (repository) =>
          repository.id ===
          new URLSearchParams(window.location.search).get("repository"),
      )?.id ||
      "",
  );
  const [artifactId, setArtifactId] = useState(
    launch?.options.artifactId ||
      data.artifacts.find(
        (artifact) =>
          artifact.id ===
          new URLSearchParams(window.location.search).get("artifact"),
      )?.id ||
      "",
  );
  const [company, setCompany] = useState(launch?.options.company || "");
  const [jobDescription, setJobDescription] = useState(
    launch?.options.jobDescription || "",
  );
  const [preparationId, setPreparationId] = useState("");
  const [stage, setStage] = useState<NonNullable<Session["stage"]>>(
    launch?.options.stage || "technical",
  );
  useEffect(() => {
    if (
      repositoryId &&
      (stage === "oa" ||
        artifactId ||
        !data.repositories.some((item) => item.id === repositoryId))
    )
      setRepositoryId("");
    if (
      artifactId &&
      (stage === "oa" || !data.artifacts.some((item) => item.id === artifactId))
    )
      setArtifactId("");
  }, [data.repositories, data.artifacts, repositoryId, artifactId, stage]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectedTrack = data.tracks.find((item) => item.id === track);
  const selectedProvider = data.capabilities.providers.find(
    (provider) => provider.id === data.settings.provider,
  );
  const projectContextMissing =
    stage === "project" &&
    !repositoryId &&
    !artifactId &&
    !data.profile.resumeText.trim();
  const options: PracticeOptions = {
    track,
    difficulty,
    durationMinutes: duration,
    mode: "practice",
    stage,
    ...(company.trim() ? { company: company.trim() } : {}),
    ...(jobDescription.trim() ? { jobDescription: jobDescription.trim() } : {}),
    ...(stage === "oa"
      ? {}
      : artifactId
        ? { artifactId }
        : repositoryId
          ? { repositoryId }
          : {}),
  };
  async function start(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await post<SessionView>("/sessions", options);
      void refresh().catch(() => {});
      navigate(`/sessions/${result.session.id}`);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading eyebrow="PRACTICE" title="Set up an interview">
        Choose a role, format, and duration.
      </PageHeading>
      {launch && (
        <Notice>
          Interview settings loaded from your SEB link. Review them below, then
          choose Start practice to begin the timer. This is a practice session.
        </Notice>
      )}
      <form onSubmit={start} className="setup-grid">
        <div>
          <fieldset className="plain-fieldset">
            <legend className="section-label">Interview track</legend>
            <div className="track-select-grid">
              {data.tracks.map((item) => {
                const Icon = trackIcons[item.id];
                return (
                  <label
                    key={item.id}
                    className={`track-choice ${track === item.id ? "selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="track"
                      aria-label={item.name}
                      value={item.id}
                      checked={track === item.id}
                      onChange={() => setTrack(item.id)}
                    />
                    <span className={`track-icon track-${item.id}`}>
                      <Icon size={23} />
                    </span>
                    <span className="track-choice-copy">
                      <strong>{item.name}</strong>
                      <span>{item.description}</span>
                    </span>
                    <span className="radio-indicator">
                      {track === item.id && <Check size={12} />}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <section className="panel targeting-panel">
            <div className="section-heading">
              <div>
                <h2>Company and role</h2>
                <p>Company and role context is optional.</p>
              </div>
            </div>
            <label className="field">
              <span>Preparation template</span>
              <select
                aria-label="Preparation template"
                value={preparationId}
                onChange={(event) => {
                  const template = preparationTemplates.find(
                    (item) => item.id === event.target.value,
                  );
                  if (!template) return;
                  setPreparationId(template.id);
                  setCompany(template.company);
                  setTrack(template.track);
                  setJobDescription(template.jobDescription);
                }}
              >
                <option value="" disabled>
                  Choose a starting point
                </option>
                {preparationTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.label}
                  </option>
                ))}
              </select>
              <small>
                Sets the track, company, and suggested context. Edit the fields
                below to match your role.
              </small>
            </label>
            <label className="field">
              <span>
                Company <small>optional</small>
              </span>
              <input
                aria-label="Company"
                value={company}
                maxLength={120}
                onChange={(event) => setCompany(event.target.value)}
                placeholder="Company you are preparing for"
              />
            </label>
            <label className="field">
              <span>
                Job description <small>optional</small>
              </span>
              <textarea
                aria-label="Job description"
                value={jobDescription}
                maxLength={8000}
                rows={5}
                onChange={(event) => setJobDescription(event.target.value)}
                placeholder="Paste the role description, responsibilities, or requirements."
              />
              <small>
                {jobDescription.length.toLocaleString()} / 8,000 characters
              </small>
            </label>
            <p className="field-help">
              Your company and job description provide context. These exercises
              are practice material, not authentic company interview questions.
              Templates are study suggestions, not job postings or company
              endorsements.
            </p>
          </section>
          <StrictSetup
            options={options}
            disabled={
              busy ||
              projectContextMissing ||
              selectedProvider?.available === false
            }
            available={data.capabilities.strict.available}
            reasons={data.capabilities.strict.reasons}
          />
        </div>
        <aside className="setup-panel panel">
          <div className="panel-heading">
            <span className="eyebrow">SESSION OPTIONS</span>
            <h2>Interview settings</h2>
          </div>
          <label className="field">
            <span>Interview stage</span>
            <select
              aria-label="Interview stage"
              value={stage}
              onChange={(event) =>
                setStage(event.target.value as NonNullable<Session["stage"]>)
              }
            >
              {Object.entries(stageNames).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <small>
              {stage === "oa"
                ? "Timed numeric and coding exercises. Hints are disabled."
                : stage === "behavioral"
                  ? "Questions about decisions, teamwork, and past experience."
                  : stage === "project"
                    ? "Attach a repository or document, or add a resume to your profile."
                    : "Role-specific exercises and discussion, with hints available."}
            </small>
          </label>
          <label className="field">
            <span>Difficulty</span>
            <select
              aria-label="Difficulty"
              value={difficulty}
              onChange={(event) =>
                setDifficulty(event.target.value as Difficulty)
              }
            >
              <option value="foundation">Foundation</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>
          <fieldset className="plain-fieldset">
            <legend className="field-label">Duration</legend>
            <div className="duration-options">
              {[10, 20, 30, 45, 60].map((minutes) => (
                <label
                  key={minutes}
                  className={duration === minutes ? "selected" : ""}
                >
                  <input
                    type="radio"
                    name="duration"
                    aria-label={`${minutes} minutes`}
                    value={minutes}
                    checked={duration === minutes}
                    onChange={() => setDuration(minutes)}
                  />
                  {minutes}
                  <span>min</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="field">
            <span>
              Project context <small>optional</small>
            </span>
            <select
              aria-label="Project context"
              disabled={stage === "oa"}
              value={
                artifactId
                  ? `artifact:${artifactId}`
                  : repositoryId
                    ? `repository:${repositoryId}`
                    : ""
              }
              onChange={(event) => {
                const [kind, id] = event.target.value.split(":");
                setRepositoryId(kind === "repository" ? id : "");
                setArtifactId(kind === "artifact" ? id : "");
              }}
            >
              <option value="">Role-specific exercises</option>
              {data.repositories.length > 0 && (
                <optgroup label="GitHub repositories">
                  {data.repositories.map((repository) => (
                    <option
                      value={`repository:${repository.id}`}
                      key={repository.id}
                    >
                      {repository.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {data.artifacts.length > 0 && (
                <optgroup label="Documents and models">
                  {data.artifacts.map((artifact) => (
                    <option key={artifact.id} value={`artifact:${artifact.id}`}>
                      {artifact.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <small>
              {stage === "oa" ? (
                "Attachments are disabled in timed online assessments."
              ) : (
                <>
                  Select one repository or document.{" "}
                  <Link to="/projects" className="text-link">
                    Add practice material
                  </Link>
                </>
              )}
            </small>
          </label>
          <div className="session-summary">
            <span className="summary-symbol">
              <MessageSquare size={20} />
            </span>
            <div>
              <strong>{providerNames[data.settings.provider]}</strong>
              <p>
                {data.settings.provider === "guided"
                  ? "Built-in questions, numeric checks, and code tests. No model required."
                  : `${data.settings.model || "Default model"} · test the connection in Settings.`}
              </p>
              <Link to="/settings" className="text-link">
                Change provider <ArrowRight size={13} />
              </Link>
            </div>
          </div>
          <div className="topic-chips">
            {selectedTrack?.topics.map((topic) => (
              <span key={topic}>{topic}</span>
            ))}
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          {projectContextMissing && (
            <Notice>
              Project defense needs a resume or attached material.{" "}
              <Link to="/profile" className="text-link">
                Add your resume
              </Link>{" "}
              or select a project above.
            </Notice>
          )}
          {selectedProvider?.available === false && (
            <Notice>
              The selected interviewer is unavailable.{" "}
              <Link to="/settings" className="text-link">
                Choose an available provider in settings.
              </Link>
            </Notice>
          )}
          <button
            className="button primary full-width"
            disabled={
              busy ||
              selectedProvider?.available === false ||
              projectContextMissing
            }
            type="submit"
          >
            {busy ? <Loader2 className="spin" size={18} /> : <Play size={17} />}
            {busy ? "Preparing your session…" : "Start practice"}
          </button>
          <p className="form-footnote">
            <Clock3 size={13} /> {duration} minutes · Answers saved as you go
          </p>
          {!launch && (
            <SebLauncher
              options={options}
              disabled={
                busy ||
                projectContextMissing ||
                selectedProvider?.available === false
              }
            />
          )}
        </aside>
      </form>
    </>
  );
}

function ProfilePage() {
  const { data, setData } = useApp();
  const [profile, setProfile] = useState<Profile>(data.profile);
  const [skills, setSkills] = useState(data.profile.skills.join(", "));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const field = (key: keyof Profile, value: string) => {
    setProfile((previous) => ({ ...previous, [key]: value }));
    setSuccess("");
  };
  async function upload(file?: File) {
    if (!file) return;
    setUploading(true);
    setError("");
    setSuccess("");
    const body = new FormData();
    body.append("file", file);
    try {
      const suggestion = await api<Profile>("/profile/resume", {
        method: "POST",
        body,
      });
      setProfile(suggestion);
      setSkills(suggestion.skills.join(", "));
      setReviewing(true);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await put<Profile>("/profile", {
        ...profile,
        skills: skills
          .split(",")
          .map((skill) => skill.trim())
          .filter(Boolean),
      });
      setData((data) => ({ ...data, profile: result }));
      setProfile(result);
      setReviewing(false);
      setSuccess("Profile saved. Your next session will use this context.");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading eyebrow="PROFILE" title="Resume and goals">
        Add the experience and projects you want to discuss.
      </PageHeading>
      <div className="profile-grid">
        <div className="panel resume-panel">
          <span className="empty-icon">
            <FileText size={31} />
          </span>
          <h2>Import a resume</h2>
          <p>
            Upload a file to suggest your profile details. You can edit the
            extracted text and decide what to save.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            id="resume-file"
            className="file-input"
            onChange={(event) => void upload(event.target.files?.[0])}
            disabled={uploading || busy}
          />
          <button
            type="button"
            className="button secondary"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || busy}
          >
            {uploading ? (
              <Loader2 className="spin" size={17} />
            ) : (
              <Plus size={17} />
            )}
            {uploading ? "Reading your resume…" : "Upload resume"}
          </button>
          <span className="form-footnote">PDF, DOCX, TXT or Markdown</span>
          <div className="resume-tip">
            <Lightbulb size={18} />
            <p>
              Describe what <strong>you</strong> built, measured, or decided.
              Include your role, key decisions, and results.
            </p>
          </div>
          <Link to="/projects" className="text-link">
            Add project material <ArrowRight size={15} />
          </Link>
        </div>
        <form className="panel profile-form" onSubmit={save}>
          <div className="section-heading">
            <h2>Your profile</h2>
            {reviewing && (
              <span className="badge status-active">
                Review suggested details
              </span>
            )}
          </div>
          {reviewing && (
            <Notice>
              The extracted details are a suggestion. Check the fields below,
              then save your profile to confirm them.
            </Notice>
          )}
          {error && <Notice tone="error">{error}</Notice>}
          {success && <Notice tone="success">{success}</Notice>}
          <div className="form-grid">
            <label className="field">
              <span>Name</span>
              <input
                autoComplete="name"
                value={profile.name}
                onChange={(event) => field("name", event.target.value)}
                placeholder="Your name"
              />
            </label>
            <label className="field">
              <span>
                Email <small>optional</small>
              </span>
              <input
                type="email"
                autoComplete="email"
                value={profile.email}
                onChange={(event) => field("email", event.target.value)}
                placeholder="you@example.com"
              />
            </label>
          </div>
          <label className="field">
            <span>Headline</span>
            <input
              value={profile.headline}
              onChange={(event) => field("headline", event.target.value)}
              placeholder="e.g. Final-year student · Software and quant development"
            />
          </label>
          <label className="field">
            <span>Skills</span>
            <input
              value={skills}
              onChange={(event) => {
                setSkills(event.target.value);
                setSuccess("");
              }}
              placeholder="Python, probability, React, financial modelling"
            />
            <small>Separate skills with commas.</small>
          </label>
          <label className="field">
            <span>What are you working towards?</span>
            <textarea
              rows={3}
              value={profile.goals}
              onChange={(event) => field("goals", event.target.value)}
              placeholder="Roles you are targeting and what you want to practise"
            />
          </label>
          <label className="field">
            <span>Resume text</span>
            <textarea
              rows={10}
              value={profile.resumeText}
              onChange={(event) => field("resumeText", event.target.value)}
              placeholder="Paste your resume here, or upload a file."
            />
          </label>
          <div className="form-actions">
            <span className="form-footnote">
              Only the details you save become your profile.
            </span>
            <button
              type="submit"
              className="button primary"
              disabled={busy || uploading}
            >
              {busy ? (
                <Loader2 size={17} className="spin" />
              ) : (
                <Check size={17} />
              )}
              {busy
                ? "Saving…"
                : reviewing
                  ? "Confirm and save profile"
                  : "Save profile"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function ProjectsPage() {
  const { data, setData } = useApp();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deleting, setDeleting] = useState<Repository | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [runningProject, setRunningProject] = useState("");
  const [uploadingArtifact, setUploadingArtifact] = useState(false);
  const [deletingArtifact, setDeletingArtifact] = useState<Artifact | null>(
    null,
  );
  const artifactFile = useRef<HTMLInputElement>(null);
  async function uploadArtifact(file?: File) {
    if (!file || uploadingArtifact) return;
    setError("");
    setSuccess("");
    if (file.size > 5 * 1024 * 1024) {
      setError("Document exceeds the 5 MB limit. Choose a smaller file.");
      if (artifactFile.current) artifactFile.current.value = "";
      return;
    }
    if (!/\.(pdf|docx|txt|md|ipynb|xlsx|csv)$/i.test(file.name)) {
      setError("Choose a PDF, DOCX, TXT, Markdown, IPYNB, XLSX, or CSV file.");
      if (artifactFile.current) artifactFile.current.value = "";
      return;
    }
    setUploadingArtifact(true);
    const body = new FormData();
    body.append("file", file);
    try {
      const artifact = await api<Artifact>("/artifacts", {
        method: "POST",
        body,
      });
      setData((data) => ({
        ...data,
        artifacts: [
          artifact,
          ...data.artifacts.filter((item) => item.id !== artifact.id),
        ],
      }));
      setSuccess(
        `${artifact.name} uploaded. Check the extracted text and import notes below.`,
      );
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setUploadingArtifact(false);
      if (artifactFile.current) artifactFile.current.value = "";
    }
  }
  async function deleteArtifact() {
    if (!deletingArtifact) return;
    setDeleteBusy(true);
    setError("");
    setSuccess("");
    try {
      await api(`/artifacts/${deletingArtifact.id}`, { method: "DELETE" });
      setData((data) => ({
        ...data,
        artifacts: data.artifacts.filter(
          (item) => item.id !== deletingArtifact.id,
        ),
      }));
      setDeletingArtifact(null);
    } catch (error) {
      setError(errorMessage(error));
      setDeletingArtifact(null);
    } finally {
      setDeleteBusy(false);
    }
  }
  async function runProjectTests(repository: Repository) {
    if (runningProject) return;
    setRunningProject(repository.id);
    setError("");
    setSuccess("");
    try {
      const result = await post<Repository>(
        `/repositories/${repository.id}/run-tests`,
      );
      setData((data) => ({
        ...data,
        repositories: data.repositories.map((item) =>
          item.id === result.id ? result : item,
        ),
      }));
      setSuccess(`${result.name}: ${result.executionStatus}`);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setRunningProject("");
    }
  }
  async function importProject(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await post<Repository>("/repositories", { url });
      setData((data) => ({
        ...data,
        repositories: [
          result,
          ...data.repositories.filter(
            (repository) => repository.id !== result.id,
          ),
        ],
      }));
      setUrl("");
      setSuccess(`${result.name} imported. View the source excerpts below.`);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function deleteProject() {
    if (!deleting) return;
    setDeleteBusy(true);
    setError("");
    try {
      await api(`/repositories/${deleting.id}`, { method: "DELETE" });
      setData((data) => ({
        ...data,
        repositories: data.repositories.filter(
          (repository) => repository.id !== deleting.id,
        ),
      }));
      setDeleting(null);
    } catch (error) {
      setError(errorMessage(error));
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  }
  return (
    <>
      <PageHeading eyebrow="MATERIAL" title="Projects and documents">
        Bring repositories, research, notebooks, and financial models into your
        preparation.
      </PageHeading>
      <form className="panel import-panel" onSubmit={importProject}>
        <span className="track-icon">
          <FolderGit2 size={25} />
        </span>
        <div>
          <h2>Add a GitHub repository</h2>
          <p>
            Import source files to discuss implementation and design decisions.
          </p>
          <div className="import-controls">
            <label className="sr-only" htmlFor="github-url">
              Public GitHub repository URL
            </label>
            <input
              id="github-url"
              type="url"
              required
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://github.com/username/repository"
              disabled={busy || uploadingArtifact}
            />
            <button
              type="submit"
              className="button primary"
              disabled={busy || uploadingArtifact}
            >
              {busy ? (
                <Loader2 className="spin" size={17} />
              ) : (
                <Plus size={17} />
              )}
              {busy ? "Importing…" : "Import project"}
            </button>
          </div>
          <small className="form-footnote">
            Public HTTPS GitHub URLs only. Imports may take up to 30 seconds.
          </small>
        </div>
      </form>
      <section className="panel import-panel artifact-upload-panel">
        <span className="track-icon">
          <FileText size={25} />
        </span>
        <div>
          <h2>Upload a document or model</h2>
          <p>
            Inspect research text, notebook source, or model sheets for project
            discussions.
          </p>
          <input
            ref={artifactFile}
            id="artifact-file"
            aria-label="Upload project document"
            className="file-input"
            type="file"
            accept=".pdf,.docx,.txt,.md,.ipynb,.xlsx,.csv"
            disabled={uploadingArtifact || busy}
            onChange={(event) => void uploadArtifact(event.target.files?.[0])}
          />
          <button
            type="button"
            className="button secondary artifact-upload-button"
            disabled={uploadingArtifact || busy}
            onClick={() => artifactFile.current?.click()}
          >
            {uploadingArtifact ? (
              <Loader2 size={17} className="spin" />
            ) : (
              <Plus size={17} />
            )}
            {uploadingArtifact ? "Reading document…" : "Upload document"}
          </button>
          <small className="form-footnote">
            PDF, DOCX, TXT, Markdown, IPYNB, XLSX or CSV · Up to 5 MB
          </small>
          <p className="artifact-upload-note">
            Source is inspected only. Notebooks are not run, and financial model
            formulas are shown with cached values without recalculation.
          </p>
        </div>
      </section>
      {error && <Notice tone="error">{error}</Notice>}
      {success && <Notice tone="success">{success}</Notice>}
      <section className="section">
        <div className="section-heading">
          <h2>
            Repositories{" "}
            <span className="count-label">{data.repositories.length}</span>
          </h2>
        </div>
        {data.repositories.length ? (
          <div className="repository-grid">
            {data.repositories.map((repository) => (
              <article key={repository.id} className="panel repository-card">
                <div className="repository-heading">
                  <span className="track-icon">
                    <FolderGit2 size={23} />
                  </span>
                  <button
                    className="icon-button"
                    aria-label={`Delete ${repository.name}`}
                    disabled={!!runningProject}
                    onClick={() => setDeleting(repository)}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
                <h3>
                  <a href={repository.url} target="_blank" rel="noreferrer">
                    {repository.name} <ArrowUpRight size={15} />
                  </a>
                </h3>
                <p>{repository.summary}</p>
                <div className="topic-chips">
                  {repository.languages.map((language) => (
                    <span key={language}>{language}</span>
                  ))}
                </div>
                <dl className="repository-meta">
                  <div>
                    <dt>Source files</dt>
                    <dd>{repository.files.length}</dd>
                  </div>
                  <div>
                    <dt>Commit</dt>
                    <dd>
                      <code>{repository.commit.slice(0, 8)}</code>
                    </dd>
                  </div>
                </dl>
                <div className="execution-status">
                  <Terminal size={15} />
                  <span>{repository.executionStatus}</span>
                </div>
                <button
                  className="button secondary small project-run-button"
                  disabled={!!runningProject}
                  onClick={() => void runProjectTests(repository)}
                >
                  {runningProject === repository.id ? (
                    <Loader2 className="spin" size={14} />
                  ) : (
                    <Play size={14} />
                  )}
                  {runningProject === repository.id
                    ? "Running project tests…"
                    : "Run project tests"}
                </button>
                <p className="project-run-help">
                  Supports dependency-free Python unittest and Node node:test.
                  Unsupported projects return an explanation.
                </p>
                <details className="evidence-details">
                  <summary>
                    View source excerpts <ChevronRight size={15} />
                  </summary>
                  {repository.evidence.length ? (
                    repository.evidence.map((evidence, index) => (
                      <div key={`${evidence.path}-${index}`}>
                        <strong>{evidence.path}</strong>
                        <pre>{evidence.excerpt}</pre>
                      </div>
                    ))
                  ) : (
                    <p>No source excerpts were returned.</p>
                  )}
                  <details>
                    <summary>Imported file list</summary>
                    <ul>
                      {repository.files.map((file) => (
                        <li key={file.path}>
                          <code>{file.path}</code>{" "}
                          <span>{file.bytes.toLocaleString()} bytes</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </details>
                <Link
                  to={`/practice?repository=${repository.id}`}
                  className="text-link"
                >
                  Use in a practice session <ArrowRight size={15} />
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <Empty icon={FolderGit2} title="No repositories yet">
            Import a public repository, then select it when you start a session.
          </Empty>
        )}
      </section>
      <section className="section artifact-shelf">
        <div className="section-heading">
          <h2>
            Documents{" "}
            <span className="count-label">{data.artifacts.length}</span>
          </h2>
        </div>
        {data.artifacts.length ? (
          <div className="repository-grid">
            {data.artifacts.map((artifact) => (
              <article
                className="panel repository-card artifact-card"
                key={artifact.id}
              >
                <div className="repository-heading">
                  <span className="track-icon">
                    <FileText size={23} />
                  </span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Delete document ${artifact.name}`}
                    onClick={() => setDeletingArtifact(artifact)}
                    disabled={deleteBusy}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
                <h3>{artifact.name}</h3>
                <div className="artifact-kind">
                  <span className="badge">
                    {artifact.kind.replaceAll("-", " ")}
                  </span>
                  <span>{dateLabel(artifact.createdAt)}</span>
                </div>
                <p>{artifact.summary}</p>
                <div className="artifact-filename">
                  <FileText size={14} />
                  <span>{artifact.filename}</span>
                </div>
                {artifact.notes.length > 0 && (
                  <div className="artifact-notes">
                    <h4>Inspection notes</h4>
                    <ul>
                      {artifact.notes.map((note, index) => (
                        <li key={index}>{note}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <details className="evidence-details">
                  <summary>
                    View document excerpts <ChevronRight size={15} />
                  </summary>
                  {artifact.evidence.length ? (
                    artifact.evidence.map((item, index) => (
                      <div key={`${item.path}-${index}`}>
                        <strong>{item.path}</strong>
                        <pre>{item.excerpt}</pre>
                      </div>
                    ))
                  ) : (
                    <p>No source excerpts were returned.</p>
                  )}
                </details>
                <Link
                  to={`/practice?artifact=${artifact.id}`}
                  className="text-link"
                >
                  Use in a practice session <ArrowRight size={15} />
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <Empty icon={FileText} title="No documents yet">
            Upload a research document, notebook, or financial model to review
            its source and discuss your contribution.
          </Empty>
        )}
      </section>
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          confirmLabel="Delete project"
          busy={deleteBusy}
          onClose={() => setDeleting(null)}
          onConfirm={() => void deleteProject()}
        >
          This removes the imported repository from your workspace. The source
          on GitHub is unaffected.
        </ConfirmDialog>
      )}
      {deletingArtifact && (
        <ConfirmDialog
          title={`Delete ${deletingArtifact.name}?`}
          confirmLabel="Delete document"
          busy={deleteBusy}
          onClose={() => setDeletingArtifact(null)}
          onConfirm={() => void deleteArtifact()}
        >
          This removes the imported document. Existing session questions retain
          cited excerpts until those sessions are deleted. Finish any active
          interview using this document before deleting it.
        </ConfirmDialog>
      )}
    </>
  );
}

function SettingsPage() {
  const { data, setData, refresh } = useApp();
  const [settings, setSettings] = useState<Settings>(data.settings);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const changed = JSON.stringify(settings) !== JSON.stringify(data.settings);
  const capability = data.capabilities.providers.find(
    (provider) => provider.id === settings.provider,
  );
  function update(next: Settings) {
    setSettings(next);
    setSuccess("");
    setTestResult(null);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await put<Settings>("/settings", settings);
      setData((data) => ({ ...data, settings: result }));
      setSettings(result);
      setSuccess(
        "Interviewer settings saved. New sessions will use this provider.",
      );
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function test() {
    setTesting(true);
    setError("");
    setTestResult(null);
    try {
      setTestResult(await post("/settings/test"));
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setTesting(false);
    }
  }
  async function exportData() {
    setExporting(true);
    setError("");
    try {
      await download(
        "/export",
        `sparr-workspace-${new Date().toISOString().slice(0, 10)}.json`,
      );
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setExporting(false);
    }
  }
  async function deleteData() {
    setDeleteBusy(true);
    setError("");
    try {
      await api("/data", { method: "DELETE" });
      setData((data) => ({
        ...data,
        artifacts: [],
        repositories: [],
        sessions: [],
        profile: {
          name: "",
          email: "",
          headline: "",
          resumeText: "",
          skills: [],
          goals: "",
        },
      }));
      try {
        for (let index = localStorage.length - 1; index >= 0; index--) {
          const key = localStorage.key(index);
          if (key?.startsWith("sparr-draft-")) localStorage.removeItem(key);
        }
      } catch {
        /* Browser storage may be disabled. */
      }
      await refresh();
      setConfirmDelete(false);
      setSuccess("Your profile, projects, and sessions have been deleted.");
    } catch (error) {
      setError(errorMessage(error));
      setConfirmDelete(false);
    } finally {
      setDeleteBusy(false);
    }
  }
  return (
    <>
      <PageHeading eyebrow="CONFIGURATION" title="Settings">
        Configure feedback, check devices, and manage saved data.
      </PageHeading>
      <div className="settings-grid">
        <form className="panel settings-form" onSubmit={save}>
          <div className="section-heading">
            <div>
              <h2>Interview provider</h2>
              <p>Guided practice works immediately, without a key.</p>
            </div>
            <MessageSquare size={24} />
          </div>
          <fieldset className="plain-fieldset provider-options">
            <legend className="sr-only">Select interview provider</legend>
            {(Object.keys(providerNames) as Settings["provider"][]).map(
              (provider) => (
                <label
                  key={provider}
                  className={`provider-option ${settings.provider === provider ? "selected" : ""} ${data.capabilities.providers.find((item) => item.id === provider)?.available === false ? "unavailable" : ""}`}
                >
                  <input
                    type="radio"
                    name="provider"
                    aria-label={providerNames[provider]}
                    disabled={
                      data.capabilities.providers.find(
                        (item) => item.id === provider,
                      )?.available === false
                    }
                    checked={settings.provider === provider}
                    onChange={() => update({ ...settings, provider })}
                  />
                  <span>
                    <strong>{providerNames[provider]}</strong>
                    <small>
                      {provider === "guided"
                        ? "Offline questions, numeric checks, and code tests"
                        : provider === "ollama"
                          ? "A model running through your local Ollama service"
                          : ["codex", "claude"].includes(provider)
                            ? "Your installed and authenticated CLI"
                            : "A provider with an OpenAI-compatible API"}
                    </small>
                    {data.capabilities.providers.find(
                      (item) => item.id === provider,
                    )?.available === false && (
                      <small className="provider-unavailable">
                        Unavailable ·{" "}
                        {data.capabilities.providers.find(
                          (item) => item.id === provider,
                        )?.reason || "Not configured on this machine."}
                      </small>
                    )}
                  </span>
                  <span className="radio-indicator">
                    {settings.provider === provider && <Check size={12} />}
                  </span>
                </label>
              ),
            )}
          </fieldset>
          {settings.provider !== "guided" && (
            <>
              <label className="field">
                <span>Model</span>
                <input
                  value={settings.model}
                  onChange={(event) =>
                    update({ ...settings, model: event.target.value })
                  }
                  placeholder={
                    settings.provider === "ollama"
                      ? "e.g. llama3.2"
                      : settings.provider === "claude"
                        ? "Leave blank for the CLI default"
                        : "Model identifier"
                  }
                />
              </label>
              {!["codex", "claude"].includes(settings.provider) && (
                <label className="field">
                  <span>API base URL</span>
                  <input
                    type="url"
                    value={settings.baseUrl}
                    onChange={(event) =>
                      update({ ...settings, baseUrl: event.target.value })
                    }
                    placeholder={
                      settings.provider === "ollama"
                        ? "http://127.0.0.1:11434"
                        : "https://api.example.com/v1"
                    }
                  />
                </label>
              )}
              <p className="field-help">
                {["codex", "claude"].includes(settings.provider)
                  ? `Install and authenticate ${providerNames[settings.provider]} on the machine running Sparr. Availability is shown above.`
                  : settings.provider === "ollama"
                    ? "Start Ollama and download your selected model on the machine running Sparr."
                    : "Configure credentials on the server using environment variables. API keys are never entered or returned in this browser."}
              </p>
            </>
          )}
          {capability?.reason && <Notice>{capability.reason}</Notice>}
          {settings.provider === "guided" && (
            <Notice>
              Guided mode checks numeric answers and code tests. It does not
              assess open-ended explanations.
            </Notice>
          )}
          {error && <Notice tone="error">{error}</Notice>}
          {success && <Notice tone="success">{success}</Notice>}
          {testResult && (
            <Notice tone={testResult.ok ? "success" : "error"}>
              {testResult.message}
            </Notice>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="button secondary"
              disabled={
                testing || busy || changed || capability?.available === false
              }
              onClick={() => void test()}
            >
              {testing ? (
                <Loader2 className="spin" size={17} />
              ) : (
                <Radio size={17} />
              )}
              {testing ? "Testing…" : "Test connection"}
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={busy || testing || capability?.available === false}
            >
              {busy ? (
                <Loader2 className="spin" size={17} />
              ) : (
                <Check size={17} />
              )}
              {busy ? "Saving…" : "Save settings"}
            </button>
          </div>
          {changed && (
            <p className="form-footnote">
              Save your changes before testing the connection.
            </p>
          )}
        </form>
        <aside>
          <section className="panel capability-panel">
            <span className="track-icon">
              <Shield size={23} />
            </span>
            <h2>Workspace capabilities</h2>
            <dl>
              <div>
                <dt>Platform</dt>
                <dd>{data.capabilities.platform}</dd>
              </div>
              <div>
                <dt>Code runner</dt>
                <dd>
                  {data.capabilities.runner.available
                    ? "Available"
                    : "Unavailable"}
                </dd>
              </div>
              <div>
                <dt>Native companion</dt>
                <dd>
                  {data.capabilities.native.available
                    ? "Available"
                    : "Unavailable"}
                </dd>
              </div>
              <div>
                <dt>Strict interview</dt>
                <dd>
                  {data.capabilities.strict.available
                    ? "Preflight available"
                    : "Build guardian first"}
                </dd>
              </div>
              {data.capabilities.native.displays !== undefined && (
                <div>
                  <dt>Native observed displays</dt>
                  <dd>{data.capabilities.native.displays}</dd>
                </div>
              )}
              {data.capabilities.native.cameras !== undefined && (
                <div>
                  <dt>Native observed cameras</dt>
                  <dd>{data.capabilities.native.cameras}</dd>
                </div>
              )}
            </dl>
            <p className="field-help">
              {data.capabilities.runner.name}
              {data.capabilities.runner.reason
                ? ` · ${data.capabilities.runner.reason}`
                : ""}
            </p>
            <ul className="capability-notes">
              {[
                ...data.capabilities.strict.reasons,
                ...data.capabilities.native.notes,
              ].map((reason, index) => (
                <li key={index}>{reason}</li>
              ))}
            </ul>
          </section>
          <DeviceCheck />
          <section className="panel data-panel">
            <h2>Saved data</h2>
            <p>
              Export your profile, repositories, documents, and sessions as
              JSON. Provider credentials are excluded.
            </p>
            <button
              className="button secondary full-width"
              onClick={() => void exportData()}
              disabled={exporting}
            >
              {exporting ? (
                <Loader2 className="spin" size={17} />
              ) : (
                <ArrowDownToLine size={17} />
              )}
              Export workspace
            </button>
            <div className="danger-zone">
              <h3>Clear this workspace</h3>
              <p>
                Permanently remove your saved profile, repositories, documents,
                and sessions.
              </p>
              <button
                className="button danger-outline"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={16} />
                Delete all data
              </button>
            </div>
          </section>
        </aside>
      </div>
      {confirmDelete && (
        <ConfirmDialog
          title="Delete all workspace data?"
          confirmLabel="Delete all data"
          busy={deleteBusy}
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => void deleteData()}
        >
          This permanently removes your profile, imported repositories, uploaded
          documents, sessions, reports, and saved browser drafts. Export your
          workspace first if you want a copy.
        </ConfirmDialog>
      )}
    </>
  );
}

function DeviceCheck() {
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [level, setLevel] = useState(0);
  const [stopped, setStopped] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const frame = useRef(0);
  const mounted = useRef(true);
  const pending = useRef(false);
  function release() {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    cancelAnimationFrame(frame.current);
    if (audio.current) void audio.current.close().catch(() => {});
    audio.current = null;
    if (video.current) video.current.srcObject = null;
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      release();
    };
  }, []);
  function stop() {
    release();
    setRunning(false);
    setLevel(0);
    setStopped(true);
  }
  async function start() {
    if (pending.current) return;
    pending.current = true;
    setStarting(true);
    setError("");
    setStopped(false);
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Device access is unavailable. Open Sparr on localhost in a browser that supports camera and microphone access.",
        );
      const result = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      if (!mounted.current) {
        result.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = result;
      setRunning(true);
      if (video.current) {
        video.current.srcObject = result;
        void video.current.play().catch(() => {});
      }
      if (typeof AudioContext !== "undefined") {
        try {
          const context = new AudioContext();
          audio.current = context;
          const analyser = context.createAnalyser();
          analyser.fftSize = 256;
          context.createMediaStreamSource(result).connect(analyser);
          const samples = new Uint8Array(analyser.fftSize);
          const measure = () => {
            if (!mounted.current || !stream.current) return;
            analyser.getByteTimeDomainData(samples);
            const rms = Math.sqrt(
              samples.reduce(
                (sum, sample) => sum + ((sample - 128) / 128) ** 2,
                0,
              ) / samples.length,
            );
            setLevel(Math.min(100, Math.round(rms * 350)));
            frame.current = requestAnimationFrame(measure);
          };
          measure();
        } catch {
          setError(
            "The video preview is available, but this browser could not start the microphone level meter.",
          );
        }
      }
    } catch (error) {
      release();
      if (mounted.current)
        setError(
          error instanceof DOMException && error.name === "NotAllowedError"
            ? "Camera or microphone permission was denied. Allow access in your browser’s site settings, then try again."
            : error instanceof DOMException && error.name === "NotFoundError"
              ? "No camera or microphone was found. Connect both devices, then try again."
              : error instanceof DOMException &&
                  error.name === "NotReadableError"
                ? "Your camera or microphone is busy. Close other apps using it, then try again."
                : errorMessage(error),
        );
    } finally {
      pending.current = false;
      if (mounted.current) setStarting(false);
    }
  }
  return (
    <section className="panel device-panel">
      <div className="inline-title">
        <Camera size={20} />
        <h2>Device check</h2>
      </div>
      <p>
        Check your camera preview and microphone level. This check does not
        record, store, or send media, and does not verify proctoring.
      </p>
      <video
        ref={video}
        autoPlay
        playsInline
        muted
        className={running ? "device-preview" : "device-preview hidden"}
        aria-label="Live camera preview"
      />
      {running && (
        <>
          <div className="microphone-label">
            <Mic size={14} />
            <span>Microphone level</span>
          </div>
          <div
            role="meter"
            aria-label="Microphone input level"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={level}
            className="audio-meter"
          >
            <span style={{ width: `${level}%` }} />
          </div>
          <p className="device-active" role="status">
            Camera and microphone active · Preview only
          </p>
        </>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {stopped && (
        <p className="device-stopped" role="status">
          Camera and microphone released.
        </p>
      )}
      {running ? (
        <button className="button secondary full-width" onClick={stop}>
          <X size={16} />
          Stop device check
        </button>
      ) : (
        <button
          className="button secondary full-width"
          onClick={() => void start()}
          disabled={starting}
        >
          {starting ? (
            <Loader2 className="spin" size={16} />
          ) : (
            <Camera size={16} />
          )}
          {starting ? "Requesting access…" : "Start device check"}
        </button>
      )}
      <span className="form-footnote">
        Device access stops when you leave this page.
      </span>
    </section>
  );
}

function HistoryPage() {
  const { data, setData } = useApp();
  const [filter, setFilter] = useState("all");
  const [deleting, setDeleting] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sessions = [...data.sessions]
    .filter((session) => filter === "all" || session.status === filter)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setError("");
    try {
      await api(`/sessions/${deleting.id}`, { method: "DELETE" });
      try {
        localStorage.removeItem(`sparr-draft-${deleting.id}`);
      } catch {}
      setData((data) => ({
        ...data,
        sessions: data.sessions.filter((session) => session.id !== deleting.id),
      }));
      setDeleting(null);
    } catch (error) {
      setError(errorMessage(error));
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="HISTORY"
        title="Session history"
        action={
          <Link className="button primary" to="/practice">
            <Plus size={17} />
            New practice
          </Link>
        }
      >
        Open saved interviews, feedback, and reports.
      </PageHeading>
      <div className="history-toolbar">
        <div className="segmented" role="group" aria-label="Filter sessions">
          {[
            { id: "all", label: "All sessions" },
            { id: "active", label: "In progress" },
            { id: "completed", label: "Completed" },
            { id: "terminated", label: "Terminated" },
          ].map((item) => (
            <button
              key={item.id}
              aria-pressed={filter === item.id}
              className={filter === item.id ? "selected" : ""}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="muted">
          {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
        </span>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {sessions.length ? (
        <div className="session-list">
          {sessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              onDelete={() => setDeleting(session)}
            />
          ))}
        </div>
      ) : (
        <Empty
          icon={History}
          title={
            data.sessions.length
              ? "No sessions in this view."
              : "No sessions yet"
          }
          action={
            <Link className="button primary" to="/practice">
              Start practice <ArrowRight size={17} />
            </Link>
          }
        >
          {data.sessions.length
            ? "Choose another filter to see your saved work."
            : "Start an interview to save your answers and feedback here."}
        </Empty>
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete this session?"
          confirmLabel="Delete session"
          busy={busy}
          onClose={() => setDeleting(null)}
          onConfirm={() => void remove()}
        >
          This permanently removes this session, its saved draft, answers, and
          report.
        </ConfirmDialog>
      )}
    </>
  );
}

function SessionPage() {
  const { id } = useParams();
  const [view, setView] = useState<SessionView | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      setView(await api<SessionView>(`/sessions/${id}`));
    } catch (error) {
      setError(errorMessage(error));
    }
  }, [id]);
  useEffect(() => {
    let active = true;
    setView(null);
    setError("");
    void api<SessionView>(`/sessions/${id}`)
      .then((result) => {
        if (active) setView(result);
      })
      .catch((error) => {
        if (active) setError(errorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [id]);
  if (!view)
    return error ? (
      <>
        <Notice tone="error">{error}</Notice>
        <button className="button secondary" onClick={() => void load()}>
          <RefreshCw size={17} />
          Try again
        </button>
        <Link to="/history" className="text-link">
          Go to session history <ArrowRight size={16} />
        </Link>
      </>
    ) : (
      <Busy label="Opening interview…" />
    );
  if (view.session.status !== "active")
    return <Navigate to={`/sessions/${view.session.id}/report`} replace />;
  return <InterviewDesk key={view.session.id} initialView={view} />;
}

type Draft = Session["draft"];
function initialDraft(view: SessionView): { draft: Draft; restored: boolean } {
  const serverDraft = {
    ...view.session.draft,
    code:
      view.session.draft.code ||
      view.question.starterCode?.[view.session.draft.language] ||
      "",
  };
  try {
    const local = JSON.parse(
      localStorage.getItem(`sparr-draft-${view.session.id}`) || "null",
    );
    if (
      local?.questionId === view.question.id &&
      typeof local.draft?.answer === "string" &&
      typeof local.draft?.code === "string" &&
      ["python", "javascript"].includes(local.draft?.language)
    )
      return { draft: local.draft, restored: true };
  } catch {
    /* Browser storage may be disabled. Server drafts still work. */
  }
  return { draft: serverDraft, restored: false };
}

function StrictPage() {
  const { launchId } = useParams();
  return (
    <StrictInterview
      id={launchId!}
      render={(view, onFinished) => (
        <InterviewDesk
          key={view.session.id}
          initialView={view}
          onFinished={onFinished}
        />
      )}
    />
  );
}
function InterviewDesk({
  initialView,
  onFinished,
}: {
  initialView: SessionView;
  onFinished?: () => void;
}) {
  const { data, refresh } = useApp();
  const navigate = useNavigate();
  const [view, setView] = useState(initialView);
  const [initial] = useState(() => initialDraft(initialView));
  const [draft, setDraft] = useState<Draft>(initial.draft);
  const [saveState, setSaveState] = useState<
    "saved" | "saving" | "pending" | "error"
  >(initial.restored ? "pending" : "saved");
  const [restored, setRestored] = useState(initial.restored);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [run, setRun] = useState<RunResult | null>(null);
  const [remaining, setRemaining] = useState(initialView.remainingSeconds);
  const [showFinish, setShowFinish] = useState(false);
  const [showLanguage, setShowLanguage] = useState<Language | null>(null);
  const draftRef = useRef(draft);
  const viewRef = useRef(view);
  const revision = useRef(0);
  const savedRevision = useRef(-1);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const actionLock = useRef(false);
  const submission = useRef<{ signature: string; requestId: string } | null>(
    null,
  );
  const conversationRef = useRef<HTMLDivElement>(null);
  const track = data.tracks.find((item) => item.id === view.session.track);
  const coding = view.question.kind === "coding";
  const assessment = view.session.assessments.find(
    (item) => item.questionId === view.question.id,
  );
  const storageKey = `sparr-draft-${view.session.id}`;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timeout.current) clearTimeout(timeout.current);
      void flushDraft().catch(() => {});
    };
  }, []);
  useEffect(() => {
    const deadline = Date.now() + view.remainingSeconds * 1000;
    setRemaining(view.remainingSeconds);
    const interval = window.setInterval(
      () =>
        setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))),
      1000,
    );
    return () => clearInterval(interval);
  }, [
    view.remainingSeconds,
    view.session.questionIndex,
    view.session.messages.length,
  ]);
  useEffect(() => {
    conversationRef.current?.scrollTo({
      top: conversationRef.current.scrollHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }, [view.session.messages.length]);
  function remember(next: Draft) {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          questionId: viewRef.current.question.id,
          draft: next,
        }),
      );
    } catch {
      /* Server autosave remains available. */
    }
  }
  function changeDraft(next: Draft) {
    draftRef.current = next;
    setDraft(next);
    revision.current++;
    setRestored(false);
    setSaveState("pending");
    remember(next);
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => {
      void flushDraft().catch(() => {});
    }, 650);
  }
  function flushDraft(): Promise<void> {
    if (timeout.current) {
      clearTimeout(timeout.current);
      timeout.current = null;
    }
    const snapshot = { ...draftRef.current };
    const snapshotRevision = revision.current;
    const questionId = viewRef.current.question.id;
    if (savedRevision.current === snapshotRevision) return saveQueue.current;
    const operation = saveQueue.current
      .catch(() => {})
      .then(async () => {
        if (
          viewRef.current.question.id !== questionId ||
          viewRef.current.session.status !== "active"
        )
          return;
        if (mounted.current) setSaveState("saving");
        await put(`/sessions/${initialView.session.id}/draft`, snapshot);
        savedRevision.current = snapshotRevision;
        if (mounted.current && revision.current === snapshotRevision)
          setSaveState("saved");
      });
    saveQueue.current = operation;
    return operation.catch((error) => {
      if (mounted.current) {
        setSaveState("error");
        setError(
          `Draft could not be saved: ${errorMessage(error)} Your work is kept in this browser when storage is available. Retry before leaving.`,
        );
      }
      throw error;
    });
  }
  useEffect(() => {
    if (initial.restored) {
      void flushDraft().catch(() => {});
    }
  }, []);
  useEffect(() => {
    if (remaining !== 0 || busy || actionLock.current) return;
    let active = true;
    void api<SessionView>(`/sessions/${initialView.session.id}`)
      .then((result) => {
        if (active) accept(result);
      })
      .catch((error) => {
        if (active)
          setError(
            `Could not refresh the ended session: ${errorMessage(error)}`,
          );
      });
    return () => {
      active = false;
    };
  }, [remaining, busy, initialView.session.id]);
  function accept(result: SessionView) {
    const newQuestion = result.question.id !== viewRef.current.question.id;
    viewRef.current = result;
    setView(result);
    if (newQuestion) {
      const next = {
        ...result.session.draft,
        code:
          result.session.draft.code ||
          result.question.starterCode?.[result.session.draft.language] ||
          "",
      };
      draftRef.current = next;
      setDraft(next);
      revision.current++;
      savedRevision.current = revision.current;
      setSaveState("saved");
      setRun(null);
      setRestored(false);
      submission.current = null;
      try {
        localStorage.removeItem(storageKey);
      } catch {}
    }
    if (result.session.status !== "active") {
      if (savedRevision.current === revision.current) {
        try {
          localStorage.removeItem(storageKey);
        } catch {}
      }
      void refresh().catch(() => {});
      if (onFinished) onFinished();
      else navigate(`/sessions/${result.session.id}/report`, { replace: true });
    }
  }
  async function act(
    action: "answer" | "followup" | "hint" | "next" | "finish",
  ) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(action);
    setError("");
    try {
      if (action !== "finish" || remaining > 0) await flushDraft();
      let body: unknown = {};
      if (action === "answer" || action === "followup") {
        const signature = JSON.stringify({
          action,
          questionId: viewRef.current.question.id,
          ...draftRef.current,
        });
        if (!submission.current || submission.current.signature !== signature)
          submission.current = { signature, requestId: crypto.randomUUID() };
        body = { ...draftRef.current, requestId: submission.current.requestId };
      }
      const result = await post<SessionView>(
        `/sessions/${view.session.id}/${action}`,
        body,
      );
      accept(result);
      setShowFinish(false);
      void refresh().catch(() => {});
    } catch (error) {
      setError(errorMessage(error));
      if (error instanceof ApiError && error.status === 409) {
        try {
          const fresh = await api<SessionView>(`/sessions/${view.session.id}`);
          if (fresh.session.status !== "active") accept(fresh);
        } catch {}
      }
    } finally {
      actionLock.current = false;
      setBusy("");
    }
  }
  async function runCode() {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy("run");
    setError("");
    try {
      await flushDraft();
      setRun(
        await post<RunResult>(`/sessions/${view.session.id}/run`, {
          code: draftRef.current.code,
          language: draftRef.current.language,
        }),
      );
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      actionLock.current = false;
      setBusy("");
    }
  }
  function changeLanguage(language: Language) {
    changeDraft({
      ...draftRef.current,
      language,
      code: view.question.starterCode?.[language] || "",
    });
    setRun(null);
    setShowLanguage(null);
  }
  const saveLabel =
    saveState === "saved"
      ? "Draft saved"
      : saveState === "saving"
        ? "Saving draft…"
        : saveState === "pending"
          ? "Unsaved changes"
          : "Save failed";
  return (
    <div className="interview-page">
      <div className="interview-header">
        <div>
          {view.session.mode !== "strict" && (
            <Link to="/history" className="text-link">
              <ArrowLeft size={15} /> Your sessions
            </Link>
          )}
          <h1>
            {track?.shortName || "Interview"}
            <span className="badge status-active">
              {view.session.stage === "oa"
                ? "Timed OA"
                : view.session.stage === "behavioral"
                  ? "Behavioral"
                  : view.session.stage === "project"
                    ? "Project defense"
                    : "Practice"}
            </span>
          </h1>
          <span className="muted">
            {view.session.difficulty} <span className="bullet">·</span>{" "}
            {providerNames[view.session.provider]}
            {view.session.company && (
              <>
                <span className="bullet">·</span>
                {view.session.company}
              </>
            )}
          </span>
        </div>
        <div className="interview-header-actions">
          <div
            className={`timer ${remaining < 120 ? "timer-low" : ""}`}
            aria-label={`${Math.floor(remaining / 60)} minutes ${remaining % 60} seconds remaining`}
          >
            <Clock3 size={18} />
            <span>
              {Math.floor(remaining / 60)
                .toString()
                .padStart(2, "0")}
              :{(remaining % 60).toString().padStart(2, "0")}
            </span>
          </div>
          <button
            className="button secondary"
            disabled={!!busy}
            onClick={() => setShowFinish(true)}
          >
            Finish session
          </button>
        </div>
      </div>
      {view.providerNotice && <Notice>{view.providerNotice}</Notice>}
      {view.session.stage === "oa" && (
        <Notice>
          Timed online assessment · Hints are disabled for this stage.
        </Notice>
      )}
      {(view.session.company || view.session.jobDescription) && (
        <details className="panel session-targeting">
          <summary>
            Session context <ChevronRight size={15} />
          </summary>
          {view.session.company && (
            <p>
              <strong>Company:</strong> {view.session.company}
            </p>
          )}
          {view.session.jobDescription && (
            <p className="job-description-context">
              {view.session.jobDescription}
            </p>
          )}
          <p className="field-help">
            Candidate-supplied context. These are practice exercises, not
            authentic company questions.
          </p>
        </details>
      )}
      {restored && (
        <Notice tone="success">
          Your draft was restored from this browser. You can continue where you
          left off.
        </Notice>
      )}
      {remaining === 0 && (
        <Notice>
          Your session time has ended. Finish the session to preserve your work
          and review available feedback.
        </Notice>
      )}
      {error && (
        <Notice tone="error">
          {error}
          {saveState === "error" && (
            <button
              className="inline-button"
              onClick={() =>
                void flushDraft()
                  .then(() => setError(""))
                  .catch(() => {})
              }
            >
              Retry save
            </button>
          )}
        </Notice>
      )}
      <div className="interview-grid">
        <section className="question-panel panel">
          <div className="question-heading">
            <span className="eyebrow">
              QUESTION {view.session.questionIndex + 1} OF{" "}
              {view.session.questionIds.length}
            </span>
            <span className="badge">{view.question.kind}</span>
          </div>
          <h2>{view.question.title}</h2>
          <div className="topic-chips">
            {view.question.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          <div className="question-prompt">{view.question.prompt}</div>
          {view.question.source && (
            <div className="source-reference">
              <FolderGit2 size={15} />
              Project evidence: <code>{view.question.source.path}</code>
            </div>
          )}
          {view.question.examples?.length ? (
            <div className="examples">
              <h3>Examples</h3>
              {view.question.examples.map((example, index) => (
                <div className="example" key={index}>
                  <span>Input</span>
                  <code>{JSON.stringify(example.input)}</code>
                  <span>Output</span>
                  <code>{JSON.stringify(example.output)}</code>
                </div>
              ))}
            </div>
          ) : null}
          <div className="answer-area">
            <div className="section-heading">
              <h3>{coding ? "Explain your approach" : "Your answer"}</h3>
              <span className={`save-status save-${saveState}`} role="status">
                {saveState === "saving" ? (
                  <Loader2 size={13} className="spin" />
                ) : saveState === "saved" ? (
                  <Check size={13} />
                ) : null}
                {saveLabel}
              </span>
            </div>
            <label htmlFor="interview-answer" className="sr-only">
              {coding ? "Explain your approach" : "Your answer"}
            </label>
            <textarea
              id="interview-answer"
              maxLength={30000}
              rows={coding ? 4 : 9}
              value={draft.answer}
              onChange={(event) =>
                changeDraft({ ...draftRef.current, answer: event.target.value })
              }
              disabled={!!busy || remaining === 0}
              placeholder={
                view.question.kind === "numeric"
                  ? "Enter a numeric answer, then explain your reasoning."
                  : coding
                    ? "Describe the idea, your assumptions, and the trade-offs."
                    : "Make your reasoning visible. Use examples where they help."
              }
            />
            {coding && (
              <div className="code-editor">
                <div className="code-toolbar">
                  <span>
                    <Code2 size={16} />
                    solution.{draft.language === "python" ? "py" : "js"}
                  </span>
                  <label className="sr-only" htmlFor="code-language">
                    Code language
                  </label>
                  <select
                    id="code-language"
                    aria-label="Code language"
                    value={draft.language}
                    disabled={!!busy || remaining === 0}
                    onChange={(event) => {
                      const language = event.target.value as Language;
                      if (
                        draft.code &&
                        draft.code !==
                          view.question.starterCode?.[draft.language]
                      )
                        setShowLanguage(language);
                      else changeLanguage(language);
                    }}
                  >
                    <option value="python">Python</option>
                    <option value="javascript">JavaScript</option>
                  </select>
                </div>
                <label htmlFor="interview-code" className="sr-only">
                  Your solution code
                </label>
                <textarea
                  id="interview-code"
                  maxLength={50000}
                  className="code-input"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  rows={14}
                  value={draft.code}
                  onChange={(event) =>
                    changeDraft({
                      ...draftRef.current,
                      code: event.target.value,
                    })
                  }
                  disabled={!!busy || remaining === 0}
                />
                <div className="code-footer">
                  <span>Implement solve(input) · JSON-compatible output</span>
                  <button
                    className="button secondary small"
                    type="button"
                    disabled={
                      !!busy ||
                      !draft.code.trim() ||
                      !data.capabilities.runner.available ||
                      remaining === 0
                    }
                    onClick={() => void runCode()}
                  >
                    {busy === "run" ? (
                      <Loader2 size={14} className="spin" />
                    ) : (
                      <Play size={14} />
                    )}
                    Run code
                  </button>
                </div>
                {!data.capabilities.runner.available && (
                  <div className="runner-unavailable">
                    Code execution unavailable:{" "}
                    {data.capabilities.runner.reason ||
                      "No supported runner is configured."}
                  </div>
                )}
              </div>
            )}
            {run && <RunResults result={run} />}
            {assessment && (
              <p className="followup-help">
                Respond to the interviewer’s follow-up to continue the
                conversation. Submit revised answer replaces the assessment of
                the original question.
              </p>
            )}
            <div className="answer-actions">
              <button
                className="button secondary"
                disabled={
                  !!busy || remaining === 0 || view.session.stage === "oa"
                }
                title={
                  view.session.stage === "oa"
                    ? "Hints are disabled in timed online assessments."
                    : undefined
                }
                onClick={() => void act("hint")}
              >
                {busy === "hint" ? (
                  <Loader2 className="spin" size={16} />
                ) : (
                  <Lightbulb size={16} />
                )}
                Get a hint{" "}
                <span className="hint-count">
                  {view.session.stage === "oa"
                    ? "Disabled in OA"
                    : `${view.session.hintsUsed} used`}
                </span>
              </button>
              {assessment && (
                <button
                  className="button secondary"
                  disabled={!!busy || remaining === 0 || !draft.answer.trim()}
                  onClick={() => void act("followup")}
                >
                  {busy === "followup" ? (
                    <Loader2 className="spin" size={16} />
                  ) : (
                    <ArrowRight size={16} />
                  )}
                  {busy === "followup"
                    ? "Continuing conversation…"
                    : "Respond to follow-up"}
                </button>
              )}
              <button
                className="button primary"
                disabled={
                  !!busy ||
                  remaining === 0 ||
                  (!draft.answer.trim() && (!coding || !draft.code.trim()))
                }
                onClick={() => void act("answer")}
              >
                {busy === "answer" ? (
                  <Loader2 className="spin" size={16} />
                ) : (
                  <ArrowUpRight size={16} />
                )}
                {busy === "answer"
                  ? "Reviewing answer…"
                  : assessment
                    ? "Submit revised answer"
                    : "Submit answer"}
              </button>
            </div>
          </div>
        </section>
        <aside className="conversation-panel panel">
          <div className="conversation-heading">
            <span className="interviewer-avatar">
              <MessageSquare size={20} />
            </span>
            <div>
              <h2>Conversation</h2>
              <span>{providerNames[view.session.provider]}</span>
            </div>
            <span className="live-dot" />
          </div>
          <div
            className="conversation"
            ref={conversationRef}
            aria-label="Interview conversation"
            role="log"
            aria-live="polite"
          >
            {view.session.messages.map((message) => (
              <div
                key={message.id}
                className={`message message-${message.role}`}
              >
                <span className="message-author">
                  {message.role === "interviewer"
                    ? "Interviewer"
                    : message.role === "candidate"
                      ? "You"
                      : "Session note"}
                </span>
                <p>{message.content}</p>
              </div>
            ))}
            {(busy === "answer" || busy === "followup") && (
              <div className="message message-system">
                <Busy
                  label={
                    busy === "followup"
                      ? "Continuing the conversation…"
                      : "Reviewing your submission…"
                  }
                />
              </div>
            )}
          </div>
          {assessment && (
            <div className="live-feedback">
              <span className={`badge verdict-${assessment.verdict}`}>
                {verdictLabel(assessment.verdict)}
              </span>
              <h3>Feedback on this answer</h3>
              <p>{assessment.feedback}</p>
              <details>
                <summary>Evidence behind the feedback</summary>
                <ul>
                  {assessment.evidence.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </details>
              <strong>Next practice</strong>
              <p>{assessment.nextPractice}</p>
            </div>
          )}
          <div className="conversation-footer">
            <p>
              {assessment
                ? "Revise your answer or continue to the next question."
                : "Submit your answer before moving to the next question."}
            </p>
            <button
              className="button secondary full-width"
              disabled={!!busy || remaining === 0 || !assessment}
              onClick={() => void act("next")}
            >
              {busy === "next" ? (
                <Loader2 className="spin" size={16} />
              ) : (
                <ArrowRight size={16} />
              )}
              {view.session.questionIndex + 1 >= view.session.questionIds.length
                ? "Complete questions"
                : "Next question"}
            </button>
          </div>
        </aside>
      </div>
      {showFinish && (
        <FinishDialog
          busy={busy === "finish"}
          strict={view.session.mode === "strict"}
          onClose={() => setShowFinish(false)}
          onConfirm={() => void act("finish")}
        />
      )}
      {showLanguage && (
        <LanguageDialog
          language={showLanguage}
          onClose={() => setShowLanguage(null)}
          onConfirm={() => changeLanguage(showLanguage)}
        />
      )}
    </div>
  );
}

function FinishDialog({
  busy,
  strict,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  strict: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby="finish-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
    >
      <div className="dialog-content">
        <span className="empty-icon">
          <CheckCircle2 size={26} />
        </span>
        <h2 id="finish-title">Ready to finish?</h2>
        <p>
          Your draft will be saved. The report covers submitted answers;
          unsubmitted work is not assessed. You can review the session in your
          history.
        </p>
        <div className="button-row">
          <button
            className="button secondary"
            onClick={onClose}
            disabled={busy}
          >
            Keep practising
          </button>
          <button
            className="button primary"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy && <Loader2 className="spin" size={16} />}
            {busy
              ? "Preparing report…"
              : strict
                ? "Finish and exit SEB"
                : "Finish and view report"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
function LanguageDialog({
  language,
  onClose,
  onConfirm,
}: {
  language: Language;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby="language-title"
      onCancel={onClose}
    >
      <div className="dialog-content">
        <h2 id="language-title">
          Switch to {language === "python" ? "Python" : "JavaScript"}?
        </h2>
        <p>
          This replaces your current code with the starter for the selected
          language. Copy your solution first if you want to keep it.
        </p>
        <div className="button-row">
          <button className="button secondary" onClick={onClose}>
            Keep current code
          </button>
          <button className="button primary" onClick={onConfirm}>
            Switch language
          </button>
        </div>
      </div>
    </dialog>
  );
}

function RunResults({ result }: { result: RunResult }) {
  return (
    <section
      className={`run-results run-${result.status}`}
      aria-label="Code run results"
      aria-live="polite"
    >
      <div className="run-heading">
        <span>
          {result.status === "passed" ? (
            <CheckCircle2 size={17} />
          ) : (
            <Terminal size={17} />
          )}
          <strong>
            {result.status === "unavailable"
              ? "Runner unavailable"
              : result.status === "error"
                ? "Execution error"
                : `${result.passed} of ${result.total} checks passed`}
          </strong>
        </span>
        <small>{result.durationMs} ms</small>
      </div>
      {result.cases.length > 0 && (
        <ul>
          {result.cases.map((item, index) => (
            <li key={index}>
              <span className={item.passed ? "case-pass" : "case-fail"}>
                {item.passed ? <Check size={14} /> : <X size={14} />}
              </span>
              <span>
                {item.name}
                {item.detail && <small>{item.detail}</small>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {result.output && <pre>{result.output}</pre>}
    </section>
  );
}

function ReportPage() {
  const { id } = useParams();
  const { data } = useApp();
  const [view, setView] = useState<SessionView | null>(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const load = useCallback(async () => {
    setError("");
    try {
      setView(await api<SessionView>(`/sessions/${id}`));
    } catch (error) {
      setError(errorMessage(error));
    }
  }, [id]);
  useEffect(() => {
    let active = true;
    setView(null);
    setError("");
    void api<SessionView>(`/sessions/${id}`)
      .then((result) => {
        if (active) setView(result);
      })
      .catch((error) => {
        if (active) setError(errorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [id]);
  async function exportReport() {
    setExporting(true);
    setError("");
    try {
      await download(`/sessions/${id}/export`, `sparr-session-${id}.json`);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setExporting(false);
    }
  }
  if (!view)
    return error ? (
      <>
        <Notice tone="error">{error}</Notice>
        <button className="button secondary" onClick={() => void load()}>
          <RefreshCw size={17} />
          Try again
        </button>
      </>
    ) : (
      <Busy label="Opening your session report…" />
    );
  if (view.session.status === "active")
    return <Navigate to={`/sessions/${view.session.id}`} replace />;
  const { session } = view;
  const report = session.report;
  const browserDraft = initialDraft(view);
  const recoveryDraft =
    browserDraft.restored &&
    JSON.stringify(browserDraft.draft) !== JSON.stringify(session.draft)
      ? browserDraft.draft
      : null;
  const track = data.tracks.find((item) => item.id === session.track);
  return (
    <>
      <Link className="text-link back-link" to="/history">
        <ArrowLeft size={15} /> Session history
      </Link>
      <PageHeading
        eyebrow="REPORT"
        title="Session report"
        action={
          <button
            className="button secondary"
            disabled={exporting}
            onClick={() => void exportReport()}
          >
            {exporting ? (
              <Loader2 className="spin" size={17} />
            ) : (
              <ArrowDownToLine size={17} />
            )}
            Export session
          </button>
        }
      >
        {track?.name} <span className="bullet">·</span>{" "}
        {dateLabel(session.createdAt)} <span className="bullet">·</span>{" "}
        {durationLabel(session)}
      </PageHeading>
      {error && <Notice tone="error">{error}</Notice>}
      {session.terminationReason && (
        <Notice tone="error">
          Session terminated: {session.terminationReason}
        </Notice>
      )}
      {session.integrity && (
        <section className="panel">
          <h2>Integrity observations</h2>
          <p>
            These record policy checks and session events. They are not a
            finding of cheating.
          </p>
          <ul className="report-list">
            {session.integrity.events.map((event, index) => (
              <li key={index}>
                <time dateTime={event.at}>
                  {new Date(event.at).toLocaleTimeString()}
                </time>
                {" · "}
                {event.detail}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="report-summary panel">
        <span className="empty-icon">
          <BookOpen size={27} />
        </span>
        <div>
          <span className="eyebrow">
            {providerNames[session.provider]} · {session.status}
          </span>
          <h2>{report ? "Session summary" : "Your session has ended"}</h2>
          <p>
            {report?.summary ||
              "No assessment report was returned for this session. Your saved conversation is available below."}
          </p>
        </div>
        <span className="report-count">
          <strong>{session.assessments.length}</strong>
          <span>
            {session.assessments.length === 1
              ? "answer assessed"
              : "answers assessed"}
          </span>
        </span>
      </section>
      {report && (
        <>
          <div className="report-columns">
            <section className="panel">
              <div className="inline-title">
                <CheckCircle2 size={21} />
                <h2>Passed checks</h2>
              </div>
              {report.strengths.length ? (
                <ul className="report-list">
                  {report.strengths.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">
                  No submitted answer passed all executable checks.
                </p>
              )}
            </section>
            <section className="panel">
              <div className="inline-title">
                <TrendingUp size={21} />
                <h2>Suggested practice</h2>
              </div>
              {report.practice.length ? (
                <ul className="report-list">
                  {report.practice.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">
                  Submit an answer in a new session to get practice suggestions.
                </p>
              )}
            </section>
          </div>
          <section className="section">
            <div className="section-heading">
              <div>
                <h2>Answer review</h2>
                <p>
                  Your answers, test results, and feedback for each question.
                </p>
              </div>
            </div>
            {report.assessments.length ? (
              <div className="assessment-list">
                {report.assessments.map((assessment, index) => (
                  <AssessmentCard
                    key={assessment.questionId}
                    assessment={assessment}
                    index={index}
                  />
                ))}
              </div>
            ) : (
              <Empty title="No answers were assessed.">
                Saved drafts do not count as submitted answers. Submit an answer
                during your next session to receive feedback.
              </Empty>
            )}
          </section>
          {report.limitations.length > 0 && (
            <section className="report-limitations">
              <CircleHelp size={21} />
              <div>
                <h3>How to read this feedback</h3>
                <ul>
                  {report.limitations.map((limitation, index) => (
                    <li key={index}>{limitation}</li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </>
      )}
      {recoveryDraft && (
        <section className="panel browser-recovery">
          <h2>Recovered browser draft</h2>
          <p>
            This browser kept a draft that differs from the last server save. It
            was not assessed. Copy it to keep this version; the session export
            contains the server’s saved version.
          </p>
          <label className="field">
            <span>Recovered answer</span>
            <textarea readOnly rows={5} value={recoveryDraft.answer} />
          </label>
          {recoveryDraft.code && (
            <label className="field">
              <span>Recovered code ({recoveryDraft.language})</span>
              <textarea
                className="code-input"
                readOnly
                rows={10}
                value={recoveryDraft.code}
              />
            </label>
          )}
        </section>
      )}
      <details className="panel transcript">
        <summary>
          Review session conversation <ChevronRight size={17} />
        </summary>
        {session.messages.map((message) => (
          <div className={`message message-${message.role}`} key={message.id}>
            <span className="message-author">
              {message.role === "candidate"
                ? "You"
                : message.role === "interviewer"
                  ? "Interviewer"
                  : "Session note"}
            </span>
            <p>{message.content}</p>
          </div>
        ))}
        {(session.draft.answer || session.draft.code) && (
          <div className="saved-final-draft">
            <h3>Saved final draft</h3>
            <p>{session.draft.answer}</p>
            {session.draft.code && <pre>{session.draft.code}</pre>}
          </div>
        )}
      </details>
      <div className="report-cta">
        <div>
          <h2>Continue practice</h2>
          <p>Start another interview in this track.</p>
        </div>
        <Link
          className="button primary"
          to={`/practice?track=${session.track}`}
        >
          Practise this track <ArrowRight size={18} />
        </Link>
      </div>
    </>
  );
}

function AssessmentCard({
  assessment,
  index,
}: {
  assessment: Assessment;
  index: number;
}) {
  return (
    <article className="panel assessment-card">
      <div className="assessment-top">
        <span className="assessment-number">
          {(index + 1).toString().padStart(2, "0")}
        </span>
        <div>
          <h3>{assessment.title}</h3>
          <span className="muted">
            {assessment.hintsUsed}{" "}
            {assessment.hintsUsed === 1 ? "hint" : "hints"} used
          </span>
        </div>
        <span className={`badge verdict-${assessment.verdict}`}>
          {verdictLabel(assessment.verdict)}
        </span>
      </div>
      <p>{assessment.feedback}</p>
      <div className="assessment-evidence">
        <strong>Observed evidence</strong>
        <ul>
          {assessment.evidence.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </div>
      <div className="next-practice">
        <TrendingUp size={18} />
        <div>
          <strong>Try next</strong>
          <p>{assessment.nextPractice}</p>
        </div>
      </div>
      {assessment.run && (
        <details className="assessment-run">
          <summary>View execution results</summary>
          <RunResults result={assessment.run} />
        </details>
      )}
    </article>
  );
}
