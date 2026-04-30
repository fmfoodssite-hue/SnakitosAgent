export type TrackingInfo = {
  company: string | null;
  number: string | null;
  url: string | null;
  status: string | null;
};

export type OrderLineItem = {
  title: string;
  quantity: number;
  sku: string | null;
  variantTitle: string | null;
  total: string;
  currencyCode: string;
};

export type OrderLookupResult = {
  id: string;
  gid: string;
  orderName: string;
  orderNumber: string;
  financialStatus: string;
  fulfillmentStatus: string;
  createdAt: string;
  totalAmount: string;
  currencyCode: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  shippingPhone: string | null;
  shippingAddress: string | null;
  tracking: TrackingInfo[];
  lineItems: OrderLineItem[];
};

export type OrderVerificationResult = OrderLookupResult & {
  verified: true;
};

export type ProductVariantLookup = {
  id: string;
  title: string;
  price: string;
  sku: string | null;
  inventoryQuantity: number | null;
};

export type ProductLookupResult = {
  id: string;
  title: string;
  handle: string;
  link: string;
  status: string;
  source?: "shopify_admin" | "shopify_storefront" | "uploaded_catalog";
  price: string | null;
  description: string | null;
  vendor: string | null;
  productType: string | null;
  tags: string[];
  availability: "in_stock" | "out_of_stock" | "unknown";
  totalInventory: number | null;
  orderCount?: number | null;
  unitsSold?: number | null;
  variants: ProductVariantLookup[];
};

export type OrderSearchNode = {
  id: string;
  legacyResourceId: string;
  name: string;
  orderNumber: number;
  displayFinancialStatus: string;
  displayFulfillmentStatus: string;
  createdAt: string;
  totalPriceSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
  customer: {
    phone: string | null;
    email: string | null;
    displayName: string | null;
  } | null;
  shippingAddress: {
    phone: string | null;
    name: string | null;
    address1: string | null;
    city: string | null;
    province: string | null;
    country: string | null;
    zip: string | null;
  } | null;
  lineItems: {
    edges: Array<{
      node: {
        title: string;
        quantity: number;
        sku: string | null;
        variantTitle: string | null;
        discountedTotalSet: {
          shopMoney: {
            amount: string;
            currencyCode: string;
          };
        };
      };
    }>;
  };
  fulfillments: Array<{
    status: string | null;
    trackingInfo: Array<{
      company: string | null;
      number: string | null;
      url: string | null;
    }>;
  }>;
};

export type ProductSearchNode = {
  id: string;
  legacyResourceId: string;
  title: string;
  handle: string;
  status: string;
  totalInventory: number | null;
  variants: {
    edges: Array<{
      node: {
        id: string;
        title: string;
        sku: string | null;
        price: string;
        inventoryQuantity: number | null;
      };
    }>;
  };
};
