// ================================================
//  METE INDUSTRY - Complete Server v2.0
//  Run: node server.js
//  Open: http://localhost:3000
//  Login: admin / admin
// ================================================

const express = require('express');
const mysql   = require('mysql2');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = 3000;
const JWT_SECRET = 'mete_industry_2024_secret';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = mysql.createPool({
  host            : 'localhost',
  user            : 'root',
  password        : 'root',          // ← तुमचा MySQL password इथे टाका
  database        : 'mete_industry',
  waitForConnections: true,
  connectionLimit : 10
}).promise();

db.query('SELECT 1')
  .then(() => console.log('✅ MySQL Connected!'))
  .catch(e => console.error('❌ MySQL Error:', e.message));

function auth(req, res, next) {
  const token = (req.headers['authorization'] || '').split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'No token' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ success: false, message: 'Invalid token' }); }
}

// ════════════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════════════
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const [[user]] = await db.query('SELECT * FROM users WHERE username=?', [username]);
    if (!user) return res.status(401).json({ success: false, message: 'Invalid username or password' });
    let ok = false;
    if (user.password.startsWith('$2')) {
      ok = await bcrypt.compare(password, user.password);
    } else {
      ok = (password === user.password);
    }
    if (!ok) return res.status(401).json({ success: false, message: 'Invalid username or password' });
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ success: true, token, username: user.username });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ════════════════════════════════════════════════
//  DASHBOARD
// ════════════════════════════════════════════════
app.get('/api/dashboard', auth, async (req, res) => {
  try {
    const [[{ total_products }]]  = await db.query('SELECT COUNT(*) as total_products FROM products');
    const [[{ stock_value }]]     = await db.query('SELECT COALESCE(SUM(s.quantity * p.rate),0) as stock_value FROM stock s JOIN products p ON p.id=s.product_id WHERE p.is_actual_bill=0');
    const [[{ low_stock }]]       = await db.query('SELECT COUNT(*) as low_stock FROM stock s JOIN products p ON p.id=s.product_id WHERE s.quantity<10 AND p.is_actual_bill=0');
    const [[{ total_customers }]] = await db.query('SELECT COUNT(*) as total_customers FROM customers');
    const [[{ today_sales }]]     = await db.query('SELECT COALESCE(SUM(total_amount),0) as today_sales FROM bills WHERE DATE(bill_date)=CURDATE()');
    const [[{ month_sales }]]     = await db.query('SELECT COALESCE(SUM(total_amount),0) as month_sales FROM bills WHERE MONTH(bill_date)=MONTH(CURDATE()) AND YEAR(bill_date)=YEAR(CURDATE())');
    const [[{ today_purchase }]]  = await db.query('SELECT COALESCE(SUM(total),0) as today_purchase FROM purchases WHERE DATE(purchase_date)=CURDATE()');
    const [[{ month_purchase }]]  = await db.query('SELECT COALESCE(SUM(total),0) as month_purchase FROM purchases WHERE MONTH(purchase_date)=MONTH(CURDATE()) AND YEAR(purchase_date)=YEAR(CURDATE())');
    const [recent_purchases]      = await db.query('SELECT pu.*,p.name as product_name,p.unit FROM purchases pu JOIN products p ON p.id=pu.product_id ORDER BY pu.created_at DESC LIMIT 5');
    const [recent_bills]          = await db.query('SELECT * FROM bills ORDER BY created_at DESC LIMIT 5');
    const month_profit = month_sales - month_purchase;
    res.json({ success: true, data: { total_products, stock_value, low_stock, total_customers, today_sales, month_sales, today_purchase, month_purchase, month_profit, recent_purchases, recent_bills } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ════════════════════════════════════════════════
//  PRODUCTS
// ════════════════════════════════════════════════
app.get('/api/products', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT p.*,COALESCE(s.quantity,0) as stock_qty FROM products p LEFT JOIN stock s ON s.product_id=p.id ORDER BY p.id');
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.post('/api/products', auth, async (req, res) => {
  try {
    const { name, unit, rate, is_actual_bill, category } = req.body;
    const [r] = await db.query('INSERT INTO products (name,unit,rate,is_actual_bill,category) VALUES (?,?,?,?,?)', [name, unit, rate||0, is_actual_bill||0, category||'']);
    await db.query('INSERT INTO stock (product_id,quantity) VALUES (?,0)', [r.insertId]);
    res.json({ success: true, message: 'Product added!' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.put('/api/products/:id', auth, async (req, res) => {
  try {
    const { name, unit, rate, is_actual_bill, category } = req.body;
    await db.query('UPDATE products SET name=?,unit=?,rate=?,is_actual_bill=?,category=? WHERE id=?', [name, unit, rate||0, is_actual_bill||0, category||'', req.params.id]);
    res.json({ success: true, message: 'Product updated!' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.delete('/api/products/:id', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM products WHERE id=?', [req.params.id]);
    res.json({ success: true, message: 'Product deleted!' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ════════════════════════════════════════════════
//  STOCK
// ════════════════════════════════════════════════
app.get('/api/stock', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT p.id,p.name,p.unit,p.rate,p.category,p.is_actual_bill,COALESCE(s.quantity,0) as quantity,COALESCE(s.quantity,0)*p.rate as stock_value FROM products p LEFT JOIN stock s ON s.product_id=p.id ORDER BY p.category,p.name');
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.put('/api/stock/:id', auth, async (req, res) => {
  try {
    const { quantity } = req.body;
    await db.query('INSERT INTO stock (product_id,quantity) VALUES (?,?) ON DUPLICATE KEY UPDATE quantity=?', [req.params.id, quantity, quantity]);
    res.json({ success: true, message: 'Stock updated!' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ════════════════════════════════════════════════
//  PURCHASES
// ════════════════════════════════════════════════
app.get('/api/purchases', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT pu.*,p.name as product_name,p.unit FROM purchases pu JOIN products p ON p.id=pu.product_id ORDER BY pu.purchase_date DESC,pu.created_at DESC LIMIT 300');
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.post('/api/purchases', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { product_id, quantity, rate, supplier_name, purchase_date, notes } = req.body;
    await conn.query('INSERT INTO purchases (product_id,quantity,rate,total,supplier_name,purchase_date,notes) VALUES (?,?,?,?,?,?,?)',
      [product_id, quantity, rate, quantity*rate, supplier_name||'', purchase_date, notes||'']);
    await conn.query('UPDATE stock SET quantity=quantity+? WHERE product_id=?', [quantity, product_id]);
    await conn.commit();
    res.json({ success: true, message: 'Purchase added! Stock updated.' });
  } catch (e) { await conn.rollback(); res.status(500).json({ success: false, message: e.message }); }
  finally { conn.release(); }
});

app.delete('/api/purchases/:id', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[p]] = await conn.query('SELECT * FROM purchases WHERE id=?', [req.params.id]);
    if (!p) return res.status(404).json({ success: false, message: 'Not found' });
    await conn.query('DELETE FROM purchases WHERE id=?', [req.params.id]);
    await conn.query('UPDATE stock SET quantity=GREATEST(0,quantity-?) WHERE product_id=?', [p.quantity, p.product_id]);
    await conn.commit();
    res.json({ success: true, message: 'Purchase deleted.' });
  } catch (e) { await conn.rollback(); res.status(500).json({ success: false, message: e.message }); }
  finally { conn.release(); }
});

// ════════════════════════════════════════════════
//  BILLS
// ════════════════════════════════════════════════
app.get('/api/bills', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT b.*,COUNT(bi.id) as item_count FROM bills b LEFT JOIN bill_items bi ON bi.bill_id=b.id GROUP BY b.id ORDER BY b.bill_date DESC,b.created_at DESC LIMIT 300');
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.get('/api/bills/:id', auth, async (req, res) => {
  try {
    const [[bill]] = await db.query('SELECT * FROM bills WHERE id=?', [req.params.id]);
    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' });
    const [items] = await db.query('SELECT * FROM bill_items WHERE bill_id=?', [req.params.id]);
    res.json({ success: true, data: { ...bill, items } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.post('/api/bills', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { customer_id, customer_name, customer_gst, bill_date, items, notes } = req.body;
    const [[last]] = await conn.query('SELECT bill_number FROM bills ORDER BY id DESC LIMIT 1');
    let num = 1;
    if (last) num = parseInt(last.bill_number.replace('MI-','')) + 1;
    const bill_number = 'MI-' + String(num).padStart(4,'0');
    const total = items.reduce((s,i) => s + parseFloat(i.total||0), 0);
    const [r] = await conn.query('INSERT INTO bills (bill_number,customer_id,customer_name,customer_gst,bill_date,total_amount,notes) VALUES (?,?,?,?,?,?,?)',
      [bill_number, customer_id||null, customer_name, customer_gst||'', bill_date, total, notes||'']);
    for (const item of items) {
      await conn.query('INSERT INTO bill_items (bill_id,product_id,product_name,unit,item_w,item_h,nos,quantity,rate,total) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [r.insertId, item.product_id||null, item.product_name, item.unit, item.item_w||0, item.item_h||0, item.nos||1, item.quantity, item.rate, item.total]);
      if (item.product_id)
        await conn.query('UPDATE stock SET quantity=GREATEST(0,quantity-?) WHERE product_id=?', [item.quantity, item.product_id]);
    }
    await conn.commit();
    res.json({ success: true, bill_number, bill_id: r.insertId, message: 'Bill created!' });
  } catch (e) { await conn.rollback(); res.status(500).json({ success: false, message: e.message }); }
  finally { conn.release(); }
});

app.delete('/api/bills/:id', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [items] = await conn.query('SELECT * FROM bill_items WHERE bill_id=?', [req.params.id]);
    for (const item of items)
      if (item.product_id)
        await conn.query('UPDATE stock SET quantity=quantity+? WHERE product_id=?', [item.quantity, item.product_id]);
    await conn.query('DELETE FROM bills WHERE id=?', [req.params.id]);
    await conn.commit();
    res.json({ success: true, message: 'Bill deleted. Stock restored.' });
  } catch (e) { await conn.rollback(); res.status(500).json({ success: false, message: e.message }); }
  finally { conn.release(); }
});

// ════════════════════════════════════════════════
//  CUSTOMERS
// ════════════════════════════════════════════════
app.get('/api/customers', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT c.*,COUNT(b.id) as total_bills,COALESCE(SUM(b.total_amount),0) as total_purchase FROM customers c LEFT JOIN bills b ON b.customer_id=c.id GROUP BY c.id ORDER BY c.name');
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.get('/api/customers/:id/bills', auth, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT b.*,GROUP_CONCAT(bi.product_name SEPARATOR ', ') as products FROM bills b LEFT JOIN bill_items bi ON bi.bill_id=b.id WHERE b.customer_id=? GROUP BY b.id ORDER BY b.bill_date DESC", [req.params.id]);
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.post('/api/customers', auth, async (req, res) => {
  try {
    const { name, phone, address, gst_number } = req.body;
    const [r] = await db.query('INSERT INTO customers (name,phone,address,gst_number) VALUES (?,?,?,?)', [name, phone||'', address||'', gst_number||'']);
    res.json({ success: true, id: r.insertId, message: 'Customer added!' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.put('/api/customers/:id', auth, async (req, res) => {
  try {
    const { name, phone, address, gst_number } = req.body;
    await db.query('UPDATE customers SET name=?,phone=?,address=?,gst_number=? WHERE id=?', [name, phone||'', address||'', gst_number||'', req.params.id]);
    res.json({ success: true, message: 'Customer updated!' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.delete('/api/customers/:id', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM customers WHERE id=?', [req.params.id]);
    res.json({ success: true, message: 'Customer deleted!' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ════════════════════════════════════════════════
//  REPORTS — Day/Month/Year P&L
// ════════════════════════════════════════════════
app.get('/api/reports', auth, async (req, res) => {
  try {
    const { type, from, to } = req.query;
    let groupBy, dateFormat;
    if (type === 'daily')        { groupBy = 'DATE(bill_date)';                       dateFormat = 'DATE(bill_date)'; }
    else if (type === 'monthly') { groupBy = 'YEAR(bill_date),MONTH(bill_date)';      dateFormat = 'DATE_FORMAT(bill_date,"%b %Y")'; }
    else                         { groupBy = 'YEAR(bill_date)';                        dateFormat = 'YEAR(bill_date)'; }

    let whereClause = '';
    const params = [];
    if (from && to) { whereClause = 'WHERE bill_date BETWEEN ? AND ?'; params.push(from, to); }

    const [sales] = await db.query(
      `SELECT ${dateFormat} as period, COUNT(*) as bill_count, SUM(total_amount) as total_sale
       FROM bills ${whereClause} GROUP BY ${groupBy} ORDER BY MIN(bill_date) DESC LIMIT 100`, params);

    let pWhere = whereClause.replace(/bill_date/g, 'purchase_date');
    const [purchases] = await db.query(
      `SELECT ${dateFormat.replace(/bill_date/g,'purchase_date')} as period, COUNT(*) as purchase_count, SUM(total) as total_purchase
       FROM purchases ${pWhere} GROUP BY ${groupBy.replace(/bill_date/g,'purchase_date')} ORDER BY MIN(purchase_date) DESC LIMIT 100`, params);

    // Merge by period
    const map = {};
    sales.forEach(s => { map[s.period] = { period: s.period, total_sale: parseFloat(s.total_sale||0), bill_count: s.bill_count, total_purchase: 0, purchase_count: 0 }; });
    purchases.forEach(p => {
      if (!map[p.period]) map[p.period] = { period: p.period, total_sale: 0, bill_count: 0 };
      map[p.period].total_purchase = parseFloat(p.total_purchase||0);
      map[p.period].purchase_count = p.purchase_count;
    });
    const result = Object.values(map).map(r => ({ ...r, profit: r.total_sale - r.total_purchase }));
    result.sort((a,b) => b.period > a.period ? 1 : -1);

    res.json({ success: true, data: result });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ════════════════════════════════════════════════
//  SALES TABLE (from bills)
// ════════════════════════════════════════════════
app.get('/api/sales', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT bi.*,b.bill_number,b.bill_date,b.customer_name,b.customer_gst
      FROM bill_items bi
      JOIN bills b ON b.id=bi.bill_id
      ORDER BY b.bill_date DESC,b.id DESC LIMIT 500`);
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════╗');
  console.log('║   METE INDUSTRY SERVER v2.0      ║');
  console.log('╠══════════════════════════════════╣');
  console.log('║  URL  : http://localhost:3000    ║');
  console.log('║  User : admin  Pass : admin      ║');
  console.log('╚══════════════════════════════════╝\n');
});
