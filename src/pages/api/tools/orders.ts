import { z } from "zod";
import { orderFulfillments, orders } from "@wix/ecom";
import { defineTool } from "./tools";
import { auth } from "@wix/essentials";


const formatOrder: (order: orders.Order, fulfillments?: orderFulfillments.Fulfillment[]) => any = (order, fulfillments) => {
  const tracking = (fulfillments ?? [])
    .map((f) => f.trackingInfo)
    .filter((t): t is orderFulfillments.FulfillmentTrackingInfo => !!t?.trackingNumber)
    .map((t) => ({ trackingNumber: t.trackingNumber, trackingLink: t.trackingLink, provider: t.shippingProvider }));

  return {
    orderNumber: order.number,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    total: order.priceSummary?.total?.formattedAmount,
    createdDate: order._createdDate?.toISOString?.().split('T')[0],
    items: (order.lineItems ?? []).map((l: any) => ({
      name: l.productName?.original,
      quantity: l.quantity,
      price: l.price?.formattedAmount,
    })),
    estimatedDelivery: order.shippingInfo?.logistics?.deliveryTime ?? null,
    tracking: tracking.length ? tracking : null,
  };
}

const getOrderStatusTool = defineTool({
  name: 'get_order_status',
  displayName: 'Get Order Status',
  shortDescription: 'Looks up a specific order by number to show payment and delivery status.',
  category: 'orders',
  description: 'Look up a specific order by order number. Use when the visitor provides an order number and asks about payment status, fulfillment, estimated delivery, or tracking.',
  inputSchema: z.object({
    order_number: z.string().describe('The order number exactly as the visitor stated it, e.g. "10042"'),
  }),
  execute: async (input) => {
    try {
      const result = await auth.elevate(orders.searchOrders)({
        filter: { number: { $eq: input.order_number } },
        cursorPaging: { limit: 1 },
      });
      if (!result.orders?.length) {
        return { found: false, message: `No order found with number ${input.order_number}.` };
      }
      const order = result.orders[0]!;
      const fulfillmentsResult = await auth.elevate(orderFulfillments.listFulfillmentsForSingleOrder)(order._id!);
      return { found: true, order: formatOrder(order, fulfillmentsResult.orderWithFulfillments?.fulfillments) };
    } catch {
      return { error: 'Could not retrieve order. Please try again.' };
    }
  },
});

const listMyOrdersTool = defineTool({
  name: 'list_my_orders',
  displayName: 'List My Orders',
  shortDescription: 'Shows a logged-in member their recent order history.',
  category: 'orders',
  description: "List the visitor's recent orders. Use when the visitor asks to see their orders or order history without providing a specific order number. Only works if the visitor is logged in.",
  inputSchema: z.object({
    limit: z.number().optional().describe('Max number of orders to return, default 5'),
  }),
  execute: async (input) => {
    try {
      const tokenInfo = await auth.getTokenInfo();
      if (tokenInfo.subjectType !== 'MEMBER') {
        return { found: false, message: 'You need to be logged in to view your orders.' };
      }
      const result = await auth.elevate(orders.searchOrders)({
        filter: { 'buyerInfo.memberId': { $eq: tokenInfo.subjectId } },
        sort: [{ fieldName: '_createdDate', order: 'DESC' }],
        cursorPaging: { limit: input.limit ?? 5 },
      });
      if (!result.orders?.length) {
        return { found: false, message: 'No orders found for your account.' };
      }
      return { found: true, count: result.orders.length, orders: result.orders.map((o) => formatOrder(o)) };
    } catch {
      return { error: 'Could not retrieve orders. Please try again.' };
    }
  },
});

const cancelOrderTool = defineTool({
  name: 'cancel_order',
  displayName: 'Cancel Order',
  shortDescription: 'Cancels an order on behalf of the visitor and sends a confirmation email.',
  category: 'orders',
  description: 'Cancel an order by order number. Only works for logged-in members cancelling their own orders. Do not attempt if the order is already cancelled or fulfilled.',
  inputSchema: z.object({
    order_number: z.string().describe('The order number to cancel, e.g. "10042"'),
  }),
  execute: async (input) => {
    try {
      const tokenInfo = await auth.getTokenInfo();
      if (tokenInfo.subjectType !== 'MEMBER') {
        return { success: false, message: 'You need to be logged in to cancel an order.' };
      }

      const result = await auth.elevate(orders.searchOrders)({
        filter: { number: { $eq: input.order_number } },
        cursorPaging: { limit: 1 },
      });
      if (!result.orders?.length) {
        return { success: false, message: `No order found with number ${input.order_number}.` };
      }
      const order = result.orders[0]!;

      if (order.buyerInfo?.memberId !== tokenInfo.subjectId) {
        return { success: false, message: 'You can only cancel your own orders.' };
      }
      if (order.status === 'CANCELED') {
        return { success: false, message: `Order ${input.order_number} is already cancelled.` };
      }
      if (order.fulfillmentStatus === 'FULFILLED') {
        return { success: false, message: `Order ${input.order_number} has already been fulfilled and cannot be cancelled.` };
      }

      await auth.elevate(orders.cancelOrder)(order._id!, { sendOrderCanceledEmail: true, restockAllItems: true });
      return { success: true, message: `Order ${input.order_number} has been cancelled successfully.` };
    } catch {
      return { success: false, message: 'Could not cancel the order. Please try again or contact support.' };
    }
  },
});

export default [getOrderStatusTool, listMyOrdersTool, cancelOrderTool];
