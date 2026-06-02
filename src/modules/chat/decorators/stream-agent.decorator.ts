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

// 将普通控制器方法装饰为 AG-UI SSE 流端点，统一处理响应头、断连取消和错误事件。
export function StreamAgent(options: StreamAgentOptions = {}): MethodDecorator {
  return (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    const original = descriptor.value as StreamHandler;

    descriptor.value = async function (...args: unknown[]): Promise<void> {
      // 从控制器入参中找到 Express 响应对象，让装饰器接管后续的流式写出。
      const response = args.find((value): value is Response => {
        return (
          typeof value === 'object' &&
          value !== null &&
          'setHeader' in value &&
          'write' in value &&
          'end' in value
        );
      });

      if (!response) {
        throw new Error('@StreamAgent() requires an Express response argument');
      }

      const abortController = new AbortController();
      const accept = response.req.headers.accept;
      const encoder = new EventEncoder({
        accept: Array.isArray(accept) ? accept.join(', ') : accept,
      });

      // 用 AG-UI 协议要求的响应头打开一条干净的 SSE 通道。
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
        const runOriginal = original.bind(this) as StreamHandler;
        const events = await runOriginal(...args, abortController.signal);

        for await (const event of events) {
          if (response.destroyed || abortController.signal.aborted) {
            break;
          }

          const canContinue = response.write(encoder.encodeBinary(event));
          if (
            !canContinue &&
            !response.destroyed &&
            !abortController.signal.aborted
          ) {
            await once(response, 'drain', { signal: abortController.signal });
          }
        }
      } catch (err) {
        if (abortController.signal.aborted || response.destroyed) {
          return;
        }

        let errMsg = options.errorMessage ?? 'AG-UI stream failed';
        if (err instanceof Error) {
          errMsg = err.message;
        }

        // 即使业务流失败，也用 AG-UI 事件格式把错误收束给前端。
        const errorEvent: AGUIEvent = {
          type: EventType.RUN_ERROR,
          message: errMsg,
          code: options.errorCode ?? 'STREAM_AGENT_FAILED',
          timestamp: Date.now(),
        };

        const canContinue = response.write(encoder.encodeBinary(errorEvent));
        if (
          !canContinue &&
          !response.destroyed &&
          !abortController.signal.aborted
        ) {
          await once(response, 'drain', { signal: abortController.signal });
        }
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
