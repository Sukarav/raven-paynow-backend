// index.js – PayNow Gateway (Redirect + Express Checkout)
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const axios   = require('axios');
const crypto  = require('crypto');

const app = express();

/* 1 ▸ CORS + body parsing
   ───────────────────────────────────────── */
const FRONTEND_ORIGIN = process.env.ALLOW_ORIGIN || '*';           // e.g. "https://sukaravtech.art"
app.use(cors({ origin: FRONTEND_ORIGIN }));
app.options('*', (_, res) => res.sendStatus(204));                 // pre-flight OK

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* 2 ▸ Env / Defaults
   ───────────────────────────────────────── */
const ID        = process.env.PAYNOW_INTEGRATION_ID  || '21458';
const KEY       = process.env.PAYNOW_INTEGRATION_KEY || 'a35a82b3-aa73-4839-90bd-aa2eb655c9de';
const EMAIL     = process.env.MERCHANT_EMAIL         || 'merchant@example.com';
const RETURNURL = process.env.PAYNOW_RETURN_URL      || 'https://sukaravtech.art/success';
const RESULTURL = process.env.PAYNOW_RESULT_URL      || 'https://sukaravtech.art/paynow-status';

/* 3 ▸ Helpers
   ───────────────────────────────────────── */
function hash(obj){
  const base = Object.entries(obj)
    .filter(([k]) => k.toLowerCase() !== 'hash')
    .map(([,v]) => v ?? '')
    .join('') + KEY;
  return crypto.createHash('sha512').update(base,'utf8').digest('hex').toUpperCase();
}
const log = (stage,data)=>console.log(`\n[PayNow] ${stage}:`,data);

/* 4 ▸ Create order
   ───────────────────────────────────────── */
app.post('/create-paynow-order', async (req, res) => {
  try{
    /* 4.1 Validate */
    const {
      amount,                     //   "0.69"
      reference,
      additionalinfo,
      returnurl,
      resulturl,
      email,
      /* express-only ↓ */
      method,                    //   "ecocash" | "onemoney" | "innbucks" | "vmc" | "zimswitch" | …
      phone,                     //   "+2637..."   (wallets)
      token                      //   "xxxxxxxx"   (tokenised cards)
    } = req.body || {};

    if(!amount) return res.status(400).json({ error:'Amount is required' });

    /* 4.2 Decide flow */
    const useExpress = Boolean(method && method.trim());
    const endpoint   = useExpress
      ? 'https://www.paynow.co.zw/interface/remotetransaction'
      : 'https://www.paynow.co.zw/interface/initiatetransaction';

    /* 4.3 Build payload */
    const payload = {
      id    : ID,
      reference     : reference      || `INV-${Date.now()}`,
      amount        : Number(amount).toFixed(2),
      additionalinfo: additionalinfo || 'AI Art Preview',
      returnurl     : returnurl      || RETURNURL,
      resulturl     : resulturl      || RESULTURL,
      authemail     : email          || EMAIL,
      status        : 'Message'
    };

    if(useExpress){
      payload.method = method.toLowerCase().trim();
      if(phone) payload.phone = phone;
      if(token) payload.token = token;
    }

    payload.hash = hash(payload);
    log('Outgoing payload', {...payload, hash: payload.hash.slice(0,8)+'…'});

    /* 4.4 Post to PayNow */
    const { data: raw } = await axios.post(
      endpoint,
      new URLSearchParams(payload),
      { headers:{ 'Content-Type':'application/x-www-form-urlencoded' }, timeout:10000 }
    );

    log('Raw response', raw);
    const p      = new URLSearchParams(raw);
    const status = (p.get('status') || p.get('Status') || '').toUpperCase();
    const error  =  p.get('error')  || p.get('Error');
    const browse =  p.get('browserurl') || p.get('BrowserUrl');
    const poll   =  p.get('pollurl')    || p.get('PollUrl');

    if(status === 'OK'){
      /* Express checkout usually has no browserUrl – that’s fine */
      return res.json({ success:true, url:browse, pollUrl:poll, status });
    }
    return res.status(400).json({ error: error || 'PayNow returned non-OK status', raw });

  }catch(err){
    console.error('[PayNow] Exception:', err?.response?.data || err.message);
    res.status(500).json({ error:'Server error contacting PayNow' });
  }
});

/* 5 ▸ Start
   ───────────────────────────────────────── */
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log(`🟢 PayNow server listening on ${PORT}`));
