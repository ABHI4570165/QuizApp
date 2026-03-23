const axios = require("axios");

// ─── 1. REGISTRATION EMAIL TEMPLATE ──────────────────────────────────────────
const registrationHTML = (reg) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Registration Confirmed</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,sans-serif;color:#333333;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:6px;overflow:hidden;border:1px solid #e0e0e0;">

          <!-- Header -->
          <tr>
            <td style="background:#1a3c5e;padding:28px 36px;">
              <p style="margin:0;font-size:16px;font-weight:700;color:#ffffff;">Mandi Hariyanna Academy</p>
              <p style="margin:4px 0 0;font-size:11px;color:#a8c4dc;letter-spacing:1px;">MANDI HARISH FOUNDATION ®</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 36px 28px;">
              <p style="margin:0 0 20px;font-size:18px;font-weight:700;color:#1a3c5e;">Registration Confirmed</p>

              <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#444444;">
                Dear ${reg.fullName},
              </p>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#444444;">
                Thank you for registering for the <strong>Data Science &amp; Employability Skills</strong> program at Mandi Hariyanna Academy. We are pleased to have you with us and look forward to seeing you at the event.
              </p>
              <p style="margin:0 0 28px;font-size:14px;line-height:1.7;color:#444444;">
                Please find your confirmation details below.
              </p>

              <!-- Confirmation Code -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#f8f9fa;border:1px solid #dee2e6;border-radius:4px;padding:20px 24px;">
                    <p style="margin:0 0 6px;font-size:11px;color:#888888;text-transform:uppercase;letter-spacing:1px;">Confirmation Code</p>
                    <p style="margin:0;font-size:26px;font-weight:700;color:#1a3c5e;letter-spacing:4px;">${reg.confirmationCode}</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:14px;line-height:1.7;color:#444444;">
                If you have any questions, please feel free to reply to this email. We look forward to welcoming you.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8f9fa;border-top:1px solid #e0e0e0;padding:20px 36px;">
              <p style="margin:0 0 2px;font-size:13px;font-weight:700;color:#1a3c5e;">Mandi Hariyanna Academy</p>
              <p style="margin:0 0 2px;font-size:11px;color:#888888;">Mandi Harish Foundation ®</p>
              <p style="margin:0;font-size:11px;color:#aaaaaa;">Data Science &amp; Employability Skills</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
`;

// ─── 2. QUIZ COMPLETION EMAIL TEMPLATE ───────────────────────────────────────
const quizCompletionHTML = (attempt) => {
  const percentage = Math.round((attempt.score / attempt.totalQuestions) * 100);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Quiz Completed</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,sans-serif;color:#333333;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:6px;overflow:hidden;border:1px solid #e0e0e0;">

          <!-- Header -->
          <tr>
            <td style="background:#1a3c5e;padding:28px 36px;">
              <p style="margin:0;font-size:16px;font-weight:700;color:#ffffff;">Mandi Hariyanna Academy</p>
              <p style="margin:4px 0 0;font-size:11px;color:#a8c4dc;letter-spacing:1px;">MANDI HARISH FOUNDATION ®</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 36px 28px;">
              <p style="margin:0 0 20px;font-size:18px;font-weight:700;color:#1a3c5e;">Thank You for Attending the Quiz</p>

              <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#444444;">
                Dear ${attempt.fullName},
              </p>
              <p style="margin:0 0 28px;font-size:14px;line-height:1.7;color:#444444;">
                Thank you for participating in the quiz for the <strong>Data Science &amp; Employability Skills</strong> program. We appreciate your effort and commitment to learning.
              </p>

              <!-- Score Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#f8f9fa;border:1px solid #dee2e6;border-radius:4px;padding:20px 24px;">
                    <p style="margin:0 0 12px;font-size:11px;color:#888888;text-transform:uppercase;letter-spacing:1px;">Your Result</p>
                    <p style="margin:0 0 8px;font-size:28px;font-weight:700;color:#1a3c5e;">${attempt.score} / ${attempt.totalQuestions}</p>
                    <p style="margin:0;font-size:13px;color:#555555;">Score: ${percentage}%</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:14px;line-height:1.7;color:#444444;">
                We hope this experience has been valuable. If you have any questions or need further assistance, please do not hesitate to reach out.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8f9fa;border-top:1px solid #e0e0e0;padding:20px 36px;">
              <p style="margin:0 0 2px;font-size:13px;font-weight:700;color:#1a3c5e;">Mandi Hariyanna Academy</p>
              <p style="margin:0 0 2px;font-size:11px;color:#888888;">Mandi Harish Foundation ®</p>
              <p style="margin:0;font-size:11px;color:#aaaaaa;">Data Science &amp; Employability Skills</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
`;
};

// ─── SENDING LOGIC ────────────────────────────────────────────────────────────
const sendConfirmationEmail = async (registration) => {
  try {
    await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: { name: "Mandi Hariyanna Academy", email: process.env.EMAIL_FROM },
        to: [{ email: registration.email, name: registration.fullName }],
        subject: `Registration Confirmed — ${registration.fullName}`,
        htmlContent: registrationHTML(registration),
      },
      {
        headers: {
          "api-key": process.env.BREVO_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );
    return true;
  } catch (err) {
    return false;
  }
};

const sendQuizCompletionEmail = async (attempt) => {
  try {
    await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: { name: "Mandi Hariyanna Academy", email: process.env.EMAIL_FROM },
        to: [{ email: attempt.email, name: attempt.fullName }],
        subject: `Quiz Completed — Thank you, ${attempt.fullName}`,
        htmlContent: quizCompletionHTML(attempt),
      },
      {
        headers: {
          "api-key": process.env.BREVO_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );
    return true;
  } catch (err) {
    return false;
  }
};

module.exports = { sendConfirmationEmail, sendQuizCompletionEmail };