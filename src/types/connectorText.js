export function isConnectorTextBlock(block) {
    return typeof block === 'object' && block !== null && block.type === 'connector_text';
}
