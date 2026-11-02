import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

export type Language = 'en' | 'am'

const translations = {
  en: {
    appName: 'Mela Sales',
    language: 'Language',
    english: 'English',
    amharic: 'አማርኛ',
    dashboard: 'Dashboard',
    sales: 'Sales',
    products: 'Products & Services',
    customers: 'Customers',
    reports: 'Reports',
    settings: 'Settings',
    businesses: 'Businesses',
    logout: 'Sign out',
    login: 'Sign in',
    register: 'Create account',
    welcome: 'Welcome to Mela Sales',
    loading: 'Loading...',
        loginDescription: 'Sign in to manage your business',
    registerDescription: 'Create your account to get started',
    forgotDescription: 'Reset your password',
    resetDescription: 'Choose a new password',
    yourName: 'Your name (optional)',
    email: 'Email',
    password: 'Password',
    newPassword: 'New password',
    resetToken: 'Reset token',
    pasteResetToken: 'Paste reset token',
    passwordHint: 'At least 8 characters.',
    createAccount: 'Create account',
    sendResetLink: 'Send reset link',
    resetPassword: 'Reset password',
    forgotPassword: 'Forgot password?',
    newHere: 'New here?',
    createAnAccount: 'Create an account',
    alreadyHaveAccount: 'Already have an account?',
    backToSignIn: 'Back to sign in',
    developerTokenLogin: 'Developer token login',
    emailRequired: 'Email is required.',
    passwordRequired: 'Password is required.',
    resetTokenRequired: 'Reset token is required.',
    passwordTooShort: 'Password must be at least 8 characters.',
    resetTokenGenerated: 'Reset token generated (dev). Use it below to set a new password.',
    resetEmailSent: 'If an account with that email exists, a reset link has been sent.',
    passwordResetSuccess: 'Password reset successfully. You can now sign in.',
    requestFailed: 'Could not process your request.',
    resetFailed: 'Could not reset your password.',
    registrationFailed: 'Could not create your account.',
    signInFailed: 'Could not sign you in.',
  },
  am: {
    appName: 'መላ ሽያጭ',
    language: 'ቋንቋ',
    english: 'English',
    amharic: 'አማርኛ',
    dashboard: 'ዳሽቦርድ',
    sales: 'ሽያጮች',
    products: 'ምርቶች እና አገልግሎቶች',
    customers: 'ደንበኞች',
    reports: 'ሪፖርቶች',
    settings: 'ቅንብሮች',
    businesses: 'ንግዶች',
    logout: 'ውጣ',
    login: 'ግባ',
    register: 'መለያ ፍጠር',
    welcome: 'ወደ መላ ሽያጭ እንኳን በደህና መጡ',
    loading: 'በመጫን ላይ...',
        loginDescription: 'ንግድዎን ለማስተዳደር ይግቡ',
    registerDescription: 'ለመጀመር መለያዎን ይፍጠሩ',
    forgotDescription: 'የይለፍ ቃልዎን ዳግም ያስጀምሩ',
    resetDescription: 'አዲስ የይለፍ ቃል ይምረጡ',
    yourName: 'ስምዎ (አማራጭ)',
    email: 'ኢሜይል',
    password: 'የይለፍ ቃል',
    newPassword: 'አዲስ የይለፍ ቃል',
    resetToken: 'የዳግም ማስጀመሪያ ቶከን',
    pasteResetToken: 'የዳግም ማስጀመሪያ ቶከኑን እዚህ ያስገቡ',
    passwordHint: 'ቢያንስ 8 ቁምፊዎች።',
    createAccount: 'መለያ ፍጠር',
    sendResetLink: 'የዳግም ማስጀመሪያ ሊንክ ላክ',
    resetPassword: 'የይለፍ ቃል ዳግም አስጀምር',
    forgotPassword: 'የይለፍ ቃል ረሱ?',
    newHere: 'አዲስ ነዎት?',
    createAnAccount: 'መለያ ይፍጠሩ',
    alreadyHaveAccount: 'አስቀድመው መለያ አለዎት?',
    backToSignIn: 'ወደ መግቢያ ተመለስ',
    developerTokenLogin: 'የገንቢ ቶከን መግቢያ',
    emailRequired: 'ኢሜይል ያስፈልጋል።',
    passwordRequired: 'የይለፍ ቃል ያስፈልጋል።',
    resetTokenRequired: 'የዳግም ማስጀመሪያ ቶከን ያስፈልጋል።',
    passwordTooShort: 'የይለፍ ቃሉ ቢያንስ 8 ቁምፊዎች መሆን አለበት።',
    resetTokenGenerated: 'የዳግም ማስጀመሪያ ቶከን ተፈጥሯል። አዲስ የይለፍ ቃል ለማዘጋጀት ከታች ይጠቀሙበት።',
    resetEmailSent: 'ይህ ኢሜይል የተመዘገበ ከሆነ የዳግም ማስጀመሪያ ሊንክ ተልኳል።',
    passwordResetSuccess: 'የይለፍ ቃሉ በተሳካ ሁኔታ ተቀይሯል። አሁን መግባት ይችላሉ።',
    requestFailed: 'ጥያቄዎን ማስኬድ አልተቻለም።',
    resetFailed: 'የይለፍ ቃሉን ዳግም ማስጀመር አልተቻለም።',
    registrationFailed: 'መለያዎን መፍጠር አልተቻለም።',
    signInFailed: 'መግባት አልተቻለም።',
  },
} as const

export type TranslationKey = keyof typeof translations.en

interface LanguageContextValue {
  language: Language
  setLanguage: (language: Language) => void
  t: (key: TranslationKey) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

const LANGUAGE_KEY = 'mela_language'

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem(LANGUAGE_KEY)
    return saved === 'am' ? 'am' : 'en'
  })

  useEffect(() => {
    localStorage.setItem(LANGUAGE_KEY, language)
    document.documentElement.lang = language
    document.documentElement.dir = 'ltr'
  }, [language])

  const t = (key: TranslationKey) => translations[language][key]

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)

  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider')
  }

  return context
}
