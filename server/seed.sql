-- Seed data awal Salad Yook
-- Jalankan setelah schema: wrangler d1 execute salad-yook-db --local --file=server/seed.sql

INSERT
    OR IGNORE INTO settings (
        id,
        name,
        address,
        phone,
        qris_merchant_name,
        qris_code_text
    )
VALUES (
        1,
        'Salad Yook',
        'Jl. Pemuda No. 34, Majalengka Kulon, Kec. Majalengka, Kabupaten Majalengka',
        '0812-3456-7890',
        'SALAD YOOK',
        ''
    );

-- Sandi awal dibuat acak (nilai asli ada di file lokal .credentials.local - TIDAK di repo)
INSERT
    OR IGNORE INTO users (
        id,
        username,
        name,
        role,
        email,
        password,
        created_at
    )
VALUES (
        'user-owner',
        'owner',
        'owner',
        'owner',
        '',
        'pbkdf2:100000:8041c5d67df387cb28b99d12461efeae:3532c41034ef54c4aa8237176d6e70b822764bf1401d9b28e7e868702352b77a',
        datetime('now')
    ),
    (
        'user-kasir-1',
        'kasir',
        'kasir',
        'kasir',
        '',
        'pbkdf2:100000:10d293ef6d787d576de1e93698b90ca5:c8b6ef70403e1224a95dac6ef68d57ecaa74e7355193072758ba8b844ff51d0a',
        datetime('now')
    ),
    (
        'user-admin',
        'admin',
        'Admin (Monitoring)',
        'admin',
        '',
        'pbkdf2:100000:2055f2fa44348564e891faef437b63bf:2c428efa23c625194667669c5c12a12a2d3e08cfb693ed26ba2a24b4c7610283',
        datetime('now')
    );

-- Menu baru sesuai MENU SALADYOOK (gambar menyusul, image_url kosong)
DELETE FROM menu;

