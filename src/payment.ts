import {
  FundWalletAddressLiquidityRequest,
  LiquidityRequest,
  LiquidityRequestType,
  LiquidityServiceAdapter,
  PeerToWalletAddressLiquidityRequest,
  WalletAddressToPeerLiquidityRequest,
  WalletToWalletAddressLiquidityRequest,
} from "./liquidity";
import { PeerServiceAdapter } from "./peer";
import { RatesServiceAdapter } from "./rates";
import { Repository } from "./repository";
import { Amount, Asset } from "./shared";
import { WalletAddress, WalletAddressServiceAdapter } from "./wallet-address";

class WalletAddressNotFoundError extends Error {}
class WalletAddressInactiveError extends Error {}
class IncomingPaymentWalletAddressAssetMismatchError extends Error {}
class IncomingPaymentNotFoundError extends Error {}
class IncomingPaymentInvalidStateError extends Error {}
class InvalidIncomingPaymentExpiryError extends Error {}
class DuplicateIncomingPaymentFoundError extends Error {}
class InvalidQuoteAmountError extends Error {}
class CouldNotConvertExchangeRatesError extends Error {}
class DuplicateQuoteFoundError extends Error {}
class QuoteNotFoundError extends Error {}
class PeerNotFoundError extends Error {}
class QuoteExpiredError extends Error {}
class IncomingPaymentCannotReceiveMicroPayment extends Error {}
class OutgoingPaymentNotFoundError extends Error {}
class OutgoingPaymentInvalidStateError extends Error {}

interface CreateIncomingPaymentRequest {
  id?: string;
  walletAddressId: string; // we can consider using URIs here: might be easier for integrators to deal with + gives us flexibility particularly when it comes to paying into incoming payments on remote Rafikis
  expiresAt: Date;
  incomingAmount?: Amount;
}

export interface Quote {
  id: string;
  receiveAmount: Amount;
  debitAmount: Amount;
  senderWalletAddressId: string;
  incomingPaymentId: string;
  expiresAt: Date;
  exchangeRate: number;
}

export const OutgoingPaymentState = {
  CREATED: "CREATED", // normal state, can add new entries
  FUNDED: "FUNDED", // normal state, can add new entries
  COMPLETED: "COMPLETED", // not available to reads or writes, historic only (can be changed back to inactive)
} as const;
export type OutgoingPaymentState = keyof typeof OutgoingPaymentState;

// Before starting ILP payment
// reserve funds: settlement account -> wallet address
// reserve funds: asset liquidity -> "pending payments account"

interface MicroPayment {
  method: "LOCAL" | "ILP";
  ilpPeerId?: string;
  requestId: string;
  asset: Asset;
  amount: bigint;
}

export interface OutgoingPayment {
  id: string;
  quoteId: string;
  asset: Asset;
  state: OutgoingPaymentState;
  sentAmount: bigint;
  debitAmount: bigint;
  incomingPaymentId: string;
  senderWalletAddressId: string;
  microPayments: MicroPayment[];
}

interface IncomingPaymentRepository extends Repository<IncomingPayment> {}
interface RemoteIncomingPaymentRepository
  extends Repository<RemoteIncomingPayment> {}
interface QuoteRepository extends Repository<Quote> {}
interface OutgoingPaymentRepository extends Repository<OutgoingPayment> {}

interface IncomingPaymentCreatedEvent {
  incomingPayment: IncomingPayment;
}

interface OutgoingPaymentPreparedEvent {
  outgoingPaymentId: string;
  debitAmount: Amount;
  receiveAmount: Amount;
  quoteExpiresAt: Date;
  incomingPaymentId: string;
  ilpDetails: IlpDetails;
}

interface IncomingPaymentCompletedEvent {
  incomingPayment: IncomingPayment;
}

interface OutgoingPaymentCompletedEvent {
  outgoingPayment: OutgoingPayment;
}

interface IlpPreparePacketAcceptedEvent {
  preparePacketId: string;
  incomingPaymentCompleted: boolean;
}

export type PaymentEvent =
  | IncomingPaymentCreatedEvent
  | OutgoingPaymentPreparedEvent
  | OutgoingPaymentCompletedEvent
  | IncomingPaymentCompletedEvent
  | IlpPreparePacketAcceptedEvent;

