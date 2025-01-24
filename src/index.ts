import { createApp } from "./app";
import { EventPublisher } from "./event";
import { LiquidityService } from "./liquidity";
import {
  IncomingPayment,
  OutgoingPayment,
  PaymentEventType,
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

const eventPublisher = new EventPublisher();

const peerService = new PeerService(new InMemoryRepository<Peer>());
const ratesService = new RatesService();
const liquidityService = new LiquidityService();
export const paymentService = new PaymentService(
  walletAddressService,
  peerService,
  ratesService,
  liquidityService,
  new InMemoryRepository<IncomingPayment>(),
  new InMemoryRepository<RemoteIncomingPayment>(),
  new InMemoryRepository<OutgoingPayment>(),
  new InMemoryRepository<Quote>(),
  eventPublisher
);

eventPublisher.registerConsumer(
  PaymentEventType.LOCAL_OUTGOING_PAYMENT_FUNDED,
  paymentService.handleLocalOutgoingPaymentFundedEvent.bind(paymentService)
);

(async () => {
  await walletAddressService.createWalletAddress({
    id: "a1469618-077a-447d-b5a3-a9ed11265a63",
    url: "",
    assetCode: "USD",
    assetScale: 2,
  });

  await walletAddressService.createWalletAddress({
    id: "a1469618-077a-447d-b5a3-a9ed11265a64",
    url: "",
    assetCode: "USD",
    assetScale: 2,
  });

  const start = createApp(paymentService);

  await start();
})();
