import {
  apiDelete,
  apiGet,
  apiGetText,
  apiPatch,
  apiPost,
  buildQuery,
  type RequestOptions,
} from './client'
import type {
  AuthSession,
  AuthUser,
  Branch,
  BranchMember,
  Business,
  CreateSaleBody,
  Customer,
  CustomerBalance,
  InstallmentPlan,
  InstallmentPlanSummary,
  Member,
  Notification,
  PaymentMethod,
  PaymentReportRow,
  Product,
  Role,
  Sale,
  SaleListRow,
  SaleSummary,
} from './types'

const B = (businessId: string) => `/businesses/${businessId}`

// --- Auth (Mela Auth) ---

export function authRegister(body: {
  email: string
  password: string
  name?: string
}) {
  return apiPost<AuthSession>('/auth/register', body).then((e) => e.data)
}

export function authLogin(body: { email: string; password: string }) {
  return apiPost<AuthSession>('/auth/login', body).then((e) => e.data)
}

export function authForgotPassword(body: { email: string }) {
  return apiPost<{ resetToken?: string }>('/auth/forgot-password', body).then((e) => e.data)
}

export function authResetPassword(body: { token: string; password: string }) {
  return apiPost<void>('/auth/reset-password', body).then((e) => e.data)
}

export function authLogout(refreshToken: string) {
  return apiPost<void>('/auth/logout', { refreshToken }).then((e) => e.data)
}

export function authMe(opts: RequestOptions = {}) {
  return apiGet<AuthUser>('/auth/me', opts).then((e) => e.data)
}

// --- Businesses & members ---

export function listBusinesses(opts: RequestOptions = {}) {
  return apiGet<Business[]>('/businesses', opts).then((e) => e.data)
}

export function createBusiness(body: {
  name: string
  currency?: string
  phone?: string | null
  email?: string | null
  address?: string | null
}) {
  return apiPost<Business>('/businesses', body).then((e) => e.data)
}

export function getBusiness(businessId: string, opts: RequestOptions = {}) {
  return apiGet<Business>(B(businessId), opts).then((e) => e.data)
}

export function updateBusiness(
  businessId: string,
  body: Partial<
    Pick<
      Business,
      'name' | 'currency' | 'phone' | 'email' | 'address' | 'logoUrl'
    >
  >,
) {
  return apiPatch<Business>(B(businessId), body).then((e) => e.data)
}

// --- Branches ---

export function listBranches(businessId: string, opts: RequestOptions = {}) {
  return apiGet<Branch[]>(`${B(businessId)}/branches`, opts).then((e) => e.data)
}

export function createBranch(
  businessId: string,
  body: { name: string; address?: string | null; phone?: string | null },
) {
  return apiPost<Branch>(`${B(businessId)}/branches`, body).then((e) => e.data)
}

export function updateBranch(
  businessId: string,
  branchId: string,
  body: Partial<{ name: string; address: string | null; phone: string | null; isActive: boolean }>,
) {
  return apiPatch<Branch>(`${B(businessId)}/branches/${branchId}`, body).then(
    (e) => e.data,
  )
}

export function listBranchMembers(businessId: string, branchId: string, opts: RequestOptions = {}) {
  return apiGet<BranchMember[]>(`${B(businessId)}/branches/${branchId}/members`, opts).then(
    (e) => e.data,
  )
}

export function assignBranchMember(
  businessId: string,
  branchId: string,
  membershipId: string,
) {
  return apiPost<void>(`${B(businessId)}/branches/${branchId}/members`, {
    membershipId,
  }).then((e) => e.data)
}

export function unassignBranchMember(
  businessId: string,
  branchId: string,
  membershipId: string,
) {
  return apiDelete<void>(
    `${B(businessId)}/branches/${branchId}/members/${membershipId}`,
  ).then((e) => e.data)
}

export function listMembers(businessId: string, opts: RequestOptions = {}) {
  return apiGet<Member[]>(`${B(businessId)}/members`, opts).then((e) => e.data)
}

