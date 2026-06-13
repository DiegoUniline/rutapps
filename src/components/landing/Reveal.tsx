import { useEffect, useRef, useState, ReactNode, CSSProperties } from 'react';

type Variant = 'up' | 'fade' | 'scale' | 'left' | 'right';

interface RevealProps {
  children: ReactNode;
  delay?: number;
  variant?: Variant;
  className?: string;
  style?: CSSProperties;
  as?: keyof JSX.IntrinsicElements;
  duration?: number;
  once?: boolean;
}

const initialTransform: Record<Variant, string> = {
  up: 'translate3d(0, 16px, 0)',
  fade: 'translate3d(0, 0, 0)',
  scale: 'scale(0.96)',
  left: 'translate3d(-20px, 0, 0)',
  right: 'translate3d(20px, 0, 0)',
};

export function Reveal({
  children,
  delay = 0,
  variant = 'up',
  className = '',
  style,
  as: Tag = 'div',
  duration = 420,
  once = true,
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setVisible(true);
            if (once) io.disconnect();
          } else if (!once) {
            setVisible(false);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once]);

  const styleCombined: CSSProperties = {
    ...style,
    opacity: visible ? 1 : 0,
    transform: visible ? 'translate3d(0,0,0) scale(1)' : initialTransform[variant],
    transition: `opacity ${duration}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms, transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`,
    willChange: 'opacity, transform',
  };

  return (
    // @ts-expect-error dynamic tag
    <Tag ref={ref} className={className} style={styleCombined}>
      {children}
    </Tag>
  );
}
