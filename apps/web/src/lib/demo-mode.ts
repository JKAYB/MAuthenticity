const KEY = "mediaauth_live_demo";
const CHANGE_EVENT = "mediaauth-live-demo-change";

function notify() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

export function enableLiveDemo(): void {
  try {
    sessionStorage.setItem(KEY, "1");
    notify();
  } catch {
    // private mode / unavailable
  }
}

export function disableLiveDemo(): void {
  try {
    sessionStorage.removeItem(KEY);
    notify();
  } catch {
    // ignore
  }
}

export function isLiveDemo(): boolean {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function subscribeLiveDemo(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const fn = () => onStoreChange();
  window.addEventListener(CHANGE_EVENT, fn);
  return () => window.removeEventListener(CHANGE_EVENT, fn);
}

export function getLiveDemoSnapshot(): boolean {
  return isLiveDemo();
}
