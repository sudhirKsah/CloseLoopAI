import { api } from "./api";

export interface PaymentConfig {
  configured: boolean;
  key_id: string;
  currency: string;
}

export interface CreateOrderResponse {
  id: string;
  razorpay_order_id: string;
  amount: number;
  currency: string;
  status: string;
  key_id: string;
  description: string | null;
}

export interface PaymentResponse {
  id: string;
  razorpay_payment_id: string;
  razorpay_order_id: string;
  amount: number;
  currency: string;
  status: string;
  method: string | null;
}

export interface OrderListItem {
  id: string;
  razorpay_order_id: string;
  amount: number;
  currency: string;
  status: string;
  description: string | null;
  customer_name: string | null;
  customer_email: string | null;
  created_at: string | null;
}

export interface PaymentListItem {
  id: string;
  razorpay_payment_id: string;
  razorpay_order_id: string;
  amount: number;
  currency: string;
  status: string;
  method: string | null;
  created_at: string | null;
}

export async function getPaymentConfig(workspaceId: string): Promise<PaymentConfig> {
  return api<PaymentConfig>(`/workspaces/${workspaceId}/payments/config`);
}

export async function createOrder(
  workspaceId: string,
  body: {
    amount: number;
    currency?: string;
    description?: string;
    customer_name?: string;
    customer_email?: string;
    customer_contact?: string;
    notes?: Record<string, string>;
  },
): Promise<CreateOrderResponse> {
  return api<CreateOrderResponse>(
    `/workspaces/${workspaceId}/payments/create-order`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export async function verifyPayment(
  workspaceId: string,
  body: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  },
): Promise<PaymentResponse> {
  return api<PaymentResponse>(
    `/workspaces/${workspaceId}/payments/verify`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export async function listOrders(workspaceId: string): Promise<OrderListItem[]> {
  return api<OrderListItem[]>(`/workspaces/${workspaceId}/payments/orders`);
}

export async function listPayments(workspaceId: string): Promise<PaymentListItem[]> {
  return api<PaymentListItem[]>(`/workspaces/${workspaceId}/payments/payments`);
}

// Razorpay checkout script URL
export const RAZORPAY_SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";

// Load the Razorpay checkout script (idempotent)
let _scriptLoaded = false;
let _scriptPromise: Promise<void> | null = null;

export function loadRazorpayScript(): Promise<void> {
  if (_scriptLoaded) return Promise.resolve();
  if (_scriptPromise) return _scriptPromise;
  _scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = RAZORPAY_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      _scriptLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error("Failed to load Razorpay checkout script"));
    document.body.appendChild(script);
  });
  return _scriptPromise;
}

// Open the Razorpay checkout modal
export async function openRazorpayCheckout(opts: {
  key_id: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  customer_name?: string;
  customer_email?: string;
  customer_contact?: string;
  onSuccess: (response: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void;
  onDismiss?: () => void;
}): Promise<void> {
  await loadRazorpayScript();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Razorpay = (window as any).Razorpay;
  if (!Razorpay) throw new Error("Razorpay checkout not available");

  const options: Record<string, unknown> = {
    key: opts.key_id,
    amount: opts.amount,
    currency: opts.currency,
    order_id: opts.order_id,
    name: opts.name,
    description: opts.description || "",
    handler: (response: {
      razorpay_payment_id: string;
      razorpay_order_id: string;
      razorpay_signature: string;
    }) => opts.onSuccess(response),
    theme: { color: "#10b981" },
    modal: {
      ondismiss: () => opts.onDismiss?.(),
    },
  };

  if (opts.customer_name) options.prefill = { name: opts.customer_name };
  if (opts.customer_email) {
    options.prefill = { ...(options.prefill || {}), email: opts.customer_email };
  }
  if (opts.customer_contact) {
    options.prefill = { ...(options.prefill || {}), contact: opts.customer_contact };
  }

  const rzp = new Razorpay(options);
  rzp.open();
}
