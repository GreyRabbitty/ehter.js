import type { FeeData, Provider } from "./provider.js";
export declare class NetworkPlugin {
    readonly name: string;
    constructor(name: string);
    clone(): NetworkPlugin;
}
export declare type GasCostParameters = {
    txBase?: number;
    txCreate?: number;
    txDataZero?: number;
    txDataNonzero?: number;
    txAccessListStorageKey?: number;
    txAccessListAddress?: number;
};
export declare class GasCostPlugin extends NetworkPlugin implements GasCostParameters {
    readonly effectiveBlock: number;
    readonly txBase: number;
    readonly txCreate: number;
    readonly txDataZero: number;
    readonly txDataNonzero: number;
    readonly txAccessListStorageKey: number;
    readonly txAccessListAddress: number;
    constructor(effectiveBlock?: number, costs?: GasCostParameters);
    clone(): GasCostPlugin;
}
export declare class EnsPlugin extends NetworkPlugin {
    readonly address: string;
    readonly targetNetwork: number;
    constructor(address?: null | string, targetNetwork?: null | number);
    clone(): EnsPlugin;
}
export declare class FeeDataNetworkPlugin extends NetworkPlugin {
    #private;
    get feeDataFunc(): (provider: Provider) => Promise<FeeData>;
    constructor(feeDataFunc: (provider: Provider) => Promise<FeeData>);
    getFeeData(provider: Provider): Promise<FeeData>;
    clone(): FeeDataNetworkPlugin;
}
import type { Block, BlockParams, TransactionResponse, TransactionResponseParams } from "./provider.js";
export declare class CustomBlockNetworkPlugin extends NetworkPlugin {
    #private;
    constructor(blockFunc: (provider: Provider, block: BlockParams<string>) => Block<string>, blockWithTxsFunc: (provider: Provider, block: BlockParams<TransactionResponseParams>) => Block<TransactionResponse>);
    getBlock(provider: Provider, block: BlockParams<string>): Promise<Block<string>>;
    getBlockWithTransactions(provider: Provider, block: BlockParams<TransactionResponseParams>): Promise<Block<TransactionResponse>>;
    clone(): CustomBlockNetworkPlugin;
}
//# sourceMappingURL=plugins-network.d.ts.map