const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const GIS_SCRIPT_ID = "google-identity-services-script";

type GoogleTokenPrompt = "" | "consent";

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
}

interface GoogleTokenClient {
  requestAccessToken: (options?: { prompt?: GoogleTokenPrompt }) => void;
}

interface GoogleOauth2 {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
    error_callback?: (error: unknown) => void;
  }) => GoogleTokenClient;
}

interface GoogleIdentityApi {
  accounts: {
    oauth2: GoogleOauth2;
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityApi;
  }
}

export interface GoogleCalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  htmlLink?: string;
  allDay: boolean;
}

let gisLoadPromise: Promise<void> | null = null;
let tokenClient: GoogleTokenClient | null = null;
let accessToken: string | null = null;

function getClientId(): string | undefined {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID;
}

function ensureConfigured() {
  if (!getClientId()) {
    throw new Error("Google Calendar não configurado. Defina VITE_GOOGLE_CLIENT_ID no .env.");
  }
}

function loadGisScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Calendar só pode ser usado no navegador."));
  }

  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }

  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(GIS_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Falha ao carregar Google Identity Services.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = GIS_SCRIPT_ID;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Falha ao carregar Google Identity Services."));
    document.head.appendChild(script);
  });

  return gisLoadPromise;
}

function requestAccessToken(prompt: GoogleTokenPrompt): Promise<string> {
  ensureConfigured();

  return new Promise<string>(async (resolve, reject) => {
    try {
      await loadGisScript();
      const oauth2 = window.google?.accounts?.oauth2;
      if (!oauth2) {
        reject(new Error("Google OAuth indisponível após carregar o script."));
        return;
      }

      tokenClient = oauth2.initTokenClient({
        client_id: getClientId() as string,
        scope: GOOGLE_SCOPE,
        callback: (response: GoogleTokenResponse) => {
          if (response.error) {
            reject(new Error(response.error));
            return;
          }
          if (!response.access_token) {
            reject(new Error("Token de acesso não retornado pelo Google."));
            return;
          }
          accessToken = response.access_token;
          resolve(response.access_token);
        },
        error_callback: () => reject(new Error("Falha no fluxo de autorização Google.")),
      });

      tokenClient.requestAccessToken({ prompt });
    } catch (error) {
      reject(error instanceof Error ? error : new Error("Erro inesperado ao autenticar com Google Calendar."));
    }
  });
}

async function getAccessToken(interactive: boolean): Promise<string> {
  if (accessToken) return accessToken;
  return requestAccessToken(interactive ? "consent" : "");
}

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(getClientId());
}

export async function connectGoogleCalendar(): Promise<string> {
  return requestAccessToken("consent");
}

export function disconnectGoogleCalendar() {
  accessToken = null;
}

export async function fetchGoogleCalendarEvents(params: {
  from: Date;
  to: Date;
  calendarId?: string;
  interactive?: boolean;
}): Promise<GoogleCalendarEvent[]> {
  const token = await getAccessToken(params.interactive ?? false);
  const calendarId = params.calendarId ?? import.meta.env.VITE_GOOGLE_CALENDAR_ID ?? "primary";

  const qs = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    timeMin: params.from.toISOString(),
    timeMax: params.to.toISOString(),
    maxResults: "2500",
  });

  const endpoint = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${qs.toString()}`;
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401) {
    accessToken = null;
    throw new Error("Sessão Google expirada. Conecte novamente para sincronizar.");
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Falha ao buscar eventos do Google Calendar (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    items?: Array<{
      id?: string;
      summary?: string;
      htmlLink?: string;
      start?: { date?: string; dateTime?: string };
      end?: { date?: string; dateTime?: string };
    }>;
  };

  const events: GoogleCalendarEvent[] = [];

  for (const item of data.items ?? []) {
    const startValue = item.start?.dateTime ?? item.start?.date;
    if (!startValue) continue;

    const allDay = Boolean(item.start?.date && !item.start?.dateTime);
    const start = allDay ? new Date(`${startValue}T09:00:00`) : new Date(startValue);

    const endValue = item.end?.dateTime ?? item.end?.date;
    const fallbackEnd = new Date(start.getTime() + 60 * 60 * 1000);
    const end = endValue
      ? allDay
        ? new Date(`${endValue}T10:00:00`)
        : new Date(endValue)
      : fallbackEnd;

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;

    events.push({
      id: item.id ?? crypto.randomUUID(),
      title: item.summary?.trim() || "Evento sem título",
      start,
      end,
      htmlLink: item.htmlLink,
      allDay,
    });
  }

  return events.sort((a, b) => a.start.getTime() - b.start.getTime());
}
