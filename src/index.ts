import { createApp } from "./app";
import { EventPublisher } from "./event";
import { LiquidityService } from "./liquidity";
import {
  IncomingPayment,
  OutgoingPayment,
  PaymentService,
  Quote,
  RemoteIncomingPayment,
} from "./payment";
import { Peer, PeerService } from "./peer";
import { RatesService } from "./rates";
import { InMemoryRepository } from "./repository";
import { WalletAddress, WalletAddressService } from "./wallet-address";

export const walletAddressService = new WalletAddressService(
  new InMemoryRepository<WalletAddress>()
);
export const peerService = new PeerService(new InMemoryRepository<Peer>());
export const ratesService = new RatesService();
export const liquidityService = new LiquidityService();
export const paymentService = new PaymentService(
  walletAddressService,
  peerService,
  ratesService,
  liquidityService,
  new InMemoryRepository<IncomingPayment>(),
  new InMemoryRepository<RemoteIncomingPayment>(),
  new InMemoryRepository<OutgoingPayment>(),
  new InMemoryRepository<Quote>(),
  new EventPublisher()
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
