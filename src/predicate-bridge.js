/**
 * Bridge module to integrate custom predicates with tree-sitter queries
 * 
 * This module provides the integration layer between our custom predicates
 * and tree-sitter's query execution engine.
 */

const SolidityPredicates = require('./custom-predicates');

/**
 * Apply custom predicates to query matches
 * @param {Array} matches - Raw matches from tree-sitter query
 * @param {Query} query - The tree-sitter Query object
 * @returns {Array} - Filtered matches with predicates applied
 */
function applyCustomPredicates(matches, query) {
  const predicates = new SolidityPredicates();
  const filteredMatches = [];

  for (const match of matches) {
    // Get predicates for this pattern
    const patternPredicates = query.predicatesForPattern(match.pattern);
    
    if (!patternPredicates || patternPredicates.length === 0) {
      // No predicates, include the match
      filteredMatches.push(match);
      continue;
    }

    // Check all predicates
    let allPredicatesPass = true;
    
    for (const predicate of patternPredicates) {
      const predicateName = predicate.operator;
      
      // Skip built-in predicates (handled by tree-sitter)
      if (isBuiltinPredicate(predicateName)) {
        continue;
      }
      
      // Apply custom predicate
      const predicateResult = predicates.apply(
        predicateName.replace(/\?$/, ''), // Remove trailing ?
        predicate.operands,
        match
      );
      
      if (!predicateResult) {
        allPredicatesPass = false;
        break;
      }
    }
    
    if (allPredicatesPass) {
      filteredMatches.push(match);
    }
  }
  
  return filteredMatches;
}

/**
 * Apply custom predicates to captures from Query#captures
 * @param {Array} captures - Raw captures from tree-sitter query
 * @param {Query} query - The tree-sitter Query object
 * @returns {Array} - Filtered captures with predicates applied
 */
function applyCustomPredicatesToCaptures(captures, query) {
  const predicates = new SolidityPredicates();
  const patternMatches = new Map(); // Track which patterns have passing predicates
  
  // Group captures by pattern
  const capturesByPattern = new Map();
  for (const capture of captures) {
    const patternIndex = capture.patternIndex;
    if (!capturesByPattern.has(patternIndex)) {
      capturesByPattern.set(patternIndex, []);
    }
    capturesByPattern.get(patternIndex).push(capture);
  }
  
  // Check predicates for each pattern
  for (const [patternIndex, patternCaptures] of capturesByPattern) {
    const patternPredicates = query.predicatesForPattern(patternIndex);
    
    if (!patternPredicates || patternPredicates.length === 0) {
      // No predicates, all captures pass
      patternMatches.set(patternIndex, true);
      continue;
    }
    
    // Create a mock match object for predicate evaluation
    const mockMatch = {
      pattern: patternIndex,
      captures: patternCaptures
    };
    
    // Check all predicates
    let allPredicatesPass = true;
    
    for (const predicate of patternPredicates) {
      const predicateName = predicate.operator;
      
      // Skip built-in predicates
      if (isBuiltinPredicate(predicateName)) {
        continue;
      }
      
      // Apply custom predicate
      const predicateResult = predicates.apply(
        predicateName.replace(/\?$/, ''), // Remove trailing ?
        predicate.operands,
        mockMatch
      );
      
      if (!predicateResult) {
        allPredicatesPass = false;
        break;
      }
    }
    
    patternMatches.set(patternIndex, allPredicatesPass);
  }
  
  // Filter captures based on predicate results
  return captures.filter(capture => {
    return patternMatches.get(capture.patternIndex) !== false;
  });
}

/**
 * Check if a predicate is built-in to tree-sitter
 * @param {string} name - Predicate name
 * @returns {boolean} - True if built-in
 */
function isBuiltinPredicate(name) {
  const builtinPredicates = [
    'eq?', 'not-eq?', 
    'match?', 'not-match?',
    'contains?', 'not-contains?',
    'is?', 'is-not?',
    'any-of?', 'not-any-of?',
    'lua-match?', 'not-lua-match?',
    'offset!', 'strip!',
    'gsub!', 'trim!',
    'set!'
  ];
  return builtinPredicates.includes(name);
}

/**
 * Enhance a tree-sitter Language object with custom predicate support
 * @param {Language} language - Tree-sitter language object
 * @returns {Language} - Enhanced language object
 */
function enhanceLanguageWithPredicates(language) {
  // Store original query method
  const originalQuery = language.query.bind(language);
  
  // Override query method to return enhanced Query objects
  language.query = function(source) {
    const query = originalQuery(source);
    
    // Store original methods
    const originalMatches = query.matches.bind(query);
    const originalCaptures = query.captures.bind(query);
    
    // Override matches method
    query.matches = function(node, startPosition, endPosition) {
      const matches = originalMatches(node, startPosition, endPosition);
      return applyCustomPredicates(matches, this);
    };
    
    // Override captures method
    query.captures = function(node, startPosition, endPosition) {
      const captures = originalCaptures(node, startPosition, endPosition);
      return applyCustomPredicatesToCaptures(captures, this);
    };
    
    return query;
  };
  
  return language;
}

module.exports = {
  applyCustomPredicates,
  applyCustomPredicatesToCaptures,
  enhanceLanguageWithPredicates,
  SolidityPredicates
};