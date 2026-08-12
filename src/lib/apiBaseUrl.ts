const rawApiUrl = import.meta.env.VITE_API_URL;

export const API_URL = (rawApiUrl === undefined ? "http://localhost:3333" : rawApiUrl).replace(/\/$/, "");
