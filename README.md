# MH Academy — Quiz Portal (MERN Stack)

A full-stack MERN application combining an **Event Registration Form** with an integrated **Quiz System** — complete with admin dashboard, certificate generation, and automated emails.

---

## 🗂 Project Structure

```
mha-quiz-system/
├── backend/                    # Express + MongoDB API
│   ├── models/
│   │   ├── EventRegistration.js   # Student registration
│   │   ├── QuizConfig.js          # Quiz questions & settings
│   │   └── QuizAttempt.js         # Each student's quiz attempt
│   ├── routes/
│   │   └── eventRegistration.js   # All API routes
│   ├── middleware/
│   │   └── validate.js            # Express-validator rules
│   ├── utils/
│   │   └── emailService.js        # Brevo email service
│   ├── server.js
│   ├── .env.example
│   └── package.json
│
└── frontend/                   # React + Vite SPA
    ├── src/
    │   ├── assets/               # logo.png, logo1.png, logo2.png
    │   ├── pages/
    │   │   ├── EventRegistrationForm.jsx  # Step 1: Register
    │   │   ├── QuizPage.jsx               # Step 2: Take quiz
    │   │   └── AdminDashboard.jsx         # Admin panel
    │   ├── utils/
    │   │   ├── api.js            # Axios API calls
    │   │   └── validation.js     # Frontend validation
    │   ├── App.jsx               # Router
    │   ├── main.jsx
    │   └── index.css
    ├── index.html
    ├── vite.config.js
    └── package.json
```

---

## ⚙️ Backend Setup

### 1. Install dependencies
```bash
cd backend
npm install
```

### 2. Create `.env` file
```bash
cp .env.example .env
```

Fill in your values:
```env
PORT=5000
MONGO_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/mha_quiz
CLIENT_URL=http://localhost:5173
ADMIN_PASSWORD=your_secure_admin_password
BREVO_API_KEY=your_brevo_api_key
EMAIL_FROM=noreply@yourdomain.com
```

### 3. Run backend
```bash
npm run dev      # development (nodemon)
npm start        # production
```

---

## 🎨 Frontend Setup

### 1. Install dependencies
```bash
cd frontend
npm install
```

### 2. Run frontend
```bash
npm run dev      # http://localhost:5173
```

### 3. Build for production
```bash
npm run build
```

---

## 🌊 User Flow

```
Student visits /
    ↓
Fills Registration Form (name, phone, email, gender, dob, state, district, qualification, address)
    ↓
✅ Registration Confirmation Email sent via Brevo
    ↓
Clicks "Start Quiz Now"
    ↓
Quiz Page (/quiz)
  - Questions loaded from DB (admin-managed)
  - Timer countdown (configurable, default 20 min)
  - Navigation dots to jump between questions
    ↓
Quiz submitted (manually or on timer expiry)
    ↓
Score calculated server-side
  - Score ≥ passing score → Certificate of ACHIEVEMENT
  - Score <  passing score → Certificate of PARTICIPATION
    ↓
📧 Thank-you email + PDF Certificate sent via Brevo
    ↓
Student can also download certificate directly from result screen
```

---

## 🔐 Admin Dashboard (/admin)

Login with `ADMIN_PASSWORD` from `.env`

### Tabs:
| Tab | Features |
|-----|----------|
| **Registrations** | View all students, quiz started/completed status, search & filter |
| **Quiz Attempts** | All attempts with scores, pass/fail, certificate type, email status |
| **Questions** | Full CRUD — Add, Edit, Delete quiz questions |
| **Quiz Settings** | Change passing score & time limit (live, no redeploy needed) |

---

## 📡 API Endpoints

### Public
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/events/register` | Register student |
| GET  | `/api/events/quiz-config` | Get quiz (questions hidden correct answers) |
| POST | `/api/events/quiz/start` | Start quiz attempt |
| POST | `/api/events/quiz/submit` | Submit answers + base64 cert |

### Admin (requires `x-admin-password` header)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/events/admin/login` | Verify password |
| GET  | `/api/events/admin/registrations` | List registrations + stats |
| GET  | `/api/events/admin/attempts` | List quiz attempts + stats |
| GET  | `/api/events/admin/quiz-config` | Full config with correct answers |
| PUT  | `/api/events/admin/quiz-settings` | Update passing score & time limit |
| POST | `/api/events/admin/questions` | Add question |
| PUT  | `/api/events/admin/questions/:id` | Edit question |
| DELETE | `/api/events/admin/questions/:id` | Delete question |

---

## 📧 Email Setup (Brevo / Sendinblue)

1. Create a free account at [brevo.com](https://brevo.com)
2. Go to **SMTP & API** → **API Keys** → generate a key
3. Add the key to `.env` as `BREVO_API_KEY`
4. Set `EMAIL_FROM` to a verified sender email

---

## 🔧 Seeding Initial Quiz Questions

After starting the backend, you can add questions via the **Admin → Questions** tab, or POST to:
```
POST /api/events/admin/questions
Headers: x-admin-password: your_password
Body: {
  "text": "Which of the following is a supervised ML algorithm?",
  "options": ["K-Means", "PCA", "Linear Regression", "Apriori"],
  "correctIndex": 2,
  "marks": 1
}
```

---

## 🚀 Deployment

### Backend (Render / Railway / VPS)
- Set all environment variables
- Set `CLIENT_URL` to your frontend domain
- Start command: `node server.js`

### Frontend (Vercel / Netlify)
- Build command: `npm run build`
- Output dir: `dist`
- Add env var or update `vite.config.js` proxy target to your backend URL

For production, update `frontend/src/utils/api.js`:
```js
const api = axios.create({
  baseURL: "https://your-backend.onrender.com/api",
  ...
});
```
