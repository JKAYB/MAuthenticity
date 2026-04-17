const TOKEN_KEY = "mediaauth_token";
const TOKEN_CHANGE_EVENT = "mediaauth-token-change";

function notifyTokenChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(TOKEN_CHANGE_EVENT));
  }
}

export function subscribeToken(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const fn = () => onStoreChange();
  window.addEventListener(TOKEN_CHANGE_EVENT, fn);
  return () => window.removeEventListener(TOKEN_CHANGE_EVENT, fn);
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getTokenSnapshot(): string | null {
  return getToken();
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  notifyTokenChange();
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  notifyTokenChange();
}

export { TOKEN_KEY };
