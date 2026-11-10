import { Link } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { useLanguage } from '../i18n/LanguageContext'
import { useTheme } from '../theme/ThemeContext'

export function LandingPage() {
  const { t, language } = useLanguage()
  const { theme, toggle } = useTheme()

  const content = {
    en: {
      tagline: 'Simple sales management for your business',
      description:
        'Manage sales, products, customers, and invoices in one simple place. Spend less time on paperwork and more time growing your business.',
      getStarted: 'Get started',
      signIn: 'Sign in',
      feature1: 'Sales management',
      feature2: 'Products & services',
      feature3: 'Business reports',
      feature1Desc: 'Record cash and credit sales, track balances, and stay on top of every transaction.',
      feature2Desc: 'Organize your catalog, manage pricing, and keep your inventory accurate.',
      feature3Desc: 'Get clear insights into revenue, outstanding balances, and payment history.',
      ctaTitle: 'Ready to run your business better?',
      ctaDesc: 'Start managing your sales today with Mela Sales.',
    },
    am: {
      tagline: 'ለንግድዎ ቀላል የሽያጭ አስተዳደር',
      description:
        'ሽያጮችን፣ ምርቶችን፣ ደንበኞችን እና ደረሰኞችን በአንድ ቀላል ቦታ ያስተዳድሩ። ጊዜዎን በወረቀት ስራ ላይ ከማጥፋት ይልቅ ንግድዎን ለማሳደግ ይጠቀሙ።',
      getStarted: 'ይጀምሩ',
      signIn: 'ይግቡ',
      feature1: 'የሽያጭ አስተዳደር',
      feature2: 'ምርቶች እና አገልግሎቶች',
      feature3: 'የንግድ ሪፖርቶች',
      feature1Desc: 'የገንዘብ እና የብድር ሽያጮችን ይመዝግቡ፣ ቀሪ ሂሳቦችን ይከታተሉ።',
      feature2Desc: 'ምርቶችዎን ያደራጁ፣ ዋጋዎችን ያስተዳድሩ፣ ክምችትዎን ትክክል ያድርጉ።',
      feature3Desc: 'ስለ ገቢ፣ ቀሪ ሂሳብ እና የክፍያ ታሪክ ግልጽ መረጃ ያግኙ።',
      ctaTitle: 'ንግድዎን የተሻለ ለማስተዳደር ዝግጁ ነዎት?',
      ctaDesc: 'ዛሬ ከMela Sales ጋር ሽያጮችዎን ያስተዳድሩ።',
    },
  }

  const text = content[language]

  const features = [
    { title: text.feature1, desc: text.feature1Desc },
    { title: text.feature2, desc: text.feature2Desc },
    { title: text.feature3, desc: text.feature3Desc },
  ]

  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Logo />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggle}
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
            <LanguageSwitcher />
            <Link
              to="/login"
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {t('login')}
            </Link>
            <Link
              to="/login"
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
            >
              {text.getStarted}
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-7xl px-6 py-20 lg:py-28">
          <div className="grid items-center gap-16 lg:grid-cols-2">
            <div>
              <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1.5 text-sm font-medium text-indigo-700 dark:border-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">
                {t('appName')}
              </span>
              <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                {text.tagline}
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600 dark:text-slate-300">
                {text.description}
              </p>
              <div className="mt-10 flex flex-wrap gap-4">
                <Link
                  to="/login"
                  className="rounded-xl bg-indigo-600 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition hover:bg-indigo-500"
                >
                  {text.getStarted}
                </Link>
                <Link
                  to="/login"
                  className="rounded-xl border border-slate-300 px-7 py-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {text.signIn}
                </Link>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-4 rounded-3xl bg-gradient-to-tr from-indigo-500/20 to-violet-500/20 blur-2xl" />
              <div className="relative rounded-3xl border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-800 dark:bg-slate-800">
                <div className="flex items-center gap-3">
                  <Logo />
                </div>
                <div className="mt-8 space-y-3">
                  {features.map((feature, index) => (
                    <div
                      key={feature.title}
                      className="flex items-start gap-4 rounded-xl bg-slate-50 p-4 dark:bg-slate-900/60"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
                        {index + 1}
                      </span>
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-slate-100">
                          {feature.title}
                        </p>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                          {feature.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200 bg-slate-50 py-20 dark:border-slate-800 dark:bg-slate-900/50">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                {text.ctaTitle}
              </h2>
              <p className="mt-4 text-lg text-slate-600 dark:text-slate-300">
                {text.ctaDesc}
              </p>
              <div className="mt-8">
                <Link
                  to="/login"
                  className="inline-flex rounded-xl bg-indigo-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition hover:bg-indigo-500"
                >
                  {text.getStarted}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
        © {new Date().getFullYear()} Mela Sales
      </footer>
    </div>
  )
}
