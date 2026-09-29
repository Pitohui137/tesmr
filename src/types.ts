export type Role = 'owner' | 'kasir' | 'admin';

export const MAX_TABLES = 30;

export interface UserAccount {
  id: string;
  username: string;
  name: string;
  role: Role;
  email?: string;
  password?: string;
  createdAt: string;
}

export type MenuCategory = 'makanan' | 'minuman' | 'kudapan' | 'dessert';

export interface MenuVariant {
  label: string;
  price: number;
  isAvailable?: boolean;
}

export interface MenuItem {
  id: string;
  name: string;
  category: MenuCategory;
  price: number;
  description: string;
  imageUrl: string;
  isAvailable: boolean;
  createdAt: string;
  variants?: MenuVariant[];
}

export interface OrderItem {
  menuId: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
  variant?: string;
  isCancelled?: boolean;
  cancelledAt?: string;
  isAdditional?: boolean;
}

export type OrderStatus = 'menunggu_verifikasi' | 'diproses' | 'siap_diambil' | 'selesai' | 'dibatalkan';
export type PaymentMethod = 'qris' | 'cash';

export interface Order {
  id: string;
  customerName: string;
  tableNumber: string;
  items: OrderItem[];
  totalPrice: number;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  createdAt: string;
  additionalAmount?: number;
  archivedAt?: string;
}

export interface CafeSettings {
  name: string;
  address: string;
  phone: string;
  qrisMerchantName: string;
  qrisCodeText: string;
  qrisImageUrl?: string;
}

export interface ReportData {
  period: string;
  startDate: string;
  endDate: string;
  totalRevenue: number;
  totalOrders: number;
  qrisRevenue: number;
  cashRevenue: number;
  orders: Order[];
}

export interface AppLog {
  id: number;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  meta?: string;
  createdAt: string;
}
