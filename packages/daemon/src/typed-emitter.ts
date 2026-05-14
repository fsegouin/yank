import { EventEmitter } from 'node:events';

type AnyFn = (...args: never[]) => void;
type Cb = (...args: unknown[]) => void;

export type ListenerSignature<L> = {
  [E in keyof L]: AnyFn;
};

export interface TypedEventEmitter<Events extends ListenerSignature<Events>> {
  on<E extends keyof Events & string>(event: E, cb: Events[E]): this;
  off<E extends keyof Events & string>(event: E, cb: Events[E]): this;
  emit<E extends keyof Events & string>(event: E, ...args: Parameters<Events[E]>): boolean;
}

export class TypedEmitter<Events extends ListenerSignature<Events>>
  implements TypedEventEmitter<Events>
{
  private readonly inner = new EventEmitter();

  on<E extends keyof Events & string>(event: E, cb: Events[E]): this {
    this.inner.on(event, cb as unknown as Cb);
    return this;
  }
  off<E extends keyof Events & string>(event: E, cb: Events[E]): this {
    this.inner.off(event, cb as unknown as Cb);
    return this;
  }
  emit<E extends keyof Events & string>(event: E, ...args: Parameters<Events[E]>): boolean {
    return this.inner.emit(event, ...(args as unknown[]));
  }
}
