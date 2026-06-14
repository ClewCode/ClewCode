import { createSignal } from './signal.js';
export class Mailbox {
    queue = [];
    waiters = [];
    changed = createSignal();
    _revision = 0;
    get length() {
        return this.queue.length;
    }
    get revision() {
        return this._revision;
    }
    send(msg) {
        this._revision++;
        const idx = this.waiters.findIndex(w => w.fn(msg));
        if (idx !== -1) {
            const waiter = this.waiters.splice(idx, 1)[0];
            if (waiter) {
                waiter.resolve(msg);
                this.notify();
                return;
            }
        }
        this.queue.push(msg);
        this.notify();
    }
    poll(fn = () => true) {
        const idx = this.queue.findIndex(fn);
        if (idx === -1)
            return undefined;
        return this.queue.splice(idx, 1)[0];
    }
    receive(fn = () => true) {
        const idx = this.queue.findIndex(fn);
        if (idx !== -1) {
            const msg = this.queue.splice(idx, 1)[0];
            if (msg) {
                this.notify();
                return Promise.resolve(msg);
            }
        }
        return new Promise(resolve => {
            this.waiters.push({ fn, resolve });
        });
    }
    subscribe = this.changed.subscribe;
    notify() {
        this.changed.emit();
    }
}
