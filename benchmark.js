import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";

export const options = {
  vus: 10,
  duration: "10s",
  //   iterations: 1,
};

const BASE_URL = "http://localhost:3000";

const RECEIVER_WALLET_ADDRESS_ID = "a1469618-077a-447d-b5a3-a9ed11265a63";
const SENDER_WALLET_ADDRESS_ID = "a1469618-077a-447d-b5a3-a9ed11265a64";

const headers = {
  "Content-Type": "application/json",
};

const outgoingPaymentCounter = new Counter("outgoing_payments");

export default function (data) {
  const incomingPaymentRes = http.post(
    `${BASE_URL}/incoming-payment`,
    JSON.stringify({
      walletAddressId: RECEIVER_WALLET_ADDRESS_ID,
    }),
    { headers }
  );
  check(incomingPaymentRes, {
    "status is 201": (r) => r.status === 201,
  });

  // Return any required data for the main test

  // Use the data from setup if needed
  const incomingPaymentId = JSON.parse(incomingPaymentRes.body).id;

  // Call /quote route
  const quoteRes = http.post(
    `${BASE_URL}/quote`,
    JSON.stringify({
      debitAmount: {
        assetScale: 2,
        assetCode: "USD",
        value: 100,
      },
      incomingPaymentId,
      senderWalletAddressId: SENDER_WALLET_ADDRESS_ID,
    }),
    { headers }
  );

  check(quoteRes, {
    "status is 201": (r) => r.status === 201,
  });

  const quoteId = JSON.parse(quoteRes.body).id;

  // Call /outgoing-payment route
  const outgoingPaymentRes = http.post(
    `${BASE_URL}/outgoing-payment`,
    JSON.stringify({
      quoteId,
      senderWalletAddressId: SENDER_WALLET_ADDRESS_ID,
    }),
    { headers }
  );
  check(outgoingPaymentRes, {
    "status is 201": (r) => r.status === 201,
  });
  outgoingPaymentCounter.add(1);
}