interface PaymentEventPublisher {
  publish(events: PaymentEvent[]): Promise<void>;
}

interface IlpPreparePacketReceivedEvent {
  packetId: string;
  incomingPaymentId: string;
  peerId: string;
  amount: bigint;
}

interface IlpFulfillPacketReceivedEvent {
  packetId: string;
  peerId: string;
  amount: Amount;
  outgoingPaymentId: string;
  incomingPaymentId: string;
  didCompleteIncomingPayment: boolean;
}

export const IncomingPaymentState = {
  CREATED: "CREATED", // normal state, can add new entries
  EXPIRED: "EXPIRED", // available for reads only, cannot add new entries
  COMPLETED: "COMPLETED", // not available to reads or writes, historic only (can be changed back to inactive)
} as const;
export type IncomingPaymentState = keyof typeof IncomingPaymentState;

interface BaseIncomingPayment {
  id: string;
  walletAddressId: string;
  expiresAt: Date;
  asset: Asset;
  incomingAmount?: bigint;
  receivedAmount: bigint;
  state: IncomingPaymentState;
  microPayments: MicroPayment[];
}

export interface IncomingPayment extends BaseIncomingPayment {
  type: "LOCAL";
}

interface IlpDetails {
  sharedSecret: string;
  destinationAddress: string;
}

export interface RemoteIncomingPayment extends BaseIncomingPayment {
  type: "REMOTE";
  ilpDetails: IlpDetails;
}

interface CreateQuoteRequest {
  id?: string;
  senderWalletAddressId: string;
  incomingPaymentId: string;
  debitAmount?: Amount;
  receiveAmount?: Amount;
}

interface CreateOutgoingPaymentFromQuoteRequest {
  quoteId: string;
  senderWalletAddressId: string;
  // isFunded: boolean; TODO if the outgoing payment request came from a third party we need to webhook out to the ASE to "fund" the payment
}

export class PaymentService {
  INCOMING_PAYMENT_MAX_EXPIRY_MS = 2592000000; // 30 days
  QUOTE_EXPIRY_MS = 1000 * 60 * 10;

  constructor(
    private walletAddressService: WalletAddressServiceAdapter,
    private peerService: PeerServiceAdapter,
    private ratesService: RatesServiceAdapter,
    private liquidityService: LiquidityServiceAdapter,
    private incomingPaymentRepository: IncomingPaymentRepository,
    private remoteIncomingPaymentRepository: RemoteIncomingPaymentRepository,
    private outgoingPaymentRepository: OutgoingPaymentRepository,
    private quoteRepository: QuoteRepository,
    private paymentEventPublisher: PaymentEventPublisher
  ) {}

  public async handleIlpFulfillPacketReceivedEvent(
    event: IlpFulfillPacketReceivedEvent
  ) {
    const outgoingPayment = await this.outgoingPaymentRepository.fetchById(
      event.outgoingPaymentId
    );

    if (!outgoingPayment) {
      throw new OutgoingPaymentNotFoundError();
    }

    if (outgoingPayment.state !== OutgoingPaymentState.FUNDED) {
      throw new OutgoingPaymentInvalidStateError();
    }

    if (event.amount.assetCode === outgoingPayment.asset.code) {
      // We lost precision
      if (event.amount.assetScale > outgoingPayment.asset.scale) {
        throw new OutgoingPaymentInvalidStateError();
      }

      const transfer: WalletAddressToPeerLiquidityRequest = {
        id: event.packetId,
        type: LiquidityRequestType.WALLET_ADDRESS_TO_PEER,
        data: {
          peerId: event.peerId,
          walletAddressId: outgoingPayment.senderWalletAddressId,
          amount: event.amount,
        },
      };

      await this.liquidityService.execute([transfer]);

      const scaledRate = BigInt(
        10 ** (outgoingPayment.asset.scale - event.amount.assetScale)
      );

      const microPayment: MicroPayment = {
        requestId: event.packetId,
        ilpPeerId: event.peerId,
        asset: outgoingPayment.asset,
        amount: event.amount.value * scaledRate,
        method: "ILP",
      };

      this.addMicroPaymentToOutgoingPayment(outgoingPayment, microPayment);

      const events: PaymentEvent[] = [];
      const outgoingPaymentCompletedEvent: OutgoingPaymentCompletedEvent = {
        outgoingPayment,
      };

      if (event.didCompleteIncomingPayment) {
        outgoingPayment.state = OutgoingPaymentState.COMPLETED;
        events.push(outgoingPaymentCompletedEvent);
      }

      await this.outgoingPaymentRepository.store(outgoingPayment);
      await this.paymentEventPublisher.publish(events);
    } else {
      throw new Error("not implemented");
    }
  }

