// server.js  ── Express bridge for Paynow
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const axios   = require('axios');
const crypto  = require('crypto');

////////////////////////////////////////////////////////////////////////////////
// 1.  CONFIG  ––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
////////////////////////////////////////////////////////////////////////////////
const PAYNOW_ID   = process.env.PAYNOW_INTEGRATION_ID  || '21458';
const PAYNOW_KEY  = process.env.PAYNOW_INTEGRATION_KEY || 'a35a82b3-aa73-4839-90bd-aa2eb655c9de';
const MERCHANT_EM = process.env.MERCHANT_EMAIL         || 'sukaravtech@gmail.com';

const DEF_RETURN  = process.env.PAYNOW_RETURN_URL || 'https://sukaravtech.art/success';
const DEF_RESULT  = process.env.PAYNOW_RESULT_URL || 'https://sukaravtech.art/paynow-status';

////////////////////////////////////////////////////////////////////////////////
// 2.  APP BOOTSTRAP  –––––––––––––––––––––––––––––––––––––––––––––––––––––––––
////////////////////////////////////////////////////////////////////////////////
const app = express();

// CORS – allow Bolt to hit the endpoint from any origin
app.use(cors({ origin: '*', methods: 'POST,OPTIONS', allowedHeaders: 'Content-Type' }));
app.options('*', (_, res) => res.sendStatus(204));   // pre-flight

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple request logger (helps you see traffic in Render logs)
app.use((req, _res, next) => {
  const b = req.headers['content-type']?.startsWith('application/json')
           ? JSON.stringify(req.body ?? {})
           : '[non-JSON]';
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} | body → ${b}`);
  next();
});

////////////////////////////////////////////////////////////////////////////////
// 3.  HELPERS  –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
////////////////////////////////////////////////////////////////////////////////
/**
 * Build the canonical hash string *exactly* the way Paynow expects:
 * id + reference + amount + additionalinfo + returnurl + resulturl + KEY
 */
function buildHash(payload) {
  const ordered = [
    payload.id,
    payload.reference,
    payload.amount,
    payload.additionalinfo,
    payload.returnurl,
    payload.resulturl
  ].join('') + PAYNOW_KEY;

  return crypto.createHash('sha512').update(ordered, 'utf8').digest('hex').toUpperCase();
}

function log(stage, data) {
  console.log(`\n[Paynow] ${stage}:`, data);
}

////////////////////////////////////////////////////////////////////////////////
// 4.  ROUTES  ––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
////////////////////////////////////////////////////////////////////////////////
app.post('/create-paynow-order', async (req, res) => {
  const { amount, reference, additionalinfo, returnurl, resulturl, email } = req.body || {};

  if (!amount) {
    return res.status(400).json({ success: false, error: 'Amount is required' });
  }

  // Fill blanks / defaults
  const payData = {
    id            : PAYNOW_ID,
    reference     : reference      || `INV-${Date.now()}`,
    amount        : Number(amount).toFixed(2),
    additionalinfo: additionalinfo || 'AI Glow Preview',
    returnurl     : returnurl      || DEF_RETURN,
    resulturl     : resulturl      || DEF_RESULT,
    status        : 'Message',               // **NOT** in hash
    authemail     : email || MERCHANT_EM     // **NOT** in hash
  };

  // Hash (only six canonical fields!)
  payData.hash = buildHash(payData);

  log('Outgoing payload', payData);

  try {
    const pnRes = await axios.post(
      'https://www.paynow.co.zw/interface/initiatetransaction',
      new URLSearchParams(payData),                    // form-urlencoded
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    log('Raw response', pnRes.data);

    // Parse returned query-string
    const qp      = new URLSearchParams(pnRes.data);
    const status  = qp.get('status')?.toUpperCase();
    const url     = qp.get('browserurl');
    const errMsg  = qp.get('error');

    if (status === 'OK' && url) {
      return res.json({ success: true, url });        // <- Bolt expects {url: …}
    }

    return res.status(400).json({ success: false, error: errMsg || 'Paynow error' });

  } catch (e) {
    console.error('[Paynow] HTTP error →', e?.response?.data || e.message);
    return res.status(500).json({ success: false, error: 'Server error hitting Paynow' });
  }
});

////////////////////////////////////////////////////////////////////////////////
// 5.  START  ––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
////////////////////////////////////////////////////////////////////////////////
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PayNow server listening on ${PORT}`));
