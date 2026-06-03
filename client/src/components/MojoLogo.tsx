interface MojoLogoProps {
  size?: 'sm' | 'md' | 'lg'
  subtitle?: string
  dark?: boolean
}

export function MojoLogo({ size = 'md', subtitle, dark = false }: MojoLogoProps) {
  const textSize = size === 'sm' ? 'text-xl' : size === 'lg' ? 'text-4xl' : 'text-2xl'
  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : size === 'lg' ? 'w-2.5 h-2.5' : 'w-2 h-2'
  const textColor = dark ? 'text-[#0A0A0A]' : 'text-white'
  const aiColor = dark ? 'text-gray-500' : 'text-white/60'

  return (
    <div>
      <div className="flex items-baseline gap-1.5">
        <div className="flex items-baseline">
          <span className={`${textColor} font-black ${textSize} tracking-tight`}>Mo</span>
          {/* j wrapped in relative span so dot is anchored directly above it */}
          <span className="relative inline-block">
            <span className={`${textColor} font-black ${textSize} tracking-tight`}>j</span>
            <span
              className={`absolute left-1/2 -translate-x-1/2 -top-1 -translate-y-1/2 ${dotSize} rounded-full`}
              style={{ background: 'linear-gradient(135deg, #E8336D, #D42B2B)' }}
            />
          </span>
          <span className={`${textColor} font-black ${textSize} tracking-tight`}>o</span>
        </div>
        <span className={`${aiColor} font-light ${textSize}`}>ai</span>
      </div>
      {subtitle && (
        <p className={`text-[10px] uppercase tracking-widest font-medium mt-0.5 ${dark ? 'text-gray-400' : 'text-white/50'}`}>
          {subtitle}
        </p>
      )}
    </div>
  )
}
