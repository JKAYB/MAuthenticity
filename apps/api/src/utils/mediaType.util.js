"use strict";

const MEDIA_TYPE_VALUES = ["image", "video", "audio", "document", "other"];

/**
 * @param {string | null | undefined} mimeType
 * @returns {"image"|"video"|"audio"|"document"|"other"}
 */
function normalizeMediaType(mimeType) {
  const m = String(mimeType || "")
    .trim()
    .toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (
    m === "application/pdf" ||
    m.startsWith("text/") ||
    m.includes("msword") ||
    m.includes("wordprocessingml")
  ) {
    return "document";
  }
  return "other";
}

/**
 * SQL fragment for normalized media type from `mime_type`.
 * Keep in sync with normalizeMediaType().
 */
const MEDIA_TYPE_SQL = `
CASE
  WHEN lower(coalesce(mime_type, '')) LIKE 'image/%' THEN 'image'
  WHEN lower(coalesce(mime_type, '')) LIKE 'video/%' THEN 'video'
  WHEN lower(coalesce(mime_type, '')) LIKE 'audio/%' THEN 'audio'
  WHEN lower(coalesce(mime_type, '')) = 'application/pdf'
    OR lower(coalesce(mime_type, '')) LIKE 'text/%'
    OR lower(coalesce(mime_type, '')) LIKE '%msword%'
    OR lower(coalesce(mime_type, '')) LIKE '%wordprocessingml%'
    THEN 'document'
  ELSE 'other'
END
`;

module.exports = {
  MEDIA_TYPE_VALUES,
  MEDIA_TYPE_SQL,
  normalizeMediaType
};
