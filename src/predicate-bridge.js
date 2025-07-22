/**
 * Bridge module to integrate custom predicates with tree-sitter queries
 * 
 * This module provides the integration layer between our custom predicates
 * and tree-sitter's query execution engine.
 */

const Parser = require('tree-sitter');
const SolidityPredicates = require('./custom-predicates');

// Custom predicate names (without ? suffix)
const CUSTOM_PREDICATES = [
  'solidity-version-gte',
  'solidity-version-lt',
  'is-user-defined-type',
  'is-mapping-type',
  'is-array-type',
  'is-state-variable',
  'is-constant',
  'is-immutable',
  'is-payable',
  'is-view',
  'is-pure',
  'is-external-call',
  'is-low-level-call'
];

/**
 * Simple approach: Store predicates in comments and parse them later
 * This avoids the complexity of preprocessing the query
 */
function storePredicatesAsComments(source) {
  const lines = source.split('\n');
  const processedLines = [];
  
  for (const line of lines) {
    // Check if line contains a custom predicate
    let hasCustomPredicate = false;
    
    for (const predicateName of CUSTOM_PREDICATES) {
      if (line.includes(`#${predicateName}?`)) {
        hasCustomPredicate = true;
        // Convert predicate to comment for storage
        const commentLine = line.replace(/\(#([^)]+)\)/, '; CUSTOM_PREDICATE: $1');
        processedLines.push(commentLine);
        break;
      }
    }
    
    if (!hasCustomPredicate) {
      processedLines.push(line);
    }
  }
  
  return processedLines.join('\n');
}

/**
 * Alternative approach: Use a wrapper that doesn't require preprocessing
 */
class QueryWithCustomPredicates {
  constructor(language, source) {
    this.source = source;
    this.language = language;
    this.customPredicates = new Map();
    this.predicateImpl = new SolidityPredicates();
    
    // Parse the query to extract custom predicates
    this._parseCustomPredicates();
    
    // Create the base query without custom predicates
    const processedSource = this._removeCustomPredicates();
    
    // Debug: save to file
    require('fs').writeFileSync('/tmp/processed-query-debug.scm', processedSource);
    
    try {
      this.baseQuery = new Parser.Query(language, processedSource);
    } catch (error) {
      console.error('Query parse error at position', error.position);
      if (error.position) {
        const lines = processedSource.split('\n');
        let pos = 0;
        for (let i = 0; i < lines.length; i++) {
          if (pos + lines[i].length >= error.position) {
            console.error(`Error on line ${i + 1}: "${lines[i]}"`);
            break;
          }
          pos += lines[i].length + 1;
        }
      }
      throw error;
    }
  }
  
  _parseCustomPredicates() {
    // Parse the query source more carefully to track pattern indices
    const lines = this.source.split('\n');
    let currentPattern = '';
    let depth = 0;
    let patternIndex = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Skip comments
      if (trimmed.startsWith(';')) {
        continue;
      }
      
      // Track parentheses depth
      for (const char of line) {
        if (char === '(') depth++;
        else if (char === ')') depth--;
      }
      
      currentPattern += line + '\n';
      
      // Pattern complete when depth returns to 0
      if (depth === 0 && currentPattern.trim()) {
        // Check if this pattern has custom predicates
        const predicates = [];
        
        for (const predicateName of CUSTOM_PREDICATES) {
          const predRegex = new RegExp(`\\(#${predicateName}\\?\\s+([^)]+)\\)`, 'g');
          const predMatches = currentPattern.matchAll(predRegex);
          
          for (const predMatch of predMatches) {
            const operandString = predMatch[1];
            const operands = this._parseOperands(operandString);
            
            predicates.push({
              operator: `${predicateName}?`,
              operands: operands
            });
          }
        }
        
        if (predicates.length > 0) {
          this.customPredicates.set(patternIndex, predicates);
        }
        
        // Increment pattern index for every complete pattern
        patternIndex++;
        currentPattern = '';
      }
    }
  }
  
  _removeCustomPredicates() {
    let processed = this.source;
    
    // Remove custom predicate expressions including parentheses
    for (const predicateName of CUSTOM_PREDICATES) {
      // Match predicates that may span lines or be on the same line
      const regex = new RegExp(`\\s*\\(#${predicateName}\\\\?[^)]+\\)`, 'g');
      processed = processed.replace(regex, '');
    }
    
    return processed;
  }
  
  _parseOperands(operandString) {
    const operands = [];
    const parts = operandString.trim().split(/\s+/);
    
    for (const part of parts) {
      if (part.startsWith('@')) {
        operands.push({ type: 'capture', name: part });
      } else if (part.startsWith('"') && part.endsWith('"')) {
        operands.push({ type: 'string', value: part.slice(1, -1) });
      } else {
        operands.push({ type: 'string', value: part });
      }
    }
    
    return operands;
  }
  
  _applyCustomPredicates(results, isCaptures = false) {
    if (isCaptures) {
      // For captures, we need to determine which pattern each capture belongs to
      return this._applyCustomPredicatesToCaptures(results);
    } else {
      // For matches, we have pattern information
      return this._applyCustomPredicatesToMatches(results);
    }
  }
  
  _applyCustomPredicatesToMatches(matches) {
    const filtered = [];
    
    for (const match of matches) {
      const predicates = this.customPredicates.get(match.pattern);
      
      if (!predicates || predicates.length === 0) {
        // No custom predicates, include match
        filtered.push(match);
        continue;
      }
      
      // Check all predicates
      let allPass = true;
      
      for (const predicate of predicates) {
        const predicateName = predicate.operator.replace(/\?$/, '');
        const result = this.predicateImpl.apply(predicateName, predicate.operands, match);
        
        if (!result) {
          allPass = false;
          break;
        }
      }
      
      if (allPass) {
        filtered.push(match);
      }
    }
    
    return filtered;
  }
  
  _applyCustomPredicatesToCaptures(captures) {
    // For captures, we can't use the base query matches because they don't have predicates
    // Instead, we need to check each capture against our predicate patterns
    
    if (captures.length === 0) return [];
    
    const filtered = [];
    
    // Get all matches with our custom predicates applied
    // Walk up to find root node
    let rootNode = captures[0].node;
    while (rootNode.parent) {
      rootNode = rootNode.parent;
    }
    const matches = this.matches(rootNode);
    
    // Build a set of valid capture node IDs
    const validCaptures = new Set();
    for (const match of matches) {
      for (const capture of match.captures) {
        validCaptures.add(`${capture.node.id}_${capture.name}`);
      }
    }
    
    // Filter the captures to only include valid ones
    for (const capture of captures) {
      const key = `${capture.node.id}_${capture.name}`;
      if (validCaptures.has(key)) {
        filtered.push(capture);
      }
    }
    
    return filtered;
  }
  
  matches(node, startPosition, endPosition) {
    const matches = this.baseQuery.matches(node, startPosition, endPosition);
    return this._applyCustomPredicates(matches, false);
  }
  
  captures(node, startPosition, endPosition) {
    const captures = this.baseQuery.captures(node, startPosition, endPosition);
    return this._applyCustomPredicates(captures, true);
  }
  
  predicatesForPattern(patternIndex) {
    return this.baseQuery.predicatesForPattern(patternIndex);
  }
}

/**
 * Create an enhanced query with custom predicate support
 * @param {Language} language - Tree-sitter language object
 * @param {string} source - Query source string
 * @returns {Query} - Enhanced query object
 */
function createQueryWithPredicates(language, source) {
  return new QueryWithCustomPredicates(language, source);
}

/**
 * Enhance a tree-sitter Language object with custom predicate support
 * This returns an object that mimics the language interface but with enhanced query creation
 * @param {Language} language - Tree-sitter language object
 * @returns {Object} - Enhanced language-like object
 */
function enhanceLanguageWithPredicates(language) {
  return {
    // Pass through all language properties
    ...language,
    
    // Enhanced query method
    query: function(source) {
      return createQueryWithPredicates(language, source);
    }
  };
}

module.exports = {
  createQueryWithPredicates,
  enhanceLanguageWithPredicates,
  SolidityPredicates
};