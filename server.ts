import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import Razorpay from 'razorpay';
import crypto from 'crypto';

const app = express();
const PORT = 8980;

app.use(express.json());

import fs from 'fs-extra';
import jwt from 'jsonwebtoken';

const DB_PATH = path.join(process.cwd(), 'cms-db.json');
const JWT_SECRET = 'vyomatrix-super-secret-key-2024';

const readDB = async () => {
  try {
    const data = await fs.readFile(DB_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return { courses: [], media: [], enquiries: [], settings: {} };
  }
};

const writeDB = async (data: any) => {
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
};

// Middleware to protect CMS routes
const authenticate = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Middleware to protect user routes
const authenticateUser = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    req.user = payload;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// CMS Authentication
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// User Authentication
app.post('/api/user/auth', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const db = await readDB();
  db.users = db.users || [];

  const existingUser = db.users.find((u: any) => u.email === email);
  if (existingUser) {
    // Login
    if (existingUser.password !== password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
  } else {
    // Register
    db.users.push({ email, password, registeredAt: new Date().toISOString() });
    await writeDB(db);
  }

  const token = jwt.sign({ role: 'user', email }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, user: { email } });
});

// User Dashboard Data
app.get('/api/user/me', authenticateUser, async (req: any, res) => {
  const db = await readDB();
  const userEmail = req.user.email;
  
  // Find all orders associated with this email
  const userOrders = (db.enquiries || [])
    .filter((e: any) => e.type === 'Academy Enrolment' && e.details?.email?.toLowerCase() === userEmail?.toLowerCase())
    .reverse();

  res.json({
    email: userEmail,
    orders: userOrders
  });
});

// CMS Endpoints
app.get('/api/cms/data', async (req, res) => {
  const db = await readDB();
  res.json(db);
});

app.post('/api/cms/data', authenticate, async (req, res) => {
  try {
    await writeDB(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save DB' });
  }
});

// Contact endpoint
app.post('/api/contact', async (req, res) => {
  console.log('New inquiry received:', req.body);
  const db = await readDB();
  db.enquiries = db.enquiries || [];
  db.enquiries.push({
    ...req.body,
    id: 'ENQ-' + Date.now(),
    date: new Date().toISOString()
  });
  await writeDB(db);
  res.json({ success: true, message: 'Inquiry saved and notification email sent.' });
});

// Chatbot endpoint (24/7 AI Bot Support)
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;

    const getFallbackResponse = (userMsg: string) => {
      const lower = (userMsg || '').toLowerCase();
      
      if (lower.includes('hi') || lower.includes('hello') || lower.includes('hey') || lower.includes('start') || lower.includes('welcome')) {
        return 'Welcome to Vyomatrix.ai! How can I help you with our AI Quality, Managed Services, Platform, or Academy offerings today?';
      }
      if (lower.includes('quality') || lower.includes('audit') || lower.includes('assurance') || lower.includes('hallucination') || lower.includes('bias')) {
        return 'Our AI Quality & Assurance offering provides independent auditing, accuracy & hallucination scoring, safety/bias reviews, and ongoing monitoring retainers for regulated industries.';
      }
      if (lower.includes('managed') || lower.includes('service') || lower.includes('build') || lower.includes('deploy') || lower.includes('annotation') || lower.includes('moderation')) {
        return 'Vyomatrix Managed AI Services helps build, deploy, and run custom AI bots, modernize legacy systems, and provide human data annotation, content moderation, and AI QA.';
      }
      if (lower.includes('platform') || lower.includes('governance') || lower.includes('accountability') || lower.includes('trail')) {
        return 'The Vyomatrix Platform is a unified suite for AI quality, governance, and accountability with configurable risk evaluation modules and immutable audit trails.';
      }
      if (lower.includes('academy') || lower.includes('course') || lower.includes('bootcamp') || lower.includes('train') || lower.includes('learn') || lower.includes('workshop')) {
        return 'Vyomatrix Academy offers practical training in AI evaluation & safety. The One-day Executive Workshop is currently available at INR 2,499 as an introductory 50% off offer (regularly INR 4,999).';
      }
      if (lower.includes('price') || lower.includes('cost') || lower.includes('fee') || lower.includes('pay') || lower.includes('enrol')) {
        return 'The One-day Executive Workshop is available at INR 2,499 as an introductory 50% off offer, reduced from INR 4,999. Check the Academy and Checkout pages for details.';
      }
      if (lower.includes('contact') || lower.includes('email') || lower.includes('phone') || lower.includes('reach') || lower.includes('location') || lower.includes('headquarter')) {
        return 'Vyomatrix.ai is headquartered in Malaysia, serving Southeast Asia. You can reach our team via the Contact page or email us at support@vyomatrix.ai.';
      }
      
      return 'Vyomatrix.ai empowers organizations with AI Quality Assurance, Managed AI Services, Enterprise Governance Platform, and Academy training. How can I assist you further with these solutions?';
    };

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.includes('MY_GEMINI')) {
      return res.json({ reply: getFallbackResponse(message) });
    }
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `You are a professional customer support AI for Vyomatrix.ai. 
    Vyomatrix is an early-stage company working in AI quality, governance and accountability, headquartered in Malaysia and serving regulated industries across Southeast Asia (Banking, Healthcare, Government, Telco).
    
    If the user says "hi", "hello", or any other greeting, respond warmly with: "Welcome to Vyomatrix.ai! How can I help you with our AI Quality, Managed Services, Platform, or Academy offerings today?"
    
    Offerings:
    1. AI Quality & Assurance: "Independent assurance for the AI you run." Includes AI system audits, accuracy and hallucination scoring, safety and bias review, and ongoing monitoring retainers.
    2. Managed AI Services: "We build, deploy and run your AI, at the right cost." Includes AI bot and assistant implementation, integration, legacy modernization, and AI-powered QA. We also provide human data annotation and content moderation.
    3. Platform: "One platform for AI quality, governance and accountability." Pre-launch configurable modules with immutable audit trails.
    4. Vyomatrix Academy: "Train for a career in AI quality and evaluation." Hands-on programs taught on real work. Offerings include a 1-day workshop, 4-5 week bootcamp, and advanced workshops.
    
    Keep responses very concise, professional, and helpful. Do not use Markdown formatting unless necessary.
    User says: ${message}`;
    
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
      });
      
      return res.json({ reply: response.text || getFallbackResponse(message) });
    } catch (apiErr) {
      console.error('Gemini API call error:', apiErr);
      return res.json({ reply: getFallbackResponse(message) });
    }
  } catch (err) {
    console.error('Chat error:', err);
    return res.json({ reply: 'Welcome to Vyomatrix.ai! How can I help you with our AI Quality, Managed Services, Platform, or Academy offerings today?' });
  }
});

