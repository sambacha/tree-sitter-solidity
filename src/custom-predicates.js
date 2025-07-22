/**
 * Custom predicates for tree-sitter-solidity
 * 
 * This module provides custom predicates that can be used in query files
 * to enable more sophisticated pattern matching and context-aware highlighting.
 */

class SolidityPredicates {
  constructor() {
    this.predicates = new Map();
    this.registerBuiltinPredicates();
  }

  /**
   * Register all built-in custom predicates
   */
  registerBuiltinPredicates() {
    // Version comparison predicates
    this.register('solidity-version-gte', this.solidityVersionGte.bind(this));
    this.register('solidity-version-lt', this.solidityVersionLt.bind(this));
    
    // Type identification predicates
    this.register('is-user-defined-type', this.isUserDefinedType.bind(this));
    this.register('is-mapping-type', this.isMappingType.bind(this));
    this.register('is-array-type', this.isArrayType.bind(this));
    
    // Variable context predicates
    this.register('is-state-variable', this.isStateVariable.bind(this));
    this.register('is-constant', this.isConstant.bind(this));
    this.register('is-immutable', this.isImmutable.bind(this));
    
    // Function type predicates
    this.register('is-payable', this.isPayable.bind(this));
    this.register('is-view', this.isView.bind(this));
    this.register('is-pure', this.isPure.bind(this));
    this.register('is-external-call', this.isExternalCall.bind(this));
    this.register('is-low-level-call', this.isLowLevelCall.bind(this));
  }

  /**
   * Register a custom predicate
   * @param {string} name - Predicate name (without # prefix)
   * @param {Function} handler - Predicate handler function
   */
  register(name, handler) {
    this.predicates.set(name, handler);
  }

  /**
   * Apply a predicate
   * @param {string} name - Predicate name
   * @param {Array} operands - Predicate operands
   * @param {Object} match - Query match object
   * @returns {boolean} - Whether the predicate passes
   */
  apply(name, operands, match) {
    const handler = this.predicates.get(name);
    if (!handler) {
      // Unknown predicate - let tree-sitter handle it or ignore
      return true;
    }
    return handler(operands, match);
  }

  /**
   * Helper to get the source file's pragma version
   * @param {Object} node - AST node
   * @returns {string|null} - Version string or null
   */
  getPragmaVersion(node) {
    let root = node;
    while (root.parent) {
      root = root.parent;
    }
    
    // Find pragma directive
    for (let i = 0; i < root.childCount; i++) {
      const child = root.child(i);
      if (child.type === 'pragma_directive') {
        // Look for solidity_pragma_token child
        for (let j = 0; j < child.childCount; j++) {
          const subchild = child.child(j);
          if (subchild.type === 'solidity_pragma_token') {
            // Extract version from the text, e.g., "solidity ^0.8.19"
            const text = subchild.text;
            const versionMatch = text.match(/(\d+\.\d+\.\d+)/);
            if (versionMatch) {
              return versionMatch[1];
            }
          }
        }
      }
    }
    return null;
  }

