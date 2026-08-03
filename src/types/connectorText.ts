export interface ConnectorTextBlock {
  type: 'connector_text';
  text: string;
  connector_text: string;
  signature?: string;
}

export interface ConnectorTextDelta {
  type: 'connector_text_delta';
  connector_text: string;
}

export function isConnectorTextBlock(block: unknown): block is ConnectorTextBlock {
  return typeof block === 'object' && block !== null && (block as any).type === 'connector_text';
}
