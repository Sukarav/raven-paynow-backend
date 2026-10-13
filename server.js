// server.js - Paynow Backend (Node 18+) - FIXED
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (_, res) => res.status(200).send('Raven Paynow Backend Running'));
app.get('/healthz', (_, res) => res.status(200).send('ok'));

const PAYNOW_ID = process.env.PAYNOW_INTEGRATION_ID || process.env.PAYNOW_ID;
const PAYNOW_KEY = process.env.PAYNOW_INTEGRATION_KEY || process.env.PAYNOW_KEY;
const PAYNOW_RESULT_URL = process.env.PAYNOW_RESULT_URL || 'https://example.com/result';
const PAYNOW_RETURN_URL = process.env.PAYNOW_RETURN_URL || 'https://example.com/return';

function createHash(values, key) {
  let string = '';
  for (let val of values) string += val;
  string += key;
  return crypto.createHash('sha512').update(string).digest('hex').toUpperCase();
}

// THIS IS THE MISSING ROUTE THAT FIXES YOUR ERROR
app.post('/create-paynow-link', async (req, res) => {
  try {
    const { amount, email, reference, phone, description } = req.body;
    
    if (!amount || !email) {
      return res.status(400).json({ error: 'amount and email required' });
    }

    const ref = reference || 'SOKO_' + Date.now();
    const amt = parseFloat(amount).toFixed(2);
    const additionalInfo = description || 'Soko Vendor Registration';

    const data = {
      id: PAYNOW_ID,
      reference: ref,
      amount: amt,
      additionalinfo: additionalInfo,
      returnurl: PAYNOW_RETURN_URL,
      resulturl: PAYNOW_RESULT_URL,
      authemail: email,
      status: 'Message'
    };

    const hashValues = [data.id, data.reference, data.amount, data.additionalinfo, data.returnurl, data.resulturl, data.authemail, data.status];
    data.hash = createHash(hashValues, PAYNOW_KEY);

    const response = await axios.post('https://www.paynow.co.zw/interface/remotetransaction', new URLSearchParams(data).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    // Parse response
    const params = new URLSearchParams(response.data);
    const result = Object.fromEntries(params);
    
    if (result.status === 'Ok' && result.browserurl) {
      return res.json({ url: result.browserurl, paynowRef: result.paynowreference, pollurl: result.pollurl });
    } else {
      console.error('Paynow error:', response.data);
      return res.status(500).json({ error: 'Paynow failed', details: response.data });
    }

  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log('Server running on', PORT));
