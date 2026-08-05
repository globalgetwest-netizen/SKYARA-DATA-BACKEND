import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/http';
import { AppError } from '../lib/errors';
import { adminAuth, requireAdmin } from '../admin/adminAuth';
import { catalogueStore } from '../store/catalogueStore';
import { settingsStore } from '../store/settingsStore';
import { store } from '../store/store';
import { paymentService } from '../services/paymentService';
import { NetworkCodeSchema } from '../domain/types';
import { paymentProvider } from '../providers/payment';

export const adminRouter = Router();

/* Auth ----------------------------------------------------------- */
const LoginSchema = z.object({ email: z.string().min(3), password: z.string().min(1) });

adminRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = LoginSchema.parse(req.body);
    res.json(adminAuth.login(email, password));
  }),
);

// Everything below requires a valid admin session.
adminRouter.use(requireAdmin);

adminRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    res.json({ email: req.adminEmail, role: 'admin' });
  }),
);

/* Overview ------------------------------------------------------- */
adminRouter.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const orders = store.listAllOrders();
    const revenue = orders
      .filter((o) => o.status === 'SUCCESS')
      .reduce((sum, o) => sum + o.total, 0);
    res.json({
      networks: catalogueStore.getNetworks().length,
      bundles: catalogueStore.allBundles().length,
      orders: orders.length,
      successful: orders.filter((o) => o.status === 'SUCCESS').length,
      revenue: Number(revenue.toFixed(2)),
      openTickets: store.listAllTickets().filter((t) => t.status !== 'resolved').length,
      paymentProvider: paymentProvider.id,
    });
  }),
);

/* Networks ------------------------------------------------------- */
adminRouter.get(
  '/networks',
  asyncHandler(async (_req, res) => {
    res.json({ networks: catalogueStore.getNetworks() });
  }),
);

const NetworkPatchSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(['available', 'unavailable', 'maintenance']).optional(),
  logo: z.string().url().nullable().optional(),
});

adminRouter.patch(
  '/networks/:code',
  asyncHandler(async (req, res) => {
    const code = NetworkCodeSchema.parse(req.params.code);
    const patch = NetworkPatchSchema.parse(req.body);
    res.json({ network: catalogueStore.updateNetwork(code, patch) });
  }),
);

/* Bundles -------------------------------------------------------- */
adminRouter.get(
  '/bundles',
  asyncHandler(async (_req, res) => {
    res.json({ bundles: catalogueStore.allBundles() });
  }),
);

const BundleInputSchema = z.object({
  id: z.string().optional(),
  network: NetworkCodeSchema,
  name: z.string().min(1),
  volume: z.number().positive(),
  unit: z.enum(['MB', 'GB']),
  price: z.number().nonnegative(),
  validity: z.string().min(1),
  category: z.enum(['data', 'social', 'night', 'unlimited']).optional(),
  badge: z.string().nullable().optional(),
  available: z.boolean().optional(),
});

adminRouter.post(
  '/bundles',
  asyncHandler(async (req, res) => {
    const input = BundleInputSchema.parse(req.body);
    res.status(201).json({ bundle: catalogueStore.createBundle(input) });
  }),
);

const BundlePatchSchema = BundleInputSchema.partial().omit({ network: true });

adminRouter.patch(
  '/bundles/:id',
  asyncHandler(async (req, res) => {
    const patch = BundlePatchSchema.parse(req.body);
    res.json({ bundle: catalogueStore.updateBundle(req.params.id, patch) });
  }),
);

adminRouter.delete(
  '/bundles/:id',
  asyncHandler(async (req, res) => {
    catalogueStore.deleteBundle(req.params.id);
    res.json({ ok: true });
  }),
);

/* Transactions --------------------------------------------------- */
adminRouter.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim().toLowerCase();
    let orders = store.listAllOrders();
    if (q) {
      orders = orders.filter(
        (o) =>
          o.reference.toLowerCase().includes(q) ||
          o.recipient.toLowerCase().includes(q) ||
          o.network.toLowerCase().includes(q) ||
          o.status.toLowerCase().includes(q),
      );
    }
    res.json({ orders: orders.slice(0, 200) });
  }),
);

adminRouter.post(
  '/orders/:id/retry',
  asyncHandler(async (req, res) => {
    const order = await paymentService.retry(req.params.id);
    res.json({ order });
  }),
);

/* Support tickets ------------------------------------------------ */
adminRouter.get(
  '/tickets',
  asyncHandler(async (_req, res) => {
    res.json({ tickets: store.listAllTickets() });
  }),
);

const TicketPatchSchema = z.object({ status: z.enum(['open', 'in_review', 'resolved']) });

adminRouter.patch(
  '/tickets/:id',
  asyncHandler(async (req, res) => {
    const ticket = store.getTicket(req.params.id);
    if (!ticket) throw AppError.notFound('Ticket not found.');
    const { status } = TicketPatchSchema.parse(req.body);
    store.putTicket({ ...ticket, status });
    res.json({ ticket: { ...ticket, status } });
  }),
);

/* Settings ------------------------------------------------------- */
adminRouter.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    res.json({ settings: settingsStore.get() });
  }),
);

const SettingsPatchSchema = z.object({
  processingFeeGhs: z.number().nonnegative().optional(),
  ussdShortCode: z.string().min(2).optional(),
});

adminRouter.patch(
  '/settings',
  asyncHandler(async (req, res) => {
    const patch = SettingsPatchSchema.parse(req.body);
    res.json({ settings: settingsStore.update(patch) });
  }),
);
