const BASE_URL = 'https://infastgo-backendd.onrender.com/api';

let adminToken = localStorage.getItem('infast_admin_token') || null;

export const setToken = (token) => {
  adminToken = token;
  if (token) {
    localStorage.setItem('infast_admin_token', token);
  } else {
    localStorage.removeItem('infast_admin_token');
  }
};

export const getToken = () => adminToken;

const request = async (endpoint, options = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
  };

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers: { ...headers, ...options.headers },
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Xatolik yuz berdi');
    }
    return data;
  } catch (error) {
    console.error(`Admin API Error on ${endpoint}:`, error.message);
    throw error;
  }
};

export const api = {
  adminLogin: (login, password) => request('/auth/admin-login', {
    method: 'POST',
    body: JSON.stringify({ login, password }),
  }),

  requestOTP: (phone) => request('/auth/otp', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  }),

  verifyOTP: (phone, code) => request('/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ phone, code }),
  }),

  getProfile: () => request('/auth/profile'),

  getStats: () => request('/admin/stats'),

  getUsers: () => request('/admin/users'),

  blockUser: (userId) => request(`/admin/users/${userId}/block`, {
    method: 'POST',
  }),

  getDrivers: () => request('/admin/drivers'),

  createDriver: (driverData) => request('/admin/drivers', {
    method: 'POST',
    body: JSON.stringify(driverData),
  }),

  toggleDriverActive: (driverId) => request(`/admin/drivers/${driverId}/active`, {
    method: 'POST',
  }),

  getLive: () => request('/admin/live'),

  getPricing: () => request('/admin/pricing'),

  updatePricing: (pricingData) => request('/admin/pricing', {
    method: 'PUT',
    body: JSON.stringify(pricingData),
  }),

  sendPush: (pushData) => request('/admin/push', {
    method: 'POST',
    body: JSON.stringify(pushData),
  }),
  
  // Seeding trigger for quick local dev setup
  triggerSeed: () => request('/seed', { method: 'POST', headers: {} }).catch(() => null),

  baseUrl: BASE_URL,
};
