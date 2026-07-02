/**
 * Clew Internal Protocol v1
 *
 * The Anthropic Messages format is Clew Code's internal lingua franca. The
 * core agent loop (claude.ts) speaks this protocol exclusively; providers
 * that expose a different wire format are converted at the system edge by
 * adapters (see services/ai/adapter/AnthropicAdapter.ts).
 *
 * This file is a declaration, not an abstraction layer: the aliases below
 * pin down which SDK types constitute the protocol so that provider work
 * targets a named, versioned surface instead of "whatever claude.ts happens
 * to accept". Do not fork these shapes — if the protocol ever diverges from
 * the Anthropic SDK types, that is a protocol version bump, not a patch.
 *
 * See docs/architecture/provider-system.md for the full picture.
 */

import type {
  BetaMessage,
  BetaMessageStreamParams,
  BetaRawMessageStreamEvent,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs';

export const CLEW_INTERNAL_PROTOCOL_VERSION = 1;

/** A model request as the Clew core emits it. */
export type ClewProtocolRequest = BetaMessageStreamParams;

/** A complete (non-streaming) model response. */
export type ClewProtocolMessage = BetaMessage;

/** A single streaming event (content_block_start/delta/stop, message_delta, ...). */
export type ClewProtocolStreamEvent = BetaRawMessageStreamEvent;
