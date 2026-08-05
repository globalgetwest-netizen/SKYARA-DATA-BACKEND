import { z } from 'zod';

/**
 * These schemas MUST stay in lock-step with the mobile client
 * (src/types/index.ts in the app). The app validates every response against
 * the same shapes, so a drift here surfaces immediately as a client error.
 */

export const NetworkCodeSchema = z.enum(['MTN', 'TELECEL', 'AT']);
export type NetworkCode = z.infer<typeof NetworkCodeSchema>;

export interface Network {
  code: NetworkCode;
  name: string;
  logo: string | null;
  status: 'available' | 'unavailable' | 'maintenance';
}

export interface Bundle {
  id: string;
  network: NetworkCode;
  name: string;
  volume: number;
  unit: 'MB' | 'GB';
  price: number;
  currency: 'GHS';
  validity: string;
  category: 'data' | 'social' | 'night' | 'unlimited';
  badge: string | null;
  available: boolean;
}

export type TransactionStatus =
  | 'PENDING_PAYMENT'
  | 'PAYMENT_PROCESSING'
  | 'PAYMENT_SUCCESS'
  | 'FULFILMENT_PROCESSING'
  | 'SUCCESS'
  | 'FAILED'
  | 'REFUND_PENDING'
  | 'REFUNDED'
  | 'CANCELLED';

export type PaymentMethod = 'mobile_money' | 'card' | 'airtime';

export interface Order {
  id: string;
  reference: string;
  status: TransactionStatus;
  network: NetworkCode;
  networkName: string;
  recipient: string; // E.164
  bundle: { id: string; name: string; validity: string };
  amount: number;
  fee: number;
  total: number;
  currency: 'GHS';
  paymentMethod: PaymentMethod | null;
  createdAt: string;
  updatedAt: string;
  failureReason: string | null;
  // internal — not serialised to the client
  userId?: string | null;
}

export interface Payment {
  id: string;
  orderId: string;
  provider: string;
  method: PaymentMethod;
  authorizationUrl: string | null;
  reference: string;
  status: TransactionStatus;
  providerRef?: string | null;
}

export interface User {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  phoneVerified: boolean;
}

export interface SupportTicket {
  id: string;
  reference: string;
  status: 'open' | 'in_review' | 'resolved';
  createdAt: string;
  issueType: string;
  description: string;
  transactionId?: string;
  userId?: string | null;
}

/* ---- Request validation schemas ---- */

export const CreateOrderSchema = z.object({
  network: NetworkCodeSchema,
  bundleId: z.string().min(1),
  recipient: z
    .string()
    .regex(/^\+233\d{9}$/, 'recipient must be a Ghana number in E.164 format (+233XXXXXXXXX)'),
});

export const InitPaymentSchema = z.object({
  orderId: z.string().min(1),
  method: z.enum(['mobile_money', 'card', 'airtime']),
});

export const OtpRequestSchema = z.object({
  phone: z.string().regex(/^\+233\d{9}$/, 'phone must be in E.164 format (+233XXXXXXXXX)'),
  name: z.string().min(2).max(60).optional(),
});

export const OtpVerifySchema = z.object({
  challengeId: z.string().min(1),
  code: z.string().regex(/^\d{6}$/, 'code must be 6 digits'),
});

export const SupportTicketSchema = z.object({
  issueType: z.enum(['data_not_received', 'charged_twice', 'wrong_number', 'payment_failed', 'other']),
  transactionId: z.string().optional(),
  description: z.string().min(10, 'Please describe the issue in a bit more detail.'),
  contact: z.string().optional(),
});

/* ---- Serialisers: strip internal fields before responding ---- */

export function toPublicOrder(order: Order) {
  const { userId: _userId, ...rest } = order;
  return rest;
}

export function toPublicUser(user: User): User {
  return user;
}