export function addMember(
  businessId: string,
  body: { authUserId?: string; email?: string; role: Role },
) {
  return apiPost<Member>(`${B(businessId)}/members`, body).then((e) => e.data)
}

export function updateMember(
  businessId: string,
  membershipId: string,
  body: { role?: Role; isActive?: boolean },
) {
  return apiPatch<Member>(`${B(businessId)}/members/${membershipId}`, body).then(
    (e) => e.data,
  )
}

// --- Products & services ---

export interface ListParams {
  q?: string
  include_inactive?: boolean
  limit?: number
  page?: number
}

function listQuery(params: ListParams): Record<string, string | number | undefined> {
  return {
    q: params.q,
    include_inactive: params.include_inactive ? 'true' : undefined,
    limit: params.limit,
    page: params.page,
  }
}

export function listProducts(
  businessId: string,
  params: ListParams = {},
  opts: RequestOptions = {},
) {
  return apiGet<Product[]>(
    `${B(businessId)}/products-services${buildQuery(listQuery(params))}`,
    opts,
  )
}

export function createProduct(
  businessId: string,
  body: {
    name: string
    type: 'PRODUCT' | 'SERVICE'
    price: string
    sku?: string | null
    description?: string | null
    is_active?: boolean
  },
) {
  return apiPost<Product>(`${B(businessId)}/products-services`, body).then(
    (e) => e.data,
  )
}

export function updateProduct(
  businessId: string,
  productId: string,
  body: Partial<{
    name: string
    type: 'PRODUCT' | 'SERVICE'
    price: string
    sku: string | null
    description: string | null
    is_active: boolean
  }>,
) {
  return apiPatch<Product>(
    `${B(businessId)}/products-services/${productId}`,
    body,
  ).then((e) => e.data)
}

export function setProductActive(
  businessId: string,
  productId: string,
  isActive: boolean,
) {
  if (isActive) {
    return updateProduct(businessId, productId, { is_active: true })
  }
  return apiDelete<Product>(
    `${B(businessId)}/products-services/${productId}`,
  ).then((e) => e.data)
}

// --- Customers ---

export function listCustomers(
  businessId: string,
  params: ListParams = {},
  opts: RequestOptions = {},
) {
  return apiGet<Customer[]>(
    `${B(businessId)}/customers${buildQuery(listQuery(params))}`,
    opts,
  )
}

export function createCustomer(
  businessId: string,
  body: {
    name: string
    phone?: string | null
    email?: string | null
    address?: string | null
    notes?: string | null
  },
) {
  return apiPost<Customer>(`${B(businessId)}/customers`, body).then(
    (e) => e.data,
  )
}

export function updateCustomer(
  businessId: string,
  customerId: string,
  body: Partial<{
    name: string
    phone: string | null
    email: string | null
    address: string | null
    notes: string | null
    is_active: boolean
  }>,
) {
  return apiPatch<Customer>(
    `${B(businessId)}/customers/${customerId}`,
    body,
  ).then((e) => e.data)
}

export function setCustomerActive(
  businessId: string,
  customerId: string,
  isActive: boolean,
) {
  if (isActive) {
    return updateCustomer(businessId, customerId, { is_active: true })
  }
  return apiDelete<Customer>(
    `${B(businessId)}/customers/${customerId}`,
  ).then((e) => e.data)
}

// --- Sales ---

export type SaleFilters = {
  status?: string[]
  saleType?: string[]
  customerId?: string
  invoice?: string
  from?: string
  to?: string
  limit?: number
  page?: number
}

export function listSales(
  businessId: string,
  filters: SaleFilters = {},
  opts: RequestOptions = {},
) {
  return apiGet<SaleListRow[]>(
    `${B(businessId)}/sales${buildQuery(filters)}`,
    opts,
  )
}

export function getSale(
  businessId: string,
  saleId: string,
  opts: RequestOptions = {},
) {
  return apiGet<Sale>(`${B(businessId)}/sales/${saleId}`, opts).then(
    (e) => e.data,
  )
}

