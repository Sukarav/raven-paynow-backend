const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// Generate SHA512 hash for Paynow
function generateHash(values) {
  const stringToHash = values.join('');
  return crypto.createHash('sha512').update(stringToHash).digest('hex');
}

app.post('/create-paynow-order', (req, res) => {
  const {
    amount,
    reference,
    additionalinfo,
    returnurl,
    resulturl,
    description,
    email
  } = req.body;

  const id = process.env.INTEGRATION_ID;
  const key = process.env.INTEGRATION_KEY;

  const params = new URLSearchParams({
    id,
    reference: reference || 'RAVEN_ORDER',
    amount,
    additionalinfo: additionalinfo || description || 'Art Payment',
    returnurl: returnurl || 'https://example.com/return',
    resulturl: resulturl || 'https://example.com/result',
    authemail: email || process.env.MERCHANT_EMAIL || 'buyer@example.com',
    status: 'Message'
  });

  const valuesToHash = [
    id,
    reference || 'RAVEN_ORDER',
    amount,
    additionalinfo || description || 'Art Payment',
    returnurl || 'https://example.com/return',
    resulturl || 'https://example.com/result',
    key
  ];

  const hash = generateHash(valuesToHash);
  params.append('hash', hash);

  const url = 'https://www.paynow.co.zw/Interface/InitiateTransaction';
  const finalUrl = `${url}?${params.toString()}`;

  res.json({ url: finalUrl });
});

app.listen(port, () => {
  console.log(`🚀 Paynow server running on port ${port}`);
});