  public async handleIlpPreparePacketReceivedEvent(
    event: IlpPreparePacketReceivedEvent
  ) {
    const peer = await this.peerService.getById(event.peerId);

    if (!peer) {
      throw new PeerNotFoundError();
    }

    const incomingPayment = await this.incomingPaymentRepository.fetchById(
      event.incomingPaymentId
    );

    if (!incomingPayment) {
      // Send a packet reject event
      throw new IncomingPaymentNotFoundError();
    }

    if (incomingPayment.state !== IncomingPaymentState.CREATED) {
      // Send a packet reject event
      throw new IncomingPaymentInvalidStateError();
    }

    // USD 2: 10 -> USD 9 10

    if (peer.asset.code === incomingPayment.asset.code) {
      // We lost precision
      if (peer.asset.scale > incomingPayment.asset.scale) {
        throw new IncomingPaymentInvalidStateError();
      }

      const transfer: PeerToWalletAddressLiquidityRequest = {
        id: event.packetId,
        type: LiquidityRequestType.PEER_TO_WALLET_ADDRESS,
        data: {
          peerId: event.peerId,
          walletAddressId: incomingPayment.walletAddressId,
          amount: {
            assetCode: peer.asset.code,
            assetScale: peer.asset.scale,
            value: event.amount,
          },
        },
      };

      await this.liquidityService.execute([transfer]);

      const scaledRate = BigInt(
        10 ** (incomingPayment.asset.scale - peer.asset.scale)
      );

      this.addMicroPaymentToIncomingPayment(incomingPayment, {
        requestId: event.packetId,
        ilpPeerId: event.peerId,
        amount: event.amount * scaledRate,
        method: "ILP",
        asset: incomingPayment.asset,
      });

      await this.incomingPaymentRepository.store(incomingPayment);

      const paymentEvents: PaymentEvent[] = [];

      const incomingPaymentCompleted =
        // @ts-ignore
        incomingPayment.state === IncomingPaymentState.COMPLETED;

      if (incomingPaymentCompleted) {
        const incomingPaymentCompletedEvent: IncomingPaymentCompletedEvent = {
          incomingPayment,
        };

        paymentEvents.push(incomingPaymentCompletedEvent);
      }

      const ilpPreparePacketAcceptedEvent: IlpPreparePacketAcceptedEvent = {
        incomingPaymentCompleted,
        preparePacketId: event.packetId,
      };

      paymentEvents.push(ilpPreparePacketAcceptedEvent);

      await this.paymentEventPublisher.publish(paymentEvents);
    } else {
      throw new Error("not implemented");
    }
  }

  public async createIncomingPayment(
    request: CreateIncomingPaymentRequest
  ): Promise<string> {
    let id: string;

    if (request.id) {
      const existingIncomingPayment =
        await this.incomingPaymentRepository.fetchById(request.id);

      if (existingIncomingPayment) {
        throw new DuplicateIncomingPaymentFoundError();
      }
      id = request.id;
    } else {
      id = crypto.randomUUID();
    }

    const walletAddress = await this.walletAddressService.getById(
      request.walletAddressId
    );

    if (!walletAddress) {
      throw new WalletAddressNotFoundError();
    }

    if (!walletAddress.isActive) {
      throw new WalletAddressInactiveError();
    }

    if (
      request.incomingAmount &&
      (walletAddress.assetCode !== request.incomingAmount.assetCode ||
        walletAddress.assetScale !== request.incomingAmount.assetScale)
    ) {
      throw new IncomingPaymentWalletAddressAssetMismatchError();
    }

    if (
      request.expiresAt.getTime() <= Date.now() ||
      request.expiresAt.getTime() >
        Date.now() + this.INCOMING_PAYMENT_MAX_EXPIRY_MS
    ) {
      throw new InvalidIncomingPaymentExpiryError();
    }

    const newIncomingPayment: IncomingPayment = {
      id,
      incomingAmount: request.incomingAmount?.value,
      receivedAmount: 0n,
      expiresAt: request.expiresAt,
      walletAddressId: request.walletAddressId,
      type: "LOCAL",
      state: IncomingPaymentState.CREATED,
      microPayments: [],
      asset: {
        code: walletAddress.assetCode,
        scale: walletAddress.assetScale,
      },
    };

    await this.incomingPaymentRepository.store(newIncomingPayment);
    await this.paymentEventPublisher.publish([
      {
        incomingPayment: newIncomingPayment,
      },
    ]);

    return id;
  }

