const Parser = require('tree-sitter');
const Solidity = require('../bindings/node');

const code = `
pragma solidity ^0.8.8;

contract Test {
  type TokenId is uint256;
}
`;

const parser = new Parser();
parser.setLanguage(Solidity);
const tree = parser.parse(code);

// Find the user_defined_type_definition node
function findNode(node, type) {
  if (node.type === type) {
    console.log(`Found ${type}:`);
    console.log('  Text:', node.text);
    console.log('  Children:');
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      console.log(`    ${i}: ${child.type} = "${child.text}"`);
    }
    return;
  }
  for (let i = 0; i < node.childCount; i++) {
    findNode(node.child(i), type);
  }
}

findNode(tree.rootNode, 'user_defined_type_definition');