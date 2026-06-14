/**
 * A fixed-size circular buffer that automatically evicts the oldest items
 * when the buffer is full. Useful for maintaining a rolling window of data.
 */
export class CircularBuffer {
    capacity;
    buffer;
    head = 0;
    size = 0;
    constructor(capacity) {
        this.capacity = capacity;
        this.buffer = new Array(capacity);
    }
    /**
     * Add an item to the buffer. If the buffer is full,
     * the oldest item will be evicted.
     */
    add(item) {
        this.buffer[this.head] = item;
        this.head = (this.head + 1) % this.capacity;
        if (this.size < this.capacity) {
            this.size++;
        }
    }
    /**
     * Add multiple items to the buffer at once.
     */
    addAll(items) {
        for (const item of items) {
            this.add(item);
        }
    }
    /**
     * Get the most recent N items from the buffer.
     * Returns fewer items if the buffer contains less than N items.
     */
    getRecent(count) {
        const result = [];
        const start = this.size < this.capacity ? 0 : this.head;
        const available = Math.min(count, this.size);
        for (let i = 0; i < available; i++) {
            const index = (start + this.size - available + i) % this.capacity;
            result.push(this.buffer[index]);
        }
        return result;
    }
    /**
     * Get all items currently in the buffer, in order from oldest to newest.
     */
    toArray() {
        if (this.size === 0)
            return [];
        const result = [];
        const start = this.size < this.capacity ? 0 : this.head;
        for (let i = 0; i < this.size; i++) {
            const index = (start + i) % this.capacity;
            result.push(this.buffer[index]);
        }
        return result;
    }
    /**
     * Clear all items from the buffer.
     */
    clear() {
        this.buffer.length = 0;
        this.head = 0;
        this.size = 0;
    }
    /**
     * Get the current number of items in the buffer.
     */
    length() {
        return this.size;
    }
}
