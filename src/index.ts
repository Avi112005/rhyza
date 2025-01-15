import { EventPublisher } from "./event";
import { LiquidityService } from "./liquidity";
import {
  IncomingPayment,
  OutgoingPayment,
  PaymentEvent,
  PaymentService,
  Quote,
  RemoteIncomingPayment,
} from "./payment";
import { Peer, PeerService } from "./peer";
import { RatesService } from "./rates";
import { InMemoryRepository } from "./repository";
import { WalletAddress, WalletAddressService } from "./wallet-address";

const walletAddressService = new WalletAddressService(
  new InMemoryRepository<WalletAddress>()
);
const peerService = new PeerService(new InMemoryRepository<Peer>());
const ratesService = new RatesService();
const liquidityService = new LiquidityService();
const paymentSerivce = new PaymentService(
  walletAddressService,
  peerService,
  ratesService,
  liquidityService,
  new InMemoryRepository<IncomingPayment>(),
  new InMemoryRepository<RemoteIncomingPayment>(),
  new InMemoryRepository<OutgoingPayment>(),
  new InMemoryRepository<Quote>(),
  new EventPublisher<PaymentEvent>()
);
