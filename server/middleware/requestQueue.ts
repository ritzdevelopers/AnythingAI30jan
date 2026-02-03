/**
 * Request queue: limit concurrent AI requests so the server is not overwhelmed.
 * Uses p-queue. Requests beyond concurrency limit wait in line.
 */

import PQueue from 'p-queue';

const CONCURRENCY = Number(process.env.AI_QUEUE_CONCURRENCY) || 3;

const aiQueue = new PQueue({ concurrency: CONCURRENCY });

/**
 * Run an async function through the queue. If more than CONCURRENCY
 * requests are in flight, this promise waits until a slot is free.
 */
export function withQueue<T>(fn: () => Promise<T>): Promise<T> {
  return aiQueue.add(fn);
}
