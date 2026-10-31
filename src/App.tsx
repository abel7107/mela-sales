import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  CreditCard,
  FileText,
  LayoutDashboard,
  Menu,
  Package,
  Plus,
  Search,
  Settings,
  ShoppingCart,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useState } from "react";

type Sale = {
  id: string;
  customer: string;
  date: string;
  amount: number;
  method: "Cash" | "Credit" | "Transfer";
  status: "Completed" | "Pending";
};

const navigation = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Sales", icon: ShoppingCart },
  { label: "Products", icon: Package },
  { label: "Customers", icon: Users },
  { label: "Invoices", icon: FileText },
  { label: "Reports", icon: BarChart3 },
];

const sales: Sale[] = [
  {
    id: "INV-1001",
    customer: "Abebe Kebede",
    date: "Oct 28, 2026",
    amount: 12500,
    method: "Cash",
    status: "Completed",
  },
  {
    id: "INV-1002",
    customer: "Hana Tesfaye",
    date: "Oct 28, 2026",
    amount: 8400,
    method: "Credit",
    status: "Pending",
  },
  {
    id: "INV-1003",
    customer: "Dawit Alemu",
    date: "Oct 27, 2026",
    amount: 6200,
    method: "Transfer",
    status: "Completed",
  },
  {
    id: "INV-1004",
    customer: "Sara Bekele",
    date: "Oct 27, 2026",
    amount: 15700,
    method: "Cash",
    status: "Completed",
  },
  {
    id: "INV-1005",
    customer: "Mekdes Girma",
    date: "Oct 26, 2026",
    amount: 3900,
    method: "Credit",
    status: "Pending",
  },
];

const metrics = [
  {
    label: "Today's Sales",
    amount: 45600,
    change: "+12.5%",
    positive: true,
    icon: ShoppingCart,
    iconStyle: "bg-blue-50 text-blue-600",
  },
  {
    label: "Cash Received",
    amount: 32100,
    change: "+8.2%",
    positive: true,
    icon: Wallet,
    iconStyle: "bg-emerald-50 text-emerald-600",
  },
  {
    label: "Credit Sales",
    amount: 13500,
    change: "+3.1%",
    positive: true,
    icon: CreditCard,
    iconStyle: "bg-violet-50 text-violet-600",
  },
  {
    label: "Outstanding Balance",
    amount: 82400,
    change: "-4.6%",
    positive: false,
    icon: Users,
    iconStyle: "bg-amber-50 text-amber-600",
  },
];

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-ET", {
    style: "currency",
    currency: "ETB",
    maximumFractionDigits: 2,
  }).format(amount);
}

