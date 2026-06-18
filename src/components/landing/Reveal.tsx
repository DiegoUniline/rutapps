import { ReactNode, CSSProperties } from 'react';
import { motion, useReducedMotion, type Variants } from 'motion/react';

type Variant = 'up' | 'fade' | 'scale' | 'left' | 'right';

interface RevealProps {
  children: ReactNode;
  delay?: number;
  variant?: Variant;
  className?: string;
  style?: CSSProperties;
  as?: 'div' | 'section' | 'span' | 'article' | 'header' | 'footer' | 'li' | 'ul';
  duration?: number;
  once?: boolean;
}

const offsets: Record<Variant, { x?: number; y?: number; scale?: number }> = {
  up: { y: 24 },
  fade: {},
  scale: { scale: 0.96 },
  left: { x: -28 },
  right: { x: 28 },
};

export function Reveal({
  children,
  delay = 0,
  variant = 'up',
  className = '',
  style,
  as = 'div',
  duration = 0.6,
  once = true,
}: RevealProps) {
  const reduce = useReducedMotion();
  const off = offsets[variant];

  const variants: Variants = {
    hidden: reduce
      ? { opacity: 1 }
      : { opacity: 0, x: off.x ?? 0, y: off.y ?? 0, scale: off.scale ?? 1 },
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
      scale: 1,
      transition: {
        duration: reduce ? 0 : duration,
        delay: reduce ? 0 : delay / 1000,
        ease: [0.22, 1, 0.36, 1],
      },
    },
  };

  const MotionTag = (motion as any)[as] ?? motion.div;

  return (
    <MotionTag
      className={className}
      style={style}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount: 0.18, margin: '0px 0px -40px 0px' }}
      variants={variants}
    >
      {children}
    </MotionTag>
  );
}
