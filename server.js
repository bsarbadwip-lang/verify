require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { ethers } = require('ethers');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;
const RPC_URL = process.env.RPC_URL || 'https://bsc-dataseed.binance.org/';
const REFILL_PRIVATE_KEY = process.env.REFILL_PRIVATE_KEY;
const USDT_CONTRACT = process.env.USDT_CONTRACT || '0x55d398326f99059fF775485246999027B3197955';
const MAX_REFILL_BNB = process.env.MAX_REFILL_BNB || '0.0005';

if (!API_KEY || !REFILL_PRIVATE_KEY) {
  console.error('ERROR: Please set API_KEY and REFILL_PRIVATE_KEY in .env');
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL); // ethers v6
const refillWallet = new ethers.Wallet(REFILL_PRIVATE_KEY, provider);

// Middleware to validate API key
function requireApiKey(req, res, next) {
  const key = req.header('x-api-key');
  if (key !== API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
}

function isAddress(a) {
  try {
    return ethers.isAddress(a); // v6 syntax
  } catch {
    return false;
  }
}

app.post('/api/get-balance', requireApiKey, async (req, res) => {
  try {
    const { address, token } = req.body;
    if (!address || !isAddress(address)) return res.status(400).json({ error: 'invalid address' });

    if (!token || token.toUpperCase() === 'BNB') {
      const raw = await provider.getBalance(address);
      return res.json({ success: true, balance: ethers.formatEther(raw), token: 'BNB' });
    }

    if (token.toUpperCase() === 'USDT') {
      const abi = ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'];
      const contract = new ethers.Contract(USDT_CONTRACT, abi, provider);
      const raw = await contract.balanceOf(address);
      const decimals = await contract.decimals();
      return res.json({ success: true, balance: ethers.formatUnits(raw, decimals), token: 'USDT' });
    }

    return res.status(400).json({ error: 'unsupported token' });
  } catch (err) {
    return res.status(500).json({ error: 'internal error', details: err.message });
  }
});

app.post('/api/refill', requireApiKey, async (req, res) => {
  try {
    const { to, amount } = req.body;
    if (!to || !isAddress(to)) return res.status(400).json({ error: 'invalid recipient address' });
    if (!amount) return res.status(400).json({ error: 'amount required' });

    const amountBn = ethers.parseEther(String(amount));
    const maxBn = ethers.parseEther(String(MAX_REFILL_BNB));
    if (amountBn > maxBn) return res.status(400).json({ error: `amount exceeds max allowed (${MAX_REFILL_BNB} BNB)` });

    const serverBal = await refillWallet.getBalance();
    if (serverBal < amountBn) return res.status(400).json({ error: 'server wallet has insufficient BNB' });

    const tx = await refillWallet.sendTransaction({ to, value: amountBn });
    return res.json({ status: 'success', txHash: tx.hash });
  } catch (err) {
    return res.status(500).json({ error: 'internal error', details: err.message });
  }
});

app.listen(PORT, () => console.log(`Refill API running on port ${PORT}`));
