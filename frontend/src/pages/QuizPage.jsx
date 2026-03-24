import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { getQuizConfig, startQuiz, submitQuiz } from "../utils/api";
import mhaLogo from "../assets/logo2.png";
import "./QuizPage.css";

const fmtTime = (secs) => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
};

export default function QuizPage() {
  const location = useLocation();
  const navigate  = useNavigate();
  const { registrationId, fullName } = location.state || {};

  const [phase,         setPhase]         = useState("loading"); // loading | quiz | submitting | result | error
  const [config,        setConfig]        = useState(null);
  const [attemptId,     setAttemptId]     = useState(null);
  const [answers,       setAnswers]       = useState({});
  const [currentQ,      setCurrentQ]      = useState(0);
  const [timeLeft,      setTimeLeft]      = useState(0);
  const [showConfirm,   setShowConfirm]   = useState(false);
  const [result,        setResult]        = useState(null);
  const [errorMsg,      setErrorMsg]      = useState("");
  const [dlLoading,     setDlLoading]     = useState(false);
  const [emailSent,     setEmailSent]     = useState(null);

  const timerRef  = useRef(null);
  const certRef   = useRef(null);
  const submitted = useRef(false);

  // Guard: redirect if no registrationId
  useEffect(() => {
    if (!registrationId) navigate("/", { replace: true });
  }, [registrationId, navigate]);

  // Load config + start attempt
  useEffect(() => {
    if (!registrationId) return;
    (async () => {
      try {
        const [cfgRes, startRes] = await Promise.all([
          getQuizConfig(),
          startQuiz(registrationId),
        ]);
        if (startRes.data?.alreadyCompleted) {
          setErrorMsg(`You have already completed this quiz. Score: ${startRes.data.score}`);
          setPhase("error");
          return;
        }
        setConfig(cfgRes.data.data);
        setAttemptId(startRes.data.attemptId);
        setTimeLeft(cfgRes.data.data.timeLimitMinutes * 60);
        setPhase("quiz");
      } catch (err) {
        setErrorMsg(err.message || "Failed to load quiz. Please try again.");
        setPhase("error");
      }
    })();
  }, [registrationId]);

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

  // Generate PDF certificate as base64
  const generateCertPDF = useCallback(async () => {
    if (!certRef.current) return null;
    try {
      // Scale 2 is enough for email, keeps file size around 2MB
      const canvas = await html2canvas(certRef.current, { scale: 2, useCORS: true, logging: false });
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const pdf     = new jsPDF("landscape", "mm", "a4");
      const pw      = pdf.internal.pageSize.getWidth();
      const ph      = (canvas.height * pw) / canvas.width;
      pdf.addImage(imgData, "JPEG", 0, 0, pw, ph);
      return pdf.output("datauristring").split(",")[1]; // base64
    } catch (e) {
      console.error("PDF gen error:", e);
      return null;
    }
  }, []);

  const handleSubmitFinal = useCallback(async (timedOut = false) => {
    if (submitted.current) return;
    submitted.current = true;
    clearInterval(timerRef.current);
    setPhase("submitting");

    const timeTaken = config ? config.timeLimitMinutes * 60 - timeLeft : 0;
    const answerArr = Object.entries(answers).map(([qi, si]) => ({
      questionIndex: parseInt(qi),
      selectedIndex: si,
    }));

    try {
      // 1. Submit to get final score
      const res = await submitQuiz({ attemptId, answers: answerArr, timeTakenSeconds: timeTaken });
      const data = res.data.data || res.data;
      setResult(data);
      setPhase("result");

      // 2. WAIT for the Result screen to render so html2canvas can capture the cert
      setTimeout(async () => {
        const certB64 = await generateCertPDF();
        if (certB64) {
          try {
            // 3. Send the cert Base64 to the backend
            const res2 = await submitQuiz({ attemptId, answers: answerArr, timeTakenSeconds: timeTaken, certBase64: certB64 });
            setEmailSent(res2.data?.data?.emailSent || res2.data?.emailSent || false);
          } catch (_) {}
        }
      }, 1500); // Increased delay for better capture reliability
    } catch (err) {
      setErrorMsg(err.message || "Failed to submit quiz.");
      setPhase("error");
    }
  }, [attemptId, answers, config, timeLeft, generateCertPDF]);

  const handleDownloadCert = async () => {
    if (!certRef.current || !result) return;
    setDlLoading(true);
    try {
      const canvas = await html2canvas(certRef.current, { scale: 3, useCORS: true, logging: false });
      const imgData = canvas.toDataURL("image/jpeg", 1.0);
      const pdf     = new jsPDF("landscape", "mm", "a4");
      const pw      = pdf.internal.pageSize.getWidth();
      const ph      = (canvas.height * pw) / canvas.width;
      pdf.addImage(imgData, "JPEG", 0, 0, pw, ph);
      const fname = result.passed ? "Certificate_of_Achievement_Seyffluo" : "Certificate_of_Participation_Seyffluo";
      pdf.save(`${(fullName || "Student").replace(/\s+/g, "_")}_${fname}.pdf`);
    } catch (e) {
      console.error("Download error:", e);
    } finally {
      setDlLoading(false);
    }
  };

  // ── Render Logic ──────────────────────────────────────────────────────────

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
        <button onClick={() => navigate("/")}>Go Back to Registration</button>
      </div>
    </div>
  );

  if (phase === "submitting") return (
    <div className="qp-root">
      <div className="qp-center"><div className="qp-spinner"/><h2>Submitting your answers...</h2><p>Please wait, don't close this page.</p></div>
    </div>
  );

  if (phase === "result" && result) {
    const passed = result.passed;
    const certType = passed ? "Achievement" : "Participation";
    const certDesc = passed
      ? `For successfully completing the Data Science & Employability Skills quiz with a score of ${result.score}/${result.totalQuestions}, demonstrating proficiency in data science and machine learning concepts.`
      : `For participating in the Data Science & Employability Skills quiz and demonstrating commitment to continuous learning and professional growth.`;

    return (
      <div className="qp-root" style={{ background: "#f8fafc" }}>
        <div className="qp-result">
          <div className={`qp-result-icon ${passed ? "qp-result-icon--pass" : "qp-result-icon--fail"}`}>
            {passed
              ? <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
              : <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            }
          </div>
          <h2 className="qp-result-title">{passed ? `Congratulations, ${fullName}! 🎉` : `Well done, ${fullName}! 🎯`}</h2>
          <p className="qp-result-sub">{passed ? "You have passed the assessment!" : "Thank you for completing the quiz. Every effort counts!"}</p>

          <div className="qp-score-card">
            <div className={`qp-score-num ${passed ? "qp-score-num--pass" : "qp-score-num--fail"}`}>
              {result.score}<span style={{ fontSize: "2rem", color: "#94a3b8" }}>/{result.totalQuestions}</span>
            </div>
            <div className="qp-score-label">Your Score · Passing: {result.passingScore}</div>
          </div>

          {/* <div className="qp-cert-badge">
            {passed ? "🏆" : "📜"} Certificate of {certType} — sent to your email
          </div> */}

          <div className="qp-result-btns">
            <button className="qp-dl-btn" onClick={handleDownloadCert} disabled={dlLoading}>
              {dlLoading ? "Generating..." : "Download Certificate"}
            </button>
            {/* {emailSent !== null && (
              <p className={`qp-email-note ${emailSent ? "" : "qp-email-note--pending"}`}>
                {emailSent ? "✅ Certificate emailed successfully!" : "⚠️ Sending email... please wait"}
              </p>
            )} */}
            {/* <button onClick={() => navigate("/")} className="qp-btn qp-btn--outline" style={{ marginTop: 8 }}>
              Back to Home
            </button> */}
          </div>
        </div>

        {/* Hidden certificate for capture */}
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
                {/* Score only shown for Achievement */}
                {passed && (
                  <div className="qp-cert-sig">
                    <div className="qp-cert-sig-val">{result.score}/{result.totalQuestions}</div>
                    <div className="qp-cert-sig-line"/>
                    <div className="qp-cert-sig-lbl">Final Score</div>
                  </div>
                )}
                <div className="qp-cert-sig">
                  <div className="qp-cert-sig-val">{new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</div>
                  <div className="qp-cert-sig-line"/>
                  <div className="qp-cert-sig-lbl">Date of Issue</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Quiz UI ───────────────────────────────────────────────────────────────
  if (phase !== "quiz" || !config) return null;

  const questions   = config.questions || [];
  const q           = questions[currentQ];
  const answeredCount = Object.keys(answers).length;
  const progress    = ((currentQ + 1) / questions.length) * 100;
  const timedDanger = timeLeft <= 60;

  return (
    <div className="qp-root">
      <header className="qp-header">
        <div className="qp-header-inner">
          <div className="qp-brand">
            <div className="qp-brand-logo"><img src={mhaLogo} alt="MHA" /></div>
            <span className="qp-welcome">Welcome, <strong>{fullName}</strong></span>
          </div>
          <div className="qp-meta">
            <span className="qp-q-badge">Q {currentQ + 1}/{questions.length}</span>
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
              <div key={idx} className={`qp-opt ${selected ? "qp-opt--selected" : ""}`} onClick={() => setAnswers(a => ({ ...a, [currentQ]: idx }))}>
                <div className="qp-opt-radio">{selected && <div className="qp-opt-radio-dot" />}</div>
                <span className="qp-opt-text">{opt}</span>
              </div>
            );
          })}
        </div>
        <div className="qp-nav-dots">
          {questions.map((_, i) => {
            let cls = "qp-dot--unanswered";
            if (i === currentQ) cls = "qp-dot--current";
            else if (answers[i] !== undefined) cls = "qp-dot--answered";
            return <button key={i} className={`qp-dot ${cls}`} onClick={() => setCurrentQ(i)}>{i + 1}</button>;
          })}
        </div>
      </div>
      <footer className="qp-footer">
        <div className="qp-footer-inner">
          <span className="qp-answered-count">{answeredCount}/{questions.length} answered</span>
          <div className="qp-footer-btns">
            <button className="qp-btn qp-btn--outline" disabled={currentQ === 0} onClick={() => setCurrentQ(i => i - 1)}>Prev</button>
            {currentQ < questions.length - 1
              ? <button className="qp-btn qp-btn--primary" onClick={() => setCurrentQ(i => i + 1)}>Next</button>
              : <button className="qp-btn qp-btn--submit" onClick={() => setShowConfirm(true)}>Submit Quiz</button>
            }
          </div>
        </div>
      </footer>
      {showConfirm && (
        <div className="qp-modal-overlay" onClick={() => setShowConfirm(false)}>
          <div className="qp-modal" onClick={e => e.stopPropagation()}>
            <h3>Submit Quiz?</h3>
            <p>You've answered <strong>{answeredCount}</strong> questions.</p>
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