  public async createQuote(request: CreateQuoteRequest): Promise<string> {
    let id: string;
    if (request.id) {
      const existingQuote = await this.quoteRepository.fetchById(request.id);

      if (existingQuote) {
        throw new DuplicateQuoteFoundError();
      }

      id = request.id;
    } else {
      id = crypto.randomUUID();
    }

    const [walletAddress, incomingPayment] = await Promise.all([
      this.walletAddressService.getById(request.senderWalletAddressId),
      this.incomingPaymentRepository.fetchById(request.incomingPaymentId),
    ]);

    if (!walletAddress) {
      throw new WalletAddressNotFoundError();
    }

    if (!walletAddress.isActive) {
      throw new WalletAddressInactiveError();
    }

    if (!incomingPayment) {
      throw new IncomingPaymentNotFoundError();
    }

    if (incomingPayment.state !== IncomingPaymentState.CREATED) {
      throw new IncomingPaymentInvalidStateError();
    }

    // We are assuming we don't care about how much has already been paid into
    // an incoming payment. Let the quote happen.

    let quoteReceiveAmount: Amount;
    let quoteDebitAmount: Amount;
    let exchangeRate: number;

    if (request.debitAmount) {
      const result = await this.calculateQuoteFromDebitAmount({
        debitAmount: request.debitAmount,
        walletAddress,
        incomingPayment,
      });

      quoteReceiveAmount = result.receiveAmount;
      exchangeRate = result.exchangeRate;
      quoteDebitAmount = request.debitAmount;
    } else if (request.receiveAmount) {
      const result = await this.calculateQuoteFromReceiveAmount({
        receiveAmount: request.receiveAmount,
        walletAddress,
        incomingPayment,
      });

      quoteDebitAmount = result.debitAmount;
      exchangeRate = result.exchangeRate;
      quoteReceiveAmount = request.receiveAmount;
    } else if (incomingPayment.incomingAmount) {
      const result = await this.calculateQuoteFromIncomingPaymentAmount({
        walletAddress,
        incomingPayment: {
          ...incomingPayment,
          incomingAmount: incomingPayment.incomingAmount,
        },
      });

      quoteDebitAmount = result.debitAmount;
      exchangeRate = result.exchangeRate;
      quoteReceiveAmount = {
        assetCode: incomingPayment.asset.code,
        assetScale: incomingPayment.asset.scale,
        value: incomingPayment.incomingAmount,
      };
    } else {
      throw new InvalidQuoteAmountError();
    }

    const quoteDefaultExpiryMs = new Date().getTime() + this.QUOTE_EXPIRY_MS;

    const newQuote: Quote = {
      id,
      receiveAmount: quoteReceiveAmount,
      debitAmount: quoteDebitAmount,
      senderWalletAddressId: walletAddress.id,
      incomingPaymentId: incomingPayment.id,
      exchangeRate,
      expiresAt: new Date(
        Math.min(incomingPayment.expiresAt.getTime(), quoteDefaultExpiryMs)
      ),
    };

    await this.quoteRepository.store(newQuote);

    return id;
  }

  private async fetchIncomingPayment(
    incomingPaymentId: string
  ): Promise<IncomingPayment | RemoteIncomingPayment | undefined> {
    return (
      (await this.incomingPaymentRepository.fetchById(incomingPaymentId)) ||
      (await this.remoteIncomingPaymentRepository.fetchById(incomingPaymentId))
    );
  }

