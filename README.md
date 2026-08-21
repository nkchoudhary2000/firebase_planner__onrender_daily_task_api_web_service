# Chronos Daily Task Planner

A modern, resilient Single-Page Web Application (SPA) designed to interface with the Chronos Daily Task & Planner REST API (`https://chronos-planner-app.onrender.com`). Engineered for **Firebase Hosting** (Spark plan, host-only mode, multi-site isolated) with **Firebase Google Authentication**, **non-blocking asynchronous queue management** (handling Render's 30–60s cold boot without freezing the UI), **date traversal**, **hourly schedule timeline**, and **Solar Orange / Cyber Emerald** theme palettes.

---

## 🌟 Key Features

1. **Link with Planner App & Ping Verification**:
   - Stores your Chronos API token (`cp_...`) securely in browser state.
   - Automatic Bearer authentication (`Authorization: Bearer <TOKEN>`) for all subsequent API requests.
   - Built-in **Ping Connection & Token Diagnostic Tester** with live latency calculation and status badge (🟢 Connected / 🟡 Cold Start Waking Up / 🔴 Offline / ⚪ Unlinked).

2. **0ms Optimistic Non-Blocking Sync Queue**:
   - Free-tier Render web services can take up to 60s to wake up on cold boot.
   - **Zero UI Freeze**: Adding, editing, toggling, deleting, duplicating tasks, updating schedule slots, or saving notes updates the UI **instantly (0ms)**.
   - Non-blocking background worker processes requests in sequence with exponential retry, inline status indicators on individual cards (`Syncing...`), and a floating bottom status pill with live elapsed timer.

3. **Date Traversal & Navigation**:
   - Quick **Previous Day (`[`)**, **Today (`T`)**, and **Next Day (`]`)** navigation.
   - Interactive **7-Day Mini Date Strip** with instant date hopping.
   - Date picker modal for jumping to any past or future date.
   - Offline-resilient local cache for instantaneous navigation between days.

4. **Task Management (CRUD & Reorder)**:
   - Fast inline task creation bar (Title + Priority + Enter).
   - Detailed modal creation & editing (Title, Priority: High/Medium/Low, Status: To Do/In Progress/Completed/Undone, Tags, Notes, Recurring toggle).
   - One-click completion checkbox toggle.
   - 1-Click Task Duplication (`/api/daily/task/duplicate`).
   - Drag-and-Drop Task Reordering (`/api/daily/task/reorder`).
   - Task rollover & spillover counter indicators.
   - Filter tabs (All, Active, Completed, High Priority) and clickable tag filter chips.

5. **Hourly Schedule Timeline & Daily Reflection**:
   - 24-hour daily timeline slots with mood emojis (`😄`, `🤩`, `😊`, `😐`, `😓`, `😤`, `😴`, `🌧️`, etc.) and focus descriptions.
   - Quick slot editor modal with daily recurrence option.
   - Daily Notes & Reflection editor with debounced auto-save.

6. **Firebase Google Authentication & Multi-Site Spark Hosting**:
   - Configured for Firebase Project: `niraj-portfolio-a7011`.
   - Multi-site isolated target: `daily-task-planner-api-niomsolutionx` (safely deploys without affecting any other web services in your Firebase project).
   - Google Sign-In with user avatar, name, and profile state.

7. **Solar Orange & Cyber Emerald Aesthetic**:
   - Primary **Solar Orange 🔥** theme with deep obsidian dark glassmorphism.
   - One-click toggle to **Cyber Emerald 🌿** theme.
   - Dynamic progress completion ring and summary metric cards.

---

## 🚀 How to Test Locally

### Step 1: Start the Local Development Server
From your project terminal (no dependencies required):
```bash
npm start
```
*Or directly:*
```bash
node server.js
```

### Step 2: Open in Your Browser
Open your browser and navigate to:
```
http://localhost:3000
```

### Step 3: Link Your Chronos API Token
1. Click the **"Link API Token"** pill or the **Settings (⚙️)** icon in the top header.
2. Paste your Chronos API token (`cp_...`) into the **Chronos API Token** input field.
3. Click **"🔄 Ping Server & Test Token"** to verify connection and token validity against `https://chronos-planner-app.onrender.com`.
4. Click **"Save Settings"**.

### Step 4: Sign in with Google (Firebase Auth)
1. Click the **"Sign In"** badge in the top header or in the Settings modal.
2. Authenticate with your Google account via the popup.

---

## 🚢 How to Deploy to Firebase Hosting

Because your Firebase project (`niraj-portfolio-a7011`) hosts multiple web services, this project is configured to deploy **strictly to its dedicated site target**: `daily-task-planner-api-niomsolutionx`.

### 1. (One-time) Apply the Hosting Target
If you haven't associated the site target locally with Firebase CLI yet, run:
```bash
firebase target:apply hosting daily-task-planner-api-niomsolutionx daily-task-planner-api-niomsolutionx
```

### 2. Deploy Isolated Hosting Site
Run the deploy command:
```bash
npm run deploy
```
*(Which runs: `firebase deploy --only hosting:daily-task-planner-api-niomsolutionx`)*

> [!IMPORTANT]
> This command only deploys to the `daily-task-planner-api-niomsolutionx` site and will **never overwrite or touch** other web services under `niraj-portfolio-a7011`.

---

## 🔒 CORS & Local Development Proxy

Modern web browsers enforce CORS (Cross-Origin Resource Sharing) when making `fetch` requests with custom headers (`Authorization`, `X-API-Token`, `Content-Type`) from `http://localhost:3000` to `https://chronos-planner-app.onrender.com`.

### 1. Zero-Setup Local Development (Built-in)
The local server (`node server.js` or `npm start`) comes with a **built-in reverse proxy** that automatically intercepts `/api/*` and `/auth/*` calls and forwards them server-to-server to Render with proper `Access-Control-Allow-Origin: *` headers, completely bypassing browser CORS restrictions locally.

### 2. Backend CORS Configuration (For Direct Calls & Production)
If you are modifying or deploying the backend service on Render, ensure CORS preflight is enabled on the server:

- **Python Flask (`flask-cors`)**:
  ```python
  from flask_cors import CORS
  CORS(app, resources={r"/*": {
      "origins": "*",
      "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
      "allow_headers": ["Content-Type", "Authorization", "X-API-Token", "Accept"]
  }})
  ```
- **Node.js Express (`cors`)**:
  ```javascript
  const cors = require('cors');
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Token', 'Accept']
  }));
  ```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| **`N`** | Open New Task Modal |
| **`T`** | Jump to Today |
| **`[`** | Navigate to Previous Day |
| **`]`** | Navigate to Next Day |
| **`S`** | Open Settings & Link Planner Modal |
| **`Enter`** | Quick Add Task from input bar |
| **`Esc`** | Close any open modal |

---

## 📁 File Structure

```
├── public/
│   ├── index.html              # Single Page Application HTML shell
│   ├── assets/
│   │   └── icon.svg            # Solar app icon and favicon
│   ├── css/
│   │   ├── style.css           # Glassmorphic layout, components, and animations
│   │   └── themes.css          # Solar Orange & Cyber Emerald theme palettes
│   └── js/
│       ├── app.js              # Application entry point & orchestration
│       ├── env.js              # Firebase & API environment configuration
│       ├── api.js              # Chronos REST API client with Bearer auth
│       ├── syncQueue.js        # Non-blocking async queue & offline cache
│       ├── auth.js             # Firebase Google Authentication manager
│       ├── utils.js            # Date formatters, helpers, toast dispatcher
│       └── components/
│           ├── taskList.js     # Task list, drag reorder, filter tabs
│           ├── scheduleView.js # 24-hour hourly schedule timeline
│           ├── datePicker.js   # 7-Day date strip & calendar picker
│           ├── taskModal.js    # Add/Edit task modal dialog
│           ├── slotModal.js    # Hourly slot editor modal
│           └── settingsModal.js# Token linker, ping tester, theme switcher
├── firebase.json               # Isolated Firebase Hosting configuration
├── .firebaserc                 # Project & target mapping
└── package.json                # Project scripts & dependencies
```
