import fastify from "fastify";
import { PaymentService } from "./payment";

export function createApp(paymentService: PaymentService) {
  const app = fastify({
    logger: true,
  });

  app.post("/incoming-payment", async function handler(request, reply) {
    const id = await paymentService.createIncomingPayment(request.body as any);

    reply
      .send({
        id,
      })
      .status(201);
  });

  app.post("/quote", async function handler(request, reply) {
    const id = await paymentService.createQuote(request.body as any);

    reply
      .send({
        id,
      })
      .status(201);
  });

  app.post("/outgoing-payment", async function handler(request, reply) {
    const id = await paymentService.createOutgoingPaymentFromQuote(
      request.body as any
    );

    reply
      .send({
        id,
      })
      .status(201);
  });

  return async () => {
    await app.listen({ port: 3000 });
  };
}