  private addMicroPaymentToIncomingPayment(
    incomingPayment: IncomingPayment,
    microPayment: MicroPayment
  ) {
    if (incomingPayment.state !== IncomingPaymentState.CREATED) {
      throw new IncomingPaymentCannotReceiveMicroPayment();
    }

    incomingPayment.microPayments.push(microPayment);
    incomingPayment.receivedAmount += microPayment.amount; // received amount can be larger than incoming amount because of FX

    if (
      incomingPayment.incomingAmount &&
      incomingPayment.receivedAmount >= incomingPayment.incomingAmount
    ) {
      incomingPayment.state = IncomingPaymentState.COMPLETED;
    }
  }

  private addMicroPaymentToOutgoingPayment(
    outgoingPayment: OutgoingPayment,
    microPayment: MicroPayment
  ) {
    if (outgoingPayment.state !== OutgoingPaymentState.FUNDED) {
      throw new OutgoingPaymentInvalidStateError();
    }

    outgoingPayment.microPayments.push(microPayment);
    outgoingPayment.sentAmount += microPayment.amount;

    // TODO: determine whether this can/should happen
    if (outgoingPayment.sentAmount > outgoingPayment.debitAmount) {
      throw new OutgoingPaymentInvalidStateError();
    }

    if (outgoingPayment.sentAmount === outgoingPayment.debitAmount) {
      outgoingPayment.state = OutgoingPaymentState.COMPLETED;
    }
  }

  public async createOutgoingPaymentFromQuote(
    request: CreateOutgoingPaymentFromQuoteRequest
  ) {
    const [walletAddress, quote] = await Promise.all([
      this.walletAddressService.getById(request.senderWalletAddressId),
      this.quoteRepository.fetchById(request.quoteId),
    ]);

    if (!walletAddress) {
      throw new WalletAddressNotFoundError();
    }

    if (!walletAddress.isActive) {
      throw new WalletAddressInactiveError();
    }

    if (!quote) {
      throw new QuoteNotFoundError();
    }

    if (new Date() >= quote.expiresAt) {
      throw new QuoteExpiredError();
    }

    const incomingPayment = await this.fetchIncomingPayment(
      quote.incomingPaymentId
    );

    if (!incomingPayment) {
      throw new IncomingPaymentNotFoundError();
    }

    if (incomingPayment.state !== IncomingPaymentState.CREATED) {
      throw new IncomingPaymentInvalidStateError();
    }

    // Like the remote one, this could also be an event
    if (incomingPayment.type === "LOCAL") {
      const liquidityRequests: LiquidityRequest[] = [];
      const walletAddressFundRequest: FundWalletAddressLiquidityRequest = {
        id: crypto.randomUUID(),
        type: LiquidityRequestType.FUND_WALLET_ADDRESS,
        data: {
          walletAddressId: request.senderWalletAddressId,
          amount: quote.debitAmount.value,
        },
      };

      liquidityRequests.push(walletAddressFundRequest);

      const transferRequest: WalletToWalletAddressLiquidityRequest = {
        id: crypto.randomUUID(),
        type: LiquidityRequestType.WALLET_ADDRESS_TO_WALLET_ADDRESS,
        data: {
          sourceWalletAddressId: request.senderWalletAddressId,
          sourceAmount: quote.debitAmount.value,
          destinationWalletAddressId: incomingPayment.walletAddressId,
          destinationAmount: quote.receiveAmount.value,
        },
      };

      liquidityRequests.push(transferRequest);

      await this.liquidityService.execute(liquidityRequests);

      const outgoingPaymentId = crypto.randomUUID();

      const outgoingPayment: OutgoingPayment = {
        id: outgoingPaymentId,
        quoteId: quote.id,
        senderWalletAddressId: walletAddress.id,
        asset: {
          code: walletAddress.assetCode,
          scale: walletAddress.assetScale,
        },
        debitAmount: quote.debitAmount.value,
        sentAmount: 0n,
        incomingPaymentId: incomingPayment.id,
        state: "COMPLETED",
        microPayments: [
          {
            requestId: outgoingPaymentId,
            amount: quote.debitAmount.value,
            method: "LOCAL",
            asset: {
              scale: quote.debitAmount.assetScale,
              code: quote.debitAmount.assetCode,
            },
          },
        ],
      };

      const events: PaymentEvent[] = [];

      const outgoingPaymentCompletedEvent: OutgoingPaymentCompletedEvent = {
        outgoingPayment,
      };

      events.push(outgoingPaymentCompletedEvent);

      this.addMicroPaymentToIncomingPayment(incomingPayment, {
        requestId: outgoingPaymentId,
        amount: quote.receiveAmount.value,
        method: "LOCAL",
        asset: {
          scale: quote.receiveAmount.assetScale,
          code: quote.receiveAmount.assetCode,
        },
      });

      // MicroPayment might have completed the incoming payment
      // @ts-ignore
      if (incomingPayment.state === IncomingPaymentState.COMPLETED) {
        const incomingPaymentCompletedEvent: IncomingPaymentCompletedEvent = {
          incomingPayment,
        };
        events.push(incomingPaymentCompletedEvent);
      }

      await Promise.all([
        this.outgoingPaymentRepository.store(outgoingPayment),
        this.incomingPaymentRepository.store(incomingPayment),
      ]);

      await this.paymentEventPublisher.publish(events);
    } else {
      const walletAddressFundRequest: FundWalletAddressLiquidityRequest = {
        id: crypto.randomUUID(),
        type: LiquidityRequestType.FUND_WALLET_ADDRESS,
        data: {
          walletAddressId: request.senderWalletAddressId,
          amount: quote.debitAmount.value,
        },
      };

      await this.liquidityService.execute([walletAddressFundRequest]);

      const outgoingPayment: OutgoingPayment = {
        id: crypto.randomUUID(),
        quoteId: quote.id,
        senderWalletAddressId: walletAddress.id,
        asset: {
          code: walletAddress.assetCode,
          scale: walletAddress.assetScale,
        },
        debitAmount: quote.debitAmount.value,
        sentAmount: 0n,
        incomingPaymentId: incomingPayment.id,
        state: "FUNDED",
        microPayments: [],
      };
      await this.outgoingPaymentRepository.store(outgoingPayment);

      const outgoingPaymentPreparedEvent: OutgoingPaymentPreparedEvent = {
        outgoingPaymentId: outgoingPayment.id,
        debitAmount: quote.debitAmount,
        receiveAmount: quote.receiveAmount,
        incomingPaymentId: outgoingPayment.incomingPaymentId,
        quoteExpiresAt: quote.expiresAt,
        ilpDetails: incomingPayment.ilpDetails,
      };

      await this.paymentEventPublisher.publish([outgoingPaymentPreparedEvent]);
    }
  }