export function createSale(
  businessId: string,
  body: CreateSaleBody,
  idempotencyKey: string,
) {
  return apiPost<Sale>(`${B(businessId)}/sales`, body, idempotencyKey).then(
    (e) => e.data,
  )
}

export function recordPayment(
  businessId: string,
  saleId: string,
  body: {
    amount: string
    method: PaymentMethod
    reference?: string | null
    notes?: string | null
  },
  idempotencyKey: string,
) {
  return apiPost<{ paymentId: string; sale: Sale }>(
    `${B(businessId)}/sales/${saleId}/payments`,
    body,
    idempotencyKey,
  ).then((e) => e.data)
}

export function voidSale(businessId: string, saleId: string, reason: string) {
  return apiPost<Sale>(`${B(businessId)}/sales/${saleId}/void`, {
    reason,
  }).then((e) => e.data)
}

export function getInvoicePrintHtml(
  businessId: string,
  saleId: string,
  opts: RequestOptions = {},
) {
  return apiGetText(`${B(businessId)}/sales/${saleId}/invoice/print`, opts)
}

// --- Installments ---

export function getInstallmentPlan(
  businessId: string,
  saleId: string,
  opts: RequestOptions = {},
) {
  return apiGet<InstallmentPlan>(
    `${B(businessId)}/sales/${saleId}/installments`,
    opts,
  ).then((e) => e.data)
}

export function createInstallmentPlan(
  businessId: string,
  saleId: string,
  body: {
    installments: Array<{ amountDue: string; dueDate: string }>
  },
) {
  return apiPost<InstallmentPlan>(
    `${B(businessId)}/sales/${saleId}/installments`,
    body,
  ).then((e) => e.data)
}

export function cancelInstallmentPlan(businessId: string, saleId: string) {
  return apiPost<InstallmentPlan>(
    `${B(businessId)}/sales/${saleId}/installments/cancel`,
    {},
  ).then((e) => e.data)
}

// --- Reports ---

export function salesSummary(
  businessId: string,
  range: { from?: string; to?: string } = {},
  opts: RequestOptions = {},
) {
  return apiGet<SaleSummary>(
    `${B(businessId)}/reports/sales/summary${buildQuery(range)}`,
    opts,
  ).then((e) => e.data)
}

export function customerBalances(
  businessId: string,
  params: { only_with_balance?: boolean; limit?: number; page?: number } = {},
  opts: RequestOptions = {},
) {
  return apiGet<CustomerBalance[]>(
    `${B(businessId)}/reports/customers/balances${buildQuery({
      only_with_balance: params.only_with_balance ? 'true' : undefined,
      limit: params.limit,
      page: params.page,
    })}`,
    opts,
  )
}

export function paymentsReport(
  businessId: string,
  params: {
    from?: string
    to?: string
    method?: PaymentMethod | ''
    limit?: number
    page?: number
  } = {},
  opts: RequestOptions = {},
) {
  return apiGet<PaymentReportRow[]>(
    `${B(businessId)}/reports/payments${buildQuery(params)}`,
    opts,
  )
}

export function listInstallmentPlans(
  businessId: string,
  opts: RequestOptions = {},
) {
  return apiGet<InstallmentPlanSummary[]>(
    `${B(businessId)}/reports/installments`,
    opts,
  ).then((e) => e.data)
}

export function listNotifications(
  businessId: string,
  opts: RequestOptions & { unread?: boolean } = {},
) {
  const params = new URLSearchParams()
  if (opts.unread) params.set('unread', 'true')
  const qs = params.toString()
  return apiGet<Notification[]>(
    `${B(businessId)}/notifications${qs ? `?${qs}` : ''}`,
    opts,
  ).then((e) => e.data)
}

export function markNotificationRead(businessId: string, notificationId: string) {
  return apiPatch<void>(`${B(businessId)}/notifications/${notificationId}/read`, {})
}
