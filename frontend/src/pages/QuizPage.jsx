import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { getQuizConfig, startQuiz, submitQuiz, getCertificate } from "../utils/api";
import mhaLogo from "../assets/logo2.png";
import "./QuizPage.css";

const fmtTime = (secs) => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
};

const shuffleArray = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const OPTION_LETTERS = ["A", "B", "C", "D"];

export default function QuizPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { registrationId, fullName, resumeResult } = location.state || {};

  const [phase,             setPhase]             = useState("loading");
  const [config,            setConfig]            = useState(null);
  const [shuffledQuestions, setShuffledQuestions] = useState([]);
  const [attemptId,         setAttemptId]         = useState(null);
  const [answers,           setAnswers]           = useState({});
  const [currentQ,          setCurrentQ]          = useState(0);
  const [timeLeft,          setTimeLeft]          = useState(0);
  const [showConfirm,       setShowConfirm]       = useState(false);
  const [result,            setResult]            = useState(null);
  const [errorMsg,          setErrorMsg]          = useState("");
  const [dlLoading,         setDlLoading]         = useState(false);

  const timerRef  = useRef(null);
  const certRef   = useRef(null);
  const submitted = useRef(false);

  useEffect(() => {
    if (!registrationId) navigate("/", { replace: true });
  }, [registrationId, navigate]);

  // Load quiz
  useEffect(() => {
    if (!registrationId) return;
    (async () => {
      try {
        // Resume completed quiz — load stored result
        if (resumeResult) {
          const certRes = await getCertificate(registrationId);
          setResult(certRes.data.data);
          setPhase("result");
          return;
        }

        // startQuiz uses JWT — registrationId comes from token on backend
        const [cfgRes, startRes] = await Promise.all([
          getQuizConfig(),
          startQuiz(),
        ]);

        // Already completed
        if (startRes.data?.alreadyCompleted) {
          setResult({
            score:           startRes.data.score,
            totalQuestions:  startRes.data.totalQuestions,
            passingScore:    startRes.data.passingScore,
            passed:          startRes.data.passed,
            certificateType: startRes.data.certificateType,
            certificateId:   startRes.data.certificateId,
          });
          setPhase("result");
          return;
        }

        const rawQuestions = cfgRes.data.data.questions || [];

        // Shuffle questions AND options per student
        const shuffled = shuffleArray(rawQuestions).map((q) => {
          const optionsWithIdx = q.options.map((text, origIdx) => ({ text, origIdx }));
          const shuffledOpts   = shuffleArray(optionsWithIdx);
          return {
            ...q,
            options:              shuffledOpts.map(o => o.text),
            shuffledCorrectIndex: shuffledOpts.findIndex(o => o.origIdx === q.correctIndex),
            originalId:           q._id,
          };
        });

        setShuffledQuestions(shuffled);
        setConfig(cfgRes.data.data);
        setAttemptId(startRes.data.attemptId);
        setTimeLeft(cfgRes.data.data.timeLimitMinutes * 60);
        setPhase("quiz");
      } catch (err) {
        // 409 = already completed
        if (err.alreadyCompleted) {
          setResult({
            score:           err.score,
            totalQuestions:  err.totalQuestions,
            passingScore:    err.passingScore,
            passed:          err.passed,
            certificateType: err.certificateType,
            certificateId:   err.certificateId,
          });
          setPhase("result");
          return;
        }
        // 401 = session expired
        if (err.message?.includes("session") || err.message?.includes("token")) {
          navigate("/", { replace: true, state: { sessionExpired: true } });
          return;
        }
        setErrorMsg(err.message || "Failed to load quiz. Please try again.");
        setPhase("error");
      }
    })();
  }, [registrationId, resumeResult, navigate]);

  // Timer countdown
  useEffect(() => {
    if (phase !== "quiz") return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); handleSubmitFinal(true); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase]);

  const generateCertPDF = useCallback(async () => {
    if (!certRef.current) return null;
    try {
      const canvas  = await html2canvas(certRef.current, { scale: 2, useCORS: true, logging: false });
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const pdf     = new jsPDF("landscape", "mm", "a4");
      const pw      = pdf.internal.pageSize.getWidth();
      const ph      = (canvas.height * pw) / canvas.width;
      pdf.addImage(imgData, "JPEG", 0, 0, pw, ph);
      return pdf.output("datauristring").split(",")[1];
    } catch (e) { console.error("PDF gen error:", e); return null; }
  }, []);

  const handleSubmitFinal = useCallback(async (timedOut = false) => {
    if (submitted.current) return;
    submitted.current = true;
    clearInterval(timerRef.current);
    setPhase("submitting");

    const timeTaken = config ? config.timeLimitMinutes * 60 - timeLeft : 0;

    // Map shuffled answers back to original question/option indices
    const answerArr = shuffledQuestions.map((q, shuffledIdx) => {
      const selectedShuffledIdx = answers[shuffledIdx];
      if (selectedShuffledIdx === undefined) return null;
      const originalQuestionIndex = (config.questions || []).findIndex(rq => rq._id === q.originalId);
      const rawQ = (config.questions || []).find(rq => rq._id === q.originalId);
      const selectedOptionText    = q.options[selectedShuffledIdx];
      const originalOptionIndex   = rawQ ? rawQ.options.indexOf(selectedOptionText) : selectedShuffledIdx;
      return {
        questionIndex: originalQuestionIndex >= 0 ? originalQuestionIndex : shuffledIdx,
        selectedIndex: originalOptionIndex,
      };
    }).filter(Boolean);

    try {
      const res  = await submitQuiz({ attemptId, answers: answerArr, timeTakenSeconds: timeTaken });
      const data = res.data.data || res.data;
      setResult(data);
      setPhase("result");

      // Generate cert PDF and send to backend for storage
      setTimeout(async () => {
        const certB64 = await generateCertPDF();
        if (certB64) {
          try {
            await submitQuiz({ attemptId, answers: answerArr, timeTakenSeconds: timeTaken, certBase64: certB64 });
          } catch (_) {}
        }
      }, 1500);
    } catch (err) {
      if (err.data) { setResult(err.data); setPhase("result"); return; }
      setErrorMsg(err.message || "Failed to submit quiz.");
      setPhase("error");
    }
  }, [attemptId, answers, config, shuffledQuestions, timeLeft, generateCertPDF]);

  const handleDownloadCert = async () => {
    if (!certRef.current || !result) return;
    setDlLoading(true);
    try {
      const canvas  = await html2canvas(certRef.current, { scale: 3, useCORS: true, logging: false });
      const imgData = canvas.toDataURL("image/jpeg", 1.0);
      const pdf     = new jsPDF("landscape", "mm", "a4");
      const pw      = pdf.internal.pageSize.getWidth();
      const ph      = (canvas.height * pw) / canvas.width;
      pdf.addImage(imgData, "JPEG", 0, 0, pw, ph);
      const label = result.passed ? "Certificate_of_Achievement" : "Certificate_of_Participation";
      pdf.save(`${(fullName || "Student").replace(/\s+/g, "_")}_${label}_MHA.pdf`);
    } catch (e) { console.error("Download error:", e); }
    finally { setDlLoading(false); }
  };

  // ── Render phases ──────────────────────────────────────────────────────────
  if (phase === "loading") return (
    <div className="qp-root">
      <div className="qp-center"><div className="qp-spinner"/><p>Loading quiz...</p></div>
    </div>
  );

  if (phase === "error") return (
    <div className="qp-root">
      <div className="qp-center">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <h2>Something went wrong</h2>
        <p>{errorMsg}</p>
        <button onClick={() => navigate("/")}>← Go Back</button>
      </div>
    </div>
  );

  if (phase === "submitting") return (
    <div className="qp-root">
      <div className="qp-center">
        <div className="qp-spinner"/>
        <h2>Submitting your answers...</h2>
        <p>Please wait, don't close this page.</p>
      </div>
    </div>
  );

  if (phase === "result" && result) {
    const passed   = result.passed;
    const certType = passed ? "Achievement" : "Participation";
    const certId   = result.certificateId || "";
    const certDesc = passed
      ? `For successfully completing the Data Science & Employability Skills quiz with a score of ${result.score}/${result.totalQuestions}, demonstrating proficiency in data science and machine learning concepts.`
      : `For participating in the Data Science & Employability Skills quiz and demonstrating commitment to continuous learning and professional growth.`;

    return (
      <div className="qp-root">
        <div className="qp-result">
          <div className={`qp-result-icon ${passed ? "qp-result-icon--pass" : "qp-result-icon--fail"}`}>
            {passed
              ? <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
              : <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            }
          </div>
          <h2 className="qp-result-title">
            {passed ? `Congratulations, ${fullName}! 🎉` : `Well done, ${fullName}! 🎯`}
          </h2>
          <p className="qp-result-sub">
            {passed ? "You passed the assessment!" : "Thank you for completing the quiz. Every effort counts!"}
          </p>

          <div className="qp-score-card">
            <div className={`qp-score-num ${passed ? "qp-score-num--pass" : "qp-score-num--fail"}`}>
              {result.score}
              <span style={{ fontSize: "2rem", color: "#334155" }}>/{result.totalQuestions}</span>
            </div>
            <div className="qp-score-label">Your Score · Passing: {result.passingScore}</div>
          </div>

          {certId && (
            <div className="qp-cert-id-badge">
              <span className="qp-cert-id-label">Certificate ID</span>
              <span className="qp-cert-id-val">{certId}</span>
              <span className="qp-cert-id-hint">Use this ID to verify your certificate at any time</span>
            </div>
          )}

          <div className="qp-result-btns">
            <button className="qp-dl-btn" onClick={handleDownloadCert} disabled={dlLoading}>
              {dlLoading
                ? <><div className="qp-btn-spinner"/>Generating…</>
                : <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Download Certificate</>
              }
            </button>
            <button className="qp-back-btn" onClick={() => navigate("/")}>← Back to Home</button>
          </div>
        </div>

        {/* Hidden certificate for html2canvas capture */}
        <div ref={certRef} className="qp-cert-wrapper">
          <div className="qp-cert-border">
            <div className="qp-cert-inner">
              <div className="qp-cert-header">
                <img src={mhaLogo} alt="MHA" className="qp-cert-logo" />
                <div className="qp-cert-academy">Mandi Hariyanna Academy</div>
              </div>
              <div className="qp-cert-title">CERTIFICATE</div>
              <div className="qp-cert-sub">Of {certType}</div>
              <div className="qp-cert-pres">This is proudly presented to</div>
              <div className="qp-cert-name">{fullName || "Student"}</div>
              <div className="qp-cert-desc">{certDesc}</div>
              <div className="qp-cert-footer">
                {passed && (
                  <div className="qp-cert-sig">
                    <div className="qp-cert-sig-val">{result.score}/{result.totalQuestions}</div>
                    <div className="qp-cert-sig-line"/>
                    <div className="qp-cert-sig-lbl">Final Score</div>
                  </div>
                )}
                <div className="qp-cert-sig">
                  <div className="qp-cert-sig-val">{new Date().toLocaleDateString("en-IN", { day:"numeric", month:"long", year:"numeric" })}</div>
                  <div className="qp-cert-sig-line"/>
                  <div className="qp-cert-sig-lbl">Date of Issue</div>
                </div>
                {certId && (
                  <div className="qp-cert-sig">
                    <div className="qp-cert-sig-val" style={{ fontSize:16, letterSpacing:2 }}>{certId}</div>
                    <div className="qp-cert-sig-line"/>
                    <div className="qp-cert-sig-lbl">Certificate ID</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Quiz UI ────────────────────────────────────────────────────────────────
  if (phase !== "quiz" || !config) return null;

  const questions     = shuffledQuestions;
  const q             = questions[currentQ];
  const answeredCount = Object.keys(answers).length;
  const progress      = ((currentQ + 1) / questions.length) * 100;
  const timedDanger   = timeLeft <= 60;

  return (
    <div className="qp-root">
      <header className="qp-header">
        <div className="qp-header-inner">
          <div className="qp-brand">
            <div className="qp-brand-logo"><img src={mhaLogo} alt="MHA" /></div>
            <span className="qp-welcome">Welcome, <strong>{fullName}</strong></span>
          </div>
          <div className="qp-meta">
            <span className="qp-q-badge">Q {currentQ + 1} / {questions.length}</span>
            <div className={`qp-timer ${timedDanger ? "qp-timer--danger" : ""}`}>
              {fmtTime(timeLeft)}
            </div>
          </div>
        </div>
      </header>

      <div className="qp-progress-wrap">
        <div className="qp-progress-bar" style={{ width: `${progress}%` }} />
      </div>

      <div className="qp-content">
        <div className="qp-q-num">Question {currentQ + 1} of {questions.length}</div>
        <div className="qp-q-text">{q.text}</div>
        <div className="qp-opts">
          {(q.options || []).map((opt, idx) => {
            const selected = answers[currentQ] === idx;
            return (
              <div
                key={idx}
                className={`qp-opt ${selected ? "qp-opt--selected" : ""}`}
                onClick={() => setAnswers(a => ({ ...a, [currentQ]: idx }))}
              >
                <div className="qp-opt-letter">{OPTION_LETTERS[idx]}</div>
                <span className="qp-opt-text">{opt}</span>
              </div>
            );
          })}
        </div>
        <div className="qp-nav-dots">
          {questions.map((_, i) => {
            let cls = "qp-dot--unanswered";
            if (i === currentQ)              cls = "qp-dot--current";
            else if (answers[i] !== undefined) cls = "qp-dot--answered";
            return (
              <button key={i} className={`qp-dot ${cls}`} onClick={() => setCurrentQ(i)}>
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>

      <footer className="qp-footer">
        <div className="qp-footer-inner">
          <span className="qp-answered-count">
            <span>{answeredCount}</span>/{questions.length} answered
          </span>
          <div className="qp-footer-btns">
            <button className="qp-btn qp-btn--outline" disabled={currentQ === 0} onClick={() => setCurrentQ(i => i - 1)}>← Prev</button>
            {currentQ < questions.length - 1
              ? <button className="qp-btn qp-btn--primary" onClick={() => setCurrentQ(i => i + 1)}>Next →</button>
              : <button className="qp-btn qp-btn--submit" onClick={() => setShowConfirm(true)}>Submit Quiz</button>
            }
          </div>
        </div>
      </footer>

      {showConfirm && (
        <div className="qp-modal-overlay" onClick={() => setShowConfirm(false)}>
          <div className="qp-modal" onClick={e => e.stopPropagation()}>
            <h3>Submit Quiz?</h3>
            <p>You've answered <strong style={{color:"#a5b4fc"}}>{answeredCount}</strong> of <strong style={{color:"#a5b4fc"}}>{questions.length}</strong> questions.</p>
            {answeredCount < questions.length && (
              <p style={{ color:"#f59e0b", fontSize:"0.82rem" }}>⚠️ {questions.length - answeredCount} question(s) unanswered</p>
            )}
            <div className="qp-modal-btns">
              <button className="qp-btn qp-btn--outline" onClick={() => setShowConfirm(false)}>Cancel</button>
              <button className="qp-btn qp-btn--submit" onClick={() => { setShowConfirm(false); handleSubmitFinal(false); }}>Submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}