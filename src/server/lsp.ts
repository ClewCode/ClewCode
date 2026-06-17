/**
 * LSP types per JSON-RPC 2.0
 */
type LSPRequest = {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
};

type LSPResponse = {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

type LSPNotification = {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
};

type Position = { line: number; character: number };
type Range = { start: Position; end: Position };

type CompletionItem = {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string;
  insertText?: string;
  insertTextFormat?: number;
  command?: { title: string; command: string; arguments?: unknown[] };
};

type CodeAction = {
  title: string;
  kind?: string;
  command?: { title: string; command: string; arguments?: unknown[] };
};

type Hover = {
  contents: { kind: 'markdown' | 'plaintext'; value: string } | string;
  range?: Range;
};

type Location = { uri: string; range: Range };

/**
 * Lulu LSP Server - AI pair programming through Language Server Protocol
 * Compatible with VS Code, Neovim, Emacs, and other LSP clients
 */
export class LuluLSPServer {
  private documents: Map<string, string> = new Map();
  private documentVersions: Map<string, number> = new Map();

  /**
   * Start the LSP server over stdio
   */
  start(): void {
    process.stdin.setEncoding('utf8');

    let buffer = '';
    process.stdin.on('data', (chunk: string) => {
      buffer += chunk;
      this.processBuffer(buffer);
      buffer = '';
    });

    // Send initialize on startup is handled by client
  }

  private processBuffer(buffer: string): void {
    // LSP uses Content-Length header
    // Format: Content-Length: N\r\n\r\n<payload>
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) return;

    const headers = buffer.slice(0, headerEnd);
    const contentLengthMatch = headers.match(/Content-Length:\s*(\d+)/i);
    if (!contentLengthMatch) return;

    const contentLength = parseInt(contentLengthMatch[1], 10);
    const payloadStart = headerEnd + 4;
    const payload = buffer.slice(payloadStart, payloadStart + contentLength);

    if (payload.length < contentLength) return;

    try {
      const message = JSON.parse(payload) as LSPRequest | LSPNotification;
      this.handleMessage(message);
    } catch (_e) {
      this.sendError(-32700, 'Parse error');
    }
  }

  private handleMessage(message: LSPRequest | LSPNotification): void {
    if ('id' in message) {
      this.handleRequest(message);
    } else {
      this.handleNotification(message);
    }
  }

  private handleRequest(request: LSPRequest): void {
    try {
      switch (request.method) {
        case 'initialize':
          this.sendResponse(request.id, this.getInitializeResult());
          break;
        case 'initialized':
          // Client is ready, nothing to do
          break;
        case 'shutdown':
          this.sendResponse(request.id, null);
          break;
        case 'exit':
          process.exit(0);
          break;
        case 'textDocument/completion':
          this.handleCompletion(request);
          break;
        case 'textDocument/hover':
          this.handleHover(request);
          break;
        case 'textDocument/definition':
          this.handleDefinition(request);
          break;
        case 'textDocument/codeAction':
          this.handleCodeAction(request);
          break;
        case 'textDocument/publishDiagnostics':
          this.handlePublishDiagnostics(request);
          break;
        case 'workspace/executeCommand':
          this.handleExecuteCommand(request);
          break;
        case '$/cancelRequest':
          // Request cancellation, ignore for now
          break;
        default:
          this.sendError(request.id, -32601, `Method not found: ${request.method}`);
      }
    } catch (e) {
      this.sendError(request.id, -32603, String(e));
    }
  }

  private handleNotification(notification: LSPNotification): void {
    switch (notification.method) {
      case 'textDocument/didOpen':
        this.handleDidOpen(notification);
        break;
      case 'textDocument/didChange':
        this.handleDidChange(notification);
        break;
      case 'textDocument/didClose':
        this.handleDidClose(notification);
        break;
      case 'textDocument/didSave':
        this.handleDidSave(notification);
        break;
    }
  }

  private handleDidOpen(notification: LSPNotification): void {
    const params = notification.params as {
      textDocument: { uri: string; languageId: string; version: number; text: string };
    };
    this.documents.set(params.textDocument.uri, params.textDocument.text);
    this.documentVersions.set(params.textDocument.uri, params.textDocument.version);
  }

  private handleDidChange(notification: LSPNotification): void {
    const params = notification.params as {
      textDocument: { uri: string; version: number };
      contentChanges: { text: string }[];
    };
    // Full sync for simplicity
    if (params.contentChanges.length > 0 && params.contentChanges[0].text) {
      this.documents.set(params.textDocument.uri, params.contentChanges[0].text);
      this.documentVersions.set(params.textDocument.uri, params.textDocument.version);
    }
  }

  private handleDidClose(notification: LSPNotification): void {
    const params = notification.params as { textDocument: { uri: string } };
    this.documents.delete(params.textDocument.uri);
    this.documentVersions.delete(params.textDocument.uri);
  }

  private handleDidSave(_notification: LSPNotification): void {
    // Could trigger AI analysis on save
  }

  private handlePublishDiagnostics(request: LSPRequest): void {
    // Diagnostics request - return diagnostics for the document
    const params = request.params as { textDocument: { uri: string } };
    this.sendDiagnostics(params.textDocument.uri);
  }

  private sendDiagnostics(uri: string): void {
    const _content = this.documents.get(uri) || '';
    const diagnostics: { range: Range; message: string; severity: number }[] = [];

    // Simple AI-style diagnostics placeholder
    // In real implementation, send to Lulu agent for analysis

    this.sendNotification('textDocument/publishDiagnostics', {
      uri,
      diagnostics,
    });
  }

  private getInitializeResult(): unknown {
    return {
      capabilities: {
        textDocumentSync: 1, // Incremental
        completionProvider: {
          resolveProvider: false,
          triggerCharacters: ['/'],
        },
        hoverProvider: true,
        definitionProvider: true,
        codeActionProvider: {
          codeActionKinds: ['quickfix', 'refactor'],
        },
        executeCommandProvider: {
          commands: ['lulu.ask', 'lulu.explain', 'lulu.fix', 'lulu.refactor', 'lulu.generate'],
        },
      },
      serverInfo: {
        name: 'claude-code-lsp',
        version: '1.0.0',
      },
    };
  }

  private handleCompletion(request: LSPRequest): void {
    const items: CompletionItem[] = [
      {
        label: '/ask',
        kind: 3,
        detail: 'Ask Lulu about selected code',
        insertText: '/ask',
        command: { title: 'Ask Lulu', command: 'lulu.ask', arguments: [] },
      },
      {
        label: '/explain',
        kind: 3,
        detail: 'Explain the selected code',
        insertText: '/explain',
        command: { title: 'Explain', command: 'lulu.explain', arguments: [] },
      },
      {
        label: '/fix',
        kind: 3,
        detail: 'Fix issues in selected code',
        insertText: '/fix',
        command: { title: 'Fix', command: 'lulu.fix', arguments: [] },
      },
      {
        label: '/refactor',
        kind: 3,
        detail: 'Refactor the selected code',
        insertText: '/refactor',
        command: { title: 'Refactor', command: 'lulu.refactor', arguments: [] },
      },
      {
        label: '/generate',
        kind: 3,
        detail: 'Generate code from description',
        insertText: '/generate ',
        command: { title: 'Generate', command: 'lulu.generate', arguments: [] },
      },
    ];

    this.sendResponse(request.id, { isIncomplete: false, items });
  }

  private handleHover(request: LSPRequest): void {
    const result: Hover = {
      contents: {
        kind: 'markdown',
        value:
          '**Lulu LSP** - AI pair programming assistance\n\nSelect code and use `/ask`, `/explain`, `/fix`, or `/refactor` commands.',
      },
    };
    this.sendResponse(request.id, result);
  }

  private handleDefinition(request: LSPRequest): void {
    this.sendResponse(request.id, null);
  }

  private handleCodeAction(request: LSPRequest): void {
    const items: CodeAction[] = [
      {
        title: 'Lulu: Ask about selection',
        kind: 'refactor.extract',
        command: { title: 'Ask Lulu', command: 'lulu.ask', arguments: [] },
      },
      {
        title: 'Lulu: Explain',
        kind: 'refactor.extract',
        command: { title: 'Explain', command: 'lulu.explain', arguments: [] },
      },
    ];
    this.sendResponse(request.id, { actions: items });
  }

  private handleExecuteCommand(request: LSPRequest): void {
    const _params = request.params as { command: string; arguments?: unknown[] };
    // TODO: Integrate with Lulu agent system via IPC
    this.sendResponse(request.id, null);
  }

  private sendResponse(id: number | string, result: unknown): void {
    const response: LSPResponse = { jsonrpc: '2.0', id, result };
    this.sendMessage(response);
  }

  private sendError(id: number | string, code: number, message: string): void {
    const response: LSPResponse = { jsonrpc: '2.0', id, error: { code, message } };
    this.sendMessage(response);
  }

  private sendNotification(method: string, params?: unknown): void {
    const notification: LSPNotification = { jsonrpc: '2.0', method, params };
    this.sendMessage(notification);
  }

  private sendMessage(message: LSPResponse | LSPNotification): void {
    const payload = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n`;
    process.stdout.write(header + payload);
  }
}

// Start stdio server when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  new LuluLSPServer().start();
}
