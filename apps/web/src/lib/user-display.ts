export function initialsFromEmail(email: string) {
  const local = email.split("@")[0] || "?";
  const parts = local.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase() || "?";
}

export function displayNameFromEmail(email: string) {
  return email.split("@")[0] || "User";
}

export function displayNameFromMe(me: { name: string | null; email: string }) {
  const n = me.name?.trim();
  if (n) return n;
  return displayNameFromEmail(me.email);
}

/** Prefer saved display name for initials; otherwise derive from email. */
export function initialsFromDisplayName(name: string | null | undefined, email: string) {
  const n = name?.trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return n.slice(0, 2).toUpperCase() || "?";
  }
  return initialsFromEmail(email);
}
