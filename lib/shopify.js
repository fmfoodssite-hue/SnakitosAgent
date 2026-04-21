const axios = require('axios');
const crypto = require('crypto');

const shopifyApi = axios.create({
  baseURL: `https://${process.env.SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01`,
  headers: {
    'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN,
    'Content-Type': 'application/json',
  },
});

/**
 * Verifies the HMAC signature for Shopify App Proxy requests
 */
function verifyShopifyProxy(params, secret) {
  const { hmac, ...rest } = params;
  if (!hmac) return false;

  const sortedParams = Object.keys(rest)
    .sort()
    .map(key => `${key}=${Array.isArray(rest[key]) ? rest[key].join(',') : rest[key]}`)
    .join('');
  
  const calculatedHmac = crypto
    .createHmac('sha256', secret)
    .update(sortedParams)
    .digest('hex');

  return calculatedHmac === hmac;
}

/**
 * Fetch real-time order status
 */
async function getOrderStatus(orderId) {
  try {
    const response = await shopifyApi.get(`/orders/${orderId}.json`);
    return response.data.order;
  } catch (error) {
    console.error('Shopify Order Error:', error);
    return null;
  }
}

/**
 * Fetch real-time product info
 */
async function getProductInfo(productId) {
  try {
    const response = await shopifyApi.get(`/products/${productId}.json`);
    return response.data.product;
  } catch (error) {
    console.error('Shopify Product Error:', error);
    return null;
  }
}

module.exports = {
  shopifyApi,
  verifyShopifyProxy,
  getOrderStatus,
  getProductInfo,
};
