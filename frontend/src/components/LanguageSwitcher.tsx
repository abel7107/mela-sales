import { useLanguage } from '../i18n/LanguageContext'

interface LanguageSwitcherProps {
  className?: string
}

export function LanguageSwitcher({
  className = '',
}: LanguageSwitcherProps) {
  const { language, setLanguage } = useLanguage()

  return (
    <label className={`inline-flex items-center gap-2 ${className}`}>
      <span className="text-sm text-slate-500 dark:text-slate-400">Language</span>

      <select
        value={language}
        onChange={(event) =>
          setLanguage(event.target.value as 'en' | 'am')
        }
        aria-label="Select language"
        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
      >
        <option value="en">English</option>
        <option value="am">አማርኛ</option>
      </select>
    </label>
  )
}
