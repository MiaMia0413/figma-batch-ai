import { MAX_CONTROL_DESCENDANT_NODES, collectNodes } from '../selection.js';
import { addUnique, nearestMeaningfulContainer, semanticMatches, uniqueNodes } from './common.js';

export function collectSemanticAnchors(nodes, query) {
  const text = [];
  const name = [];
  const seenText = new Set();
  const seenName = new Set();

  for (const node of nodes) {
    if (node.type === 'TEXT' && semanticMatches(node, query)) addUnique(text, seenText, node);
    else if (semanticMatches(node, query)) addUnique(name, seenName, node);
  }

  for (const root of name) {
    const descendants = collectNodes([root], MAX_CONTROL_DESCENDANT_NODES).nodes;
    for (const node of descendants) {
      if (node.type === 'TEXT' && semanticMatches(node, query)) addUnique(text, seenText, node);
    }
  }

  const structural = collectStructuralAnchors(text, name);
  return {
    text,
    name,
    structural,
    all: uniqueNodes([...text, ...name, ...structural]),
    total: text.length + name.length + structural.length,
  };
}

function collectStructuralAnchors(textAnchors, nameAnchors) {
  const out = [];
  const seen = new Set();

  for (const node of [...textAnchors, ...nameAnchors]) {
    const container = nearestMeaningfulContainer(node);
    if (container) addUnique(out, seen, container);
  }

  return out;
}
