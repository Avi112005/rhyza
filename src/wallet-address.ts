import { Repository } from "./repository";

export interface WalletAddress {
  id: string;
  url: string;
  isActive: boolean;
  assetCode: string;
  assetScale: number;
}

export interface WalletAddressServiceAdapter {
  getById(id: string): Promise<WalletAddress | undefined>;
}

export class WalletAddressService implements WalletAddressServiceAdapter {
  constructor(private walletAddressRepository: Repository<WalletAddress>) {}

  public getById(id: string): Promise<WalletAddress | undefined> {
    return this.walletAddressRepository.fetchById(id);
  }
}
