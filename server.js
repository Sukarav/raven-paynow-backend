require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const axios   = require('axios');
const crypto  = require('crypto');

/* ─────────── Config ─────────── */
const ID    = process.env.PAYNOW_INTEGRATION_ID  || '21458';
const KEY   = process.env.PAYNOW_INTEGRATION_KEY || 'a35a82b3-aa73-4839-90bd-aa2eb655c9de';
const EMAIL = process.env.MERCHANT_EMAIL         || 'sukaravtech@gmail.com';
const DEF_RETURN = process.env.PAYNOW_RETURN_URL || 'https://sukaravtech.art/success';
const DEF_RESULT = process.env.PAYNOW_RESULT_URL || 'https://sukaravtech.art/paynow-status';

/* ─────────── Express ─────────── */
const app = express();
app.use(cors({ origin: '*' }));
app.options('*', (_, r) => r.sendStatus(204));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* Simple request logger (shows in Render logs) */
app.use((req, _, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`,
              'body →', JSON.stringify(req.body ?? {}));
  next();
});

/* ─────────── Util: build PayNow hash ─────────── */
function buildHash(o) {
  const str =
    o.id            +
    o.reference     +
    o.amount        +
    o.additionalinfo+
    o.returnurl     +
    o.resulturl     +
    'Message' +       // **must** be present
    KEY;
  return crypto.createHash('sha512').update(str, 'utf8').digest('hex').toUpperCase();
}

/* ───────────  POST /create-paynow-order ─────────── */
app.post('/create-paynow-order', async (req, res) => {
  const { amount, reference, additionalinfo, returnurl, resulturl, email } = req.body || {};

  if (!amount)
    return res.status(400).json({ success: false, error: 'Amount is required' });

  const raw = {
    id            : ID,
    reference     : reference      || `INV-${Date.now()}`,
    amount        : Number(amount).toFixed(2),
    additionalinfo: additionalinfo || 'AI Glow Preview',
    returnurl     : returnurl      || DEF_RETURN,
    resulturl     : resulturl      || DEF_RESULT
  };

  const payload = {
    ...raw,
    status   : 'Message',
    authemail: email || EMAIL,
    hash     : buildHash(raw)
  };

  console.log('[PayNow] Outgoing payload:', payload);

  /* Build form-urlencoded body (URLs will be percent-encoded automatically) */
  const form = new URLSearchParams();
  Object.entries(payload).forEach(([k, v]) => form.append(k, v));

  try {
    const resp = await axios.post(
      'https://www.paynow.co.zw/interface/initiatetransaction',
      form,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    console.log('[PayNow] Raw response:', resp.data);

    const p   = new URLSearchParams(resp.data);
    const sts = (p.get('status') || '').toUpperCase();
    const url = p.get('browserurl');

    if (sts === 'OK' && url)
      return res.json({ success: true, url });

    return res.status(400).json({ success: false, error: p.get('error') || 'PayNow error' });
  } catch (err) {
    console.error('[PayNow] HTTP error:', err?.response?.data || err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/* ─────────── Start server ─────────── */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PayNow server listening on ${PORT}`));
