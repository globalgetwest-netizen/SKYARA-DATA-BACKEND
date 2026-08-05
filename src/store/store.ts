import type { Order, Payment, SupportTicket, User } from '../domain/types';
import { loadKey, saveKey } from './persist';

/**
 * In-memory data store.
 *
 * This is a deliberately thin repository layer so it can be swapped for a real
 * database (Postgres/Prisma, Mongo, etc.) without touching the services that
 * use it — every service depends on these methods, not on the Map internals.
 *
 * NOTE: state is lost on restart. That is fine for local development and for
 * running the mobile app end-to-end; wire a real DB before production.
 */

interface OtpChallenge {
  id: string;
  phone: string;
  name?: string;
  codeHash: string;
  attempts: number;
  expiresAt: number;
}

class Store {
  private usersById = new Map<string, User>();
  private usersByPhone = new Map<string, string>(); // phone -> userId
  private orders = new Map<string, Order>();
  private payments = new Map<string, Payment>();
  private paymentsByOrder = new Map<string, string>(); // orderId -> paymentId
  private tickets = new Map<string, SupportTicket>();
  private otp = new Map<string, OtpChallenge>();
  private idempotency = new Map<string, string>(); // key -> resourceId
  private saveTimer: NodeJS.Timeout | null = null;

  /* Persistence -------------------------------------------------- */
  // Snapshot of durable state (OTP challenges are transient, so not persisted).
  private snapshot() {
    return {
      users: Array.from(this.usersById.values()),
      orders: Array.from(this.orders.values()),
      payments: Array.from(this.payments.values()),
      tickets: Array.from(this.tickets.values()),
      idempotency: Array.from(this.idempotency.entries()),
    };
  }

  async hydrate(): Promise<void> {
    const s = await loadKey<ReturnType<Store['snapshot']>>('store');
    if (!s) return;
    s.users?.forEach((u) => {
      this.usersById.set(u.id, u);
      this.usersByPhone.set(u.phone, u.id);
    });
    s.orders?.forEach((o) => this.orders.set(o.id, o));
    s.payments?.forEach((p) => {
      this.payments.set(p.id, p);
      this.paymentsByOrder.set(p.orderId, p.id);
    });
    s.tickets?.forEach((t) => this.tickets.set(t.id, t));
    s.idempotency?.forEach(([k, v]) => this.idempotency.set(k, v));
  }

  // Debounced save so bursts of status updates coalesce into one write.
  private scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void saveKey('store', this.snapshot());
    }, 800);
  }

  /* Users -------------------------------------------------------- */
  upsertUserByPhone(user: User): User {
    const existingId = this.usersByPhone.get(user.phone);
    if (existingId) {
      const merged: User = { ...this.usersById.get(existingId)!, ...user, id: existingId };
      this.usersById.set(existingId, merged);
      this.scheduleSave();
      return merged;
    }
    this.usersById.set(user.id, user);
    this.usersByPhone.set(user.phone, user.id);
    this.scheduleSave();
    return user;
  }
  getUser(id: string): User | undefined {
    return this.usersById.get(id);
  }

  /* OTP ---------------------------------------------------------- */
  putOtp(c: OtpChallenge) {
    this.otp.set(c.id, c);
  }
  getOtp(id: string): OtpChallenge | undefined {
    return this.otp.get(id);
  }
  deleteOtp(id: string) {
    this.otp.delete(id);
  }

  /* Orders ------------------------------------------------------- */
  putOrder(order: Order) {
    this.orders.set(order.id, order);
    this.scheduleSave();
  }
  getOrder(id: string): Order | undefined {
    return this.orders.get(id);
  }
  listOrdersByUser(userId: string): Order[] {
    return Array.from(this.orders.values())
      .filter((o) => o.userId === userId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
  listAllOrders(): Order[] {
    return Array.from(this.orders.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  /* Payments ----------------------------------------------------- */
  putPayment(payment: Payment) {
    this.payments.set(payment.id, payment);
    this.paymentsByOrder.set(payment.orderId, payment.id);
    this.scheduleSave();
  }
  getPayment(id: string): Payment | undefined {
    return this.payments.get(id);
  }
  getPaymentByOrder(orderId: string): Payment | undefined {
    const pid = this.paymentsByOrder.get(orderId);
    return pid ? this.payments.get(pid) : undefined;
  }
  findPaymentByProviderRef(providerRef: string): Payment | undefined {
    return Array.from(this.payments.values()).find((p) => p.providerRef === providerRef);
  }

  /* Support ------------------------------------------------------ */
  putTicket(ticket: SupportTicket) {
    this.tickets.set(ticket.id, ticket);
    this.scheduleSave();
  }
  getTicket(id: string): SupportTicket | undefined {
    return this.tickets.get(id);
  }
  listAllTickets(): SupportTicket[] {
    return Array.from(this.tickets.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  /* Idempotency -------------------------------------------------- */
  getIdempotent(key: string): string | undefined {
    return this.idempotency.get(key);
  }
  setIdempotent(key: string, resourceId: string) {
    this.idempotency.set(key, resourceId);
  }
}

export const store = new Store();
