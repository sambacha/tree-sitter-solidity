const root = require("path").join(__dirname, "..", "..");

const language = require("node-gyp-build")(root);

try {
  language.nodeTypeInfo = require("../../src/node-types.json");
} catch (_) {}

// Export the base language
module.exports = language;

// Export predicate utilities
try {
  const { enhanceLanguageWithPredicates, SolidityPredicates } = require("../../src/predicate-bridge");
  module.exports.enhanceLanguageWithPredicates = enhanceLanguageWithPredicates;
  module.exports.SolidityPredicates = SolidityPredicates;
} catch (_) {
  // Predicate support is optional
}
