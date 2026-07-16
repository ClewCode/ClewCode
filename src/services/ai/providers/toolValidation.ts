/**
 * Add strict parameter validation to function tools.
 * When strict=true, OpenAI enforces that tool arguments match the schema exactly.
 * This prevents hallucinated parameters and improves reliability.
 */
export function addStrictValidation(tools: any[]): any[] {
  return tools.map(tool => {
    if (tool.type !== 'function' || !tool.function) {
      return tool;
    }

    // Only set strict if not already explicitly set
    if ('strict' in tool.function) {
      return tool;
    }

    return {
      ...tool,
      function: {
        ...tool.function,
        strict: true,
      },
    };
  });
}
