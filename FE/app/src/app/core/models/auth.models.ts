export interface User {
  id: string;
  shopId: string;
  name: string;
  email: string;
  phone?: string | null;
  role: 'SHOP_ADMIN' | 'SHOPKEEPER';
  status: 'ACTIVE' | 'INACTIVE';
  permissions: string[];
}

export interface Shop {
  id: string;
  name: string;
  ownerName: string;
  email: string;
  phone: string;
  address: string;
  status: 'ACTIVE' | 'SUSPENDED';
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  accessToken: string;
  user: User;
  shop: Shop;
}

export interface RegisterRequest {
  shopName: string;
  ownerName: string;
  email: string;
  phone: string;
  address: string;
  password: string;
  confirmPassword: string;
}

export interface RegisterResponse {
  success: boolean;
  message: string;
  accessToken: string;
  user: User;
  shop: Shop;
}

export interface StaffUser {
  id: string;
  shopId: string;
  name: string;
  email: string;
  phone: string | null;
  role: 'SHOP_ADMIN' | 'SHOPKEEPER';
  status: 'ACTIVE' | 'INACTIVE';
  permissions: string[];
  created_at?: string;
  updated_at?: string;
}

export interface CreateStaffRequest {
  name: string;
  email: string;
  password: string;
  phone?: string | null;
  role: 'SHOP_ADMIN' | 'SHOPKEEPER';
  permissions?: string[];
}

export interface UpdateStaffRequest {
  name: string;
  phone?: string | null;
  role?: 'SHOP_ADMIN' | 'SHOPKEEPER';
}

export interface PermissionDefinition {
  id: string;
  name: string;
  module: string;
  description: string;
}
