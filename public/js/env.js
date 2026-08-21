/**
 * Chronos Planner - Environment Configuration
 * Isolated Firebase configuration for project "niraj-portfolio-a7011"
 * Hosting Site: "daily-task-planner-api-niomsolutionx"
 */

export const ENV = {
  // Firebase Configuration for project "niraj-portfolio-a7011"
  FIREBASE_CONFIG: {
    apiKey: "AIzaSyAIIlhE3rlHSt5cV3bJslldDTDLlzVYNYE",
    authDomain: "niraj-portfolio-a7011.firebaseapp.com",
    projectId: "niraj-portfolio-a7011",
    storageBucket: "niraj-portfolio-a7011.firebasestorage.app",
    messagingSenderId: "875063736113",
    appId: "1:875063736113:web:6d6d3b6289e7680f4e6210",
    measurementId: "G-803KS0Q7TP"
  },

  // REST API running on Render
  DEFAULT_API_BASE_URL: "https://chronos-planner-app.onrender.com",

  // Hosting Site Identifier (Multi-site on Spark Plan)
  HOSTING_SITE: "daily-task-planner-api-niomsolutionx",

  // Firestore collection for storing user tokens and sync preferences
  FIRESTORE_COLLECTION: "daily_task_planner_users",

  // Default Theme ("orange" | "emerald")
  DEFAULT_THEME: "orange"
};

// Also expose globally for runtime inspection or script injection if needed
if (typeof window !== 'undefined') {
  window.__ENV__ = {
    ...ENV,
    ...(window.__ENV__ || {})
  };
}
