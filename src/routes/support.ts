import { Router } from 'express';
import { asyncHandler } from '../lib/http';
import { optionalAuth } from '../middleware/auth';
import { parseBody } from '../middleware/validate';
import { SupportTicketSchema } from '../domain/types';
import { id, reference } from '../lib/ids';
import { store } from '../store/store';
import type { SupportTicket } from '../domain/types';

export const supportRouter = Router();

// POST /support/tickets
supportRouter.post(
  '/tickets',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const body = parseBody(SupportTicketSchema, req);
    const ticket: SupportTicket = {
      id: id('tkt'),
      reference: reference('SUP'),
      status: 'open',
      createdAt: new Date().toISOString(),
      issueType: body.issueType,
      description: body.description,
      transactionId: body.transactionId,
      userId: req.userId ?? null,
    };
    store.putTicket(ticket);
    // TODO: notify your support inbox / ticketing system here.
    res.status(201).json({
      ticket: {
        id: ticket.id,
        reference: ticket.reference,
        status: ticket.status,
        createdAt: ticket.createdAt,
      },
    });
  }),
);
