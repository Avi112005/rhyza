import { IlpDetails } from "./ilp-connector";
import { Repository } from "./repository";
import { Amount, Asset } from "./shared";

export interface RemoteIncomingPayment {
  id: string;
  expiresAt: Date;
  asset: Asset;
  incomingAmount?: bigint;
  receivedAmount: bigint;
  type: "REMOTE";
  ilpDetails: IlpDetails;
}

interface CreateRemoteIncomingPaymentArgs {
  resourceServerUrl: string;
  expiresAt?: Date;
  incomingAmount?: Amount;
  walletAddressId: string;
}

export interface RemoteIncomingPaymentServiceAdapter {
  createRemoteIncomingPayment(
    args: CreateRemoteIncomingPaymentArgs
  ): Promise<string>;
  getById(id: string): Promise<RemoteIncomingPayment | undefined>;
}

interface RemoteIncomingPaymentRepository
  extends Repository<RemoteIncomingPayment> {}

export class RemoteIncomingPaymentService
  implements RemoteIncomingPaymentServiceAdapter
{
  constructor(
    private remoteIncomingPaymentRepository: RemoteIncomingPaymentRepository
  ) {}

  public async createRemoteIncomingPayment(
    args: CreateRemoteIncomingPaymentArgs
  ): Promise<string> {
    const { expiresAt, incomingAmount, walletAddressId } = args;

    // TODO: Open Payments client
    const res = await fetch(args.resourceServerUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        walletAddressId,
        expiresAt,
        ...(incomingAmount
          ? {
              assetScale: incomingAmount.assetScale,
              assetCode: incomingAmount.assetCode,
              value: incomingAmount.value,
            }
          : {}),
      }),
    });

    const remoteIncomingPayment = (await res.json()) as RemoteIncomingPayment;

    await this.remoteIncomingPaymentRepository.store(remoteIncomingPayment);

    return remoteIncomingPayment.id;
  }

  public async getById(id: string): Promise<RemoteIncomingPayment | undefined> {
    return this.remoteIncomingPaymentRepository.fetchById(id);
  }
}
