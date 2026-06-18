import { ReactNode, useRef, CSSProperties } from 'react';
import { motion, useScroll, useTransform, useReducedMotion, useSpring } from 'motion/react';

interface ParallaxProps {
  children: ReactNode;
  /** Pixel offset range. Positive = element moves up as you scroll down. */
  offset?: number;
  className?: string;
  style?: CSSProperties;
}

/** Smooth scroll-linked parallax wrapper. Respects prefers-reduced-motion. */
export function Parallax({ children, offset = 60, className = '', style }: ParallaxProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });

  const rawY = useTransform(scrollYProgress, [0, 1], [offset, -offset]);
  const y = useSpring(rawY, { stiffness: 80, damping: 20, mass: 0.3 });

  return (
    <div ref={ref} className={`overflow-hidden ${className}`} style={style}>
      <motion.div className="h-full" style={{ y: reduce ? 0 : y, willChange: 'transform' }}>
        {children}
      </motion.div>
    </div>
  );
}

interface FloatProps {
  children: ReactNode;
  amplitude?: number;
  duration?: number;
  delay?: number;
  className?: string;
}

/** Continuous gentle floating animation. */
export function Float({
  children,
  amplitude = 6,
  duration = 4,
  delay = 0,
  className = '',
}: FloatProps) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      animate={{ y: [-amplitude, amplitude, -amplitude] }}
      transition={{ duration, delay, ease: 'easeInOut', repeat: Infinity }}
      style={{ willChange: 'transform' }}
    >
      {children}
    </motion.div>
  );
}
