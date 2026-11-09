/**
 * Orders: public server API.
 *
 * Checkout     checkoutInputSchema, fieldErrors, normalizePhone, createPendingOrder, attachPaymentIntent, loadSlotLoad
 * Lifecycle    markOrderPaid, markPaymentFailed, changeOrderStatus, refundOrder, expireStaleOrders
 * Queries      getOrderByToken, getOrderDetails, listBoardOrders, listOrders, countByStatus
 * Errors       CheckoutError, OrderNotFoundError, OrderStateError (+ InvalidTransitionError from @/domain/order-status)
 *
 * All functions take the Drizzle handle as first argument; every write that changes an order also writes an
 * `order_events` row (audit) in the same transaction.
 */
export * from './errors';
export * from './input';
export * from './types';
export { attachPaymentIntent, createPendingOrder, loadSlotLoad, priceMismatchCart } from './create';
export type { CreatePendingOrderOptions, CreatePendingOrderResult, PendingOrder } from './create';
export { BOARD_COMPLETED_WINDOW_MS, countByStatus, getOrderByToken, getOrderDetails, listBoardOrders, listOrders } from './queries';
export { changeOrderStatus, expireStaleOrders, markOrderPaid, markPaymentFailed, refundOrder } from './lifecycle';
export type {
  ChangeStatusMeta,
  ChangeStatusResult,
  MarkOrderPaidInput,
  MarkOrderPaidResult,
  MarkPaymentFailedInput,
  MarkPaymentFailedResult,
  OrderRef,
} from './lifecycle';
