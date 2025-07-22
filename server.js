// index.js – Express gateway for PayNow
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const axios   = require('axios');
const crypto  = require('crypto');

const app = express();

/* ─────────── 1.  CORS & body parsing ─────────── */
app.use(cors({ origin: '*' }));  // allow every front-end, or tighten as needed
app.options('*', (_, res) => res.sendStatus(204)); // pre-flight OK

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ─────────── 2.  ENV  ─────────── */
const ID        = process.env.PAYNOW_INTEGRATION_ID  || '21458';
const KEY       = process.env.PAYNOW_INTEGRATION_KEY || 'a35a82b3-aa73-4839-90bd-aa2eb655c9de';
const EMAIL     = process.env.MERCHANT_EMAIL         || 'client@sukaravtech.art';
const RETURNURL = process.env.PAYNOW_RETURN_URL      || 'https://sukaravtech.art/success';
const RESULTURL = process.env.PAYNOW_RESULT_URL      || 'https://sukaravtech.art/paynow-status';

/* ─────────── 3.  Helpers ─────────── */
function hash(values) {
  let s = '';
  for (const [k, v] of Object.entries(values))
    if (k.toLowerCase() !== 'hash') s += v || '';
  s += KEY;
  return crypto.createHash('sha512').update(s, 'utf8').digest('hex').toUpperCase();
}
function log(stage, obj) { console.log(`\n[PayNow] ${stage}:`, obj); }

/* ─────────── 4.  Endpoint ─────────── */
app.post('/create-paynow-order', async (req, res) => {

  /* Validate & assemble */
  const { amount, reference, additionalinfo, returnurl, resulturl, email } = req.body || {};
  if (!amount) return res.status(400).json({ success:false, error:'Amount is required' });

  const payload = {
    id            : ID,
    reference     : reference      || `INV-${Date.now()}`,
    amount        : Number(amount).toFixed(2),
    additionalinfo: additionalinfo || 'AI Art Preview for Design Lab',
    returnurl     : returnurl      || RETURNURL,
    resulturl     : resulturl      || RESULTURL,
    status        : 'Message',
    authemail     : email          || EMAIL
  };
  payload.hash = hash(payload);

  log('Outgoing payload', payload);

  /* Send to PayNow */
  try {
    const pnRes = await axios.post(
      'https://www.paynow.co.zw/interface/initiatetransaction',
      new URLSearchParams(payload),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    log('Raw response', pnRes.data);
    const p = new URLSearchParams(pnRes.data);
    if ((p.get('status') || '').toUpperCase() === 'OK' && p.get('browserurl'))
      return res.json({ success:true, url:p.get('browserurl') });

    return res.status(400).json({ success:false, error:p.get('error') || 'PayNow error' });

  } catch (e) {
    console.error('[PayNow] HTTP error:', e?.response?.data || e.message);
    res.status(500).json({ success:false, error:'Server error contacting PayNow' });
  }
});

/* ─────────── 5.  Start ─────────── */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PayNow server listening on ${PORT}`));