  public async createOutgoingPaymentFromIncomingPayment() {
    throw new Error("not implemented");
  }

  private async calculateQuoteFromDebitAmount({
    debitAmount,
    walletAddress,
    incomingPayment,
  }: {
    debitAmount: Amount;
    incomingPayment: IncomingPayment;
    walletAddress: WalletAddress;
  }): Promise<{
    exchangeRate: number;
    receiveAmount: Amount;
  }> {
    if (
      debitAmount.assetCode !== walletAddress.assetCode ||
      debitAmount.assetScale !== walletAddress.assetScale ||
      debitAmount.value <= 0n
    ) {
      throw new InvalidQuoteAmountError();
    }

    const isSameAssetQuote =
      debitAmount.assetCode === incomingPayment.asset.code;

    if (isSameAssetQuote) {
      const exchangeRate =
        10 ** (incomingPayment.asset.scale - debitAmount.assetScale);
      const receiveAmountValue = BigInt(
        Math.floor(Number(debitAmount.value) * exchangeRate)
      );

      return {
        receiveAmount: {
          assetCode: incomingPayment.asset.code,
          assetScale: incomingPayment.asset.scale,
          value: receiveAmountValue,
        },
        exchangeRate,
      };
    }

    const conversionResponse = await this.ratesService.convertFromSource({
      destinationAsset: incomingPayment.asset,
      sourceAmount: debitAmount.value,
      sourceAsset: {
        code: debitAmount.assetCode,
        scale: debitAmount.assetScale,
      },
    });

    if (!conversionResponse) {
      throw new CouldNotConvertExchangeRatesError();
    }

    return {
      receiveAmount: {
        assetCode: incomingPayment.asset.code,
        assetScale: incomingPayment.asset.scale,
        value: conversionResponse.destinationAmount,
      },
      exchangeRate: conversionResponse.exchangeRate,
    };
  }

