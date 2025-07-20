const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const dotenv = require('dotenv');
const { URLSearchParams } = require('url'); // Node.js built-in for URL-encoding

dotenv.config(); // Load environment variables from .env file (for local testing)

const app = express();
const PORT = process.env.PORT || 3000; // Use Render's PORT or default to 3000 locally

// Paynow API credentials and base URL
const PAYNOW_INTEGRATION_ID = process.env.PAYNOW_INTEGRATION_ID;
const PAYNOW_INTEGRATION_KEY = process.env.PAYNOW_INTEGRATION_KEY;
const PAYNOW_API_BASE_URL = process.env.PAYNOW_API_BASE_URL; // e.g., 'https://www.paynow.co.zw/Interface/'

if (!PAYNOW_INTEGRATION_ID || !PAYNOW_INTEGRATION_KEY || !PAYNOW_API_BASE_URL) {
    console.error(`[${new Date().toISOString()}] Error: Paynow environment variables are not set. Please check your .env file or Render environment settings.`);
    process.exit(1); // Exit if critical variables are missing
}

// Middleware to parse JSON bodies (for incoming requests to /api/paynow/initiate)
app.use(express.json());
// Middleware to parse URL-encoded bodies (for incoming webhooks from Paynow)
app.use(express.urlencoded({ extended: true }));

/**
 * Generates the SHA-512 hash required by Paynow.
 * @param {object} params - An object containing all the parameters for the Paynow request.
 * @param {string} integrationKey - Your Paynow Integration Key.
 * @returns {string} The SHA-512 hash in uppercase hexadecimal format.
 */
function generatePaynowHash(params, integrationKey) {
    // 1. Sort parameters alphabetically by key
    const sortedKeys = Object.keys(params).sort();

    // 2. Concatenate values
    let signatureString = "";
    for (const key of sortedKeys) {
        // Exclude the 'hash' parameter itself if it somehow exists in params
        if (key.toUpperCase() !== "HASH") { // Ensure case-insensitive check for 'hash'
            signatureString += params[key];
        }
    }

    // 3. Append Integration Key
    signatureString += integrationKey;

    // --- DEBUGGING LOG ---
    console.log(`[${new Date().toISOString()}] DEBUG: String for hash generation: "${signatureString}"`);
    // --- END DEBUGGING LOG ---

    // 4. Compute SHA-512 hash and convert to uppercase hexadecimal
    const hash = crypto.createHash('sha512').update(signatureString).digest('hex').toUpperCase();
    return hash;
}

