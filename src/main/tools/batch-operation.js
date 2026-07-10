import { isCancelledError, isSafetyError } from '../../shared/errors.js';
import { errorMessage } from '../utils.js';

export async function runNodeBatch(nodes, context, operation, options = {}) {
  const changedNodes = [];
  const skipped = [];
  const values = [];
  const shouldRethrow = options.shouldRethrow || rethrowCancellationOrSafety;

  await context?.yieldToHost();
  for (let index = 0; index < nodes.length; index++) {
    await context?.yieldIfNeeded();
    const node = nodes[index];
    try {
      const value = await operation(node, index);
      if (value === false) continue;
      changedNodes.push(node);
      if (value !== undefined && value !== true) values.push(value);
    } catch (error) {
      if (shouldRethrow(error)) throw error;
      skipped.push({
        id: node.id,
        name: node.name,
        reason: errorMessage(error),
      });
    }
  }

  return {
    changed: changedNodes.length,
    changedNodes,
    skipped,
    values,
  };
}

export function rethrowCancellationOrSafety(error) {
  return isCancelledError(error) || isSafetyError(error);
}
