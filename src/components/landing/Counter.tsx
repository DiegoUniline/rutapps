import CountUp from "react-countup";
import { useInView } from "react-intersection-observer";

interface CounterProps {
  end: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
  separator?: string;
  className?: string;
}

/** Number that counts up smoothly the first time it enters the viewport. */
export function Counter({
  end,
  prefix = "",
  suffix = "",
  decimals = 0,
  duration = 2.2,
  separator = ",",
  className,
}: CounterProps) {
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.35 });
  return (
    <span ref={ref} className={className}>
      {inView ? (
        <CountUp
          end={end}
          duration={duration}
          decimals={decimals}
          separator={separator}
          prefix={prefix}
          suffix={suffix}
          useEasing
        />
      ) : (
        <>{prefix}0{suffix}</>
      )}
    </span>
  );
}
