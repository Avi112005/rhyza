import { Amount } from "./shared";

export enum LiquidityRequestType {
  FUND_WALLET_ADDRESS = "FUND_WALLET_ADDRESS",
  WALLET_ADDRESS_TO_WALLET_ADDRESS = "WALLET_ADDRESS_TO_WALLET_ADDRESS",
  PEER_TO_WALLET_ADDRESS = "PEER_TO_WALLET_ADDRESS",
  WALLET_ADDRESS_TO_PEER = "WALLET_ADDRESS_TO_PEER",
}

export interface LiquidityRequest<T = unknown> {
  id: string;
  type: LiquidityRequestType;
  data: T;
}

export interface WalletToWalletAddressLiquidityRequest
  extends LiquidityRequest<WalletToWalletAddressRequestData> {
  type: LiquidityRequestType.WALLET_ADDRESS_TO_WALLET_ADDRESS;
}
interface WalletToWalletAddressRequestData {
  sourceWalletAddressId: string;
  sourceAmount: bigint;
  destinationWalletAddressId: string;
  destinationAmount: bigint;
}

export interface FundWalletAddressLiquidityRequest
  extends LiquidityRequest<FundWalletAddressRequestData> {
  type: LiquidityRequestType.FUND_WALLET_ADDRESS;
}
interface FundWalletAddressRequestData {
  walletAddressId: string;
  amount: bigint;
}

export interface WalletAddressToPeerLiquidityRequest
  extends LiquidityRequest<WalletAddressToPeerRequestData> {
  type: LiquidityRequestType.WALLET_ADDRESS_TO_PEER;
}

interface WalletAddressToPeerRequestData {
  peerId: string;
  walletAddressId: string;
  amount: Amount;
}

interface PeerToWalletAddressRequestData {
  peerId: string;
  walletAddressId: string;
  amount: Amount;
}

export interface PeerToWalletAddressLiquidityRequest
  extends LiquidityRequest<PeerToWalletAddressRequestData> {
  type: LiquidityRequestType.PEER_TO_WALLET_ADDRESS;
}
interface PeerToWalletAddressRequestData {
  peerId: string;
  walletAddressId: string;
  amount: Amount;
}

export interface LiquidityServiceAdapter {
  execute(requests: LiquidityRequest<unknown>[]): Promise<void>;
}

export class LiquidityService implements LiquidityServiceAdapter {
  requests: LiquidityRequest<unknown>[] = [];

  public async execute(requests: LiquidityRequest<unknown>[]): Promise<void> {
    this.requests = this.requests.concat(requests);
  }
}
