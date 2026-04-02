
const express = require('express');
const mysql   = require('mysql2');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const cors    = require('cors');
const path    = require('path');
 
const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'mete_industry_2024_secret';
 
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
 
const db = mysql.createPool({
  host     : process.env.MYSQLHOST     || 'localhost',
  user     : process.env.MYSQLUSER     || 'root',
  password : process.env.MYSQLPASSWORD || 'root',
  database : process.env.MYSQLDATABASE || 'mete_industry',
  port     : process.env.MYSQLPORT     || 3306,
  waitForConnections: true,
  connectionLimit: 10
}).promise();
 
// Auto-create tables if not exist
async function initDB() {
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) UNIQUE,
      password VARCHAR(255)
    )`);
 
    await db.query(`CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      unit VARCHAR(50),
      rate DECIMAL(10,2) DEFAULT 0,
      is_actual_bill TINYINT DEFAULT 0,
      category VARCHAR(100) DEFAULT '',
      mfg_date DATE NULL,
      exp_date DATE NULL,
      has_expiry TINYINT DEFAULT 0
    )`);
 
    // Add expiry columns if not exist (for existing DBs)
    try { await db.query(`ALTER TABLE products ADD COLUMN mfg_date DATE NULL`); } catch(e) {}
    try { await db.query(`ALTER TABLE products ADD COLUMN exp_date DATE NULL`); } catch(e) {}
    try { await db.query(`ALTER TABLE products ADD COLUMN has_expiry TINYINT DEFAULT 0`); } catch(e) {}
 
    await db.query(`CREATE TABLE IF NOT EXISTS stock (
      product_id INT PRIMARY KEY,
      quantity DECIMAL(10,3) DEFAULT 0
    )`);
 
    await db.query(`CREATE TABLE IF NOT EXISTS customers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(50) DEFAULT '',
      address TEXT,
      gst_number VARCHAR(100) DEFAULT ''
    )`);
 
    // Fix gst_number column if missing
    try { await db.query(`ALTER TABLE customers ADD COLUMN gst_number VARCHAR(100) DEFAULT ''`); } catch(e) {}
 
    await db.query(`CREATE TABLE IF NOT EXISTS purchases (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT,
      quantity DECIMAL(10,3),
      rate DECIMAL(10,2),
      total DECIMAL(10,2),
      supplier_name VARCHAR(255) DEFAULT '',
      purchase_date DATE,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
 
    await db.query(`CREATE TABLE IF NOT EXISTS bills (
      id INT AUTO_INCREMENT PRIMARY KEY,
      bill_number VARCHAR(50),
      customer_id INT NULL,
      customer_name VARCHAR(255),
      customer_gst VARCHAR(100) DEFAULT '',
      bill_date DATE,
      total_amount DECIMAL(10,2),
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
 
    // Fix customer_gst column if missing
    try { await db.query(`ALTER TABLE bills ADD COLUMN customer_gst VARCHAR(100) DEFAULT ''`); } catch(e) {}
 
    await db.query(`CREATE TABLE IF NOT EXISTS bill_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      bill_id INT,
      product_id INT NULL,
      product_name VARCHAR(255),
      unit VARCHAR(50),
      item_w DECIMAL(10,2) DEFAULT 0,
      item_h DECIMAL(10,2) DEFAULT 0,
      nos INT DEFAULT 1,
      quantity DECIMAL(10,6),
      rate DECIMAL(10,2),
      total DECIMAL(10,2)
    )`);
 
    // Fix bill_items columns if missing in old DB
    try { await db.query(`ALTER TABLE bill_items ADD COLUMN item_w DECIMAL(10,2) DEFAULT 0`); } catch(e) {}
    try { await db.query(`ALTER TABLE bill_items ADD COLUMN item_h DECIMAL(10,2) DEFAULT 0`); } catch(e) {}
    try { await db.query(`ALTER TABLE bill_items ADD COLUMN nos INT DEFAULT 1`); } catch(e) {}
 
    await db.query(`CREATE TABLE IF NOT EXISTS expenses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      category VARCHAR(100),
      description VARCHAR(255),
      amount DECIMAL(10,2),
      expense_date DATE,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
 
    // Insert default admin if not exists
    const [[u]] = await db.query('SELECT id FROM users WHERE username=?', ['admin']);
    if (!u) {
      await db.query('INSERT INTO users (username, password) VALUES (?,?)', ['admin','admin']);
    }
 
    console.log('✅ MySQL Connected & Tables Ready!');
  } catch(e) {
    console.error('❌ MySQL Error:', e.message);
  }
}
initDB();
 
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
    const [[{ month_expenses }]]  = await db.query('SELECT COALESCE(SUM(amount),0) as month_expenses FROM expenses WHERE MONTH(expense_date)=MONTH(CURDATE()) AND YEAR(expense_date)=YEAR(CURDATE())');
    const [recent_purchases]      = await db.query('SELECT pu.*,p.name as product_name,p.unit FROM purchases pu JOIN products p ON p.id=pu.product_id ORDER BY pu.created_at DESC LIMIT 5');
    const [recent_bills]          = await db.query('SELECT * FROM bills ORDER BY created_at DESC LIMIT 5');
 
    // Expiry alerts - products expiring within 30 days
    const [expiry_alerts]         = await db.query(`SELECT id,name,exp_date,DATEDIFF(exp_date,CURDATE()) as days_left FROM products WHERE has_expiry=1 AND exp_date IS NOT NULL AND exp_date >= CURDATE() AND DATEDIFF(exp_date,CURDATE()) <= 30 ORDER BY exp_date ASC`);
    const [expired_products]      = await db.query(`SELECT id,name,exp_date FROM products WHERE has_expiry=1 AND exp_date IS NOT NULL AND exp_date < CURDATE()`);
 
    const month_profit = month_sales - month_purchase - month_expenses;
    res.json({ success: true, data: { total_products, stock_value, low_stock, total_customers, today_sales, month_sales, today_purchase, month_purchase, month_expenses, month_profit, recent_purchases, recent_bills, expiry_alerts, expired_products } });
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
    const { name, unit, rate, is_actual_bill, category, mfg_date, exp_date, has_expiry } = req.body;
    const [r] = await db.query(
      'INSERT INTO products (name,unit,rate,is_actual_bill,category,mfg_date,exp_date,has_expiry) VALUES (?,?,?,?,?,?,?,?)',
      [name, unit, rate||0, is_actual_bill||0, category||'', mfg_date||null, exp_date||null, has_expiry||0]
    );
    // Only insert stock if not already exists
    await db.query('INSERT IGNORE INTO stock (product_id,quantity) VALUES (?,0)', [r.insertId]);
    res.json({ success: true, message: 'Product added!' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
 
app.put('/api/products/:id', auth, async (req, res) => {
  try {
    const { name, unit, rate, is_actual_bill, category, mfg_date, exp_date, has_expiry } = req.body;
    await db.query(
      'UPDATE products SET name=?,unit=?,rate=?,is_actual_bill=?,category=?,mfg_date=?,exp_date=?,has_expiry=? WHERE id=?',
      [name, unit, rate||0, is_actual_bill||0, category||'', mfg_date||null, exp_date||null, has_expiry||0, req.params.id]
    );
    res.json({ success: true, message: 'Product updated!' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
 
app.delete('/api/products/:id', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM stock WHERE product_id=?', [req.params.id]);
    await db.query('DELETE FROM products WHERE id=?', [req.params.id]);
    res.json({ success: true, message: 'Product deleted!' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
 
// ════════════════════════════════════════════════
//  STOCK
// ════════════════════════════════════════════════
app.get('/api/stock', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT p.id,p.name,p.unit,p.rate,p.category,p.is_actual_bill,p.exp_date,p.has_expiry,COALESCE(s.quantity,0) as quantity,COALESCE(s.quantity,0)*p.rate as stock_value FROM products p INNER JOIN stock s ON s.product_id=p.id WHERE s.quantity > 0 ORDER BY p.category,p.name');
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
    // Use INSERT ... ON DUPLICATE to avoid double entry
    await conn.query('INSERT INTO stock (product_id,quantity) VALUES (?,?) ON DUPLICATE KEY UPDATE quantity=quantity+?', [product_id, quantity, quantity]);
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
    const [r] = await conn.query(
      'INSERT INTO bills (bill_number,customer_id,customer_name,customer_gst,bill_date,total_amount,notes) VALUES (?,?,?,?,?,?,?)',
      [bill_number, customer_id||null, customer_name, customer_gst||'', bill_date, total, notes||'']
    );
    for (const item of items) {
      await conn.query('INSERT INTO bill_items (bill_id,product_id,product_name,unit,item_w,item_h,nos,quantity,rate,total) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [r.insertId, item.product_id||null, item.product_name, item.unit, item.item_w||0, item.item_h||0, item.nos||1, item.quantity, item.rate, item.total]);
      if (item.product_id)
        await conn.query('UPDATE stock SET quantity=GREATEST(0,quantity-?) WHERE product_id=?', [item.quantity, item.product_id]);
    }
    // Auto-add customer if new and name provided
    if (!customer_id && customer_name) {
      const [[existing]] = await conn.query('SELECT id FROM customers WHERE name=? LIMIT 1', [customer_name]);
      if (!existing) {
        const [nc] = await conn.query('INSERT INTO customers (name,phone,address,gst_number) VALUES (?,?,?,?)', [customer_name,'','',customer_gst||'']);
        await conn.query('UPDATE bills SET customer_id=? WHERE id=?', [nc.insertId, r.insertId]);
      } else {
        await conn.query('UPDATE bills SET customer_id=? WHERE id=?', [existing.id, r.insertId]);
      }
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
    await conn.query('DELETE FROM bill_items WHERE bill_id=?', [req.params.id]);
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
//  EXPENSES
// ════════════════════════════════════════════════
app.get('/api/expenses', auth, async (req, res) => {
  try {
    const { from, to } = req.query;
    let where = ''; const params = [];
    if (from && to) { where = 'WHERE expense_date BETWEEN ? AND ?'; params.push(from, to); }
    else if (from)  { where = 'WHERE expense_date >= ?'; params.push(from); }
    const [rows] = await db.query(`SELECT * FROM expenses ${where} ORDER BY expense_date DESC LIMIT 500`, params);
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
 
app.post('/api/expenses', auth, async (req, res) => {
  try {
    const { category, description, amount, expense_date, notes } = req.body;
    if (!category || !amount || !expense_date) return res.status(400).json({ success: false, message: 'Category, amount, date required' });
    await db.query('INSERT INTO expenses (category,description,amount,expense_date,notes) VALUES (?,?,?,?,?)',
      [category, description||'', amount, expense_date, notes||'']);
    res.json({ success: true, message: 'Expense added!' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
 
app.delete('/api/expenses/:id', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM expenses WHERE id=?', [req.params.id]);
    res.json({ success: true, message: 'Expense deleted.' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
 
// ════════════════════════════════════════════════
//  REPORTS — Day/Month/Year P&L with Expenses
// ════════════════════════════════════════════════
app.get('/api/reports', auth, async (req, res) => {
  try {
    const { type, from, to } = req.query;
    let groupBy, dateFormat;
    if (type === 'daily')        { groupBy = 'DATE(bill_date)';                  dateFormat = 'DATE(bill_date)'; }
    else if (type === 'monthly') { groupBy = 'YEAR(bill_date),MONTH(bill_date)'; dateFormat = 'DATE_FORMAT(bill_date,"%b %Y")'; }
    else                         { groupBy = 'YEAR(bill_date)';                  dateFormat = 'YEAR(bill_date)'; }
 
    let whereClause = ''; const params = [];
    if (from && to) { whereClause = 'WHERE bill_date BETWEEN ? AND ?'; params.push(from, to); }
 
    const [sales] = await db.query(
      `SELECT ${dateFormat} as period, COUNT(*) as bill_count, SUM(total_amount) as total_sale
       FROM bills ${whereClause} GROUP BY ${groupBy} ORDER BY MIN(bill_date) DESC LIMIT 100`, params);
 
    let pWhere = whereClause.replace(/bill_date/g, 'purchase_date');
    const pParams = [...params];
    const [purchases] = await db.query(
      `SELECT ${dateFormat.replace(/bill_date/g,'purchase_date')} as period, COUNT(*) as purchase_count, SUM(total) as total_purchase
       FROM purchases ${pWhere} GROUP BY ${groupBy.replace(/bill_date/g,'purchase_date')} ORDER BY MIN(purchase_date) DESC LIMIT 100`, pParams);
 
    let eWhere = whereClause.replace(/bill_date/g, 'expense_date');
    const eParams = [...params];
    const [expenses] = await db.query(
      `SELECT ${dateFormat.replace(/bill_date/g,'expense_date')} as period, SUM(amount) as total_expenses
       FROM expenses ${eWhere} GROUP BY ${groupBy.replace(/bill_date/g,'expense_date')} ORDER BY MIN(expense_date) DESC LIMIT 100`, eParams);
 
    const map = {};
    sales.forEach(s => { map[s.period] = { period: s.period, total_sale: parseFloat(s.total_sale||0), bill_count: s.bill_count, total_purchase: 0, purchase_count: 0, total_expenses: 0 }; });
    purchases.forEach(p => {
      if (!map[p.period]) map[p.period] = { period: p.period, total_sale: 0, bill_count: 0, total_expenses: 0 };
      map[p.period].total_purchase = parseFloat(p.total_purchase||0);
      map[p.period].purchase_count = p.purchase_count;
    });
    expenses.forEach(e => {
      if (!map[e.period]) map[e.period] = { period: e.period, total_sale: 0, bill_count: 0, total_purchase: 0, purchase_count: 0 };
      map[e.period].total_expenses = parseFloat(e.total_expenses||0);
    });
    const result = Object.values(map).map(r => ({
      ...r,
      gross_profit: r.total_sale - r.total_purchase,
      net_profit: r.total_sale - r.total_purchase - r.total_expenses
    }));
    result.sort((a,b) => b.period > a.period ? 1 : -1);
    res.json({ success: true, data: result });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
 
// ════════════════════════════════════════════════
//  SALES
// ════════════════════════════════════════════════
app.get('/api/sales', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT bi.*,b.bill_number,b.bill_date,b.customer_name,b.customer_gst
      FROM bill_items bi JOIN bills b ON b.id=bi.bill_id
      ORDER BY b.bill_date DESC,b.id DESC LIMIT 500`);
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
 
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
 
app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════╗');
  console.log('║   METE INDUSTRY SERVER v3.0      ║');
  console.log('╠══════════════════════════════════╣');
  console.log(`║  URL  : http://localhost:${PORT}    ║`);
  console.log('║  User : admin  Pass : admin      ║');
  console.log('╚══════════════════════════════════╝\n');
});