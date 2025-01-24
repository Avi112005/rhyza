import fastify from "fastify";
import { CreateQuoteRequest, PaymentService } from "./payment";

export function createApp(paymentService: PaymentService) {
  const app = fastify();

  app.post("/incoming-payment", async function handler(request, reply) {
    const requestBody = request.body as any;

    const id = await paymentService.createIncomingPayment({
      id: requestBody.id,
      expiresAt: requestBody.expiresAt,
      incomingAmount: requestBody.incomingAmount
        ? {
            assetCode: requestBody.incomingAmount.assetCode,
            assetScale: requestBody.incomingAmount.assetScale,
            value: BigInt(requestBody.incomingAmount.value),
          }
        : undefined,
      walletAddressId: requestBody.walletAddressId,
    });

    reply.code(201).send({ id });
  });

  app.post("/quote", async function handler(request, reply) {
    const requestBody = request.body as any;

    const id = await paymentService.createQuote({
      id: requestBody.id,
      debitAmount: requestBody.debitAmount
        ? {
            assetCode: requestBody.debitAmount.assetCode,
            assetScale: requestBody.debitAmount.assetScale,
            value: BigInt(requestBody.debitAmount.value),
          }
        : undefined,
      receiveAmount: requestBody.receiveAmount
        ? {
            assetCode: requestBody.receiveAmount.assetCode,
            assetScale: requestBody.receiveAmount.assetScale,
            value: BigInt(requestBody.receiveAmount.value),
          }
        : undefined,
      senderWalletAddressId: requestBody.senderWalletAddressId,
      incomingPaymentId: requestBody.incomingPaymentId,
    });

    reply.code(201).send({ id });
  });

  app.post("/outgoing-payment", async function handler(request, reply) {
    const requestBody = request.body as any;

    const id = await paymentService.createOutgoingPaymentFromQuote({
      id: requestBody.id,
      senderWalletAddressId: requestBody.senderWalletAddressId,
      quoteId: requestBody.quoteId,
    });

    reply.code(201).send({ id });
  });

  return async () => {
    await app.listen({ port: 3000 });
  };
}