  /**
   * Compare semantic versions
   * @param {string} v1 - First version
   * @param {string} v2 - Second version
   * @returns {number} - -1 if v1 < v2, 0 if equal, 1 if v1 > v2
   */
  compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 < p2) return -1;
      if (p1 > p2) return 1;
    }
    return 0;
  }

  /**
   * Check if pragma version >= specified version
   */
  solidityVersionGte(operands, match) {
    if (operands.length < 2) return false;
    const [captureNode, targetVersion] = operands;
    const captureName = captureNode.name.replace(/^@/, '');
    const node = match.captures.find(c => c.name === captureName)?.node;
    if (!node) return false;
    
    const pragmaVersion = this.getPragmaVersion(node);
    if (!pragmaVersion) return false;
    
    return this.compareVersions(pragmaVersion, targetVersion.value) >= 0;
  }

  /**
   * Check if pragma version < specified version
   */
  solidityVersionLt(operands, match) {
    if (operands.length < 2) return false;
    const [captureNode, targetVersion] = operands;
    const captureName = captureNode.name.replace(/^@/, '');
    const node = match.captures.find(c => c.name === captureName)?.node;
    if (!node) return false;
    
    const pragmaVersion = this.getPragmaVersion(node);
    if (!pragmaVersion) return false;
    
    return this.compareVersions(pragmaVersion, targetVersion.value) < 0;
  }

  /**
   * Check if type is user-defined (not primitive)
   */
  isUserDefinedType(operands, match) {
    if (operands.length < 1) return false;
    const captureNode = operands[0];
    const captureName = captureNode.name.replace(/^@/, '');
    const node = match.captures.find(c => c.name === captureName)?.node;
    if (!node) return false;
    
    // Check parent node type
    const parent = node.parent;
    return parent && parent.type === 'user_defined_type';
  }

  /**
   * Check if type is a mapping
   */
  isMappingType(operands, match) {
    if (operands.length < 1) return false;
    const captureNode = operands[0];
    const captureName = captureNode.name.replace(/^@/, '');
    const node = match.captures.find(c => c.name === captureName)?.node;
    if (!node) return false;
    
    // Check if node is part of a mapping type
    let current = node;
    while (current) {
      if (current.type === 'mapping_type') return true;
      current = current.parent;
    }
    return false;
  }

  /**
   * Check if type is an array
   */
  isArrayType(operands, match) {
    if (operands.length < 1) return false;
    const captureNode = operands[0];
    const captureName = captureNode.name.replace(/^@/, '');
    const node = match.captures.find(c => c.name === captureName)?.node;
    if (!node) return false;
    
    // Check if node is part of an array type
    let current = node;
    while (current) {
      if (current.type === 'array_type') return true;
      current = current.parent;
    }
    return false;
  }

  /**
   * Check if identifier is a state variable
   */
  isStateVariable(operands, match) {
    if (operands.length < 1) return false;
    const captureNode = operands[0];
    // captureNode is {type: 'capture', name: '@variable.state'}
    const captureName = (captureNode.name || captureNode).replace(/^@/, '');
    const node = match.captures.find(c => c.name === captureName)?.node;
    if (!node) return false;
    
    // State variables are defined at contract body level
    let parent = node.parent;
    while (parent) {
      if (parent.type === 'state_variable_declaration') return true;
      if (parent.type === 'function_definition' || 
          parent.type === 'modifier_definition' ||
          parent.type === 'constructor_definition') {
        return false; // Local variable
      }
      parent = parent.parent;
    }
    return false;
  }

  /**
   * Check if variable is declared as constant
   */
  isConstant(operands, match) {
    if (operands.length < 1) return false;
    const captureNode = operands[0];
    const captureName = captureNode.name.replace(/^@/, '');
    const node = match.captures.find(c => c.name === captureName)?.node;
    if (!node) return false;
    
    // Check for constant keyword in declaration
    let parent = node.parent;
    while (parent) {
      if (parent.type === 'state_variable_declaration' || 
          parent.type === 'constant_variable_declaration') {
        // Look for 'constant' keyword among siblings
        for (let i = 0; i < parent.childCount; i++) {
          const child = parent.child(i);
          if (child.type === 'constant' && child.text === 'constant') {
            return true;
          }
        }
      }
      parent = parent.parent;
    }
    return false;
  }

  /**
   * Check if variable is declared as immutable
   */
  isImmutable(operands, match) {
    if (operands.length < 1) return false;
    const captureNode = operands[0];
    const captureName = captureNode.name.replace(/^@/, '');
    const node = match.captures.find(c => c.name === captureName)?.node;
    if (!node) return false;
    
    // Check for immutable keyword in declaration
    let parent = node.parent;
    while (parent) {
      if (parent.type === 'state_variable_declaration') {
        // Look for 'immutable' keyword among siblings
        for (let i = 0; i < parent.childCount; i++) {
          const child = parent.child(i);
          if (child.type === 'immutable' && child.text === 'immutable') {
            return true;
          }
        }
      }
      parent = parent.parent;
    }
    return false;
  }

  /**
   * Check if function is payable
   */
  isPayable(operands, match) {
    if (operands.length < 1) return false;
    const captureNode = operands[0];
    const captureName = captureNode.name.replace(/^@/, '');
    const node = match.captures.find(c => c.name === captureName)?.node;
    if (!node) return false;
    
    // Find enclosing function definition
    let funcDef = node;
    while (funcDef && funcDef.type !== 'function_definition') {
      funcDef = funcDef.parent;
    }
    if (!funcDef) return false;
    
    // Check for payable modifier
    const modifiers = funcDef.childForFieldName('modifiers');
    if (modifiers) {
      for (let i = 0; i < modifiers.childCount; i++) {
        const child = modifiers.child(i);
        if (child.text === 'payable') return true;
      }
    }
    return false;
  }

  /**
   * Check if function is view
   */
  isView(operands, match) {
    if (operands.length < 1) return false;
    const captureNode = operands[0];
    const captureName = captureNode.name.replace(/^@/, '');
    const node = match.captures.find(c => c.name === captureName)?.node;
    if (!node) return false;
    
    // Find enclosing function definition
    let funcDef = node;
    while (funcDef && funcDef.type !== 'function_definition') {
      funcDef = funcDef.parent;
    }
    if (!funcDef) return false;
    
    // Check for view modifier
    const modifiers = funcDef.childForFieldName('modifiers');
    if (modifiers) {
      for (let i = 0; i < modifiers.childCount; i++) {
        const child = modifiers.child(i);
        if (child.text === 'view') return true;
      }
    }
    return false;
  }

  /**
   * Check if function is pure
   */
  isPure(operands, match) {
    if (operands.length < 1) return false;
    const captureNode = operands[0];
    const captureName = captureNode.name.replace(/^@/, '');
    const node = match.captures.find(c => c.name === captureName)?.node;
    if (!node) return false;
    
    // Find enclosing function definition
    let funcDef = node;
    while (funcDef && funcDef.type !== 'function_definition') {
      funcDef = funcDef.parent;
    }
    if (!funcDef) return false;
    
    // Check for pure modifier
    const modifiers = funcDef.childForFieldName('modifiers');
    if (modifiers) {
      for (let i = 0; i < modifiers.childCount; i++) {
        const child = modifiers.child(i);
        if (child.text === 'pure') return true;
      }
    }
    return false;
  }

  /**
   * Check if call is an external contract call
   */
  isExternalCall(operands, match) {
    if (operands.length < 1) return false;
    const captureNode = operands[0];
    const captureName = captureNode.name.replace(/^@/, '');
    const node = match.captures.find(c => c.name === captureName)?.node;
    if (!node) return false;
    
    // External calls typically have a member expression as the callee
    if (node.type === 'call_expression') {
      const callee = node.child(0);
      if (callee && callee.type === 'member_expression') {
        // Check if base is not 'this' or a library
        const base = callee.childForFieldName('base');
        if (base && base.text !== 'this') {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Check if call is a low-level call (call, delegatecall, staticcall)
   */
  isLowLevelCall(operands, match) {
    if (operands.length < 1) return false;
    const captureNode = operands[0];
    const captureName = captureNode.name.replace(/^@/, '');
    const node = match.captures.find(c => c.name === captureName)?.node;
    if (!node) return false;
    
    // Check if this is a member call to call/delegatecall/staticcall
    if (node.type === 'identifier' || node.type === 'property_identifier') {
      const text = node.text;
      return text === 'call' || text === 'delegatecall' || text === 'staticcall';
    }
    
    if (node.type === 'call_expression') {
      const callee = node.child(0);
      if (callee && callee.type === 'member_expression') {
        const property = callee.childForFieldName('property');
        if (property) {
          const text = property.text;
          return text === 'call' || text === 'delegatecall' || text === 'staticcall';
        }
      }
    }
    return false;
  }
}

// Export for use in tree-sitter queries
module.exports = SolidityPredicates;