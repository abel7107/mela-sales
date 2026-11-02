
interface LogoProps {
  compact?: boolean
  light?: boolean
}

export function Logo({ compact = false, light = false }: LogoProps) {
  return (
    <div className={`flex items-center ${compact ? '' : 'flex-col gap-2'}`}>
      <svg
        viewBox="0 0 240 190"
        className={compact ? 'h-9 w-9' : 'h-8 w-12'}
        fill="none"
        role="img"
        aria-label="Mela Sales logo"
      >
        <defs>
          <linearGradient id="blueFrame" x1="20" y1="0" x2="190" y2="150">
            <stop stopColor="#38BDF8" />
            <stop offset="1" stopColor="#0875C9" />
          </linearGradient>
          <linearGradient id="bars" x1="100" y1="30" x2="170" y2="130">
            <stop stopColor="#67E8F9" />
            <stop offset="1" stopColor="#0284C7" />
          </linearGradient>
          <linearGradient id="silver" x1="30" y1="80" x2="200" y2="150">
            <stop stopColor="#F8FAFC" />
            <stop offset="1" stopColor="#64748B" />
          </linearGradient>
        </defs>

        <rect
          x="25" y="8" width="190" height="165"
          rx="25" stroke="url(#blueFrame)" strokeWidth="12"
        />

        <path d="M60 125V105Q60 95 70 95H80Q90 95 90 105V125Z" fill="#0284C7" />
        <path d="M105 125V65Q105 55 115 55H125Q135 55 135 65V125Z" fill="url(#bars)" />
        <path d="M150 125V40Q150 30 160 30H170Q180 30 180 40V125Z" fill="url(#bars)" />

        <path
          d="M25 135Q55 95 90 112Q130 132 170 91L205 62L184 65L222 59L195 88L197 70Q145 143 91 128Q55 118 25 150Z"
          fill="url(#silver)"
        />

        <path d="M40 130V168M75 133V168M120 135V168M165 115V168M200 88V145"
          stroke="#64748B" strokeWidth="9" />
      </svg>

      {!compact && (
        <span className={`text-2xl font-black tracking-[0.12em] ${
          light ? 'text-white' : 'text-slate-900'
        }`}>
          MELA SALES
        </span>
      )}
    </div>
  )
}
