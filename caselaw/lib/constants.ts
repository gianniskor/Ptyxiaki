// Public URL of the backend API. In production set NEXT_PUBLIC_API_URL to the
// public backend URL (e.g. https://api.example.com). Falls back to localhost
// for local development.
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
