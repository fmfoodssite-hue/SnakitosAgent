import axios from 'axios';
import * as crypto from 'crypto';

const shopifyApi = axios.create({
  baseURL: `https://${process.env.SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01`,
  headers: {
    'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN || '',
    'Content-Type': 'application/json',
  },
});

/**
 * Verifies the HMAC signature for Shopify App Proxy requests
 */
export function verifyShopifyProxy(params: Record<string, any>, secret: string): boolean {
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
export async function getOrderStatus(orderId: string): Promise<any> {
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
export async function getProductInfo(productId: string): Promise<any> {
  try {
    const response = await shopifyApi.get(`/products/${productId}.json`);
    return response.data.product;
  } catch (error) {
    console.error('Shopify Product Error:', error);
    return null;
  }
}

export default shopifyApi;
