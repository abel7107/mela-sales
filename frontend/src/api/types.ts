export type Role = 'OWNER' | 'CASHIER'
export type SaleType = 'CASH' | 'CREDIT'
export type SaleStatus = 'OPEN' | 'PAID' | 'VOID'
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'MOBILE_MONEY' | 'OTHER'
export type ProductType = 'PRODUCT' | 'SERVICE'

export const PAYMENT_METHODS: PaymentMethod[] = [
  'CASH',
  'BANK_TRANSFER',
  'MOBILE_MONEY',
  'OTHER',
]

export interface Pagination {
  limit: number
  offset: number
  page: number
  total: number
  totalPages: number
  hasMore: boolean
}

export interface Membership {
  id: string
  role: Role
}

export interface AuthUser {
  id: string
  email: string
  name: string | null
  createdAt: string
}

export interface AuthSession {
  user: AuthUser
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export interface Business {
  id: string
  name: string
  currency: string
  phone: string | null
  email: string | null
  address: string | null
  logoUrl: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  membership?: Membership
}

export interface Member {
  id: string
  authUserId: string
  role: Role
  isActive: boolean
  createdAt: string
}

export interface Product {
  id: string
  businessId: string
  name: string
  description: string | null
  sku: string | null
  type: ProductType
  price: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface Customer {
  id: string
  businessId: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface SaleLine {
  id: string
  productServiceId: string
  name: string
  type: ProductType
  sku: string | null
  quantity: string
  unitPrice: string
  discountAmount: string
  lineTotal: string
}

export interface Payment {
  id: string
  amount: string
  method: PaymentMethod
  reference: string | null
  notes: string | null
  receivedAt: string
  receivedByMembershipId: string
}

export interface InvoiceRef {
  id: string
  invoiceNumber: string
  issuedAt: string
}

export interface Sale {
  id: string
  businessId: string
  customerId: string | null
  customerName: string | null
  createdByMembershipId: string
  saleType: SaleType
  status: SaleStatus
  subtotal: string
  discountAmount: string
  taxAmount: string
  totalAmount: string
  amountPaid: string
  balanceDue: string
  notes: string | null
  voidReason: string | null
  voidedAt: string | null
  createdAt: string
  updatedAt: string
  invoice?: InvoiceRef | null
  invoiceNumber?: string
  items?: SaleLine[]
  payments?: Payment[]
}

export interface SaleListRow
  extends Omit<Sale, 'items' | 'payments' | 'invoice'> {
  invoiceNumber: string
}

export interface SaleSummary {
  range: { from: string | null; to: string | null }
  totals: {
    saleCount: number
    totalAmount: string
    taxAmount: string
    discountAmount: string
    cashAmount: string
    creditAmount: string
    outstandingAmount: string
    voidedCount: number
  }
  daily: Array<{
    day: string
    saleCount: number
    totalAmount: string
    cashAmount: string
    creditAmount: string
  }>
  topProducts: Array<{
    name: string
    type: ProductType
    quantitySold: string
    revenue: string
  }>
}

export interface CustomerBalance {
  customerId: string
  name: string
  phone: string | null
  totalSales: string
  totalPaid: string
  outstandingBalance: string
  lastSaleAt: string | null
}

export interface PaymentReportRow {
  id: string
  amount: string
  method: PaymentMethod
  reference: string | null
  notes: string | null
  receivedAt: string
  receivedByMembershipId: string
  saleId: string
  invoiceNumber: string
  customerName: string | null
}

export interface CreateSaleBody {
  saleType: SaleType
  items: Array<{
    productServiceId: string
    quantity: string
    discountAmount?: string
  }>
  customerId?: string | null
  discountAmount?: string
  taxAmount?: string
  notes?: string | null
  initialPaymentAmount?: string
  paymentMethod?: PaymentMethod
  paymentReference?: string | null
  paymentNotes?: string | null
}
