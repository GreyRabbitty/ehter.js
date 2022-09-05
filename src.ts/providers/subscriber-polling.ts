import { isHexString } from "../utils/data.js";

import type { AbstractProvider, Subscriber } from "./abstract-provider.js";
import type { EventFilter, OrphanFilter, ProviderEvent } from "./provider.js";
import { logger } from "../utils/logger.js";

function copy(obj: any): any {
    return JSON.parse(JSON.stringify(obj));
}

export function getPollingSubscriber(provider: AbstractProvider, event: ProviderEvent): Subscriber {
    if (event === "block") { return new PollingBlockSubscriber(provider); }
    if (isHexString(event, 32)) { return new PollingTransactionSubscriber(provider, event); }

    return logger.throwError("unsupported polling event", "UNSUPPORTED_OPERATION", {
        operation: "getPollingSubscriber", info: { event }
    });
}

// @TODO: refactor this

export class PollingBlockSubscriber implements Subscriber{
    #provider: AbstractProvider;
    #poller: null | number;

    #interval: number;

    // The most recent block we have scanned for events. The value -2
    // indicates we still need to fetch an initial block number
    #blockNumber: number;

    constructor(provider: AbstractProvider) {
        this.#provider = provider;
        this.#poller = null;
        this.#interval = 4000;

        this.#blockNumber = -2;
    }

    get pollingInterval(): number { return this.#interval; }
    set pollingInterval(value: number) { this.#interval = value; }

    async #poll(): Promise<void> {
        const blockNumber = await this.#provider.getBlockNumber();
        if (this.#blockNumber === -2) {
            this.#blockNumber = blockNumber;
            return;
        }

        // @TODO: Put a cap on the maximum number of events per loop?

        if (blockNumber !== this.#blockNumber) {
            for (let b = this.#blockNumber + 1; b <= blockNumber; b++) {
                this.#provider.emit("block", b);
            }

            this.#blockNumber = blockNumber;
        }

        this.#poller = this.#provider._setTimeout(this.#poll.bind(this), this.#interval);
    }

    start(): void {
        if (this.#poller) { throw new Error("subscriber already running"); }
        this.#poll();
        this.#poller = this.#provider._setTimeout(this.#poll.bind(this), this.#interval);
    }

    stop(): void {
        if (!this.#poller) { throw new Error("subscriber not running"); }
        this.#provider._clearTimeout(this.#poller);
        this.#poller = null;
    }

    pause(dropWhilePaused?: boolean): void {
        this.stop();
        if (dropWhilePaused) { this.#blockNumber = -2; }
    }

    resume(): void {
        this.start();
    }
}

export class OnBlockSubscriber implements Subscriber {
    #provider: AbstractProvider;
    #poll: (b: number) => void;

    constructor(provider: AbstractProvider) {
        this.#provider = provider;
        this.#poll = (blockNumber: number) => {
            this._poll(blockNumber, this.#provider);
        }
    }

    async _poll(blockNumber: number, provider: AbstractProvider): Promise<void> {
        throw new Error("sub-classes must override this");
    }

    start(): void {
        this.#poll(-2);
        this.#provider.on("block", this.#poll);
    }

    stop(): void {
        this.#provider.off("block", this.#poll);
    }

    pause(dropWhilePaused?: boolean): void { this.stop(); }
    resume(): void { this.start(); }
}

export class PollingOrphanSubscriber extends OnBlockSubscriber {
    #filter: OrphanFilter;

    constructor(provider: AbstractProvider, filter: OrphanFilter) {
        super(provider);
        this.#filter = copy(filter);
    }

    async _poll(blockNumber: number, provider: AbstractProvider): Promise<void> {
        throw new Error("@TODO");
        console.log(this.#filter);
    }
}

export class PollingTransactionSubscriber extends OnBlockSubscriber {
    #hash: string;

    constructor(provider: AbstractProvider, hash: string) {
        super(provider);
        this.#hash = hash;
    }

    async _poll(blockNumber: number, provider: AbstractProvider): Promise<void> {
        const tx = await provider.getTransactionReceipt(this.#hash);
        if (tx) { provider.emit(this.#hash, tx); }
    }
}

export class PollingEventSubscriber implements Subscriber {
    #provider: AbstractProvider;
    #filter: EventFilter;
    #poller: (b: number) => void;

    // The most recent block we have scanned for events. The value -2
    // indicates we still need to fetch an initial block number
    #blockNumber: number;

    constructor(provider: AbstractProvider, filter: EventFilter) {
        this.#provider = provider;
        this.#filter = copy(filter);
        this.#poller = this.#poll.bind(this);
        this.#blockNumber = -2;
    }

    async #poll(blockNumber: number): Promise<void> {
        // The initial block hasn't been determined yet
        if (this.#blockNumber === -2) { return; }

        const filter = copy(this.#filter);
        filter.fromBlock = this.#blockNumber + 1;
        filter.toBlock = blockNumber;
        const logs = await this.#provider.getLogs(filter);

        // No logs could just mean the node has not indexed them yet,
        // so we keep a sliding window of 60 blocks to keep scanning
        if (logs.length === 0) {
            if (this.#blockNumber < blockNumber - 60) {
                this.#blockNumber = blockNumber - 60;
            }
            return;
        }

        this.#blockNumber = blockNumber;

        for (const log of logs) {
            this.#provider.emit(this.#filter, log);
        }
    }

    start(): void {
        if (this.#blockNumber === -2) {
            this.#provider.getBlockNumber().then((blockNumber) => {
                this.#blockNumber = blockNumber;
            });
        }
        this.#provider.on("block", this.#poller);
    }

    stop(): void {
        this.#provider.off("block", this.#poller);
    }

    pause(dropWhilePaused?: boolean): void {
        this.stop();
        if (dropWhilePaused) { this.#blockNumber = -2; }
    }

    resume(): void {
        this.start();
    }
}
