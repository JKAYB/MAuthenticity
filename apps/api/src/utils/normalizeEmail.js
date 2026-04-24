"use strict";

function normalizeEmail(input) {
  return String(input || "").trim().toLowerCase();
}

module.exports = { normalizeEmail };
