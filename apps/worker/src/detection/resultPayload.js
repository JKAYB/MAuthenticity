const { PAYLOAD_VERSION } = require("./contract");

/**
 * @param {import('./contract').ProviderResult[]} detections
 */
function buildResultPayload(detections) {
  const list = Array.isArray(detections) ? detections : [];
  const primary = list[0];
  const processors = {};
  for (const detection of list) {
    if (!detection || !detection.providerId) continue;
    processors[detection.providerId] = detection.details || {};
  }
  return {
    version: PAYLOAD_VERSION,
    primaryProvider: primary ? primary.providerId : null,
    processors
  };
}

module.exports = { buildResultPayload };