INSERT INTO menu (id, name, category, price, description, image_url, is_available, variants, created_at) VALUES
('menu-1', 'Nasi Kuning Abon/Telur', 'makanan', 18000, 'Nasi kuning gurih, lengkap dengan abon atau telur, ringan dan mengenyangkan.', '', 1, '', datetime('now')),
('menu-2', 'Ketoprak', 'makanan', 20000, 'Tahu, bihun, sayur segar, bumbu kacang, dan kerupuk yang gurih.', '', 1, '', datetime('now')),
('menu-3', 'Ketoprak Komplit', 'makanan', 25000, 'Ketoprak istimewa dengan tambahan telur dan topping lengkap.', '', 1, '', datetime('now')),
('menu-4', 'Soto Ayam', 'makanan', 20000, 'Soto ayam hangat, kuah gurih, lengkap dengan sambal dan jeruk nipis.', '', 1, '', datetime('now')),
('menu-5', 'Spaghetti Carbonara', 'makanan', 22000, 'Spaghetti creamy dengan saus carbonara dan taburan keju.', '', 1, '', datetime('now')),
('menu-6', 'Sunny Cumi Rice', 'makanan', 25000, 'Nasi dengan cumi saus sunny yang segar dan sedikit pedas.', '', 1, '', datetime('now')),
('menu-7', 'Rice Bowl Garlic Butter Chicken', 'makanan', 25000, 'Nasi bowl dengan ayam saus mentega bawang putih yang gurih.', '', 1, '', datetime('now')),
('menu-8', 'Rice Bowl Chicken Teriyaki', 'makanan', 25000, 'Nasi bowl ayam teriyaki manis-gurih, cocok untuk makan siang.', '', 1, '', datetime('now')),
('menu-9', 'Rice Bowl Chicken Blackpaper', 'makanan', 28000, 'Nasi bowl ayam saus blackpaper dengan rasa gurih pedas.', '', 1, '', datetime('now')),
('menu-10', 'Golden Eggs Toast', 'makanan', 34000, 'Roti panggang dengan telur spesial yang creamy dan gurih.', '', 1, '', datetime('now')),
('menu-11', 'Bubur Candil', 'kudapan', 12000, 'Bubur candil manis kenyal, hangat menyenangkan.', '', 1, '', datetime('now')),
('menu-12', 'Rujak Cireng', 'kudapan', 15000, 'Cireng garing dengan siraman saus rujak segar.', '', 1, '', datetime('now')),
('menu-13', 'Pisang Goreng Wijen', 'kudapan', 18000, 'Pisang goreng renyah dengan taburan wijen wangi.', '', 1, '', datetime('now')),
('menu-14', 'Bakwan Jagung Bumbu Kacang', 'kudapan', 15000, 'Bakwan jagung gurih dengan bumbu kacang khas.', '', 1, '', datetime('now')),
('menu-15', 'Risol Mayo', 'kudapan', 15000, 'Risol isi mayones yang creamy dan gurih.', '', 1, '', datetime('now')),
('menu-16', 'Kebab Beef', 'kudapan', 18000, 'Kebab daging sapi dengan saus dan sayuran segar.', '', 1, '', datetime('now')),
('menu-17', 'Dimsum', 'kudapan', 18000, 'Dimsum lembut, dinikmati hangat dengan saus.', '', 1, '', datetime('now')),
('menu-18', 'Roti Maryam Keju Susu', 'kudapan', 12000, 'Roti maryam lembut berlapis dengan keju susu.', '', 1, '', datetime('now')),
('menu-19', 'Roti Maryam Choco Crunchy', 'kudapan', 15000, 'Roti maryam dengan cokelat renyah yang manis.', '', 1, '', datetime('now')),
('menu-20', 'Roti Maryam Tiramisu Oreo', 'kudapan', 15000, 'Roti maryam rasa tiramisu dengan taburan oreo.', '', 1, '', datetime('now')),
('menu-21', 'Pudding Mini Mango Cheese', 'dessert', 15000, 'Pudding mangga creamy dengan lapisan keju.', '', 1, '', datetime('now')),
('menu-22', 'Pudding Mini Choco Silverqueen', 'dessert', 18000, 'Pudding cokelat dengan cita rasa silverqueen.', '', 1, '', datetime('now')),
('menu-23', 'Fruit Slice A', 'dessert', 18000, 'Irisan buah segar pilihan untuk pencuci mulut ringan.', '', 1, '', datetime('now')),
('menu-24', 'Fruit Slice B', 'dessert', 15000, 'Irisan buah segar dengan saus dan taburan istimewa.', '', 1, '', datetime('now')),
('menu-25', 'Tropical Bliss Bowl', 'dessert', 32000, 'Bowl buah tropis segar, creamy, dan menyegarkan.', '', 1, '', datetime('now')),
('menu-26', 'Teh Manis', 'minuman', 8000, 'Teh manis segar, bisa dinikmati hangat atau dingin.', '', 1, '[{"label":"Ice","price":8000},{"label":"Hot","price":6000}]', datetime('now')),
('menu-27', 'Teh Tawar', 'minuman', 5000, 'Teh tawar klasik, cocok untuk menemani santapan.', '', 1, '[{"label":"Ice","price":5000},{"label":"Hot","price":3000}]', datetime('now')),
('menu-28', 'Air Mineral', 'minuman', 5000, 'Air mineral segar untuk melepas dahaga.', '', 1, '', datetime('now')),
('menu-29', 'Kopi Susu', 'minuman', 15000, 'Es kopi susu manis yang creamy dan nikmat.', '', 1, '', datetime('now')),
('menu-30', 'Kopi Susu Gula Aren', 'minuman', 18000, 'Es kopi susu dengan gula aren yang legit.', '', 1, '', datetime('now')),
('menu-31', 'Espresso Lemon Buzz', 'minuman', 20000, 'Espresso dengan sentuhan lemon yang segar dan menyegarkan.', '', 1, '[{"label":"Ice","price":20000},{"label":"Hot","price":16000}]', datetime('now')),
('menu-32', 'Classic Americano', 'minuman', 18000, 'Kopi hitam klasik yang pekat dan nikmat.', '', 1, '[{"label":"Ice","price":18000},{"label":"Hot","price":14000}]', datetime('now')),
('menu-33', 'Matcha Latte', 'minuman', 20000, 'Es matcha latte lembut dengan rasa hijau yang khas.', '', 1, '', datetime('now')),
('menu-34', 'Strawberry Matcha Latte', 'minuman', 25000, 'Es matcha latte dengan sirup strawberry manis.', '', 1, '', datetime('now')),
('menu-35', 'Teh Tarik', 'minuman', 18000, 'Teh tarik creamy yang kental dan manis.', '', 1, '[{"label":"Ice","price":18000},{"label":"Hot","price":15000}]', datetime('now')),
('menu-36', 'Teh Lemon', 'minuman', 15000, 'Teh dengan perasan lemon segar, rasa asam manis.', '', 1, '[{"label":"Ice","price":15000},{"label":"Hot","price":12000}]', datetime('now')),
('menu-37', 'Royal Chocolatte', 'minuman', 20000, 'Minuman cokelat creamy yang kaya dan lembut.', '', 1, '[{"label":"Ice","price":20000},{"label":"Hot","price":18000}]', datetime('now')),
('menu-38', 'Jus Buah Naga', 'minuman', 15000, 'Jus buah naga segar, manis, dan menyegarkan.', '', 1, '', datetime('now')),
('menu-39', 'Jus Buah Naga Pisang', 'minuman', 18000, 'Jus buah naga pisang yang creamy dan mengenyangkan.', '', 1, '', datetime('now')),
('menu-40', 'Jus Alpukat', 'minuman', 18000, 'Jus alpukat kental dengan cokelat, favorit semua kalangan.', '', 1, '', datetime('now')),
('menu-41', 'Jus Mangga', 'minuman', 18000, 'Jus mangga manis segar dari buah pilihan.', '', 1, '', datetime('now')),
('menu-42', 'Jus Melon', 'minuman', 18000, 'Jus melon segar yang ringan dan manis.', '', 1, '', datetime('now')),
('menu-43', 'Milk Regal Merry', 'minuman', 18000, 'Susu regal merry yang creamy dan gurih manis.', '', 1, '', datetime('now')),
('menu-44', 'Milky Strawberry', 'minuman', 18000, 'Susu strawberry segar yang manis dan creamy.', '', 1, '', datetime('now'));