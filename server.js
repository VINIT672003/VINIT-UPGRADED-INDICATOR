require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');
const { authRequired, requireRole } = require('./middleware');

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.FRONTEND_PROD_URL,
  process.env.FRONTEND_VERCEL_URL,
].filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS blocked for origin: ' + origin));
  },
  credentials: true,
}));

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ success: true, message: 'Vinit Indicator backend is live' });
});

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ success: true, message: 'Server is running', database: 'connected' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server running but DB failed', error: error.message });
  }
});

app.get('/api/plans', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM plans WHERE is_active = true ORDER BY price ASC');
    res.json({ success: true, plans: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email and password are required' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
    if (existing.rows.length) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, email, phone, password, role, is_verified)
       VALUES ($1, $2, $3, $4, 'user', true)
       RETURNING id, name, email, phone, role`,
      [name, email, phone || null, hashed]
    );

    res.status(201).json({ success: true, user: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const result = await pool.query(
      'SELECT id, name, email, phone, password, role, is_active FROM users WHERE email = $1 LIMIT 1',
      [email]
    );

    if (!result.rows.length) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const user = result.rows[0];
    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'Account disabled' });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/dashboard', authRequired, async (req, res) => {
  try {
    const userResult = await pool.query(
      'SELECT id, name, email, phone, role, wallet_balance, total_referral_earnings, created_at FROM users WHERE id = $1 LIMIT 1',
      [req.user.id]
    );
    const paymentsResult = await pool.query(
      'SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10',
      [req.user.id]
    );
    res.json({ success: true, user: userResult.rows[0], recentPayments: paymentsResult.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/payments/create', authRequired, async (req, res) => {
  try {
    const { plan_id, amount, payment_method, transaction_id, payment_proof_url } = req.body;
    if (!amount) {
      return res.status(400).json({ success: false, message: 'Amount is required' });
    }
    const result = await pool.query(
      `INSERT INTO payments (user_id, plan_id, amount, payment_method, transaction_id, payment_proof_url, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING *`,
      [req.user.id, plan_id || null, amount, payment_method || 'upi', transaction_id || null, payment_proof_url || null]
    );
    res.status(201).json({ success: true, payment: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/admin/payments', authRequired, requireRole('admin', 'owner'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, u.name AS user_name, u.email AS user_email, pl.name AS plan_name
       FROM payments p
       LEFT JOIN users u ON p.user_id = u.id
       LEFT JOIN plans pl ON p.plan_id = pl.id
       ORDER BY p.created_at DESC`
    );
    res.json({ success: true, payments: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.use((error, req, res, next) => {
  if (error.message && error.message.startsWith('CORS blocked')) {
    return res.status(403).json({ success: false, message: error.message });
  }
  return res.status(500).json({ success: false, message: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
