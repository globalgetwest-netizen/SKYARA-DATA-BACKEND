import { formatMoney } from '../lib/money';
import { store } from '../store/store';
import { catalogueStore } from '../store/catalogueStore';
import { id } from '../lib/ids';
import { orderService } from '../services/orderService';
import { paymentService } from '../services/paymentService';
import type { NetworkCode, PaymentMethod } from '../domain/types';

/**
 * USSD menu state machine for feature phones.
 *
 * USSD is stateless per request: the gateway sends the FULL input string so far
 * (steps joined by `*`), plus the caller's MSISDN. We derive the current step
 * from how many inputs have been entered — no server-side session store needed.
 * Every purchase goes through the SAME orderService + paymentService as the app,
 * so app and USSD sales share one system, one state machine, one history.
 *
 * Response protocol (Africa's Talking style, widely supported / adaptable):
 *   "CON <text>"  -> more input expected
 *   "END <text>"  -> session finished
 */

export interface UssdResult {
  message: string;
  end: boolean;
}

function con(text: string): UssdResult {
  return { message: text, end: false };
}
function end(text: string): UssdResult {
  return { message: text, end: true };
}

const NETWORK_ORDER: NetworkCode[] = ['MTN', 'TELECEL', 'AT'];

const PAYMENT_CHOICES: { key: string; method: PaymentMethod; label: string }[] = [
  { key: '1', method: 'mobile_money', label: 'Mobile Money' },
  { key: '2', method: 'airtime', label: 'Airtime' },
];

/** Normalise the gateway MSISDN to E.164 (+233…). */
function toE164(msisdn: string): string {
  const digits = msisdn.replace(/[^\d]/g, '');
  if (digits.startsWith('233')) return `+${digits}`;
  if (digits.startsWith('0')) return `+233${digits.slice(1)}`;
  if (digits.length === 9) return `+233${digits}`;
  return msisdn.startsWith('+') ? msisdn : `+${digits}`;
}

/** Parse the "024..." style recipient a caller typed into E.164, or null. */
function parseTypedRecipient(input: string): string | null {
  const digits = input.replace(/[^\d]/g, '');
  if (digits.length === 10 && digits.startsWith('0')) return `+233${digits.slice(1)}`;
  if (digits.length === 9) return `+233${digits}`;
  if (digits.length === 12 && digits.startsWith('233')) return `+${digits}`;
  return null;
}

export async function handleUssd(rawMsisdn: string, text: string): Promise<UssdResult> {
  const caller = toE164(rawMsisdn);
  const parts = text.length ? text.split('*') : [];

  // Step 0 — welcome / network menu
  if (parts.length === 0) {
    return con(
      ['Welcome to Skyra Data', 'Choose network:', '1. MTN', '2. Telecel', '3. AT'].join('\n'),
    );
  }

  // Step 1 — network chosen, show bundles
  const netIdx = Number(parts[0]) - 1;
  const network = NETWORK_ORDER[netIdx];
  if (!network) return end('Invalid choice. Please dial again.');

  const bundleList = catalogueStore.getBundlesFor(network, true);

  if (parts.length === 1) {
    const list = bundleList.map((b, i) => `${i + 1}. ${b.name} - ${formatMoney(b.price)}`);
    const netName = catalogueStore.getNetwork(network)?.name ?? network;
    return con([`${netName} bundles:`, ...list].join('\n'));
  }

  // Step 2 — bundle chosen, ask recipient
  const bundle = bundleList[Number(parts[1]) - 1];
  if (!bundle) return end('Invalid bundle. Please dial again.');

  if (parts.length === 2) {
    return con(['Recipient number:', '1. My number', 'Or enter a number e.g. 024XXXXXXX'].join('\n'));
  }

  // Step 3 — recipient resolved, ask payment method
  const recipientInput = parts[2];
  const recipient =
    recipientInput === '1' ? caller : parseTypedRecipient(recipientInput);
  if (!recipient) return end('That number is not valid. Please dial again.');

  if (parts.length === 3) {
    return con(
      [
        `Pay ${formatMoney(bundle.price)} for ${bundle.name}`,
        `to ${recipient}`,
        'Choose payment:',
        ...PAYMENT_CHOICES.map((c) => `${c.key}. ${c.label}`),
      ].join('\n'),
    );
  }

  // Step 4 — payment chosen: create the order + initialise payment
  const choice = PAYMENT_CHOICES.find((c) => c.key === parts[3]);
  if (!choice) return end('Invalid payment choice. Please dial again.');

  // Associate the sale with a user resolved from the caller's number.
  const user = store.upsertUserByPhone({
    id: id('usr'),
    phone: caller,
    name: null,
    email: null,
    phoneVerified: true,
  });

  const order = orderService.create({
    network,
    bundleId: bundle.id,
    recipient,
    userId: user.id,
    // Idempotency per USSD attempt so repeated final submits don't duplicate.
    idempotencyKey: `ussd:${caller}:${text}`,
  });

  await paymentService.initialize({
    orderId: order.id,
    method: choice.method,
    idempotencyKey: `ussd-pay:${caller}:${text}`,
  });

  const via =
    choice.method === 'airtime'
      ? 'Your airtime will be debited.'
      : 'You will receive a prompt to approve the Mobile Money payment.';

  return end(
    [
      'Request received.',
      via,
      `Ref ${order.reference}.`,
      'You will get an SMS when your data is delivered.',
    ].join('\n'),
  );
}
