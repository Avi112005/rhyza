import fastify from "fastify";
import { PaymentService } from "./payment";

export function createApp(paymentService: PaymentService) {
  const app = fastify();

  app.post("/incoming-payment", async function handler(request, reply) {
    const id = await paymentService.createIncomingPayment(request.body as any);

    reply.code(201).send({ id });
  });

  app.post("/quote", async function handler(request, reply) {
    const id = await paymentService.createQuote(request.body as any);

    reply.code(201).send({ id });
  });

  app.post("/outgoing-payment", async function handler(request, reply) {
    const id = await paymentService.createOutgoingPaymentFromQuote(
      request.body as any
    );

    reply.code(201).send({ id });
  });

  return async () => {
    await app.listen({ port: 3000 });
  };
}
