// toolExecutionPool.ts

export type ToolExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ToolExecution {
  id: string;
  toolName: string;
  input: unknown;
  status: ToolExecutionStatus;
  startedAt?: number;
  finishedAt?: number;
  cancel: () => void;
}

export interface ToolExecutor {
  (input: unknown, signal: AbortSignal): Promise<unknown>;
}

export interface ToolResultEvent {
  executionId: string;
  toolName: string;
  output?: unknown;
  error?: unknown;
}

export type ToolEventEmitter = (event: ToolResultEvent) => void;

interface QueuedExecution {
  execution: ToolExecution;
  executor: ToolExecutor;
  controller: AbortController;
}

export class ToolExecutionPool {
  private readonly maxConcurrent: number;
  private readonly queue: QueuedExecution[] = [];
  private runningCount = 0;

  private readonly emitEvent: ToolEventEmitter;

  constructor(options: {
    maxConcurrent?: number;
    emitEvent: ToolEventEmitter;
  }) {
    this.maxConcurrent = options.maxConcurrent ?? 2;
    this.emitEvent = options.emitEvent;
  }

  execute(
    toolName: string,
    input: unknown,
    executor: ToolExecutor
  ): ToolExecution {
    const controller = new AbortController();

    const execution: ToolExecution = {
      id: crypto.randomUUID(),
      toolName,
      input,
      status: 'pending',
      cancel: () => {
        if (
          execution.status === 'completed' ||
          execution.status === 'failed'
        ) {
          return;
        }

        execution.status = 'cancelled';
        controller.abort();
      },
    };

    this.queue.push({
      execution,
      executor,
      controller,
    });

    this.tryRunNext();
    return execution;
  }

  private tryRunNext() {
    if (this.runningCount >= this.maxConcurrent) {
      return;
    }

    const next = this.queue.shift();
    if (!next) {
      return;
    }

    const { execution, executor, controller } = next;

    if (execution.status === 'cancelled') {
      this.tryRunNext();
      return;
    }

    this.runningCount++;
    execution.status = 'running';
    execution.startedAt = Date.now();

    executor(execution.input, controller.signal)
      .then((output) => {
        if (execution.status === 'cancelled') {
          return;
        }

        execution.status = 'completed';
        execution.finishedAt = Date.now();

        this.emitEvent({
          executionId: execution.id,
          toolName: execution.toolName,
          output,
        });
      })
      .catch((error) => {
        if (execution.status === 'cancelled') {
          return;
        }

        execution.status = 'failed';
        execution.finishedAt = Date.now();

        this.emitEvent({
          executionId: execution.id,
          toolName: execution.toolName,
          error,
        });
      })
      .finally(() => {
        this.runningCount--;
        this.tryRunNext();
      });
  }
}