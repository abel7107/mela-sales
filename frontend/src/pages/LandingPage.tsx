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
    },
  }

  const text = content[language]

  return (
    <div className="min-h-screen bg-white dark:bg-slate-800">
      <header className="border-b border-slate-100">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Logo />
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={toggle}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
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
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
            >
              {t('login')}
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-20 lg:grid-cols-2 lg:py-8">
          <div>
            <span className="inline-flex rounded-full bg-indigo-50 dark:bg-indigo-900/30 px-4 py-2 text-sm font-medium text-indigo-700 dark:text-indigo-300">
              {t('appName')}
            </span>

            <h1 className="mt-6 max-w-2xl text-4xl font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-100 sm:text-5xl lg:text-6xl">
              {text.tagline}
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600 dark:text-slate-300">
              {text.description}
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                to="/login"
                className="rounded-xl bg-indigo-600 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700"
              >
                {text.getStarted}
              </Link>

              <Link
                to="/login"
                className="rounded-xl border border-slate-200 dark:border-slate-700 px-7 py-3.5 text-sm font-semibold text-slate-700 dark:text-slate-200 transition hover:bg-slate-50 dark:bg-slate-900"
              >
                {text.signIn}
              </Link>
            </div>
          </div>

          <div className="rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 p-8 text-white shadow-2xl shadow-indigo-900/20 sm:p-12">
            <div className="rounded-2xl bg-white/10 p-6 backdrop-blur">
              <Logo light />
              <div className="mt-10 space-y-4">
                {[text.feature1, text.feature2, text.feature3].map(
                  (feature, index) => (
                    <div
                      key={feature}
                      className="flex items-center gap-4 rounded-xl bg-white/10 p-4"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20 font-bold">
                        {index + 1}
                      </span>
                      <span className="font-medium">{feature}</span>
                    </div>
                  ),
                )}
              </div>
            </div>
            <p className="mt-6 text-center text-sm text-indigo-100">
              {t('welcome')}
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-100 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
        © {new Date().getFullYear()} Mela Sales
      </footer>
    </div>
  )
}
