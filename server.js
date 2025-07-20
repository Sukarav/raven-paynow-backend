const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

// Initialize Express app
const app = express();
const port = process.env.PORT || 10000;

// ======================
// Middleware Configuration
// ======================
app.use(cors({
  origin: ['https://sukaravtech.art', 'http://localhost:*'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(bodyParser.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// ======================
// Rate Limiting (Protection)
// ======================
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// ======================
// Security Headers
// ======================
const helmet = require('helmet');
app.use(helmet());

// ======================
// Logger Middleware
// ======================
const morgan = require('morgan');
app.use(morgan(':date[iso] :method :url :status :response-time ms'));

// ======================
// SHA512 Hash Generator
// ======================
function generateHash(values, integrationKey) {
  const rawString = values.join('');
  console.log('\n🔍 String to Hash:', rawString + integrationKey);
  return crypto
    .createHash('sha512')
    .update(rawString + integrationKey, 'utf8')
    .digest('hex')
    .toUpperCase();
}

// ======================
// Health Check Endpoint
// ======================
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.2.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// ======================
// Main PayNow Endpoint
// ======================
app.post('/create-paynow-order', async (req, res) => {
  try {
    // Validate required fields
    const { amount, reference, additionalinfo, returnurl, resulturl, description, email } = req.body;

    if (!amount || isNaN(parseFloat(amount))) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Amount is required and must be a valid number'
      });
    }

    // Prepare parameters
    const id = process.env.PAYNOW_INTEGRATION_ID;
    const key = process.env.PAYNOW_INTEGRATION_KEY;
    const authemail = email || process.env.MERCHANT_EMAIL;

    const ref = reference || `RAVEN_${Date.now()}`;
    const info = additionalinfo || description || 'Digital Art Payment';
    const returnUrlRaw = returnurl || 'https://sukaravtech.art/success';
    const resultUrlRaw = resulturl || 'https://sukaravtech.art/paynow-status';
    const status = 'Message';

    // Generate hash
    const valuesToHash = [id, ref, amount, info, returnUrlRaw, resultUrlRaw, status];
    const hash = generateHash(valuesToHash, key);

    // Prepare payload for PayNow
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

    console.log('🚀 PayNow Request Parameters:', Object.fromEntries(params));

    // Call PayNow API
    const response = await axios.post(
      'https://www.paynow.co.zw/Interface/InitiateTransaction',
      params,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/x-www-form-urlencoded'
        },
        timeout: 10000 // 10 second timeout
      }
    );

    // Parse response
    const responseData = new URLSearchParams(response.data);
    const browserUrl = responseData.get('browserurl');
    const statusResp = responseData.get('status');
    const paynowReference = responseData.get('reference');

    // Validate response
    if (statusResp !== 'Ok' || !browserUrl) {
      console.error('❌ PayNow Error Response:', response.data);
      return res.status(502).json({
        error: 'PAYNOW_ERROR',
        message: 'Payment gateway returned an error',
        paynowStatus: statusResp,
        reference: paynowReference
      });
    }

    // Success response
    res.json({
      success: true,
      url: browserUrl,
      reference: ref,
      amount: amount,
      paynowReference: paynowReference,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('🔥 Server Error:', error);

    // Enhanced error handling
    const errorResponse = {
      error: 'SERVER_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    };

    if (error.response) {
      errorResponse.details = error.response.data;
      errorResponse.statusCode = error.response.status;
    }

    res.status(500).json(errorResponse);
  }
});

// ======================
// Server Configuration
// ======================
const server = app.listen(port, () => {
  console.log(`
  ██████╗  █████╗ ██╗   ██╗███████╗███╗   ██╗
  ██╔══██╗██╔══██╗██║   ██║██╔════╝████╗  ██║
  ██████╔╝███████║██║   ██║█████╗  ██╔██╗ ██║
  ██╔══██╗██╔══██║╚██╗ ██╔╝██╔══╝  ██║╚██╗██║
  ██║  ██║██║  ██║ ╚████╔╝ ███████╗██║ ╚████║
  ╚═╝  ╚═╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝╚═╝  ╚═══╝
  
  🚀 Server ready at http://localhost:${port}
  ⏰ Started at ${new Date().toISOString()}
  `);
});

// Render.com specific optimizations
server.keepAliveTimeout = 60 * 1000; // 60 seconds
server.headersTimeout = 65 * 1000; // 65 seconds

// ======================
// Error Handling
// ======================
process.on('unhandledRejection', (err) => {
  console.error('⚠️ Unhandled Rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('⚠️ Uncaught Exception:', err);
  process.exit(1);
});

// ======================
// Graceful Shutdown
// ======================
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('💤 Process terminated');
    process.exit(0);
  });
});