// Initialize Razorpay instance if keys exist
const razorpay = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET 
  ? new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    }) 
  : null;

// Payment endpoints (Academy Enrolment)
app.post('/api/payment/create-order', async (req, res) => {
  const { amount, programId, studentDetails } = req.body;
  
  // Never create a fake order: a successful enrollment must come from Razorpay.
  if (!razorpay) {
    return res.status(503).json({ error: 'Razorpay is not configured on the server.' });
  }

  try {
    const options = {
      amount: amount * 100, // amount in the smallest currency unit (paise)
      currency: 'INR',
      receipt: `receipt_${programId}_${Date.now()}`
    };
    const order = await razorpay.orders.create(options);
    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error("Razorpay Error:", error);
    res.status(500).json({ error: 'Failed to create Razorpay order' });
  }
});

app.post('/api/payment/verify', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, details } = req.body;

  // Verification Logic
  let isVerified = false;

  if (process.env.RAZORPAY_KEY_SECRET && razorpay_order_id && razorpay_payment_id && razorpay_signature) {
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    isVerified = (expectedSignature === razorpay_signature);
  }

  if (isVerified) {
    console.log('Payment verified server-side:', details);
    const db = await readDB();
    db.enquiries = db.enquiries || [];
    db.enquiries.push({
      type: 'Academy Enrolment',
      details: details,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      adminStatus: 'Payment Verified',
      id: 'ENQ-' + Date.now(),
      date: new Date().toISOString()
    });
    await writeDB(db);
    res.json({ success: true, message: 'Payment verified by Razorpay.', paymentId: razorpay_payment_id, orderId: razorpay_order_id });
  } else {
    res.status(400).json({ success: false, message: 'Invalid payment signature' });
  }
});

// Update order status (admin)
app.patch('/api/orders/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { adminStatus } = req.body;
  const validStatuses = ['Payment Verified', 'Simulated / Test', 'Pending', 'Cancelled', 'Refunded', 'Reviewed'];
  if (!validStatuses.includes(adminStatus)) {
    return res.status(400).json({ error: 'Invalid status value' });
  }
  try {
    const db = await readDB();
    const idx = db.enquiries.findIndex((e: any) => e.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Order not found' });
    db.enquiries[idx].adminStatus = adminStatus;
    await writeDB(db);
    res.json({ success: true, adminStatus });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// Vite Middleware for Full-Stack App
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
