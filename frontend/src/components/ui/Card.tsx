import { HTMLAttributes, forwardRef } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ hover = true, className = '', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`
          bg-surface-card rounded-md shadow-card
          transition-all duration-200 ease-out
          ${hover ? 'hover:shadow-card-hover hover:-translate-y-1' : ''}
          ${className}
        `.trim()}
        {...props}
      >
        {children}
      </div>
    )
  }
)

Card.displayName = 'Card'

interface CardImageProps {
  src: string
  alt: string
  className?: string
}

function CardImage({ src, alt, className = '' }: CardImageProps) {
  return (
    <div className={`overflow-hidden rounded-t-md ${className}`}>
      <img src={src} alt={alt} className="w-full h-full object-cover" />
    </div>
  )
}

interface CardBodyProps extends HTMLAttributes<HTMLDivElement> {
  className?: string
}

function CardBody({ className = '', children, ...props }: CardBodyProps) {
  return (
    <div className={`p-lg ${className}`} {...props}>
      {children}
    </div>
  )
}

export { CardImage, CardBody }
export default Card
