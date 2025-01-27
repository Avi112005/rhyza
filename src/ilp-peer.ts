import { InMemoryRepository, Repository } from "./repository";
import { Asset } from "./shared";

export interface IlpPeer {
  id: string;
  asset: Asset;
  address: string;
  connectorUrl: string;
  callbackUrl: string;
}

export interface CreateIlpPeerArgs {
  asset: Asset;
  address: string;
  connectorUrl: string;
  callbackUrl: string;
}

export interface IlpPeerServiceAdapter {
  getById(id: string): Promise<IlpPeer | undefined>;
  getByDestinationAddress(address: string): Promise<IlpPeer | undefined>;
  create(args: CreateIlpPeerArgs): Promise<string>;
}

export interface PeerRepository extends Repository<IlpPeer> {
  getByDestinationAddress(address: string): Promise<IlpPeer | undefined>;
}

export class InMemoryIlpPeerRepository
  extends InMemoryRepository<IlpPeer>
  implements PeerRepository
{
  public async getByDestinationAddress(
    address: string
  ): Promise<IlpPeer | undefined> {
    return [...this.map.values()].find((peer) => peer.address === address);
  }
}

export class IlpPeerService implements IlpPeerServiceAdapter {
  constructor(private peerRepository: PeerRepository) {}

  public async getById(id: string): Promise<IlpPeer | undefined> {
    return this.peerRepository.fetchById(id);
  }

  public async getByDestinationAddress(
    address: string
  ): Promise<IlpPeer | undefined> {
    return this.peerRepository.getByDestinationAddress(address);
  }

  public async create(args: CreateIlpPeerArgs): Promise<string> {
    const newPeer: IlpPeer = {
      ...args,
      id: crypto.randomUUID(),
    };

    await this.peerRepository.store(newPeer);

    return newPeer.id;
  }
}
