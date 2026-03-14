const express  = require('express');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const bcrypt   = require('bcrypt');
const path     = require('path');

const app  = express();
const PORT = 3000;

// ── Database ───────────────────────────────────────────────────────────────
const db = new Database('/data/market.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id    TEXT PRIMARY KEY,
    name  TEXT UNIQUE NOT NULL,
    icon  TEXT,
    slug  TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS vendors (
    id          TEXT PRIMARY KEY,
    handle      TEXT UNIQUE NOT NULL,
    joined      DATETIME DEFAULT CURRENT_TIMESTAMP,
    rating      REAL DEFAULT 4.5,
    sales       INTEGER DEFAULT 0,
    pgp_key     TEXT,
    description TEXT,
    verified    INTEGER DEFAULT 0,
    level       TEXT DEFAULT 'trusted'
  );

  CREATE TABLE IF NOT EXISTS listings (
    id           TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    description  TEXT,
    price_btc    REAL NOT NULL,
    price_xmr    REAL NOT NULL,
    category_id  TEXT,
    vendor_id    TEXT,
    stock        INTEGER DEFAULT 99,
    views        INTEGER DEFAULT 0,
    orders       INTEGER DEFAULT 0,
    rating       REAL DEFAULT 4.7,
    review_count INTEGER DEFAULT 0,
    featured     INTEGER DEFAULT 0,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    ships_from   TEXT DEFAULT 'Worldwide',
    ships_to     TEXT DEFAULT 'Worldwide',
    escrow       INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id         TEXT PRIMARY KEY,
    listing_id TEXT NOT NULL,
    vendor_id  TEXT NOT NULL,
    handle     TEXT NOT NULL,
    rating     INTEGER NOT NULL,
    body       TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id         TEXT PRIMARY KEY,
    listing_id TEXT NOT NULL,
    quantity   INTEGER DEFAULT 1,
    total_btc  REAL NOT NULL,
    status     TEXT DEFAULT 'pending',
    address    TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS admin_sessions (
    token      TEXT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── Seed data ──────────────────────────────────────────────────────────────
const seeded = db.prepare('SELECT COUNT(*) as n FROM categories').get().n;

if (seeded === 0) {
  // Categories
  const cats = [
    { id: uuidv4(), name: 'Digital Goods',    icon: '💾', slug: 'digital'    },
    { id: uuidv4(), name: 'Security Tools',   icon: '🔐', slug: 'security'   },
    { id: uuidv4(), name: 'Privacy Services', icon: '🕵️', slug: 'privacy'    },
    { id: uuidv4(), name: 'Documents',        icon: '📄', slug: 'documents'  },
    { id: uuidv4(), name: 'Tutorials',        icon: '📚', slug: 'tutorials'  },
    { id: uuidv4(), name: 'Software',         icon: '⚙️', slug: 'software'   },
  ];
  const insertCat = db.prepare('INSERT INTO categories (id,name,icon,slug) VALUES (?,?,?,?)');
  cats.forEach(c => insertCat.run(c.id, c.name, c.icon, c.slug));

  // Vendors
  const vendors = [
    { id: uuidv4(), handle: 'GhostVendor',   rating: 4.9, sales: 1243, verified: 1, level: 'elite',   description: 'Top-rated vendor since 2021. FE only for trusted buyers. PGP required.' },
    { id: uuidv4(), handle: 'CipherMerchant', rating: 4.7, sales: 876,  verified: 1, level: 'trusted', description: 'Specializing in digital goods and privacy tools. Fast delivery.' },
    { id: uuidv4(), handle: 'NullPointer',   rating: 4.5, sales: 412,  verified: 0, level: 'trusted', description: 'Security researcher. Educational materials only.' },
    { id: uuidv4(), handle: 'ShadowDealer',  rating: 4.8, sales: 2109, verified: 1, level: 'elite',   description: 'Established vendor. Escrow preferred. Bulk discounts available.' },
  ];
  const insertVendor = db.prepare('INSERT INTO vendors (id,handle,rating,sales,verified,level,description) VALUES (?,?,?,?,?,?,?)');
  vendors.forEach(v => insertVendor.run(v.id, v.handle, v.rating, v.sales, v.verified, v.level, v.description));

  const catMap  = {};
  db.prepare('SELECT * FROM categories').all().forEach(c => catMap[c.slug] = c.id);
  const vendorList = db.prepare('SELECT * FROM vendors').all();
  const V = (i) => vendorList[i % vendorList.length].id;

  // Listings — all clearly educational/fictional
  const listings = [
    // Digital Goods
    { title: 'Anonymous Email Account Bundle x10',          desc: 'Ten pre-warmed anonymous email accounts on privacy-focused providers. Includes setup guide and OpSec checklist. All created via Tor, no phone verification.',                                      btc: 0.00089, xmr: 0.14, cat: 'digital',   vendor: 0, orders: 234, rating: 4.8, reviews: 89,  featured: 1, ships: 'Digital' },
    { title: 'Verified VPN Account — 2 Year Premium',       desc: 'Two-year premium VPN subscription on no-log provider. Paid anonymously with Monero. Includes 10 simultaneous connections and all servers.',                                                          btc: 0.00234, xmr: 0.37, cat: 'digital',   vendor: 1, orders: 156, rating: 4.6, reviews: 61,  featured: 0, ships: 'Digital' },
    { title: 'Crypto Wallet Seed Phrase Recovery Guide',    desc: 'Comprehensive 47-page guide on recovering lost seed phrases, hardware wallet attacks, and cold storage best practices. Educational purposes only.',                                                   btc: 0.00045, xmr: 0.07, cat: 'digital',   vendor: 2, orders: 98,  rating: 4.5, reviews: 34,  featured: 0, ships: 'Digital' },
    // Security Tools
    { title: 'Custom Compiled Tor Browser Bundle',          desc: 'Hardened Tor Browser compiled from source with additional privacy patches. Verified build with reproducible checksums. Includes Tails OS integration guide.',                                         btc: 0.00123, xmr: 0.19, cat: 'security',  vendor: 0, orders: 445, rating: 4.9, reviews: 178, featured: 1, ships: 'Digital' },
    { title: 'OpSec Masterclass — Complete Video Series',   desc: '14-hour video course covering threat modeling, OPSEC fundamentals, device hardening, network anonymity, and counter-surveillance. Trusted by 2000+ buyers.',                                          btc: 0.00312, xmr: 0.49, cat: 'security',  vendor: 3, orders: 389, rating: 4.9, reviews: 201, featured: 1, ships: 'Digital' },
    { title: 'Network Pentesting Toolkit — 2024 Edition',  desc: 'Curated toolkit of open-source penetration testing tools, pre-configured Kali VM, and 200-page methodology guide. For authorized testing only.',                                                     btc: 0.00456, xmr: 0.72, cat: 'security',  vendor: 1, orders: 167, rating: 4.7, reviews: 73,  featured: 0, ships: 'Digital' },
    { title: 'Password Audit Wordlist — 50GB Collection',  desc: 'Comprehensive wordlist collection for authorized password auditing. Includes rockyou2024, custom rule sets, and hashcat configuration files.',                                                        btc: 0.00178, xmr: 0.28, cat: 'security',  vendor: 2, orders: 212, rating: 4.6, reviews: 88,  featured: 0, ships: 'Digital' },
    // Privacy Services
    { title: 'BTC Mixing Service — 1 BTC Capacity',        desc: 'Tumbling service with 3-round mixing, time delays, and change address rotation. 0.5% fee. Minimum 0.01 BTC. No logs, no KYC. CoinJoin compatible.',                                                  btc: 0.00500, xmr: 0.79, cat: 'privacy',   vendor: 3, orders: 892, rating: 4.8, reviews: 334, featured: 1, ships: 'Digital' },
    { title: 'Private Hosting — .onion + Clearnet 1yr',    desc: 'Anonymous hosting with Tor hidden service setup. 100GB SSD, unlimited bandwidth, DDoS protection. Accepted: XMR only. No personal info required.',                                                   btc: 0.00890, xmr: 1.41, cat: 'privacy',   vendor: 0, orders: 123, rating: 4.7, reviews: 67,  featured: 0, ships: 'Digital' },
    { title: 'Monero Cold Storage Setup Guide',            desc: 'Step-by-step guide to setting up offline Monero cold storage using an air-gapped computer. Includes Feather Wallet configuration and seed phrase backup strategies.',                                  btc: 0.00067, xmr: 0.11, cat: 'privacy',   vendor: 2, orders: 78,  rating: 4.5, reviews: 29,  featured: 0, ships: 'Digital' },
    // Documents
    { title: 'Whistleblower Protection Legal Guide 2024',  desc: 'Comprehensive 89-page legal guide covering whistleblower protections across 40 countries. Includes SecureDrop setup, journalist contacts, and legal framework comparisons.',                          btc: 0.00089, xmr: 0.14, cat: 'documents', vendor: 1, orders: 56,  rating: 4.6, reviews: 22,  featured: 0, ships: 'Digital' },
    { title: 'Investigative Journalism OSINT Handbook',    desc: 'Used by 500+ journalists worldwide. Covers OSINT techniques, source protection, data analysis, and secure communication. Updated quarterly.',                                                         btc: 0.00134, xmr: 0.21, cat: 'documents', vendor: 2, orders: 189, rating: 4.8, reviews: 94,  featured: 1, ships: 'Digital' },
    // Tutorials
    { title: 'Dark Web Navigation — Beginner to Advanced', desc: 'Complete course covering Tor fundamentals, .onion services, safe browsing practices, and dark web OPSEC. 8 hours of content with practical exercises.',                                              btc: 0.00201, xmr: 0.32, cat: 'tutorials', vendor: 3, orders: 567, rating: 4.9, reviews: 289, featured: 1, ships: 'Digital' },
    { title: 'Cryptocurrency Privacy Techniques 2024',     desc: 'Master Monero, CoinJoin, Lightning Network privacy, and chain analysis evasion. Practical guide with real transaction examples.',                                                                     btc: 0.00156, xmr: 0.25, cat: 'tutorials', vendor: 0, orders: 234, rating: 4.7, reviews: 112, featured: 0, ships: 'Digital' },
    // Software
    { title: 'Encrypted Messaging App — Source Code',      desc: 'Signal-protocol implementation in Python. End-to-end encrypted, forward secrecy, deniability. Includes server and client code. MIT licensed.',                                                      btc: 0.00345, xmr: 0.55, cat: 'software',  vendor: 1, orders: 145, rating: 4.6, reviews: 58,  featured: 0, ships: 'Digital' },
    { title: 'Anonymous File Sharing Platform — v3.2',     desc: 'Self-hosted SecureDrop alternative. Tor hidden service compatible, zero-knowledge encryption, automatic key management. Docker deployment included.',                                                 btc: 0.00567, xmr: 0.90, cat: 'software',  vendor: 2, orders: 89,  rating: 4.8, reviews: 41,  featured: 1, ships: 'Digital' },
  ];

  const insertListing = db.prepare(`
    INSERT INTO listings (id,title,description,price_btc,price_xmr,category_id,vendor_id,orders,rating,review_count,featured,ships_from,ships_to)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  listings.forEach(l => {
    insertListing.run(
      uuidv4(), l.title, l.desc, l.btc, l.xmr,
      catMap[l.cat], V(l.vendor),
      l.orders, l.rating, l.reviews, l.featured,
      l.ships || 'Worldwide', 'Worldwide'
    );
  });

  // Reviews
  const reviewBodies = [
    'Exactly as described. Fast and professional.',
    'Vendor was responsive. Product quality is excellent.',
    'Best on the market. Will buy again.',
    'Legit. Verified everything. 5 stars.',
    'Good quality, slight delay but vendor communicated throughout.',
    'Top tier vendor. Highly recommended.',
    'Product worked perfectly. Clear instructions.',
    'Exceeded expectations. Worth every satoshi.',
  ];

  const insertReview = db.prepare('INSERT INTO reviews (id,listing_id,vendor_id,handle,rating,body) VALUES (?,?,?,?,?,?)');
  const reviewHandles = ['AnonBuyer4821','SilentNode3347','CryptoUser9921','PrivateEye4412','GhostClient7733'];
  const allListings = db.prepare('SELECT id, vendor_id FROM listings').all();

  allListings.forEach(l => {
    const count = Math.floor(Math.random() * 4) + 2;
    for (let i = 0; i < count; i++) {
      insertReview.run(
        uuidv4(), l.id, l.vendor_id,
        reviewHandles[Math.floor(Math.random() * reviewHandles.length)],
        Math.random() > 0.2 ? 5 : 4,
        reviewBodies[Math.floor(Math.random() * reviewBodies.length)]
      );
    }
  });

  console.log('Database seeded successfully');
}

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Admin auth ─────────────────────────────────────────────────────────────
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'nexus2024';
const ADMIN_HASH     = bcrypt.hashSync(ADMIN_PASSWORD, 10);

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  const s = db.prepare('SELECT * FROM admin_sessions WHERE token = ?').get(token);
  if (!s) return res.status(401).json({ error: 'invalid session' });
  next();
}

// ── API ────────────────────────────────────────────────────────────────────

// Stats
app.get('/api/stats', (req, res) => {
  const listings = db.prepare('SELECT COUNT(*) as n FROM listings').get().n;
  const vendors  = db.prepare('SELECT COUNT(*) as n FROM vendors').get().n;
  const orders   = db.prepare('SELECT SUM(orders) as n FROM listings').get().n || 0;
  const online   = Math.floor(Math.random() * 80) + 120;
  res.json({ listings, vendors, orders, online });
});

// Categories
app.get('/api/categories', (req, res) => {
  const cats = db.prepare(`
    SELECT c.*, COUNT(l.id) as count
    FROM categories c
    LEFT JOIN listings l ON l.category_id = c.id
    GROUP BY c.id ORDER BY c.name
  `).all();
  res.json(cats);
});

// Listings
app.get('/api/listings', (req, res) => {
  const { category, featured, search, sort = 'orders', page = 1, limit = 12 } = req.query;
  const offset = (page - 1) * limit;

  let where  = [];
  let params = [];

  if (category) { where.push('c.slug = ?'); params.push(category); }
  if (featured === 'true') { where.push('l.featured = 1'); }
  if (search)   { where.push('(l.title LIKE ? OR l.description LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const orderMap = {
    orders: 'l.orders DESC',
    rating: 'l.rating DESC',
    price_asc: 'l.price_btc ASC',
    price_desc: 'l.price_btc DESC',
    newest: 'l.created_at DESC',
  };
  const orderClause = orderMap[sort] || 'l.orders DESC';

  const rows = db.prepare(`
    SELECT l.*, c.name as category_name, c.slug as category_slug, c.icon as category_icon,
           v.handle as vendor_handle, v.rating as vendor_rating, v.verified as vendor_verified, v.level as vendor_level
    FROM listings l
    JOIN categories c ON c.id = l.category_id
    JOIN vendors v    ON v.id = l.vendor_id
    ${whereClause}
    ORDER BY ${orderClause}
    LIMIT ? OFFSET ?
  `).all([...params, parseInt(limit), parseInt(offset)]);

  const total = db.prepare(`
    SELECT COUNT(*) as n FROM listings l
    JOIN categories c ON c.id = l.category_id
    ${whereClause}
  `).get(params).n;

  // Bump views
  rows.forEach(r => db.prepare('UPDATE listings SET views = views + 1 WHERE id = ?').run(r.id));

  res.json({ rows, total, page: parseInt(page) });
});

// Single listing
app.get('/api/listings/:id', (req, res) => {
  const row = db.prepare(`
    SELECT l.*, c.name as category_name, c.slug as category_slug, c.icon as category_icon,
           v.handle as vendor_handle, v.rating as vendor_rating, v.sales as vendor_sales,
           v.verified as vendor_verified, v.level as vendor_level, v.description as vendor_description
    FROM listings l
    JOIN categories c ON c.id = l.category_id
    JOIN vendors v    ON v.id = l.vendor_id
    WHERE l.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });

  const reviews = db.prepare(`
    SELECT * FROM reviews WHERE listing_id = ? ORDER BY created_at DESC LIMIT 10
  `).all(req.params.id);

  res.json({ ...row, reviews });
});

// Vendors
app.get('/api/vendors', (req, res) => {
  const vendors = db.prepare('SELECT * FROM vendors ORDER BY sales DESC').all();
  res.json(vendors);
});

app.get('/api/vendors/:handle', (req, res) => {
  const vendor = db.prepare('SELECT * FROM vendors WHERE handle = ?').get(req.params.handle);
  if (!vendor) return res.status(404).json({ error: 'not found' });
  const listings = db.prepare(`
    SELECT l.*, c.name as category_name, c.icon as category_icon
    FROM listings l JOIN categories c ON c.id = l.category_id
    WHERE l.vendor_id = ? ORDER BY l.orders DESC
  `).all(vendor.id);
  res.json({ ...vendor, listings });
});

// Place order (fake — no real transaction)
app.post('/api/orders', (req, res) => {
  const { listing_id, quantity = 1 } = req.body;
  if (!listing_id) return res.status(400).json({ error: 'listing_id required' });

  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(listing_id);
  if (!listing) return res.status(404).json({ error: 'listing not found' });

  const total_btc = listing.price_btc * quantity;
  const id        = uuidv4();

  // Generate fake BTC address
  const fakeAddress = '1' + [...Array(33)].map(() => '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[Math.floor(Math.random()*58)]).join('');

  db.prepare('INSERT INTO orders (id,listing_id,quantity,total_btc,address) VALUES (?,?,?,?,?)')
    .run(id, listing_id, quantity, total_btc, fakeAddress);

  res.json({
    order_id: id,
    address: fakeAddress,
    total_btc: total_btc.toFixed(8),
    total_xmr: (listing.price_xmr * quantity).toFixed(4),
    status: 'awaiting_payment',
    expires_in: 3600,
  });
});

// Admin
app.post('/api/admin/login', (req, res) => {
  if (!bcrypt.compareSync(req.body.password, ADMIN_HASH))
    return res.status(401).json({ error: 'invalid password' });
  const token = uuidv4();
  db.prepare('INSERT INTO admin_sessions (token) VALUES (?)').run(token);
  res.json({ token });
});

app.get('/api/admin/overview', requireAdmin, (req, res) => {
  const listings = db.prepare('SELECT COUNT(*) as n FROM listings').get().n;
  const vendors  = db.prepare('SELECT COUNT(*) as n FROM vendors').get().n;
  const orders   = db.prepare('SELECT COUNT(*) as n FROM orders').get().n;
  const revenue  = db.prepare('SELECT SUM(total_btc) as n FROM orders').get().n || 0;
  const topListings = db.prepare('SELECT l.title, l.orders, l.rating, v.handle FROM listings l JOIN vendors v ON v.id = l.vendor_id ORDER BY l.orders DESC LIMIT 5').all();
  res.json({ listings, vendors, orders, revenue, topListings });
});

app.get('/api/admin/listings', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT l.*, v.handle as vendor_handle, c.name as category_name
    FROM listings l JOIN vendors v ON v.id = l.vendor_id JOIN categories c ON c.id = l.category_id
    ORDER BY l.created_at DESC
  `).all();
  res.json(rows);
});

app.delete('/api/admin/listings/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM listings WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT o.*, l.title as listing_title FROM orders o
    JOIN listings l ON l.id = o.listing_id
    ORDER BY o.created_at DESC LIMIT 50
  `).all();
  res.json(rows);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`╔════════════════════════════════════╗`);
  console.log(`║  NexusMarket running on :${PORT}       ║`);
  console.log(`║  Admin password: ${ADMIN_PASSWORD.padEnd(16)}  ║`);
  console.log(`╚════════════════════════════════════╝`);
});
