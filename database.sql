-- ============================================================
--  METE INDUSTRY v2.0 - Database Setup
--  MySQL Workbench: File > Open SQL Script > Execute (⚡)
-- ============================================================

CREATE DATABASE IF NOT EXISTS mete_industry;
USE mete_industry;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin','staff') DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  rate DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_actual_bill BOOLEAN DEFAULT FALSE,
  category VARCHAR(100) DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL UNIQUE,
  quantity DECIMAL(10,3) DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS purchases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  quantity DECIMAL(10,3) NOT NULL,
  rate DECIMAL(10,2) NOT NULL,
  total DECIMAL(12,2) NOT NULL,
  supplier_name VARCHAR(200) DEFAULT '',
  purchase_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(20) DEFAULT '',
  address TEXT,
  gst_number VARCHAR(20) DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bills (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bill_number VARCHAR(50) UNIQUE NOT NULL,
  customer_id INT,
  customer_name VARCHAR(200),
  customer_gst VARCHAR(20) UNIQUE NOT NULL,
  bill_date DATE NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS bill_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bill_id INT NOT NULL,
  product_id INT,
  product_name VARCHAR(200) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  item_w DECIMAL(10,4) DEFAULT 0,
  item_h DECIMAL(10,4) DEFAULT 0,
  nos INT DEFAULT 1,
  quantity DECIMAL(10,6) NOT NULL,
  rate DECIMAL(10,2) NOT NULL,
  total DECIMAL(12,2) NOT NULL,
  FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

-- ============================================================
--  LOGIN: admin / admin
-- ============================================================
INSERT IGNORE INTO users (username, password, role) VALUES
('admin', 'admin', 'admin');

-- ============================================================
--  25 PRODUCTS
-- ============================================================
INSERT INTO products (name, unit, rate, is_actual_bill, category) VALUES
('Plywood 18mm (Grade A)',            'sq.ft',  100.00, 0, 'Plywood'),
('Plywood 18mm (Grade B)',            'sq.ft',   80.00, 0, 'Plywood'),
('Blackboard 25mm',                   'sq.ft',  120.00, 0, 'Board'),
('Flush Door',                        'sq.ft',  135.00, 0, 'Door'),
('MDF 18mm',                          'sq.ft',  100.00, 0, 'MDF'),
('MDF 12mm',                          'sq.ft',   80.00, 0, 'MDF'),
('MDF 6mm',                           'sq.ft',   15.00, 0, 'MDF'),
('MDF 4mm',                           'sq.ft',   40.00, 0, 'MDF'),
('Inner Laminate',                    'sheet', 1000.00, 0, 'Laminate'),
('Outer Laminate',                    'sheet', 2500.00, 0, 'Laminate'),
('PVC Laminate Acrylic',              'sheet', 3500.00, 0, 'Laminate'),
('Veneer',                            'sq.ft',  150.00, 0, 'Veneer'),
('Fevicol Adhesive',                  'kg',     300.00, 0, 'Adhesive'),
('WPC Plywood 18mm',                  'sq.ft',  120.00, 0, 'WPC'),
('WPC Plywood 12mm',                  'sq.ft',  100.00, 0, 'WPC'),
('Hardware & Fittings',               'actual',   0.00, 1, 'Hardware'),
('Glass & Profile',                   'actual',   0.00, 1, 'Glass'),
('Teakwood',                          'cu.ft', 7000.00, 0, 'Wood'),
('Other Materials',                   'actual',   0.00, 1, 'Other'),
('Beading Patti 1x10',                'rn.ft',   10.00, 0, 'Beading'),
('Beading Patti 1.5x10',              'rn.ft',   15.00, 0, 'Beading'),
('Beading Patti 2x10',                'rn.ft',   20.00, 0, 'Beading'),
('Beading Patti 2.5x10',              'rn.ft',   27.00, 0, 'Beading'),
('Beading Patti 3x10',                'rn.ft',   35.00, 0, 'Beading'),
('Soft Board / Flexi / Cement Board', 'actual',   0.00, 1, 'Board');

INSERT INTO stock (product_id, quantity) SELECT id, 0 FROM products;