// Endpoint to initiate a Paynow transaction
app.post('/api/paynow/initiate', async (req, res) => {
    try {
        const { reference, amount, customerEmail } = req.body;

        if (!reference || !amount) {
            return res.status(400).json({ error: 'Missing required parameters: reference and amount.' });
        }

        // Use RENDER_EXTERNAL_URL when deployed, otherwise fall back to localhost for local testing
        const BASE_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
        // The URLs Paynow will interact with on your server
        const returnUrl = `${BASE_URL}/paynow/return`; // Customer lands here after payment
        const resultUrl = `${BASE_URL}/api/paynow/webhook`; // Paynow sends webhooks here

        // Prepare parameters for Paynow API
        const paynowParams = {
            id: PAYNOW_INTEGRATION_ID,
            reference: String(reference), // Ensure string type
            amount: parseFloat(amount).toFixed(2), // Format to 2 decimal places
            returnurl: returnUrl,
            resulturl: resultUrl,
            status: "message" // Standard for initiate transaction
        };

        if (customerEmail) {
            paynowParams.authemail = customerEmail;
        }

        // Generate the hash
        const hash = generatePaynowHash(paynowParams, PAYNOW_INTEGRATION_KEY);
        paynowParams.hash = hash;

        // Convert parameters to x-www-form-urlencoded format as Paynow expects
        const formData = new URLSearchParams();
        for (const key in paynowParams) {
            formData.append(key, paynowParams[key]);
        }

        console.log(`[${new Date().toISOString()}] Initiating transaction for reference: ${reference}, amount: ${amount}`);
        // console.log("Parameters sent to Paynow (excluding key):", paynowParams); // Uncomment for debugging


        // --- CRUCIAL CHANGE: Reverting to 'InitiateTransaction' for live ---
        const paynowResponse = await axios.post(`${PAYNOW_API_BASE_URL}InitiateTransaction`, formData.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        // --- END CRUCIAL CHANGE ---

        // Parse Paynow's response (it's often URL-encoded form data in the response body)
        const paynowResponseData = new URLSearchParams(paynowResponse.data);
        const responseStatus = paynowResponseData.get('status');
        const redirectUrl = paynowResponseData.get('redirecturl');
        const pollUrl = paynowResponseData.get('pollurl');
        const paynowReference = paynowResponseData.get('paynowreference');
        const paynowResponseHash = paynowResponseData.get('hash');

        // --- IMPORTANT: Verify Paynow's response hash (highly recommended for robustness) ---
        // This confirms the response from Paynow hasn't been tampered with.
        const receivedParamsForVerification = {};
        paynowResponseData.forEach((value, key) => {
            if (key.toUpperCase() !== 'HASH') {
                receivedParamsForVerification[key] = value;
            }
        });
        const generatedResponseHash = generatePaynowHash(receivedParamsForVerification, PAYNOW_INTEGRATION_KEY);

        if (generatedResponseHash !== paynowResponseHash) {
            console.warn(`[${new Date().toISOString()}] Paynow response hash mismatch for reference ${reference}! Possible tampering or incorrect hash calculation on verification.`);
            // In a production scenario, you might want to log this as a critical error and potentially reject the transaction.
        }
        // --- End Hash Verification ---


        if (responseStatus === 'Ok' && redirectUrl) {
            console.log(`[${new Date().toISOString()}] Transaction initiated successfully. Paynow Ref: ${paynowReference}, Redirect URL: ${redirectUrl}`);
            res.json({
                success: true,
                message: 'Transaction initiated successfully',
                redirectUrl: redirectUrl,
                pollUrl: pollUrl, // Save this in your database to check status later if needed
                paynowReference: paynowReference // Save this in your database
            });
        } else {
            console.error(`[${new Date().toISOString()}] Paynow initiation failed for reference ${reference}:`, paynowResponse.data);
            res.status(500).json({
                success: false,
                error: 'Paynow initiation failed',
                details: paynowResponse.data
            });
        }

    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error initiating Paynow transaction:`, error.message);
        console.error('Paynow API response error data:', error.response ? error.response.data : 'No response data');
        res.status(500).json({
            success: false,
            error: 'Internal server error during Paynow initiation',
            details: error.message
        });
    }
});

// Endpoint to handle Paynow webhooks (resulturl)
app.post('/api/paynow/webhook', (req, res) => {
    // Paynow sends URL-encoded form data to this endpoint.
    // req.body will already be populated by express.urlencoded({ extended: true })
    const paynowData = req.body;

    console.log(`[${new Date().toISOString()}] Received Paynow Webhook:`, paynowData);

    const receivedHash = paynowData.hash;
    const receivedParamsForVerification = { ...paynowData }; // Create a shallow copy
    delete receivedParamsForVerification.hash; // Remove hash before calculating

    // Verify the incoming hash for authenticity and integrity
    const generatedHash = generatePaynowHash(receivedParamsForVerification, PAYNOW_INTEGRATION_KEY);

    if (generatedHash !== receivedHash) {
        console.error(`[${new Date().toISOString()}] Webhook Hash Mismatch for reference ${paynowData.reference}! Possible tampering detected.`);
        // Respond with an error status to Paynow if hash verification fails
        return res.status(400).send('Hash mismatch. Request rejected for security.');
    }

    // Hash is verified, now process the transaction status
    const status = paynowData.status;
    const reference = paynowData.reference; // Your internal order reference
    const paynowReference = paynowData.paynowreference; // Paynow's reference
    const amount = paynowData.amount;

    // IMPORTANT: This is where you update your database/order status
    console.log(`[${new Date().toISOString()}] Processing webhook for Order ${reference}. Paynow Ref: ${paynowReference}. Status: ${status}. Amount: ${amount}`);

    // In a real application, you would:
    // 1. Look up the order in your database using 'reference'.
    // 2. Potentially check if the 'amount' matches to prevent manipulation (though hash helps here).
    // 3. Update the order status based on 'status' ('Paid', 'Cancelled', 'Failed', etc.).
    // 4. Log the transaction details in your system's audit trail.

    if (status === 'Paid') {
        // Mark order as paid in your database
        console.log(`[${new Date().toISOString()}] Order ${reference} successfully paid.`);
    } else if (status === 'Cancelled' || status === 'Failed') {
        // Mark order as cancelled/failed
        console.log(`[${new Date().toISOString()}] Order ${reference} payment ${status}.`);
    } else {
        // Handle other statuses if necessary (e.g., 'Awaiting Delivery', 'Created')
        console.log(`[${new Date().toISOString()}] Order ${reference} has status: ${status}.`);
    }

    // Always respond to Paynow with a 200 OK to acknowledge successful receipt of the webhook.
    // If you don't, Paynow might retry sending the webhook.
    res.status(200).send('OK');
});

// Example route for the return URL (customer lands here after payment on Paynow's site)
app.get('/paynow/return', (req, res) => {
    // Paynow will typically redirect the customer back to this URL, often
    // including query parameters like 'reference' and 'status'.
    const { reference, status } = req.query; // Capture these if present

    let message = 'Thank you for your payment!';
    let details = 'We are processing your order.';
    let cssClass = '';

    if (status) {
        message = `Payment ${status}!`;
        if (status === 'Paid') {
            details = 'Your order has been confirmed and is being processed.';
            cssClass = 'success';
        } else if (status === 'Cancelled' || status === 'Failed') {
            details = 'There was an issue with your payment. Please try again or contact support.';
            cssClass = 'fail';
        } else {
            details = 'Your payment status is being updated. Please check your order history.';
        }
    }

    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Payment Status</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; text-align: center; margin-top: 50px; background-color: #f4f7f6; color: #333; }
                .container { background-color: #fff; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); padding: 30px; max-width: 600px; margin: 0 auto; }
                h1 { font-size: 2.2em; margin-bottom: 15px; }
                p { font-size: 1.1em; line-height: 1.6; }
                .success { color: #28a745; }
                .fail { color: #dc3545; }
                .info { color: #007bff; }
                a { display: inline-block; margin-top: 20px; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; transition: background-color 0.3s ease; }
                a:hover { background-color: #0056b3; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1 class="${cssClass}">${message}</h1>
                <p>Your order reference: <strong>${reference || 'N/A'}</strong></p>
                <p>${details}</p>
                <p><strong>Note:</strong> The final status of your transaction is confirmed via our secure backend webhook. This page provides immediate feedback for your convenience.</p>
                <a href="/">Go to Homepage</a>
            </div>
        </body>
        </html>
    `);
});

// Basic health check endpoint
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Paynow Service Status</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; text-align: center; margin-top: 50px; background-color: #f4f7f6; color: #333; }
            .container { background-color: #fff; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); padding: 30px; max-width: 600px; margin: 0 auto; }
            h1 { color: #007bff; }
            p { margin-bottom: 20px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Paynow Hash Server is running!</h1>
            <p>Your backend service for Paynow integration is active.</p>
            <p>To initiate a transaction, send a <strong>POST</strong> request to:</p>
            <p><code>${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}/api/paynow/initiate</code></p>
            <p>Webhook notifications will be sent to:</p>
            <p><code>${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}/api/paynow/webhook</code></p>
            <p>And customers will return to:</p>
            <p><code>${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}/paynow/return</code></p>
        </div>
    </body>
    </html>
    `);
});


// Start the server
app.listen(PORT, () => {
    console.log(`[${new Date().toISOString()}] Server running on port ${PORT}`);
    console.log(`[${new Date().toISOString()}] Paynow API Base URL: ${PAYNOW_API_BASE_URL}`);
    console.log(`[${new Date().toISOString()}] Live Service URL (Render): ${process.env.RENDER_EXTERNAL_URL}`);
    console.log(`[${new Date().toISOString()}] Webhook URL (for Paynow config): ${process.env.RENDER_EXTERNAL_URL}/api/paynow/webhook`);
});
