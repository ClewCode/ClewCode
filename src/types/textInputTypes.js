/**
 * Type guard for image PastedContent with non-empty data. Empty-content
 * images (e.g. from a 0-byte file drag) yield empty base64 strings that
 * the API rejects with `image cannot be empty`. Use this at every site
 * that converts PastedContent → ImageBlockParam so the filter and the
 * ID list stay in sync.
 */
export function isValidImagePaste(c) {
    return c.type === 'image' && c.content.length > 0;
}
/** Extract image paste IDs from a QueuedCommand's pastedContents. */
export function getImagePasteIds(pastedContents) {
    if (!pastedContents) {
        return undefined;
    }
    const ids = Object.values(pastedContents)
        .filter(isValidImagePaste)
        .map(c => c.id);
    return ids.length > 0 ? ids : undefined;
}
