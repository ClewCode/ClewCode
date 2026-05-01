import type { BetaMessageStreamParams, BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

export class AnthropicAdapter {
  private client: any
  private providerId: string

  constructor(client: any, providerId: string) {
    this.client = client
    this.providerId = providerId
  }

  get beta() {
    return {
      messages: this.messages
    }
  }

  get messages() {
    return {
      create: (params: BetaMessageStreamParams, options?: any) => {
        if (params.stream) {
          return this.handleStreaming(params, options)
        }
        return this.handleNonStreaming(params, options)
      }
    }
  }

  private handleNonStreaming(params: BetaMessageStreamParams, options?: any): any {
    const promise = (async () => {
      const openAIParams = this.convertToOpenAI(params)
      const response = await this.client.chat.completions.create({
        ...openAIParams,
        stream: false
      }, { signal: options?.signal })
      return this.convertToAnthropic(response)
    })()

    // Add .withResponse() to the promise for compatibility
    return Object.assign(promise, {
      withResponse: async () => {
        const data = await promise
        return {
          data,
          response: {
            headers: new Headers()
          },
          request_id: `adapter-${Date.now()}`
        }
      }
    })
  }

  private handleStreaming(params: BetaMessageStreamParams, options?: any): any {
    // Return an object that mimics the Anthropic stream with .withResponse() etc.
    return {
      withResponse: async () => {
        const openAIParams = this.convertToOpenAI(params)
        const stream = await this.client.chat.completions.create({
          ...openAIParams,
          stream: true
        }, { signal: options?.signal })

        return {
          data: this.wrapStream(stream),
          response: {
            headers: new Headers() // Dummy headers
          },
          request_id: `adapter-${Date.now()}`
        }
      }
    }
  }

  private async *wrapStream(stream: AsyncGenerator<any>): AsyncGenerator<any> {
    // Initial message_start event
    yield {
      type: 'message_start',
      message: {
        id: `msg-${Date.now()}`,
        type: 'message',
        role: 'assistant',
        model: 'unknown',
        content: [],
        usage: { input_tokens: 0, output_tokens: 0 }
      }
    }

    let activeIndex: number | null = null

    for await (const chunk of stream) {
      if (chunk.choices && chunk.choices[0].delta) {
        const delta = chunk.choices[0].delta
        
        // Handle text content
        if (delta.content) {
          if (activeIndex !== 0) {
            if (activeIndex !== null) {
              yield { type: 'content_block_stop', index: activeIndex }
            }
            yield {
              type: 'content_block_start',
              index: 0,
              content_block: { type: 'text', text: '' }
            }
            activeIndex = 0
          }
          yield {
            type: 'content_block_delta',
            index: 0,
            delta: {
              type: 'text_delta',
              text: delta.content
            }
          }
        }

        // Handle tool calls
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            // OpenAI indices are 0-based, but we might want to offset them 
            // if we already used index 0 for text. For simplicity, we'll use tc.index + 1
            const index = (tc.index ?? 0) + 1
            
            if (tc.function?.name) {
              if (activeIndex !== null && activeIndex !== index) {
                yield { type: 'content_block_stop', index: activeIndex }
              }
              yield {
                type: 'content_block_start',
                index: index,
                content_block: {
                  type: 'tool_use',
                  id: tc.id,
                  name: tc.function.name,
                  input: ''
                }
              }
              activeIndex = index
            }

            if (tc.function?.arguments) {
              yield {
                type: 'content_block_delta',
                index: index,
                delta: {
                  type: 'input_json_delta',
                  partial_json: tc.function.arguments
                }
              }
            }
          }
        }
      }

      if (chunk.choices && chunk.choices[0].finish_reason) {
        if (activeIndex !== null) {
          yield { type: 'content_block_stop', index: activeIndex }
          activeIndex = null
        }
        yield {
          type: 'message_delta',
          delta: {
            stop_reason: this.mapFinishReason(chunk.choices[0].finish_reason)
          },
          usage: {
            output_tokens: chunk.usage?.completion_tokens ?? 0
          }
        }
      }
    }

    yield {
      type: 'message_stop'
    }
  }

  private convertToOpenAI(params: BetaMessageStreamParams): any {
    const messages: any[] = []
    
    for (const m of params.messages) {
      const openAIMessage: any = {
        role: m.role,
        content: ''
      }

      if (typeof m.content === 'string') {
        openAIMessage.content = m.content
      } else if (Array.isArray(m.content)) {
        const textParts: string[] = []
        const toolCalls: any[] = []

        for (const c of m.content) {
          if (c.type === 'text') {
            textParts.push(c.text)
          } else if (c.type === 'tool_use') {
            toolCalls.push({
              id: c.id,
              type: 'function',
              function: {
                name: c.name,
                arguments: JSON.stringify(c.input)
              }
            })
          } else if (c.type === 'tool_result') {
            // Tool results must be separate messages in OpenAI
            messages.push({
              role: 'tool',
              tool_call_id: c.tool_use_id,
              content: typeof c.content === 'string' ? c.content : JSON.stringify(c.content)
            })
          }
        }

        if (textParts.length > 0) {
          openAIMessage.content = textParts.join('\n')
        } else if (toolCalls.length > 0) {
          // OpenAI allows null content when tool_calls are present
          openAIMessage.content = null
        }

        if (toolCalls.length > 0) {
          openAIMessage.tool_calls = toolCalls
        }
      }

      // Only push the assistant/user message if it has content or tool_calls
      // (Tool results were already pushed inside the loop)
      if (openAIMessage.content !== '' || openAIMessage.tool_calls) {
        messages.push(openAIMessage)
      }
    }

    // If there's a system prompt, add it as a system message at the beginning
    if (params.system) {
      const systemContent = Array.isArray(params.system)
        ? params.system.map((s: any) => s.text).join('\n')
        : params.system
      messages.unshift({ role: 'system', content: systemContent })
    }

    return {
      model: params.model,
      messages,
      max_tokens: params.max_tokens,
      temperature: params.temperature ?? 1,
      top_p: params.top_p,
      stop: params.stop_sequences,
      // Map tools if present
      ...(params.tools && params.tools.length > 0 && {
        tools: params.tools.map((t: any) => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.input_schema
          }
        }))
      })
    }
  }

  private convertToAnthropic(openAIResponse: any): BetaMessage {
    const choice = openAIResponse.choices[0]
    const message = choice.message
    
    const content: any[] = []
    if (message.content) {
      content.push({
        type: 'text',
        text: message.content
      })
    }

    if (message.tool_calls) {
      for (const tc of message.tool_calls) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments)
        })
      }
    }

    return {
      id: openAIResponse.id,
      type: 'message',
      role: 'assistant',
      model: openAIResponse.model,
      content,
      stop_reason: this.mapFinishReason(choice.finish_reason),
      stop_sequence: null,
      usage: {
        input_tokens: openAIResponse.usage?.prompt_tokens ?? 0,
        output_tokens: openAIResponse.usage?.completion_tokens ?? 0
      }
    } as any
  }

  private mapFinishReason(reason: string): string {
    switch (reason) {
      case 'stop': return 'end_turn'
      case 'tool_calls': return 'tool_use'
      case 'length': return 'max_tokens'
      case 'content_filter': return 'stop_sequence'
      default: return 'end_turn'
    }
  }
}
