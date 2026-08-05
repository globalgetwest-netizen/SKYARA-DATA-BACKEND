import { Router } from 'express';
import { AppError } from '../lib/errors';
import { asyncHandler } from '../lib/http';
import { NetworkCodeSchema } from '../domain/types';
import { catalogueStore } from '../store/catalogueStore';

export const networksRouter = Router();

// GET /networks — served live from the (admin-editable) catalogue store
networksRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ networks: catalogueStore.getNetworks() });
  }),
);

// GET /networks/:network/bundles
networksRouter.get(
  '/:network/bundles',
  asyncHandler(async (req, res) => {
    const parsed = NetworkCodeSchema.safeParse(req.params.network);
    if (!parsed.success) throw AppError.notFound('Unknown network.');
    res.json({ bundles: catalogueStore.getBundlesFor(parsed.data, true) });
  }),
);
