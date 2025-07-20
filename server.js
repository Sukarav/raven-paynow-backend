app.post('/create-paynow-order', async (req, res) => {
  try {
    const {
      amount,
      reference,
      additionalinfo,
      returnurl,
      resulturl,
      description,
      email
    } = req.body;

    // Validate required fields
    if (!amount) {
      return res.status(400).json({ error: 'Amount is required' });
    }

    const id = process.env.PAYNOW_INTEGRATION_ID;
    const key = process.env.PAYNOW_INTEGRATION_KEY;
    const authemail = email || process.env.MERCHANT_EMAIL;

    const ref = reference || 'RAVEN_ORDER';
    const info = additionalinfo || description || 'Art Payment';
    // Use the URLs from request or fallback to defaults
    const returnUrlRaw = returnurl || 'https://sukaravtech.art/success';
    const resultUrlRaw = resulturl || 'https://sukaravtech.art/paynow-status';
    const status = 'Message';

    const valuesToHash = [id, ref, amount, info, returnUrlRaw, resultUrlRaw, status];
    const hash = generateHash(valuesToHash, key);

    const params = new URLSearchParams();
    params.append('id', id);
    params.append('reference', ref);
    params.append('amount', amount);
    params.append('additionalinfo', info);
    params.append('returnurl', returnUrlRaw);
    params.append('resulturl', resultUrlRaw);
    params.append('status', status);
    params.append('authemail', authemail);
    params.append('hash', hash);

    console.log('🚀 Final Parameters Sent to Paynow:\n' + params.toString());

    const response = await axios.post('https://www.paynow.co.zw/Interface/InitiateTransaction', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    const data = new URLSearchParams(response.data);
    const browserUrl = data.get('browserurl');
    const statusResp = data.get('status');

    if (statusResp !== 'Ok' || !browserUrl) {
      console.error('❌ Paynow Error:', response.data);
      return res.status(500).json({ 
        error: 'Paynow returned an error', 
        details: response.data,
        paynowStatus: statusResp
      });
    }

    res.json({ 
      url: browserUrl,
      reference: ref,
      amount: amount
    });

  } catch (error) {
    console.error('🔥 Server Error:', error?.response?.data || error.message);
    res.status(500).json({ 
      error: 'Server error', 
      details: error.message,
      responseData: error?.response?.data
    });
  }
});
