interface MojoLogoProps {
  size?: 'sm' | 'md' | 'lg'
  subtitle?: string
  dark?: boolean
}

export function MojoLogo({ size = 'md', subtitle, dark = false }: MojoLogoProps) {
  const textSize = size === 'sm' ? 'text-xl' : size === 'lg' ? 'text-4xl' : 'text-2xl'
  const dotSize = size === 'sm' ? 6 : size === 'lg' ? 10 : 8
  const textColor = dark ? 'text-[#0A0A0A]' : 'text-white'
  const aiColor = dark ? 'text-gray-500' : 'text-white/60'

  return (
    <div>
      <div className="flex items-baseline gap-1.5">
        <div className="flex items-baseline">
          <span className={`${textColor} font-black ${textSize} tracking-tight`}>Mo</span>
          {/* Use dotless-j (ȷ) so there's no white font dot, then add our red dot */}
          <span className="relative inline-block">
            <span className={`${textColor} font-black ${textSize} tracking-tight`}>ȷ</span>
            <span
              className="absolute left-1/2 -translate-x-1/2"
              style={{
                background: 'linear-gradient(135deg, #E8336D, #D42B2B)',
                width: dotSize,
                height: dotSize,
                borderRadius: '50%',
                top: 0,
              }}
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
