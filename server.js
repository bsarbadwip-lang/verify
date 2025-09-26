require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { ethers } = require('ethers');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Load environment variables
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;
const RPC_URL = process.env.RPC_URL;
const REFILL_PRIVATE_KEY = process.env.REFILL_PRIVATE_KEY;
const MAX_REFILL_BNB = process.env.MAX_REFILL_BNB || '0.0005';

// Initialize provider and wallet
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(REFILL_PRIVATE_KEY, provider);

app.get('/', (req, res) => {
  res.send('Refill API is running!');
});

app.post('/api/refill', async (req, res) => {
  try {
    const clientKey = req.headers['x-api-key'];
    if (clientKey !== API_KEY) {
      return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
    }

    const { to, amount } = req.body;

    if (!to || !amount) {
      return res.status(400).json({ error: 'Missing "to" or "amount" in request body' });
    }

    if (!ethers.utils.isAddress(to)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    if (parseFloat(amount) > parseFloat(MAX_REFILL_BNB)) {
      return res.status(400).json({ error: `Amount exceeds MAX_REFILL_BNB (${MAX_REFILL_BNB} BNB)` });
    }

    // Check wallet balance
    const balance = await wallet.getBalance();
    if (balance.lt(ethers.utils.parseEther(amount))) {
      return res.status(400).json({ error: 'Insufficient BNB in refill wallet' });
    }

    // Send BNB
    const tx = await wallet.sendTransaction({
      to: to,
      value: ethers.utils.parseEther(amount)
    });

    await tx.wait(); // wait for confirmation

    console.log(`Refilled ${amount} BNB to ${to}. TxHash: ${tx.hash}`);
    res.json({ success: true, to, amount, txHash: tx.hash });

  } catch (error) {
    console.error('Refill error:', error);
    res.status(500).json({ error: 'Refill failed', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Refill API running on port ${PORT}`);
});

