#!/usr/bin/env node

/**
 * Test runner for syntax highlighting tests with custom predicates
 * 
 * This script runs the highlight tests and verifies that custom predicates
 * are working correctly. It parses the test files, applies the enhanced
 * query with custom predicates, and validates the assertions.
 */

const fs = require('fs');
const path = require('path');
const Parser = require('tree-sitter');
const Solidity = require('../bindings/node');
const { createQueryWithPredicates } = require('../src/predicate-bridge');

const HIGHLIGHT_TEST_DIR = path.join(__dirname, '../test/highlight');
const QUERY_FILE = path.join(__dirname, '../queries/highlights-minimal.scm');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
};

class HighlightTester {
  constructor() {
    this.parser = new Parser();
    this.language = Solidity;
    this.parser.setLanguage(this.language);
    this.query = this.loadQuery();
    this.totalTests = 0;
    this.passedTests = 0;
    this.failedTests = 0;
  }

  loadQuery() {
    const querySource = fs.readFileSync(QUERY_FILE, 'utf8');
    return createQueryWithPredicates(this.language, querySource);
  }

  runTests() {
    console.log(`${colors.blue}Running syntax highlighting tests with custom predicates...${colors.reset}\n`);

    const testFiles = fs.readdirSync(HIGHLIGHT_TEST_DIR)
      .filter(f => f.endsWith('.sol'))
      .sort();

    for (const testFile of testFiles) {
      this.runTestFile(path.join(HIGHLIGHT_TEST_DIR, testFile));
    }

    this.printSummary();
  }

  runTestFile(filePath) {
    const fileName = path.basename(filePath);
    console.log(`${colors.yellow}Testing ${fileName}:${colors.reset}`);
    
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const tree = this.parser.parse(content);
    
    // Get all captures from the query
    const captures = this.query.captures(tree.rootNode);
    
    // Build a map of position -> capture names
    const highlightMap = new Map();
    for (const capture of captures) {
      const startPos = capture.node.startPosition;
      const endPos = capture.node.endPosition;
      
      // Store captures for each column in the range
      for (let row = startPos.row; row <= endPos.row; row++) {
        const startCol = row === startPos.row ? startPos.column : 0;
        const endCol = row === endPos.row ? endPos.column : lines[row]?.length || 0;
        
        for (let col = startCol; col < endCol; col++) {
          const key = `${row}:${col}`;
          if (!highlightMap.has(key)) {
            highlightMap.set(key, new Set());
          }
          highlightMap.get(key).add(capture.name);
        }
      }
    }
    
    // Process test assertions
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const assertions = this.parseAssertions(line);
      
      for (const assertion of assertions) {
        this.totalTests++;
        const testLine = assertion.type === '<-' ? i - 1 : i - 1;
        const testCol = assertion.col;
        const key = `${testLine}:${testCol}`;
        const highlights = highlightMap.get(key) || new Set();
        
        const passed = assertion.negated
          ? !highlights.has(assertion.capture)
          : highlights.has(assertion.capture);
        
        if (passed) {
          this.passedTests++;
          console.log(`  ${colors.green}✓${colors.reset} Line ${i + 1}: ${assertion.capture} ${assertion.negated ? 'not ' : ''}at column ${testCol}`);
        } else {
          this.failedTests++;
          console.log(`  ${colors.red}✗${colors.reset} Line ${i + 1}: Expected ${assertion.negated ? 'no ' : ''}${assertion.capture} at column ${testCol}`);
          console.log(`    ${colors.gray}Found: ${highlights.size > 0 ? Array.from(highlights).join(', ') : 'none'}${colors.reset}`);
          
          // Show context
          if (testLine >= 0 && testLine < lines.length) {
            console.log(`    ${colors.gray}Context: ${lines[testLine]}${colors.reset}`);
            console.log(`    ${colors.gray}         ${' '.repeat(testCol)}^${colors.reset}`);
          }
        }
      }
    }
    
    console.log('');
  }

  parseAssertions(line) {
    const assertions = [];
    
    // Parse arrow assertions: // <- capture
    const arrowMatch = line.match(/^(\s*)\/\/\s*<-\s*(!)?(.+)$/);
    if (arrowMatch) {
      // For arrow assertions, the column matches the indentation of the comment
      const col = arrowMatch[1].length;
      const negated = !!arrowMatch[2];
      const capture = arrowMatch[3].trim();
      assertions.push({ type: '<-', col, capture, negated });
    }
    
    // Parse caret assertions: // ^ capture
    const caretRegex = /(\^+)\s*(!)?([^\s]+)/g;
    let caretMatch;
    while ((caretMatch = caretRegex.exec(line)) !== null) {
      // Find the position of the caret in the line
      const caretPos = line.indexOf(caretMatch[1], caretMatch.index);
      const caretLength = caretMatch[1].length;
      const negated = !!caretMatch[2];
      const capture = caretMatch[3];
      
      // The caret position in the comment line corresponds to the same column
      // position in the previous line
      for (let i = 0; i < caretLength; i++) {
        assertions.push({
          type: '^',
          col: caretPos + i,
          capture,
          negated
        });
      }
    }
    
    return assertions;
  }

  printSummary() {
    const total = this.totalTests;
    const passed = this.passedTests;
    const failed = this.failedTests;
    
    console.log('\n' + '='.repeat(50));
    console.log(`${colors.blue}Test Summary:${colors.reset}`);
    console.log(`Total:  ${total}`);
    console.log(`Passed: ${colors.green}${passed}${colors.reset}`);
    console.log(`Failed: ${colors.red}${failed}${colors.reset}`);
    
    if (failed === 0) {
      console.log(`\n${colors.green}All tests passed! 🎉${colors.reset}`);
      process.exit(0);
    } else {
      console.log(`\n${colors.red}Some tests failed.${colors.reset}`);
      process.exit(1);
    }
  }
}

// Run tests
const tester = new HighlightTester();
tester.runTests();