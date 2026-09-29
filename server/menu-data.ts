import { MenuItem, MenuVariant } from '../src/types';

const createdAt = () => new Date().toISOString();

const v = (label: string, price: number): MenuVariant => ({ label, price });

export const MENUS: MenuItem[] = [
  // ===== Food Menu (makanan) =====
  { id: 'menu-1', name: 'Nasi Kuning Abon/Telur', category: 'makanan', price: 18000, description: 'Nasi kuning gurih, lengkap dengan abon atau telur, ringan dan mengenyangkan.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
  { id: 'menu-2', name: 'Ketoprak', category: 'makanan', price: 20000, description: 'Tahu, bihun, sayur segar, bumbu kacang, dan kerupuk yang gurih.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
  { id: 'menu-3', name: 'Ketoprak Komplit', category: 'makanan', price: 25000, description: 'Ketoprak istimewa dengan tambahan telur dan topping lengkap.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
  { id: 'menu-4', name: 'Soto Ayam', category: 'makanan', price: 20000, description: 'Soto ayam hangat, kuah gurih, lengkap dengan sambal dan jeruk nipis.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
  { id: 'menu-5', name: 'Spaghetti Carbonara', category: 'makanan', price: 22000, description: 'Spaghetti creamy dengan saus carbonara dan taburan keju.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
  { id: 'menu-6', name: 'Sunny Cumi Rice', category: 'makanan', price: 25000, description: 'Nasi dengan cumi saus sunny yang segar dan sedikit pedas.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
  { id: 'menu-7', name: 'Rice Bowl Garlic Butter Chicken', category: 'makanan', price: 25000, description: 'Nasi bowl dengan ayam saus mentega bawang putih yang gurih.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
  { id: 'menu-8', name: 'Rice Bowl Chicken Teriyaki', category: 'makanan', price: 25000, description: 'Nasi bowl ayam teriyaki manis-gurih, cocok untuk makan siang.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
  { id: 'menu-9', name: 'Rice Bowl Chicken Blackpaper', category: 'makanan', price: 28000, description: 'Nasi bowl ayam saus blackpaper dengan rasa gurih pedas.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
  { id: 'menu-10', name: 'Golden Eggs Toast', category: 'makanan', price: 34000, description: 'Roti panggang dengan telur spesial yang creamy dan gurih.', imageUrl: '', isAvailable: true, createdAt: createdAt() },

  // ===== Kudapan =====
  { id: 'menu-11', name: 'Bubur Candil', category: 'kudapan', price: 12000, description: 'Bubur candil manis kenyal, hangat menyenangkan.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
  { id: 'menu-12', name: 'Rujak Cireng', category: 'kudapan', price: 15000, description: 'Cireng garing dengan siraman saus rujak segar.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
  { id: 'menu-13', name: 'Pisang Goreng Wijen', category: 'kudapan', price: 18000, description: 'Pisang goreng renyah dengan taburan wijen wangi.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
  { id: 'menu-14', name: 'Bakwan Jagung Bumbu Kacang', category: 'kudapan', price: 15000, description: 'Bakwan jagung gurih dengan bumbu kacang khas.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
  { id: 'menu-15', name: 'Risol Mayo', category: 'kudapan', price: 15000, description: 'Risol isi mayones yang creamy dan gurih.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
  { id: 'menu-16', name: 'Kebab Beef', category: 'kudapan', price: 18000, description: 'Kebab daging sapi dengan saus dan sayuran segar.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
  { id: 'menu-17', name: 'Dimsum', category: 'kudapan', price: 18000, description: 'Dimsum lembut, dinikmati hangat dengan saus.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
  { id: 'menu-18', name: 'Roti Maryam Keju Susu', category: 'kudapan', price: 12000, description: 'Roti maryam lembut berlapis dengan keju susu.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
  { id: 'menu-19', name: 'Roti Maryam Choco Crunchy', category: 'kudapan', price: 15000, description: 'Roti maryam dengan cokelat renyah yang manis.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
  { id: 'menu-20', name: 'Roti Maryam Tiramisu Oreo', category: 'kudapan', price: 15000, description: 'Roti maryam rasa tiramisu dengan taburan oreo.', imageUrl: '', isAvailable: true, createdAt: createdAt() },

  // ===== Dessert =====
  { id: 'menu-21', name: 'Pudding Mini Mango Cheese', category: 'dessert', price: 15000, description: 'Pudding mangga creamy dengan lapisan keju.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
  { id: 'menu-22', name: 'Pudding Mini Choco Silverqueen', category: 'dessert', price: 18000, description: 'Pudding cokelat dengan cita rasa silverqueen.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
  { id: 'menu-23', name: 'Fruit Slice A', category: 'dessert', price: 18000, description: 'Irisan buah segar pilihan untuk pencuci mulut ringan.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
  { id: 'menu-24', name: 'Fruit Slice B', category: 'dessert', price: 15000, description: 'Irisan buah segar dengan saus dan taburan istimewa.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
  { id: 'menu-25', name: 'Tropical Bliss Bowl', category: 'dessert', price: 32000, description: 'Bowl buah tropis segar, creamy, dan menyegarkan.', imageUrl: '', isAvailable: true, createdAt: createdAt() },

  // ===== Minuman =====
  { id: 'menu-26', name: 'Teh Manis', category: 'minuman', price: 8000, description: 'Teh manis segar, bisa dinikmati hangat atau dingin.', imageUrl: '', isAvailable: true, createdAt: createdAt(), variants: [v('Ice', 8000), v('Hot', 6000)] },
  { id: 'menu-27', name: 'Teh Tawar', category: 'minuman', price: 5000, description: 'Teh tawar klasik, cocok untuk menemani santapan.', imageUrl: '', isAvailable: true, createdAt: createdAt(), variants: [v('Ice', 5000), v('Hot', 3000)] },
  { id: 'menu-28', name: 'Air Mineral', category: 'minuman', price: 5000, description: 'Air mineral segar untuk melepas dahaga.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
  { id: 'menu-29', name: 'Kopi Susu', category: 'minuman', price: 15000, description: 'Es kopi susu manis yang creamy dan nikmat.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
  { id: 'menu-30', name: 'Kopi Susu Gula Aren', category: 'minuman', price: 18000, description: 'Es kopi susu dengan gula aren yang legit.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
  { id: 'menu-31', name: 'Espresso Lemon Buzz', category: 'minuman', price: 20000, description: 'Espresso dengan sentuhan lemon yang segar dan menyegarkan.', imageUrl: '', isAvailable: true, createdAt: createdAt(), variants: [v('Ice', 20000), v('Hot', 16000)] },
  { id: 'menu-32', name: 'Classic Americano', category: 'minuman', price: 18000, description: 'Kopi hitam klasik yang pekat dan nikmat.', imageUrl: '', isAvailable: true, createdAt: createdAt(), variants: [v('Ice', 18000), v('Hot', 14000)] },
  { id: 'menu-33', name: 'Matcha Latte', category: 'minuman', price: 20000, description: 'Es matcha latte lembut dengan rasa hijau yang khas.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
  { id: 'menu-34', name: 'Strawberry Matcha Latte', category: 'minuman', price: 25000, description: 'Es matcha latte dengan sirup strawberry manis.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
  { id: 'menu-35', name: 'Teh Tarik', category: 'minuman', price: 18000, description: 'Teh tarik creamy yang kental dan manis.', imageUrl: '', isAvailable: true, createdAt: createdAt(), variants: [v('Ice', 18000), v('Hot', 15000)] },
  { id: 'menu-36', name: 'Teh Lemon', category: 'minuman', price: 15000, description: 'Teh dengan perasan lemon segar, rasa asam manis.', imageUrl: '', isAvailable: true, createdAt: createdAt(), variants: [v('Ice', 15000), v('Hot', 12000)] },
  { id: 'menu-37', name: 'Royal Chocolatte', category: 'minuman', price: 20000, description: 'Minuman cokelat creamy yang kaya dan lembut.', imageUrl: '', isAvailable: true, createdAt: createdAt(), variants: [v('Ice', 20000), v('Hot', 18000)] },
  { id: 'menu-38', name: 'Jus Buah Naga', category: 'minuman', price: 15000, description: 'Jus buah naga segar, manis, dan menyegarkan.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
  { id: 'menu-39', name: 'Jus Buah Naga Pisang', category: 'minuman', price: 18000, description: 'Jus buah naga pisang yang creamy dan mengenyangkan.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
  { id: 'menu-40', name: 'Jus Alpukat', category: 'minuman', price: 18000, description: 'Jus alpukat kental dengan cokelat, favorit semua kalangan.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
  { id: 'menu-41', name: 'Jus Mangga', category: 'minuman', price: 18000, description: 'Jus mangga manis segar dari buah pilihan.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
  { id: 'menu-42', name: 'Jus Melon', category: 'minuman', price: 18000, description: 'Jus melon segar yang ringan dan manis.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
  { id: 'menu-43', name: 'Milk Regal Merry', category: 'minuman', price: 18000, description: 'Susu regal merry yang creamy dan gurih manis.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
  { id: 'menu-44', name: 'Milky Strawberry', category: 'minuman', price: 18000, description: 'Susu strawberry segar yang manis dan creamy.', imageUrl: '', isAvailable: true, createdAt: createdAt() },
];
