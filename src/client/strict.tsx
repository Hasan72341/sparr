import { useEffect, useRef, useState, type ReactNode } from "react";
import type {
  PracticeOptions,
  SessionView,
  StrictLaunch,
  StrictStatus,
} from "../shared/types";
import { api, post, errorMessage } from "./api";
import { sebProof } from "./seb-client";

export function StrictSetup({
  options,
  disabled,
  available,
  reasons,
}: {
  options: PracticeOptions;
  disabled: boolean;
  available: boolean;
  reasons: string[];
}) {
  const [consent, setConsent] = useState(false);
  const [launch, setLaunch] = useState<StrictLaunch>();
  const [status, setStatus] = useState<StrictStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const preparedSelection = useRef("");
  const currentId = useRef<string | undefined>(undefined);
  const mounted = useRef(true);
  const selection = JSON.stringify(options);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (currentId.current)
        void post(`/strict/launches/${currentId.current}/cancel`, {
          ifPreflight: true,
        }).catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!launch) return;
    let active = true;
    const update = async () => {
      try {
        const s = await api<StrictStatus>(
          `/strict/launches/${launch.id}/status`,
        );
        if (active) setStatus(s);
      } catch (e) {
        if (active) setError(errorMessage(e));
      }
    };
    void update();
    const timer = setInterval(() => void update(), 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [launch?.id]);
  useEffect(() => {
    if (launch && preparedSelection.current !== selection) {
      const id = launch.id;
      currentId.current = undefined;
      setLaunch(undefined);
      setStatus(undefined);
      void post(`/strict/launches/${id}/cancel`, { ifPreflight: true }).catch(
        () => {},
      );
    }
  }, [selection, launch]);
  async function prepare() {
    setBusy(true);
    setError("");
    preparedSelection.current = selection;
    try {
      const next = await post<StrictLaunch>("/strict/launches", {
        options,
        consent,
      });
      if (!mounted.current) {
        await post(`/strict/launches/${next.id}/cancel`, { ifPreflight: true });
        return;
      }
      currentId.current = next.id;
      setLaunch(next);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (!launch) return;
    setBusy(true);
    setError("");
    try {
      await post(`/strict/launches/${launch.id}/cancel`);
      currentId.current = undefined;
      setLaunch(undefined);
      setStatus(undefined);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="strict-setup panel" aria-labelledby="strict-title">
      <div className="inline-title">
        <h3 id="strict-title">Strict interview</h3>
        <span className="badge">macOS · SEB</span>
      </div>
      <p>
        The native guardian checks the built-in camera, microphone, displays,
        running applications, and SEB throughout the interview.
      </p>
      <ul>
        <li>
          One display and one built-in camera. No VMs, external or virtual
          cameras, mirroring, or screen sharing.
        </li>
        <li>
          Multiple faces for 3 seconds, no face for 15 seconds, or lost
          monitoring ends the attempt. These are policy observations, not proof
          of cheating.
        </li>
        <li>
          Face counts and device events stay local. Audio/video are processed in
          memory and are never recorded or sent to the interviewer model.
        </li>
      </ul>
      {!available && <p className="notice">{reasons.join(" ")}</p>}
      {!launch && (
        <>
          <label className="strict-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />{" "}
            <span>
              I agree to live device, camera, and microphone checks for this
              strict interview.
            </span>
          </label>
          <button
            type="button"
            className="button secondary"
            disabled={!consent || disabled || busy || !available}
            onClick={prepare}
          >
            {busy ? "Starting guardian…" : "Prepare strict interview"}
          </button>
        </>
      )}
      {launch && (
        <div className="strict-preflight" aria-live="polite">
          <h4>
            {status?.phase === "active"
              ? "Strict interview running"
              : status?.phase === "ended"
                ? "Strict setup ended"
                : "Device preflight"}
          </h4>
          {status?.observation && (
            <p>
              {status.observation.displays ?? "Unknown"} displays ·{" "}
              {status.observation.cameras} cameras ·{" "}
              {status.observation.faceCount ?? "Unknown"} faces
            </p>
          )}
          {!status && (
            <p>
              Waiting for the guardian. Allow camera and microphone access to
              Sparr Guardian when macOS asks.
            </p>
          )}
          {status?.reasons.map((reason) => (
            <p className="notice" key={reason}>
              {reason}
            </p>
          ))}
          {status?.ready && preparedSelection.current === selection && (
            <>
              <p>
                Preflight passed. Keep this page open, launch SEB, then choose
                Start strict interview there. The timer has not started.
              </p>
              <div className="button-row">
                <a className="button primary" href={launch.launchUrl}>
                  Launch strict SEB
                </a>
                <a
                  className="text-link"
                  href={launch.configUrl}
                  download="sparr-strict.seb"
                >
                  Download strict .seb
                </a>
              </div>
            </>
          )}
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={cancel}
          >
            Cancel strict setup
          </button>
        </div>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <p className="field-help">
        Sparr, the guardian, and SEB must run on the same Mac. Your configured
        agent runs in the background. Command-Q is an emergency exit and
        invalidates an unfinished attempt.
      </p>
    </section>
  );
}

export function StrictInterview({
  id,
  render,
}: {
  id: string;
  render: (view: SessionView, onFinished: () => void) => ReactNode;
}) {
  const [view, setView] = useState<SessionView>();
  const [status, setStatus] = useState<StrictStatus>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const challenge = useRef("");
  const lastAck = useRef(Date.now());
  const active = useRef(true);
  const quitUrl = `${window.location.origin}/strict/${encodeURIComponent(id)}/quit`;
  const exit = () => window.location.assign(quitUrl);
  useEffect(() => {
    active.current = true;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      try {
        let next: StrictStatus;
        if (challenge.current) {
          const response = await post<StrictStatus & { challenge: string }>(
            `/strict/launches/${id}/heartbeat`,
            { ...(await sebProof()), challenge: challenge.current },
          );
          challenge.current = response.challenge;
          next = response;
          lastAck.current = Date.now();
        } else {
          next = await api<StrictStatus>(`/strict/launches/${id}/status`);
          if (next.phase === "active") {
            const resumed = await post<{
              view: SessionView;
              challenge: string;
            }>(`/strict/launches/${id}/resume`, await sebProof());
            challenge.current = resumed.challenge;
            lastAck.current = Date.now();
            if (active.current) setView(resumed.view);
          }
        }
        if (!active.current) return;
        setStatus(next);
        if (next.phase === "ended") {
          setView(undefined);
          exit();
          return;
        }
        setError("");
      } catch (e) {
        if (active.current) setError(errorMessage(e));
        if (challenge.current && Date.now() - lastAck.current > 6000) {
          exit();
          return;
        }
      }
      if (active.current) timer = setTimeout(() => void loop(), 1000);
    };
    void loop();
    return () => {
      active.current = false;
      clearTimeout(timer);
    };
  }, [id]);
  async function start() {
    setBusy(true);
    setError("");
    try {
      const result = await post<{ view: SessionView; challenge: string }>(
        `/strict/launches/${id}/admit`,
        await sebProof(),
      );
      challenge.current = result.challenge;
      lastAck.current = Date.now();
      setView(result.view);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function end() {
    const deadline = window.setTimeout(exit, 1500);
    try {
      await post(`/strict/launches/${id}/cancel`);
    } finally {
      clearTimeout(deadline);
      exit();
    }
  }
  return (
    <>
      <div className="strict-status" role="status">
        <strong>Strict monitoring</strong>
        <span>
          {view
            ? "Camera and microphone monitored · device and session checks every second"
            : "Waiting for admission checks"}
        </span>
        <button
          type="button"
          className="button secondary"
          onClick={() => void end().catch(() => {})}
        >
          End strict attempt
        </button>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {view ? (
        render(view, exit)
      ) : (
        <section className="panel strict-entry">
          <h1>Start strict interview</h1>
          <p>
            Your timer begins only after SEB and the native guardian pass
            admission.
          </p>
          {status?.reasons.map((reason) => (
            <p className="notice" key={reason}>
              {reason}
            </p>
          ))}
          <button
            type="button"
            className="button primary"
            disabled={busy || !status?.ready}
            onClick={start}
          >
            {busy ? "Verifying SEB…" : "Start strict interview"}
          </button>
        </section>
      )}
    </>
  );
}
