import { telecomProvider } from '../providers/telecom';
import { orderService } from './orderService';
import type { Order } from '../domain/types';

/**
 * Data delivery stage of the transaction. Only ever runs AFTER payment has been
 * verified. Transitions the order to SUCCESS only when the telecom provider
 * confirms delivery — never optimistically.
 */
export const fulfilmentService = {
  async fulfil(order: Order): Promise<void> {
    orderService.setStatus(order.id, 'FULFILMENT_PROCESSING');

    try {
      const result = await telecomProvider.deliver({
        orderId: order.id,
        network: order.network,
        recipient: order.recipient,
        bundleId: order.bundle.id,
      });

      if (result.status === 'delivered') {
        orderService.setStatus(order.id, 'SUCCESS');
      } else if (result.status === 'processing') {
        // Async delivery: remain in FULFILMENT_PROCESSING until the provider's
        // delivery callback confirms. (Wire that callback to markDelivered.)
        // no-op
      } else {
        // Paid but not delivered → flag for refund review.
        orderService.setStatus(order.id, 'FAILED', result.reason);
      }
    } catch (err) {
      orderService.setStatus(
        order.id,
        'FAILED',
        'We could not reach the network to deliver your bundle. Your payment is being reviewed.',
      );
    }
  },

  /** Called by a telecom delivery webhook/callback for async fulfilment. */
  markDelivered(orderId: string) {
    orderService.setStatus(orderId, 'SUCCESS');
  },
  markFailed(orderId: string, reason: string) {
    orderService.setStatus(orderId, 'FAILED', reason);
  },
};