function App() {
  const [activePage, setActivePage] = useState("Dashboard");
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const filteredSales = sales.filter((sale) =>
    `${sale.id} ${sale.customer} ${sale.method}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {menuOpen && (
        <button
          aria-label="Close navigation overlay"
          className="fixed inset-0 z-30 bg-slate-950/40 md:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-200 ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        <div className="flex h-20 items-center justify-between border-b border-slate-100 px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white">
              M
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">
                Mela Sales
              </h1>
              <p className="text-xs text-slate-500">Sales management</p>
            </div>
          </div>

          <button
            aria-label="Close navigation"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden"
            onClick={() => setMenuOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-4 py-6">
          <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Workspace
          </p>

          {navigation.map(({ label, icon: Icon }) => (
            <button
              key={label}
              onClick={() => {
                setActivePage(label);
                setMenuOpen(false);
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${
                activePage === label
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <Icon size={19} />
              <span>{label}</span>
              {activePage === label && (
                <span className="ml-auto h-2 w-2 rounded-full bg-blue-600" />
              )}
            </button>
          ))}
        </nav>

        <div className="border-t border-slate-100 p-4">
          <button
            onClick={() => setActivePage("Settings")}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium ${
              activePage === "Settings"
                ? "bg-blue-50 text-blue-700"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Settings size={19} />
            Settings
          </button>

          <div className="mt-4 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-700">
              AD
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800">
                Admin User
              </p>
              <p className="text-xs text-slate-500">Store administrator</p>
            </div>
          </div>
        </div>
      </aside>

      <main className="min-h-screen md:ml-64">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              aria-label="Open navigation"
              className="rounded-lg p-2 hover:bg-slate-100 md:hidden"
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={22} />
            </button>

            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-slate-900 sm:text-xl">
                {activePage}
              </h2>
              <p className="hidden text-sm text-slate-500 sm:block">
                Welcome back! Here's your store overview.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <label className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 sm:flex">
              <Search size={17} className="text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search sales..."
                aria-label="Search sales"
                className="w-32 bg-transparent text-sm outline-none placeholder:text-slate-400 lg:w-44"
              />
            </label>

            <button
              aria-label="Notifications"
              className="relative rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50"
            >
              <Bell size={19} />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" />
            </button>

            <button
              onClick={() => setActivePage("Sales")}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 sm:px-4"
            >
              <Plus size={18} />
              <span className="hidden sm:inline">New sale</span>
              <span className="sm:hidden">Sale</span>
            </button>
          </div>
        </header>

        <div className="p-4 sm:p-6 lg:p-8">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-blue-600">
                Tuesday, October 28, 2026
              </p>
              <h3 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Business overview
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                Here's what's happening with your sales today.
              </p>
            </div>

            <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">
              Sample data · ETB
            </span>
          </div>

          <section
            aria-label="Sales metrics"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            {metrics.map((metric) => {
              const Icon = metric.icon;
              const TrendIcon = metric.positive ? ArrowUpRight : ArrowDownRight;

              return (
                <article
                  key={metric.label}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-500">
                        {metric.label}
                      </p>
                      <p className="mt-3 break-words text-2xl font-bold tracking-tight text-slate-900">
                        {formatMoney(metric.amount)}
                      </p>
                    </div>

                    <div className={`rounded-xl p-3 ${metric.iconStyle}`}>
                      <Icon size={21} />
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-1 text-xs">
                    <TrendIcon
                      size={15}
                      className={
                        metric.positive ? "text-emerald-600" : "text-blue-600"
                      }
                    />
                    <span
                      className={
                        metric.positive
                          ? "font-semibold text-emerald-600"
                          : "font-semibold text-blue-600"
                      }
                    >
                      {metric.change}
                    </span>
                    <span className="text-slate-400">vs. previous period</span>
                  </div>
                </article>
              );
            })}
          </section>

          <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5 sm:p-6">
              <div>
                <h3 className="font-bold text-slate-900">
                  Recent transactions
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  A summary of your latest sales.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 sm:hidden">
                  <Search size={16} className="text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search..."
                    aria-label="Search transactions"
                    className="w-24 bg-transparent text-sm outline-none"
                  />
                </label>

                <button
                  onClick={() => setActivePage("Sales")}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                >
                  View sales
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Invoice</th>
                    <th className="px-6 py-4 font-semibold">Customer</th>
                    <th className="px-6 py-4 font-semibold">Date</th>
                    <th className="px-6 py-4 font-semibold">Payment</th>
                    <th className="px-6 py-4 font-semibold">Amount</th>
                    <th className="px-6 py-4 font-semibold">Status</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredSales.map((sale) => (
                    <tr
                      key={sale.id}
                      className="transition-colors hover:bg-slate-50/70"
                    >
                      <td className="whitespace-nowrap px-6 py-4 font-semibold text-blue-700">
                        {sale.id}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-800">
                        {sale.customer}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-slate-500">
                        {sale.date}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-slate-600">
                        {sale.method}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 font-semibold text-slate-800">
                        {formatMoney(sale.amount)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            sale.status === "Completed"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {sale.status}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {filteredSales.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-6 py-12 text-center text-slate-500"
                      >
                        No transactions match your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="border-t border-slate-100 px-6 py-4 text-xs text-slate-500">
              Showing {filteredSales.length} of {sales.length} sample
              transactions
            </div>
          </section>

          <footer className="py-6 text-center text-xs text-slate-400">
            Mela Sales · Sales management made simpler
          </footer>
        </div>
      </main>
    </div>
  );
}

export default App;
