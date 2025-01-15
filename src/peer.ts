import { Repository } from "./repository";
import { Asset } from "./shared";

export interface Peer {
  id: string;
  asset: Asset;
}

export interface PeerServiceAdapter {
  getById(id: string): Promise<Peer | undefined>;
}

export class PeerService implements PeerServiceAdapter {
  constructor(private peerRepository: Repository<Peer>) {}

  public getById(id: string): Promise<Peer | undefined> {
    return this.peerRepository.fetchById(id);
  }
}
