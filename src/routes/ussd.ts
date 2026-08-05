import { Router } from 'express';
import { asyncHandler } from '../lib/http';
import { handleUssd } from '../ussd/menu';

/**
 * USSD endpoints.
 *
 * `POST /ussd` speaks the Africa's Talking protocol (form-encoded body with
 * sessionId, phoneNumber, text; plain-text "CON"/"END" response). Most Ghana
 * aggregators (Hubtel, Nsano) use a similar shape — adapt the field names in
 * one place here if yours differs.
 *
 * `POST /ussd/simulate` and `GET /ussd/simulate` are local testers so you can
 * exercise the full menu without renting a short code. Example:
 *   curl "http://localhost:4000/ussd/simulate?phoneNumber=0241234567&text=1*2*1*1"
 */
export const ussdRouter = Router();

// Africa's Talking / generic aggregator webhook
ussdRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const phoneNumber = String(req.body.phoneNumber ?? req.body.msisdn ?? '');
    const text = String(req.body.text ?? '');
    const result = await handleUssd(phoneNumber, text);
    res.set('Content-Type', 'text/plain');
    res.send(`${result.end ? 'END' : 'CON'} ${result.message}`);
  }),
);

// Local simulator — returns JSON so it's easy to test in a browser or script.
const simulate = asyncHandler(async (req, res) => {
  const src = req.method === 'GET' ? req.query : req.body;
  const phoneNumber = String(src.phoneNumber ?? '0240000000');
  const text = String(src.text ?? '');
  const result = await handleUssd(phoneNumber, text);
  res.json({
    display: `${result.end ? 'END' : 'CON'} ${result.message}`,
    end: result.end,
    hint: 'Append the next choice to `text`, separated by *  (e.g. text=1*2*1*1)',
  });
});

ussdRouter.get('/simulate', simulate);
ussdRouter.post('/simulate', simulate);
