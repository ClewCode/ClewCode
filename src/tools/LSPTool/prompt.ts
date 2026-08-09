export const LSP_TOOL_NAME = 'LSP' as const;

export const DESCRIPTION = `Interact with Language Server Protocol (LSP) servers to get code intelligence features.

START HERE:
- explore: Given symbol names or a question, returns the matching symbols' verbatim source (with line numbers) plus who calls them. Prefer this over Grep + Read when you want to understand or safely change code — one call replaces a search, several file reads, and a caller hunt. Takes only a query; no file or position needed.

Position-based operations (use when you already know the exact spot):
- goToDefinition: Find where a symbol is defined
- findReferences: Find all references to a symbol
- hover: Get hover information (documentation, type info) for a symbol
- documentSymbol: Get all symbols (functions, classes, variables) in a document
- workspaceSymbol: Search for symbols across the entire workspace
- goToImplementation: Find implementations of an interface or abstract method
- prepareCallHierarchy: Get call hierarchy item at a position (functions/methods)
- incomingCalls: Find all functions/methods that call the function at a position
- outgoingCalls: Find all functions/methods called by the function at a position

explore requires:
- query: Symbol names ("PeerServer setActiveMode") or a question ("how does peer discovery start")

All other operations require:
- filePath: The file to operate on
- line: The line number (1-based, as shown in editors)
- character: The character offset (1-based, as shown in editors)

explore reads live from the LSP servers and the files on disk, so its results are never stale. It only reports symbols defined inside the project — for text that is not code (strings, config keys, comments), use Grep.

Note: LSP servers must be configured for the file type. If no server is available, an error will be returned.`;
