import { once } from 'node:events';
import { EventType, type AGUIEvent } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import type { Response } from 'express';

type StreamHandler = (
  ...args: unknown[]
) => AsyncIterable<AGUIEvent> | Promise<AsyncIterable<AGUIEvent>>;

interface StreamAgentOptions {
  errorCode?: string;
  errorMessage?: string;
}

function isResponse(value: unknown): value is Response {
  return (
    typeof value === 'object' &&
    value !== null &&
    'setHeader' in value &&
    'write' in value &&
    'end' in value
  );
}

function findResponse(args: unknown[]): Response {
  const response = args.find(isResponse);
  if (!response) {
    throw new Error('@StreamAgent() requires an Express response argument');
  }
  return response;
}

function getAcceptHeader(response: Response): string | undefined {
  const accept = response.req.headers.accept;
  return Array.isArray(accept) ? accept.join(', ') : accept;
}

async function writeAgentEvent(
  response: Response,
  encoder: EventEncoder,
  event: AGUIEvent,
  signal: AbortSignal,
): Promise<void> {
  const canContinue = response.write(encoder.encodeBinary(event));
  if (!canContinue && !response.destroyed && !signal.aborted) {
    await once(response, 'drain', { signal });
  }
}

export function StreamAgent(options: StreamAgentOptions = {}): MethodDecorator {
  return (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    const original = descriptor.value as StreamHandler;

    descriptor.value = async function (...args: unknown[]): Promise<void> {
      const response = findResponse(args);
      const abortController = new AbortController();
      const encoder = new EventEncoder({ accept: getAcceptHeader(response) });

      response.setHeader('Content-Type', encoder.getContentType());
      response.setHeader('Cache-Control', 'no-cache, no-transform');
      response.setHeader('Connection', 'keep-alive');
      response.setHeader('X-Accel-Buffering', 'no');
      response.flushHeaders();

      const onClientClose = () => {
        abortController.abort();
      };
      response.on('close', onClientClose);

      try {
        const events = await original.apply(this, [
          ...args,
          abortController.signal,
        ]);

        for await (const event of events) {
          if (response.destroyed || abortController.signal.aborted) {
            break;
          }
          await writeAgentEvent(
            response,
            encoder,
            event,
            abortController.signal,
          );
        }
      } catch (err) {
        if (abortController.signal.aborted || response.destroyed) {
          return;
        }

        const errMsg =
          err instanceof Error
            ? err.message
            : (options.errorMessage ?? 'AG-UI stream failed');
        const errorEvent: AGUIEvent = {
          type: EventType.RUN_ERROR,
          message: errMsg,
          code: options.errorCode ?? 'STREAM_AGENT_FAILED',
          timestamp: Date.now(),
        };

        await writeAgentEvent(
          response,
          encoder,
          errorEvent,
          abortController.signal,
        );
      } finally {
        response.off('close', onClientClose);
        if (!response.destroyed) {
          response.end();
        }
      }
    };

    return descriptor;
  };
}