  private async calculateQuoteFromReceiveAmount({
    receiveAmount,
    walletAddress,
    incomingPayment,
  }: {
    receiveAmount: Amount;
    incomingPayment: IncomingPayment;
    walletAddress: WalletAddress;
  }): Promise<{
    exchangeRate: number;
    debitAmount: Amount;
  }> {
    if (
      receiveAmount.assetCode !== incomingPayment.asset.code ||
      receiveAmount.assetScale !== incomingPayment.asset.scale ||
      receiveAmount.value <= 0n
    ) {
      throw new InvalidQuoteAmountError();
    }

    const isSameAssetQuote =
      receiveAmount.assetCode === walletAddress.assetCode;
    if (isSameAssetQuote) {
      // TODO: additional logic for making sure we can actually deliver the minimum amount of the receiving asset scale (e.g. sending from scale 4 to 2, may not satisfy a single unit of 2)
      const exchangeRate =
        10 ** (walletAddress.assetScale - receiveAmount.assetScale);
      const debitAmountValue = BigInt(
        Math.ceil(Number(receiveAmount.value) * exchangeRate)
      );

      return {
        debitAmount: {
          assetCode: walletAddress.assetCode,
          assetScale: walletAddress.assetScale,
          value: debitAmountValue,
        },
        exchangeRate,
      };
    }

    const conversionResponse = await this.ratesService.convertFromDestination({
      destinationAsset: incomingPayment.asset,
      destinationAmount: receiveAmount.value,
      sourceAsset: {
        code: walletAddress.assetCode,
        scale: walletAddress.assetScale,
      },
    });

    if (!conversionResponse) {
      throw new CouldNotConvertExchangeRatesError();
    }

    return {
      debitAmount: {
        assetCode: walletAddress.assetCode,
        assetScale: walletAddress.assetScale,
        value: conversionResponse.sourceAmount,
      },
      exchangeRate: conversionResponse.exchangeRate,
    };
  }

  private async calculateQuoteFromIncomingPaymentAmount({
    walletAddress,
    incomingPayment,
  }: {
    incomingPayment: IncomingPayment & {
      incomingAmount: Pick<IncomingPayment, "incomingAmount">;
    };
    walletAddress: WalletAddress;
  }): Promise<{
    exchangeRate: number;
    debitAmount: Amount;
  }> {
    if (
      walletAddress.assetCode !== incomingPayment.asset.code ||
      walletAddress.assetScale !== incomingPayment.asset.scale
    ) {
      throw new InvalidQuoteAmountError();
    }

    if (incomingPayment.asset.code === walletAddress.assetCode) {
      // TODO: additional logic for making sure we can actually deliver the minimum amount of the receiving asset scale (e.g. sending from scale 4 to 2 may not satisfy a single unit of 2)
      const exchangeRate =
        10 ** (walletAddress.assetScale - incomingPayment.asset.scale);
      const debitAmountValue = BigInt(
        Math.ceil(Number(incomingPayment.incomingAmount) * exchangeRate)
      );

      return {
        debitAmount: {
          assetCode: walletAddress.assetCode,
          assetScale: walletAddress.assetScale,
          value: debitAmountValue,
        },
        exchangeRate,
      };
    }

    const conversionResponse = await this.ratesService.convertFromDestination({
      destinationAsset: incomingPayment.asset,
      destinationAmount: incomingPayment.incomingAmount,
      sourceAsset: {
        code: walletAddress.assetCode,
        scale: walletAddress.assetScale,
      },
    });

    if (!conversionResponse) {
      throw new CouldNotConvertExchangeRatesError();
    }

    return {
      debitAmount: {
        assetCode: walletAddress.assetCode,
        assetScale: walletAddress.assetScale,
        value: conversionResponse.sourceAmount,
      },
      exchangeRate: conversionResponse.exchangeRate,
    };
  }
}
