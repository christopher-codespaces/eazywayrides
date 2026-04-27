<div align="center">

# 🚗 EazyWayRides

**A production-grade ride management platform connecting businesses with vetted drivers.**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-eazywayrides--nine.vercel.app-blue?style=for-the-badge&logo=vercel)](https://eazywayrides-nine.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js%2014-App%20Router-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![Firebase](https://img.shields.io/badge/Firebase-Auth%20%2B%20Firestore-orange?style=for-the-badge&logo=firebase)](https://firebase.google.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-99.2%25-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-Styling-38bdf8?style=for-the-badge&logo=tailwindcss)](https://tailwindcss.com)

</div>

---

## 📌 Overview

**EazyWayRides** is a full-stack MVP platform that connects **businesses** with a pool of **trained and vetted drivers**. It supports:

- Driver onboarding, training flows, and profile management
- Business job posting and driver matching
- Role-based dashboards for `admin`, `business`, and `driver` users
- Secure server-side session authentication using Firebase Admin SDK + HTTP-only cookies

Currently in **active MVP execution phase** — core auth, dashboards, and job flows are live in production.

---

## 🚀 Live Deployment

| Environment | URL |
|---|---|
| **Production** | [eazywayrides-nine.vercel.app](https://eazywayrides-nine.vercel.app) |
| **Platform** | Vercel (Serverless, Edge-ready) |
| **Status** | ✅ Live |

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 14 (App Router) + TypeScript |
| **Authentication** | Firebase Authentication (Client SDK) + Firebase Admin SDK (Server-side session cookies) |
| **Database** | Cloud Firestore (NoSQL) |
| **Styling** | Tailwind CSS |
| **Deployment** | Vercel |
| **Middleware** | Next.js Edge Middleware (route protection) |
| **Build** | Turbopack |

---

## 🏗️ Architecture

```
EazyWayRides/
├── src/
│   ├── app/
│   │   ├── admin/          # Admin dashboard + active users
│   │   ├── business/       # Business user pages + job posting
│   │   ├── driver/         # Driver dashboard + onboarding
│   │   ├── login/          # Google OAuth login (signInWithPopup)
│   │   ├── complete-signup/ # Role assignment + profile completion
│   │   ├── api/
│   │   │   └── session/    # Server-side session cookie minting
│   │   └── components/     # Reusable UI components
│   ├── context/
│   │   └── AuthContext.tsx  # Global auth state provider
│   ├── lib/
│   │   ├── firebaseClient.ts # Firebase Client SDK init
│   │   └── firebaseAdmin.ts  # Firebase Admin SDK init
│   └── middleware.ts         # Route protection + role-based redirects
├── .env.example
├── firestore.rules
└── next.config.ts
```

### Auth Flow

```
User clicks "Sign in with Google"
        ↓
signInWithPopup() → Google account selector
        ↓
Firebase returns user + ID token
        ↓
POST /api/session/login → Admin SDK mints __session cookie
        ↓
Middleware reads __session → role-based redirect
        ↓
/admin  /driver  /business  (based on Firestore role)
```

---

## 👥 Role-Based Access

| Role | Access |
|---|---|
| `admin` | Full platform dashboard, user management, active users |
| `business` | Job posting, driver search, booking management |
| `driver` | Profile, onboarding, assigned jobs |

Roles are stored in Firestore (`users/{uid}/role`) and enforced server-side via middleware on every request.

---

## ⚙️ Getting Started (Local Development)

### Prerequisites

- Node.js v18+
- npm
- A Firebase project with Authentication + Firestore enabled

### Installation

```bash
git clone https://github.com/avengersvstheflash/eazywayrides.git
cd eazywayrides
npm install
```

### Environment Variables

Copy the template and fill in your Firebase config:

```bash
cp .env.example .env.local
```

```env
# Firebase Client SDK (public)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=        # Must be: your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase Admin SDK (server-side, never exposed to client)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=                    # Full PEM key with literal \n characters
```

> **Note:** `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` must be your `.firebaseapp.com` domain — not your Vercel deployment URL. Firebase uses this domain to resolve redirect auth state.

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 🔐 Security Notes

- Firebase API keys are **public by design** — security is enforced via Firestore Security Rules and server-side middleware
- Session cookies are **HTTP-only** and minted server-side using the Firebase Admin SDK
- Never commit `.env.local` or any service account JSON files
- Admin SDK credentials are **server-only** — never exposed to the client bundle

---

## 📦 Key Engineering Decisions

| Decision | Reasoning |
|---|---|
| `signInWithPopup` over `signInWithRedirect` | Redirect flow has a known race condition with Next.js App Router's soft navigation — popup eliminates the timing issue entirely |
| HTTP-only session cookies over client JWT | Prevents XSS token theft; server-side validation on every request |
| `browserLocalPersistence` explicit set | Prevents Firebase auth state loss during Next.js hydration cycles |
| Edge Middleware route protection | Role-based redirects happen at the edge before any page renders |

---

## 🤝 Contributing

- Do **not** commit `.env.local` or service account files
- Do **not** hardcode credentials anywhere in the codebase
- Do **not** replace `login/page.tsx` or `AuthContext.tsx` without a full auth flow review — these files contain production-critical fixes
- Keep all AI/ML logic **server-side only**
- Align changes with MVP scope before opening PRs

---


---

## 👥 Team & Credits

EazyWayRides is a **Cape Neto Solutions** product, developed for their client as a full-stack MVP platform.

### Lead Developer
**[Christopher Musamakombe](https://www.linkedin.com/in/christophermusamakombe/)** — Project Lead & Core Developer

### Production & Deployment
**[Ayush Sharma](https://www.linkedin.com/in/ayush-sharma-swe)** — Systems Builder & Technical Consultant

- Auth system redesign and deployment on Vercel
- signInWithRedirect → signInWithPopup migration (fixed infinite login loop)
- Firebase Admin SDK session cookie architecture
- Middleware role-based route protection
- Full production deployment and monitoring

### Built By
**[Cape Neto Solutions](https://www.linkedin.com/company/cape-neto-solutions/)** — Software Development Studio

---

<div align="center">

<sub>Production deployment on Vercel · Firebase Auth + Firestore · Next.js 14 App Router · TypeScript 99.2%</sub>

<sub>Built for Cape Neto Solutions · [LinkedIn](https://www.linkedin.com/company/cape-neto-solutions/) · [Christopher](https://www.linkedin.com/in/christophermusamakombe/) · [Ayush](https://www.linkedin.com/in/ayush-sharma-swe)</sub>

</div>
